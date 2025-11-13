/**
 * AIChatContainer Component
 * Main container for AI Chat task with split-panel layout
 * Left panel (15%): Conversation list
 * Right panel (85%): Chat interface
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { logger } from '@/lib/logger';
import ConversationList, { type Conversation } from './ConversationList';
import ChatPanel, { type Message } from './ChatPanel';

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
    </div>
  );
};

export default AIChatContainer;

