/**
 * ChatPanel Component
 * Right panel for AI Chat with message display and input
 * Shows conversation messages and provides input interface
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Loader2, Trash2 } from 'lucide-react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { logger } from '@/lib/logger';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import type { ChatMessage as ChatMessageType } from '@/lib/chatClient';
import { syncModelConfigsToCookies } from '@/lib/modelConfigSync';
import { buildApiUrl } from '@/lib/apiConfig';

export interface Message extends ChatMessageType {
  id: string;
  timestamp: Date;
  isCleared?: boolean;
}

interface ChatPanelProps {
  conversationId: string | null;
  messagesMap: Map<string, Message[]>;
  onMessagesMapChange: (messagesMap: Map<string, Message[]>) => void;
  onMessagesChange?: (messages: Message[]) => void;
}

const ChatPanel = ({ 
  conversationId, 
  messagesMap,
  onMessagesMapChange,
  onMessagesChange 
}: ChatPanelProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logger.component('ChatPanel', 'mounted', { 
      conversationId,
      messagesInConversation: conversationId ? (messagesMap.get(conversationId)?.length || 0) : 0,
    });
  }, [conversationId]);

  // Get messages for current conversation
  const messages = conversationId ? (messagesMap.get(conversationId) || []) : [];

  // Initialize with welcome message when conversation changes
  useEffect(() => {
    if (conversationId && messages.length === 0) {
      const welcomeMsg: Message = {
        id: `welcome-${conversationId}`,
        role: 'assistant',
        content: dict.chat.welcomeMessage,
        timestamp: new Date(),
      };
      const newMap = new Map(messagesMap);
      newMap.set(conversationId, [welcomeMsg]);
      onMessagesMapChange(newMap);
      logger.debug('Welcome message initialized', { conversationId }, 'ChatPanel');
    }
  }, [conversationId, messages.length, dict.chat.welcomeMessage]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent]);

  // Notify parent of message changes
  // Use a ref to track previous messages length to avoid infinite loops
  const prevMessagesLengthRef = useRef<number>(0);
  
  useEffect(() => {
    // Only notify parent if messages actually changed (not on initial render or same content)
    if (onMessagesChange && messages.length !== prevMessagesLengthRef.current) {
      prevMessagesLengthRef.current = messages.length;
      onMessagesChange(messages);
    }
  }, [messages, onMessagesChange]);

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isLoading) {
      logger.debug('Message send blocked', { 
        hasContent: !!content.trim(), 
        isLoading 
      }, 'ChatPanel');
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    if (!conversationId) {
      logger.error('No active conversation', undefined, 'ChatPanel');
      return;
    }

    const newMapForUser = new Map(messagesMap);
    const currentMessages = newMapForUser.get(conversationId) || [];
    newMapForUser.set(conversationId, [...currentMessages, userMessage]);
    onMessagesMapChange(newMapForUser);
    
    setIsLoading(true);
    setStreamingContent('');

    logger.info('Sending chat message', { 
      messageLength: content.length,
      conversationId 
    }, 'ChatPanel');

    try {
      // Sync model configurations to cookies before API call
      await syncModelConfigsToCookies();
      logger.debug('Model config synced to cookies', undefined, 'ChatPanel');
      
      // Prepare messages for API (without id, timestamp, and cleared messages)
      const apiMessages: ChatMessageType[] = messages
        .filter(msg => !msg.id.startsWith('welcome-') && !msg.isCleared)
        .map(({ role, content }) => ({ role, content }));
      
      apiMessages.push({ role: 'user', content });

      logger.debug('Prepared API messages', { 
        messageCount: apiMessages.length 
      }, 'ChatPanel');

      // Get appropriate API URL based on environment
      const apiUrl = await buildApiUrl('/api/chat');
      logger.debug('Using API URL for chat', { apiUrl }, 'ChatPanel');

      // Call streaming API
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!response.ok) {
        let errorData: { error?: string; details?: string } = {};
        try {
          errorData = await response.json();
        } catch (parseError) {
          logger.warn('Failed to parse error response', {
            parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
          }, 'ChatPanel');
        }
        
        logger.error('API request failed', { 
          status: response.status,
          statusText: response.statusText,
          error: errorData.error,
          details: errorData.details,
        }, 'ChatPanel');
        
        const errorMessage = errorData.details || errorData.error || `Failed to get response (${response.status} ${response.statusText})`;
        throw new Error(errorMessage);
      }

      if (!response.body) {
        logger.error('Response body is empty', undefined, 'ChatPanel');
        throw new Error('Response body is empty');
      }

      logger.info('Starting to process streaming response', {
        conversationId,
        hasResponseBody: !!response.body,
        responseStatus: response.status,
        contentType: response.headers.get('content-type'),
      }, 'ChatPanel');

      // Process streaming response with enhanced error handling
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      let buffer = '';
      let chunkCount = 0;
      let parseErrorCount = 0;
      let emptyChunkCount = 0;
      let lastProgressLog = Date.now();
      const progressLogInterval = 3000; // Log progress every 3 seconds
      const maxParseErrors = 10; // Maximum allowed parse errors before failing
      const streamStartTime = Date.now();
      
      logger.debug('Stream reader initialized', {
        conversationId,
        streamStartTime,
      }, 'ChatPanel');

      try {
        while (true) {
          let readResult;
          
          try {
            readResult = await reader.read();
          } catch (readError) {
            logger.error('Failed to read from stream', {
              error: readError instanceof Error ? readError.message : 'Unknown error',
              chunkCount,
              contentLength: assistantContent.length,
            }, 'ChatPanel');
            throw readError;
          }

          const { done, value } = readResult;

          if (done) {
            logger.success('Stream completed successfully', { 
              totalLength: assistantContent.length,
              chunkCount,
              emptyChunkCount,
              parseErrorCount,
              duration: `${Date.now() - streamStartTime}ms`,
            }, 'ChatPanel');
            break;
          }

          // Validate chunk
          if (!value || value.length === 0) {
            emptyChunkCount++;
            logger.warn('Received empty chunk from stream', {
              chunkIndex: chunkCount,
              emptyChunkCount,
            }, 'ChatPanel');
            continue;
          }

          chunkCount++;
          
          // Log first chunk received for debugging
          if (chunkCount === 1) {
            logger.info('First stream chunk received', {
              chunkSize: value.length,
              conversationId,
              timeSinceStart: `${Date.now() - streamStartTime}ms`,
            }, 'ChatPanel');
          }
          
          try {
            buffer += decoder.decode(value, { stream: true });
          } catch (decodeError) {
            logger.error('Failed to decode chunk', {
              error: decodeError instanceof Error ? decodeError.message : 'Unknown error',
              chunkIndex: chunkCount,
              chunkSize: value.length,
            }, 'ChatPanel');
            continue; // Skip this chunk but continue processing
          }

          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            
            if (!trimmedLine || trimmedLine === 'data: [DONE]') {
              continue;
            }

            if (trimmedLine.startsWith('data: ')) {
              try {
                const jsonStr = trimmedLine.slice(6);
                const data = JSON.parse(jsonStr);
                
                const chunk = data.choices?.[0]?.delta?.content;
                if (chunk) {
                  const wasEmpty = assistantContent.length === 0;
                  assistantContent += chunk;
                  
                  // Log first content received
                  if (wasEmpty && assistantContent.length > 0) {
                    logger.info('First content chunk received and displaying', {
                      firstChunkLength: chunk.length,
                      timeSinceStreamStart: `${Date.now() - streamStartTime}ms`,
                      conversationId,
                    }, 'ChatPanel');
                  }
                  
                  // Use flushSync to ensure immediate rendering of streaming content
                  flushSync(() => {
                    setStreamingContent(assistantContent);
                  });
                  
                  // Log progress periodically
                  const now = Date.now();
                  if (now - lastProgressLog >= progressLogInterval) {
                    logger.debug('Stream content accumulation progress', {
                      contentLength: assistantContent.length,
                      chunksProcessed: chunkCount,
                      parseErrors: parseErrorCount,
                      elapsed: `${now - streamStartTime}ms`,
                      averageChunkSize: Math.round(assistantContent.length / chunkCount),
                    }, 'ChatPanel');
                    lastProgressLog = now;
                  }
                } else if (data.choices?.[0]?.finish_reason) {
                  logger.debug('Stream finished', {
                    finishReason: data.choices[0].finish_reason,
                    contentLength: assistantContent.length,
                  }, 'ChatPanel');
                }
              } catch (parseError) {
                parseErrorCount++;
                logger.warn('Failed to parse SSE chunk', {
                  error: parseError instanceof Error ? parseError.message : 'Unknown error',
                  linePreview: trimmedLine.substring(0, 100),
                  parseErrorCount,
                  chunkIndex: chunkCount,
                }, 'ChatPanel');
                
                // Fail if too many parse errors
                if (parseErrorCount >= maxParseErrors) {
                  logger.error('Too many parse errors, aborting stream', {
                    parseErrorCount,
                    maxParseErrors,
                    chunkCount,
                  }, 'ChatPanel');
                  throw new Error(`Stream parsing failed: ${parseErrorCount} errors exceeded maximum of ${maxParseErrors}`);
                }
              }
            }
          }
        }

        // Process any remaining buffer content
        if (buffer.trim()) {
          logger.debug('Processing remaining buffer content', {
            bufferLength: buffer.length,
            bufferPreview: buffer.substring(0, 100),
          }, 'ChatPanel');
        }
      } finally {
        try {
          reader.releaseLock();
          logger.debug('Stream reader released', {
            chunkCount,
            parseErrorCount,
          }, 'ChatPanel');
        } catch (releaseError) {
          logger.warn('Failed to release reader', {
            error: releaseError instanceof Error ? releaseError.message : 'Unknown error',
          }, 'ChatPanel');
        }
      }

      // Add complete assistant message
      if (assistantContent && conversationId) {
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: assistantContent,
          timestamp: new Date(),
        };

        const newMapForAssistant = new Map(messagesMap);
        const currentMessages = newMapForAssistant.get(conversationId) || [];
        newMapForAssistant.set(conversationId, [...currentMessages, assistantMessage]);
        onMessagesMapChange(newMapForAssistant);
        
        logger.success('Chat response received', { 
          contentLength: assistantContent.length,
          conversationId 
        }, 'ChatPanel');
      }

      setStreamingContent('');

    } catch (error) {
      logger.error('Failed to send chat message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        conversationId,
      }, 'ChatPanel');

      if (conversationId) {
        // Provide more informative error message to user
        let userFriendlyError = dict.chat.errorMessage;
        
        if (error instanceof Error) {
          const errorMsg = error.message.toLowerCase();
          if (errorMsg.includes('failed to connect') || errorMsg.includes('fetch failed')) {
            userFriendlyError = 'Unable to connect to the AI service. Please check your network connection and API configuration.';
          } else if (errorMsg.includes('timed out') || errorMsg.includes('timeout')) {
            userFriendlyError = 'The request timed out. Please try again or check your network connection.';
          } else if (errorMsg.includes('api url') || errorMsg.includes('accessible')) {
            userFriendlyError = error.message; // Use the detailed error message from backend
          }
        }
        
        const errorMessage: Message = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: userFriendlyError,
          timestamp: new Date(),
        };

        const newMapForError = new Map(messagesMap);
        const currentMessages = newMapForError.get(conversationId) || [];
        newMapForError.set(conversationId, [...currentMessages, errorMessage]);
        onMessagesMapChange(newMapForError);
      }
      setStreamingContent('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearChat = () => {
    if (!conversationId) {
      logger.error('No active conversation to clear', undefined, 'ChatPanel');
      return;
    }

    logger.info('Clearing chat context', { 
      currentMessageCount: messages.length,
      conversationId 
    }, 'ChatPanel');
    
    // Add a cleared indicator message
    const clearedMessage: Message = {
      id: `cleared-${Date.now()}`,
      role: 'assistant',
      content: dict.chat.clearedMessage,
      timestamp: new Date(),
      isCleared: true,
    };
    
    // Keep all messages (including history) but add cleared indicator
    const newMapForClear = new Map(messagesMap);
    const currentMessages = newMapForClear.get(conversationId) || [];
    newMapForClear.set(conversationId, [...currentMessages, clearedMessage]);
    onMessagesMapChange(newMapForClear);
    
    setStreamingContent('');
    
    logger.debug('Chat context cleared', { 
      newMessageCount: messages.length + 1 
    }, 'ChatPanel');
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Start a conversation...</p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage
                key={message.id}
                role={message.role as 'user' | 'assistant'}
                content={message.content}
                timestamp={message.timestamp}
              />
            ))}

            {/* Streaming message with typing indicator */}
            {streamingContent && (
              <div className="relative">
                <ChatMessage
                  role="assistant"
                  content={streamingContent}
                />
                {/* Blinking cursor to indicate active streaming */}
                <div className="inline-block w-2 h-4 bg-primary ml-1 animate-pulse" />
              </div>
            )}

            {/* Loading indicator */}
            {isLoading && !streamingContent && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">{dict.chat.thinking}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Clear Button */}
      <div className="px-4 pb-2 border-t border-border bg-background">
        <button
          onClick={handleClearChat}
          disabled={messages.length <= 1 || isLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-border"
          aria-label="Clear chat context"
          tabIndex={0}
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>{dict.chat.clearButton}</span>
        </button>
      </div>

      {/* Input Area */}
      <ChatInput
        onSend={handleSendMessage}
        disabled={isLoading}
        placeholder={dict.chat.inputPlaceholder}
      />
    </div>
  );
};

export default ChatPanel;

