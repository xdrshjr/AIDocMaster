/**
 * ChatDialog Component
 * Main chat interface with message history and streaming support
 * Displays above the floating chat button
 */

'use client';

import { useState, useEffect, useRef, forwardRef } from 'react';
import { flushSync } from 'react-dom';
import { X, Loader2, Trash2, Trash } from 'lucide-react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { logger } from '@/lib/logger';
import type { ChatMessage as ChatMessageType } from '@/lib/chatClient';
import { syncModelConfigsToCookies } from '@/lib/modelConfigSync';
import { buildApiUrl } from '@/lib/apiConfig';
import { loadModelConfigs, getDefaultModel, type ModelConfig } from '@/lib/modelConfig';

export interface ChatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  welcomeMessage?: string;
}

interface Message extends ChatMessageType {
  id: string;
  timestamp: Date;
}

const ChatDialog = forwardRef<HTMLDivElement, ChatDialogProps>(({ 
  isOpen, 
  onClose, 
  title = 'AI Assistant',
  welcomeMessage = 'Hello! I\'m your AI assistant. How can I help you today?'
}, ref) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [viewportHeight, setViewportHeight] = useState(0);
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Track viewport height for responsive dialog sizing
  useEffect(() => {
    const updateViewportHeight = () => {
      const height = window.innerHeight;
      setViewportHeight(height);
      logger.debug('Viewport height updated', { 
        height, 
        calculatedChatHeight: Math.floor(height * 0.8) 
      }, 'ChatDialog');
    };

    // Initialize viewport height
    updateViewportHeight();
    logger.info('Chat dialog viewport tracking initialized', { 
      initialHeight: window.innerHeight 
    }, 'ChatDialog');

    // Add resize listener with debouncing for performance
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        updateViewportHeight();
      }, 100);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
      logger.debug('Chat dialog viewport tracking cleaned up', undefined, 'ChatDialog');
    };
  }, []);

  // Load available models on mount
  useEffect(() => {
    const loadModels = async () => {
      setIsLoadingModels(true);
      logger.info('Loading available models for selection', undefined, 'ChatDialog');
      
      try {
        const configList = await loadModelConfigs();
        const enabledModels = configList.models.filter(m => m.isEnabled !== false);
        
        logger.info('Models loaded for selector', {
          totalModels: configList.models.length,
          enabledModels: enabledModels.length,
        }, 'ChatDialog');
        
        setAvailableModels(enabledModels);
        
        // Set default model as selected
        const defaultModel = await getDefaultModel();
        if (defaultModel) {
          setSelectedModel(defaultModel);
          logger.info('Default model selected', {
            modelId: defaultModel.id,
            modelName: defaultModel.name,
          }, 'ChatDialog');
        } else if (enabledModels.length > 0) {
          setSelectedModel(enabledModels[0]);
          logger.info('No default model, selected first enabled model', {
            modelId: enabledModels[0].id,
            modelName: enabledModels[0].name,
          }, 'ChatDialog');
        } else {
          logger.warn('No enabled models available', undefined, 'ChatDialog');
        }
      } catch (error) {
        logger.error('Failed to load models for selector', {
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'ChatDialog');
      } finally {
        setIsLoadingModels(false);
      }
    };
    
    loadModels();
  }, []);

  // Initialize with welcome message
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMsg: Message = {
        id: 'welcome',
        role: 'assistant',
        content: welcomeMessage,
        timestamp: new Date(),
      };
      setMessages([welcomeMsg]);
      logger.component('ChatDialog', 'initialized with welcome message');
    }
  }, [isOpen, messages.length, welcomeMessage]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, streamingContent]);

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || isLoading) {
      logger.debug('Message send blocked', { 
        hasContent: !!content.trim(), 
        isLoading 
      }, 'ChatDialog');
      return;
    }

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      timestamp: new Date(),
    };

    // Add user message immediately so it's visible
    setMessages((prev) => [...prev, userMessage]);
    
    logger.info('User message added to chat', {
      messageId: userMessage.id,
      messageCount: messages.length + 1,
      content: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
    }, 'ChatDialog');
    
    setIsLoading(true);
    setStreamingContent('');

    logger.info('Sending chat message to API', { messageLength: content.length }, 'ChatDialog');

    try {
      // Sync model configurations to cookies before API call
      await syncModelConfigsToCookies();
      
      // Prepare messages for API (without id and timestamp)
      const apiMessages: ChatMessageType[] = messages
        .filter(msg => msg.id !== 'welcome') // Exclude welcome message
        .map(({ role, content }) => ({ role, content }));
      
      apiMessages.push({ role: 'user', content });

      // Get appropriate API URL based on environment
      const apiUrl = await buildApiUrl('/api/chat');
      logger.debug('Using API URL for chat', { apiUrl }, 'ChatDialog');

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
          }, 'ChatDialog');
        }
        
        logger.error('API request failed', { 
          status: response.status,
          statusText: response.statusText,
          error: errorData.error,
          details: errorData.details,
        }, 'ChatDialog');
        
        const errorMessage = errorData.details || errorData.error || `Failed to get response (${response.status} ${response.statusText})`;
        throw new Error(errorMessage);
      }

      if (!response.body) {
        throw new Error('Response body is empty');
      }

      logger.info('Starting to process streaming response', {
        hasResponseBody: !!response.body,
        messageCount: messages.length,
        responseStatus: response.status,
        contentType: response.headers.get('content-type'),
      }, 'ChatDialog');

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
        messageCount: messages.length,
        streamStartTime,
      }, 'ChatDialog');

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
            }, 'ChatDialog');
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
            }, 'ChatDialog');
            break;
          }

          // Validate chunk
          if (!value || value.length === 0) {
            emptyChunkCount++;
            logger.warn('Received empty chunk from stream', {
              chunkIndex: chunkCount,
              emptyChunkCount,
            }, 'ChatDialog');
            continue;
          }

          chunkCount++;
          
          // Log first chunk received for debugging
          if (chunkCount === 1) {
            logger.info('First stream chunk received', {
              chunkSize: value.length,
              timeSinceStart: `${Date.now() - streamStartTime}ms`,
            }, 'ChatDialog');
          }
          
          try {
            buffer += decoder.decode(value, { stream: true });
          } catch (decodeError) {
            logger.error('Failed to decode chunk', {
              error: decodeError instanceof Error ? decodeError.message : 'Unknown error',
              chunkIndex: chunkCount,
              chunkSize: value.length,
            }, 'ChatDialog');
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
                      currentMessagesVisible: messages.length,
                      userMessagePresent: messages.some(m => m.role === 'user'),
                    }, 'ChatDialog');
                  }
                  
                  // Use flushSync to ensure immediate rendering of streaming content
                  flushSync(() => {
                    setStreamingContent(assistantContent);
                  });
                  
                  // Log streaming update periodically
                  if (chunkCount % 10 === 0) {
                    logger.debug('Streaming content update', {
                      contentLength: assistantContent.length,
                      chunkNumber: chunkCount,
                      messagesInView: messages.length,
                    }, 'ChatDialog');
                  }
                  
                  // Log progress periodically
                  const now = Date.now();
                  if (now - lastProgressLog >= progressLogInterval) {
                    logger.debug('Stream content accumulation progress', {
                      contentLength: assistantContent.length,
                      chunksProcessed: chunkCount,
                      parseErrors: parseErrorCount,
                      elapsed: `${now - streamStartTime}ms`,
                      averageChunkSize: Math.round(assistantContent.length / chunkCount),
                    }, 'ChatDialog');
                    lastProgressLog = now;
                  }
                } else if (data.choices?.[0]?.finish_reason) {
                  logger.debug('Stream finished', {
                    finishReason: data.choices[0].finish_reason,
                    contentLength: assistantContent.length,
                  }, 'ChatDialog');
                }
              } catch (parseError) {
                parseErrorCount++;
                logger.warn('Failed to parse SSE chunk', {
                  error: parseError instanceof Error ? parseError.message : 'Unknown error',
                  linePreview: trimmedLine.substring(0, 100),
                  parseErrorCount,
                  chunkIndex: chunkCount,
                }, 'ChatDialog');
                
                // Fail if too many parse errors
                if (parseErrorCount >= maxParseErrors) {
                  logger.error('Too many parse errors, aborting stream', {
                    parseErrorCount,
                    maxParseErrors,
                    chunkCount,
                  }, 'ChatDialog');
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
          }, 'ChatDialog');
        }
      } finally {
        try {
          reader.releaseLock();
          logger.debug('Stream reader released', {
            chunkCount,
            parseErrorCount,
          }, 'ChatDialog');
        } catch (releaseError) {
          logger.warn('Failed to release reader', {
            error: releaseError instanceof Error ? releaseError.message : 'Unknown error',
          }, 'ChatDialog');
        }
      }

      // Add complete assistant message
      if (assistantContent) {
        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: assistantContent,
          timestamp: new Date(),
        };

        // CRITICAL: Use functional update to ensure we have the latest messages
        // including the user message that was just added
        setMessages((prev) => {
          const updatedMessages = [...prev, assistantMessage];
          logger.success('Chat response completed and added', { 
            contentLength: assistantContent.length,
            totalMessagesNow: updatedMessages.length,
            userMessagesCount: updatedMessages.filter(m => m.role === 'user').length,
            lastUserMessage: updatedMessages.filter(m => m.role === 'user').slice(-1)[0]?.content?.substring(0, 50),
          }, 'ChatDialog');
          return updatedMessages;
        });
      }

      setStreamingContent('');

    } catch (error) {
      logger.error('Failed to send chat message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
      }, 'ChatDialog');

      // Provide more informative error message to user
      let userFriendlyError = 'Sorry, I encountered an error. Please try again.';
      
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

      setMessages((prev) => [...prev, errorMessage]);
      setStreamingContent('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    logger.component('ChatDialog', 'closed');
    onClose();
  };

  const handleClearChat = () => {
    const currentMessageCount = messages.length;
    logger.info('Clearing chat context (adding cleared indicator)', { 
      messageCount: currentMessageCount,
    }, 'ChatDialog');
    
    // Add a cleared indicator message but keep history
    const clearedMessage: Message = {
      id: `cleared-${Date.now()}`,
      role: 'assistant',
      content: '✓ Chat cleared',
      timestamp: new Date(),
    };
    
    setMessages([...messages, clearedMessage]);
    setStreamingContent('');
    
    logger.debug('Chat context cleared', { 
      previousMessageCount: currentMessageCount,
      currentMessageCount: messages.length + 1 
    }, 'ChatDialog');
  };

  const handleClearAll = () => {
    const currentMessageCount = messages.length;
    logger.info('Clearing all chat messages', { 
      messageCount: currentMessageCount,
    }, 'ChatDialog');
    
    // Reset to only the welcome message
    const welcomeMsg: Message = {
      id: 'welcome',
      role: 'assistant',
      content: welcomeMessage,
      timestamp: new Date(),
    };
    
    setMessages([welcomeMsg]);
    setStreamingContent('');
    
    logger.info('All messages cleared, reset to welcome message', { 
      previousMessageCount: currentMessageCount,
      currentMessageCount: 1 
    }, 'ChatDialog');
  };

  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelId = e.target.value;
    const model = availableModels.find(m => m.id === modelId);
    
    if (model) {
      setSelectedModel(model);
      logger.info('Model selection changed', {
        modelId: model.id,
        modelName: model.name,
        displayName: model.name,
      }, 'ChatDialog');
    } else {
      logger.warn('Selected model not found', { modelId }, 'ChatDialog');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  // Calculate chat dialog height as 80% of viewport height
  // Minimum height of 300px to ensure usability
  const calculatedHeight = viewportHeight > 0 
    ? Math.max(Math.floor(viewportHeight * 0.8), 300)
    : 720; // Default fallback height

  logger.debug('Chat dialog height calculated', {
    viewportHeight,
    calculatedHeight,
    percentage: '80%'
  }, 'ChatDialog');

  return (
    <div
      ref={ref}
      className="fixed bottom-24 right-6 w-[576px] bg-background border-2 border-border rounded-lg shadow-xl flex flex-col z-50 animate-slideUp"
      style={{ height: `${calculatedHeight}px` }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-label={title}
      aria-modal="true"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/50">
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <button
          onClick={handleClose}
          className="w-8 h-8 rounded-lg hover:bg-muted flex items-center justify-center transition-colors"
          aria-label="Close chat"
          tabIndex={0}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-1"
      >
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
            <div className="inline-block w-1.5 h-4 bg-purple-500 ml-1 animate-pulse rounded-sm" />
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && !streamingContent && (
          <div className="flex items-center gap-2.5 text-muted-foreground ml-14 mb-4">
            <Loader2 className="w-4 h-4 animate-spin text-purple-500" />
            <span className="text-sm">Thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Model Selector and Clear Buttons */}
      <div className="px-6 py-3 border-t border-border/50 bg-background/50 flex items-center justify-between gap-4">
        {/* Model Selector - Left */}
        <div className="flex items-center gap-2">
          <label htmlFor="dialog-model-selector" className="text-sm text-muted-foreground font-medium whitespace-nowrap">
            Model:
          </label>
          <select
            id="dialog-model-selector"
            value={selectedModel?.id || ''}
            onChange={handleModelChange}
            disabled={isLoadingModels || availableModels.length === 0 || isLoading}
            className="px-3 py-1.5 text-sm bg-background border border-input rounded-md hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Select AI model"
          >
            {availableModels.length === 0 ? (
              <option value="">No models configured</option>
            ) : (
              availableModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Clear Buttons - Right */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearChat}
            disabled={messages.length <= 1 || isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/80 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-border/50"
            aria-label="Clear chat context"
            tabIndex={0}
          >
            <Trash2 className="w-4 h-4" />
            <span className="font-medium">Clear</span>
          </button>
          
          <button
            onClick={handleClearAll}
            disabled={messages.length <= 1 || isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-destructive/50"
            aria-label="Clear all messages"
            tabIndex={0}
          >
            <Trash className="w-4 h-4" />
            <span className="font-medium">Clear All</span>
          </button>
        </div>
      </div>

      {/* Input */}
      <ChatInput
        onSend={handleSendMessage}
        disabled={isLoading}
        placeholder="Type your message..."
      />
    </div>
  );
});

ChatDialog.displayName = 'ChatDialog';

export default ChatDialog;

