/**
 * AIDocValidationContainer Component
 * Main container for AI Document Validation task with split-panel layout
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { logger } from '@/lib/logger';
import WordEditorPanel from './WordEditorPanel';
import ValidationResultPanel from './ValidationResultPanel';

interface AIDocValidationContainerProps {
  onExportRequest?: () => void;
  onContentChange?: (content: string) => void;
  onExportReadyChange?: (ready: boolean) => void;
}

const AIDocValidationContainer = ({ 
  onExportRequest, 
  onContentChange,
  onExportReadyChange,
}: AIDocValidationContainerProps) => {
  const [leftPanelWidth, setLeftPanelWidth] = useState(60); // percentage
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logger.component('AIDocValidationContainer', 'mounted');
  }, []);

  const handleContentChange = (content: string) => {
    logger.debug('Editor content changed', { contentLength: content.length }, 'AIDocValidationContainer');
    onContentChange?.(content);
  };

  const handleExportReady = (ready: boolean) => {
    logger.info('Export ready state changed', { ready }, 'AIDocValidationContainer');
    onExportReadyChange?.(ready);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    logger.debug('Started resizing panels', undefined, 'AIDocValidationContainer');
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
    
    // Constrain width between 30% and 70%
    if (newWidth >= 30 && newWidth <= 70) {
      setLeftPanelWidth(newWidth);
    }
  };

  const handleMouseUp = () => {
    if (isResizing) {
      setIsResizing(false);
      logger.debug('Stopped resizing panels', { leftPanelWidth }, 'AIDocValidationContainer');
    }
  };

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, leftPanelWidth]);

  return (
    <div 
      ref={containerRef}
      className="h-full flex relative select-none"
    >
      {/* Left Panel - Word Editor */}
      <div 
        className="h-full overflow-hidden"
        style={{ width: `${leftPanelWidth}%` }}
      >
        <WordEditorPanel 
          onContentChange={handleContentChange}
          onExportReady={handleExportReady}
        />
      </div>

      {/* Resizer */}
      <div
        className={`w-1 bg-border hover:bg-primary cursor-col-resize transition-colors relative group ${
          isResizing ? 'bg-primary' : ''
        }`}
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-y-0 -left-1 -right-1 flex items-center justify-center">
          <div className="w-1 h-12 bg-border group-hover:bg-primary rounded-full transition-colors" />
        </div>
      </div>

      {/* Right Panel - Validation Results */}
      <div 
        className="h-full overflow-hidden"
        style={{ width: `${100 - leftPanelWidth}%` }}
      >
        <ValidationResultPanel />
      </div>
    </div>
  );
};

export default AIDocValidationContainer;

