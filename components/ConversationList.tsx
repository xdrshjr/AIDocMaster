/**
 * ConversationList Component
 * Left sidebar showing conversation history
 * Allows users to browse and select previous conversations
 */

'use client';

import { useEffect } from 'react';
import { MessageSquare, Plus } from 'lucide-react';
import { logger } from '@/lib/logger';
import { getDictionary } from '@/lib/i18n/dictionaries';

export interface Conversation {
  id: string;
  title: string;
  timestamp: Date;
  messageCount: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onNewConversation: () => void;
}

const ConversationList = ({
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
}: ConversationListProps) => {
  const dict = getDictionary('en');

  useEffect(() => {
    logger.component('ConversationList', 'mounted', {
      conversationCount: conversations.length,
    });
  }, [conversations.length]);

  const handleConversationClick = (conversationId: string) => {
    logger.info('Conversation selected', { conversationId }, 'ConversationList');
    onSelectConversation(conversationId);
  };

  const handleNewConversation = () => {
    logger.info('New conversation requested', undefined, 'ConversationList');
    onNewConversation();
  };

  const handleKeyDown = (e: React.KeyboardEvent, conversationId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleConversationClick(conversationId);
    }
  };

  const handleNewKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleNewConversation();
    }
  };

  const formatTimestamp = (date: Date): string => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) {
      return 'Just now';
    }
    if (hours < 24) {
      return `${hours}h ago`;
    }
    if (days === 1) {
      return 'Yesterday';
    }
    if (days < 7) {
      return `${days}d ago`;
    }
    return date.toLocaleDateString();
  };

  return (
    <aside className="h-full bg-sidebar border-r-4 border-sidebar-border flex flex-col">
      {/* Header with New Conversation button */}
      <div className="p-3 border-b-2 border-sidebar-border">
        <button
          onClick={handleNewConversation}
          onKeyDown={handleNewKeyDown}
          tabIndex={0}
          aria-label={dict.chat.newConversation}
          className="w-full px-3 py-2 bg-primary text-primary-foreground border-2 border-border hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none transition-all shadow-sm flex items-center justify-center gap-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>{dict.chat.newConversation}</span>
        </button>
      </div>

      {/* Conversations Title */}
      <div className="px-3 py-2 border-b border-sidebar-border">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {dict.chat.conversations}
        </h3>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No conversations yet</p>
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {conversations.map((conversation) => {
              const isActive = conversation.id === activeConversationId;

              return (
                <button
                  key={conversation.id}
                  onClick={() => handleConversationClick(conversation.id)}
                  onKeyDown={(e) => handleKeyDown(e, conversation.id)}
                  tabIndex={0}
                  aria-label={`Conversation: ${conversation.title}`}
                  className={`w-full px-3 py-2 text-left border-2 transition-all ${
                    isActive
                      ? 'bg-primary text-primary-foreground border-border shadow-md'
                      : 'bg-card text-card-foreground border-border hover:bg-accent hover:text-accent-foreground shadow-sm hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-none'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <MessageSquare className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {conversation.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs opacity-70">
                          {formatTimestamp(conversation.timestamp)}
                        </span>
                        <span className="text-xs opacity-70">
                          •
                        </span>
                        <span className="text-xs opacity-70">
                          {conversation.messageCount} msg
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};

export default ConversationList;

