/**
 * FloatingChatButton Component
 * Circular floating button in bottom-right corner
 * Toggles the chat dialog interface
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { MessageCircle, X } from 'lucide-react';
import ChatDialog from './ChatDialog';
import { logger } from '@/lib/logger';

export interface FloatingChatButtonProps {
  title?: string;
  welcomeMessage?: string;
}

const FloatingChatButton = ({ 
  title = 'AI Assistant',
  welcomeMessage = 'Hello! I\'m your AI assistant. How can I help you today?'
}: FloatingChatButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    logger.info(`Chat dialog ${newState ? 'opened' : 'closed'}`, undefined, 'FloatingChatButton');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggle();
    }
  };

  // Click outside detection to auto-collapse the chat panel
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Check if click is outside both the dialog and the button
      if (
        dialogRef.current && 
        !dialogRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        logger.info('Chat dialog closed by clicking outside', undefined, 'FloatingChatButton');
        setIsOpen(false);
      }
    };

    // Add event listener with a slight delay to prevent immediate closing
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      logger.debug('Click-outside detection enabled for chat dialog', undefined, 'FloatingChatButton');
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      logger.debug('Click-outside detection disabled for chat dialog', undefined, 'FloatingChatButton');
    };
  }, [isOpen]);

  return (
    <>
      {/* Chat Dialog */}
      <ChatDialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={title}
        welcomeMessage={welcomeMessage}
        ref={dialogRef}
      />

      {/* Floating Button */}
      <button
        ref={buttonRef}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className={`fixed bottom-6 right-6 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl flex items-center justify-center transition-all duration-300 z-40 ${
          isOpen ? 'rotate-90' : 'rotate-0'
        }`}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
        aria-expanded={isOpen}
        tabIndex={0}
      >
        {isOpen ? (
          <X className="w-6 h-6 transition-transform duration-200" />
        ) : (
          <MessageCircle className="w-6 h-6 transition-transform duration-200" />
        )}
        
        {/* Pulse animation when closed */}
        {!isOpen && (
          <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-20" />
        )}
      </button>
    </>
  );
};

export default FloatingChatButton;

