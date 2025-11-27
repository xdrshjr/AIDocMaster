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
import ConversationList, { type Conversation } from './ConversationList';
import ChatPanel, { type Message } from './ChatPanel';
import ConfirmDialog from './ConfirmDialog';

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

  const handleNewConversation = () => {
    const newConversation: Conversation = {
      id: `conv-${Date.now()}`,
      title: `Conversation ${conversations.length + 1}`,
      timestamp: new Date(),
      messageCount: 0,
    };
    
    onConversationsChange([newConversation, ...conversations]);
    onActiveConversationChange(newConversation.id);
    
    logger.info('New conversation created', { 
      conversationId: newConversation.id,
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

