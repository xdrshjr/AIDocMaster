/**
 * AIChatContainer Component
 * Main container for AI Chat task with split-panel layout
 * Left panel (15%): Conversation list
 * Right panel (85%): Chat interface
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import ConversationList, { type Conversation, type ConversationType } from './ConversationList';
import ChatPanel, { type Message } from './ChatPanel';
import ConfirmDialog from './ConfirmDialog';
import { getChatBotById } from '@/lib/chatBotConfig';
import { buildApiUrl } from '@/lib/apiConfig';

interface AIChatContainerProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  messagesMap: Map<string, Message[]>;
  onConversationsChange: (conversations: Conversation[]) => void;
  onActiveConversationChange: (conversationId: string | null) => void;
  onMessagesMapChange: (messagesMap: Map<string, Message[]>) => void;
}

const AIChatContainer = ({
  conversations,
  activeConversationId,
  messagesMap,
  onConversationsChange,
  onActiveConversationChange,
  onMessagesMapChange,
}: AIChatContainerProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  const [conversationToDelete, setConversationToDelete] = useState<Conversation | null>(null);

  useEffect(() => {
    logger.component('AIChatContainer', 'mounted', {
      conversationsCount: conversations.length,
      activeConversationId,
      messagesMapSize: messagesMap.size,
    });
    
    // Initialize with first conversation only if empty
    if (conversations.length === 0) {
      const initialConversation: Conversation = {
        id: `conv-${Date.now()}`,
        title: 'New Conversation',
        timestamp: new Date(),
        messageCount: 0,
        type: 'basic',
      };
      
      onConversationsChange([initialConversation]);
      onActiveConversationChange(initialConversation.id);
      
      logger.info('Initial conversation created', { 
        conversationId: initialConversation.id 
      }, 'AIChatContainer');
    } else {
      logger.info('AIChatContainer restored with existing state', {
        conversationsCount: conversations.length,
        activeConversationId,
        totalMessages: Array.from(messagesMap.values()).reduce((sum, msgs) => sum + msgs.length, 0),
      }, 'AIChatContainer');
    }
  }, []);

  const handleSelectConversation = (conversationId: string) => {
    logger.info('Conversation selected', { conversationId }, 'AIChatContainer');
    onActiveConversationChange(conversationId);
  };

  const handleNewConversation = async (
    type?: ConversationType,
    metadata?: { chatbotId?: string; agentType?: string }
  ) => {
    logger.info('Creating new conversation', { type, metadata }, 'AIChatContainer');

    let conversationTitle = `Conversation ${conversations.length + 1}`;
    let conversationType: ConversationType = type || 'basic';
    let conversationMetadata: Conversation['metadata'] = {};

    // Handle different conversation types
    if (type === 'chatbot' && metadata?.chatbotId) {
      try {
        const chatbot = await getChatBotById(metadata.chatbotId);
        if (chatbot) {
          conversationTitle = chatbot.name;
          conversationMetadata = {
            chatbotId: chatbot.id,
            chatbotName: chatbot.name,
          };
          logger.info('Chat bot conversation created', {
            conversationId: `conv-${Date.now()}`,
            chatbotId: chatbot.id,
            chatbotName: chatbot.name,
          }, 'AIChatContainer');
        } else {
          logger.warn('Chat bot not found, falling back to basic conversation', {
            chatbotId: metadata.chatbotId,
          }, 'AIChatContainer');
          conversationType = 'basic';
        }
      } catch (error) {
        logger.error('Failed to load chat bot, falling back to basic conversation', {
          error: error instanceof Error ? error.message : 'Unknown error',
          chatbotId: metadata.chatbotId,
        }, 'AIChatContainer');
        conversationType = 'basic';
      }
    } else if (type === 'agent' && metadata?.agentType) {
      try {
        // Load agent info from API
        const apiUrl = await buildApiUrl('/api/agents');
        const response = await fetch(apiUrl);
        
        if (response.ok) {
          const data = await response.json();
          const agent = data.agents?.find((a: any) => a.type === metadata.agentType);
          
          if (agent) {
            conversationTitle = agent.name;
            conversationMetadata = {
              agentType: agent.type,
              agentName: agent.name,
            };
            logger.info('Agent conversation created', {
              conversationId: `conv-${Date.now()}`,
              agentType: agent.type,
              agentName: agent.name,
            }, 'AIChatContainer');
          } else {
            logger.warn('Agent not found, falling back to basic conversation', {
              agentType: metadata.agentType,
            }, 'AIChatContainer');
            conversationType = 'basic';
          }
        } else {
          logger.warn('Failed to load agents, falling back to basic conversation', {
            status: response.status,
          }, 'AIChatContainer');
          conversationType = 'basic';
        }
      } catch (error) {
        logger.error('Failed to load agent info, falling back to basic conversation', {
          error: error instanceof Error ? error.message : 'Unknown error',
          agentType: metadata.agentType,
        }, 'AIChatContainer');
        conversationType = 'basic';
      }
    }

    const newConversation: Conversation = {
      id: `conv-${Date.now()}`,
      title: conversationTitle,
      timestamp: new Date(),
      messageCount: 0,
      type: conversationType,
      metadata: Object.keys(conversationMetadata).length > 0 ? conversationMetadata : undefined,
    };
    
    onConversationsChange([newConversation, ...conversations]);
    onActiveConversationChange(newConversation.id);
    
    logger.info('New conversation created', { 
      conversationId: newConversation.id,
      type: conversationType,
      totalConversations: conversations.length + 1 
    }, 'AIChatContainer');
  };

  const handleRequestDeleteConversation = (conversationId: string) => {
    const targetConversation = conversations.find(
      (conversation) => conversation.id === conversationId
    );

    if (!targetConversation) {
      logger.warn(
        'Requested delete for non-existent conversation',
        { conversationId },
        'AIChatContainer'
      );
      return;
    }

    logger.info(
      'Delete conversation requested',
      {
        conversationId: targetConversation.id,
        title: targetConversation.title,
        messageCount: targetConversation.messageCount,
        isActive: targetConversation.id === activeConversationId,
      },
      'AIChatContainer'
    );

    setConversationToDelete(targetConversation);
  };

  const handleConfirmDeleteConversation = () => {
    if (!conversationToDelete) {
      logger.warn(
        'Confirm delete called with no pending conversation',
        undefined,
        'AIChatContainer'
      );
      return;
    }

    const conversationId = conversationToDelete.id;
    const isDeletingActive = conversationId === activeConversationId;

    const updatedConversations = conversations.filter(
      (conversation) => conversation.id !== conversationId
    );

    const updatedMessagesMap = new Map(messagesMap);
    const removedMessages = updatedMessagesMap.get(conversationId)?.length ?? 0;
    updatedMessagesMap.delete(conversationId);

    let nextActiveConversationId = activeConversationId;

    if (isDeletingActive) {
      nextActiveConversationId =
        updatedConversations.length > 0 ? updatedConversations[0].id : null;
    }

    logger.info(
      'Conversation deleted',
      {
        conversationId,
        title: conversationToDelete.title,
        wasActive: isDeletingActive,
        remainingConversations: updatedConversations.length,
        removedMessages,
        nextActiveConversationId,
      },
      'AIChatContainer'
    );

    onConversationsChange(updatedConversations);
    onMessagesMapChange(updatedMessagesMap);
    onActiveConversationChange(nextActiveConversationId);

    setConversationToDelete(null);
  };

  const handleCancelDeleteConversation = () => {
    if (!conversationToDelete) {
      return;
    }

    logger.debug(
      'Conversation delete cancelled by user',
      {
        conversationId: conversationToDelete.id,
        title: conversationToDelete.title,
      },
      'AIChatContainer'
    );

    setConversationToDelete(null);
  };

  const handleMessagesChange = useCallback((messages: Message[]) => {
    // Update conversation metadata when messages change
    if (!activeConversationId) {
      return;
    }

    const currentConv = conversations.find((c) => c.id === activeConversationId);
    if (!currentConv) {
      return;
    }

    // Filter out welcome and cleared messages for count
    const realMessageCount = messages.filter(
      (msg) => !msg.id.startsWith('welcome-') && !msg.isCleared
    ).length;

    // Update title from first user message if still default
    let title = currentConv.title;
    if (title.startsWith('New Conversation') || title.startsWith('Conversation ')) {
      const firstUserMessage = messages.find(
        (msg) => msg.role === 'user' && !msg.id.startsWith('welcome-')
      );
      if (firstUserMessage) {
        // Use first 30 characters of first message as title
        title = firstUserMessage.content.slice(0, 30);
        if (firstUserMessage.content.length > 30) {
          title += '...';
        }
      }
    }

    // Only update if something actually changed
    if (currentConv.messageCount === realMessageCount && currentConv.title === title) {
      return;
    }

    logger.debug('Conversation metadata updated', {
      conversationId: activeConversationId,
      messageCount: realMessageCount,
      title,
    }, 'AIChatContainer');

    const updatedConversations = conversations.map((conv) => {
      if (conv.id === activeConversationId) {
        return {
          ...conv,
          title,
          messageCount: realMessageCount,
          timestamp: new Date(),
        };
      }
      return conv;
    });

    onConversationsChange(updatedConversations);
  }, [activeConversationId, conversations, onConversationsChange]);

  return (
    <div className="h-full flex overflow-hidden">
      {/* Left Panel - Conversation List (15%) */}
      <div className="w-[15%] h-full">
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleRequestDeleteConversation}
        />
      </div>

      {/* Right Panel - Chat Interface (85%) */}
      <div className="w-[85%] h-full">
        {activeConversationId ? (
          <ChatPanel
            conversationId={activeConversationId}
            conversation={conversations.find(c => c.id === activeConversationId) || null}
            messagesMap={messagesMap}
            onMessagesMapChange={onMessagesMapChange}
            onMessagesChange={handleMessagesChange}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p className="text-sm">Select or create a conversation to start chatting</p>
          </div>
        )}
      </div>

      {conversationToDelete && (
        <ConfirmDialog
          isOpen={!!conversationToDelete}
          title={dict.chat.deleteConversationTitle}
          description={dict.chat.deleteConversationDescription}
          confirmLabel={dict.chat.deleteConversationConfirm}
          cancelLabel={dict.chat.deleteConversationCancel}
          isDestructive
          onConfirm={handleConfirmDeleteConversation}
          onCancel={handleCancelDeleteConversation}
        />
      )}
    </div>
  );
};

export default AIChatContainer;

