/**
 * ChatStopButton Component
 * Displays a stop button during AI streaming response
 * Shows a rotating loader icon and allows users to stop the streaming
 */

'use client';

import { StopCircle, Loader2 } from 'lucide-react';
import { logger } from '@/lib/logger';

export interface ChatStopButtonProps {
  onStop: () => void;
  disabled?: boolean;
}

const ChatStopButton = ({ onStop, disabled = false }: ChatStopButtonProps) => {
  const handleClick = () => {
    if (disabled) {
      return;
    }
    
    logger.info('User clicked stop button to stop AI response', undefined, 'ChatStopButton');
    onStop();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div className="flex items-center justify-center py-3 animate-fadeIn">
      <button
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="group flex items-center gap-2.5 px-5 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 active:scale-95"
        aria-label="Stop AI response"
        tabIndex={0}
      >
        {/* Rotating loader icon */}
        <Loader2 
          className="w-5 h-5 animate-spin" 
          strokeWidth={2.5}
        />
        
        {/* Stop icon */}
        <StopCircle 
          className="w-5 h-5 group-hover:animate-pulse" 
          strokeWidth={2.5}
        />
        
        {/* Button text */}
        <span className="font-semibold text-sm tracking-wide">
          Stop Generating
        </span>
      </button>
    </div>
  );
};

export default ChatStopButton;

