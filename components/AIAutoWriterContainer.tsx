'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { logger } from '@/lib/logger';
import { type DocumentParagraph } from '@/lib/documentUtils';
import WordEditorPanel, { type WordEditorPanelRef } from './WordEditorPanel';
import ChatDialog from './ChatDialog';

interface AIAutoWriterContainerProps {
  leftPanelWidth: number;
  onLeftPanelWidthChange: (width: number) => void;
  onDocumentFunctionsReady?: (
    getContent: () => string,
    updateContent: (content: string | DocumentParagraph[]) => void
  ) => void;
  onContentChange?: (content: string) => void;
}

const MIN_LEFT_WIDTH = 35;
const MAX_LEFT_WIDTH = 70;

const AIAutoWriterContainer = ({
  leftPanelWidth,
  onLeftPanelWidthChange,
  onDocumentFunctionsReady,
  onContentChange,
}: AIAutoWriterContainerProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wordEditorRef = useRef<WordEditorPanelRef>(null);
  const [isResizing, setIsResizing] = useState(false);
  // Track images to be inserted for each section
  const sectionImagesRef = useRef<Map<number, { url: string; description?: string }>>(new Map());

  const getEditorContent = useCallback(() => {
    if (!wordEditorRef.current) {
      logger.warn('Word editor ref unavailable while getting content', undefined, 'AIAutoWriterContainer');
      return '';
    }

    const editor = wordEditorRef.current.getEditor();
    if (!editor) {
      logger.warn('Word editor instance missing while getting content', undefined, 'AIAutoWriterContainer');
      return '';
    }

    const html = editor.getHTML();
    logger.debug('Auto-writer editor content fetched', { length: html.length }, 'AIAutoWriterContainer');
    return html;
  }, []);

  const updateEditorContent = useCallback((content: string | DocumentParagraph[]) => {
    if (!wordEditorRef.current) {
      logger.error('Word editor ref unavailable while updating content', undefined, 'AIAutoWriterContainer');
      return;
    }

    const editor = wordEditorRef.current.getEditor();
    if (!editor) {
      logger.error('Word editor instance missing while updating content', undefined, 'AIAutoWriterContainer');
      return;
    }

    if (Array.isArray(content)) {
      // Update paragraphs individually
      logger.info('Auto-writer updating document paragraphs', { paragraphCount: content.length }, 'AIAutoWriterContainer');
      content.forEach(para => {
        wordEditorRef.current?.updateParagraph(para.id, para.content);
      });
      logger.success('Auto-writer editor paragraphs updated from AI chat', { paragraphCount: content.length }, 'AIAutoWriterContainer');
    } else {
      // Note: Images are now primarily inserted via ProseMirror API in insertImageAfterSection
      // This code serves as a backup for cases where HTML is updated before images are inserted
      let htmlWithImages = content;
      if (sectionImagesRef.current.size > 0) {
        logger.debug('[Content Update] Checking for images to insert into HTML (backup method)', {
          imageCount: sectionImagesRef.current.size,
        }, 'AIAutoWriterContainer');
        
        // Parse HTML and insert images after each section (backup method)
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlWithImages;
        
        let h2Count = -1;
        const h2Elements = tempDiv.querySelectorAll('h2');
        let imagesInsertedCount = 0;
        
        h2Elements.forEach((h2, index) => {
          const imageInfo = sectionImagesRef.current.get(index);
          if (imageInfo) {
            // Check if image already exists after this section
            let nextElement = h2.nextElementSibling;
            let hasImage = false;
            
            // Check if there's already an image after this h2
            while (nextElement && nextElement.tagName !== 'H2') {
              if (nextElement.tagName === 'IMG' || (nextElement.querySelector && nextElement.querySelector('img'))) {
                hasImage = true;
                logger.debug('[Content Update] Image already exists in section (backup check)', {
                  sectionIndex: index,
                }, 'AIAutoWriterContainer');
                break;
              }
              nextElement = nextElement.nextElementSibling;
            }
            
            if (!hasImage) {
              // Find the last paragraph in this section
              let lastPara: Element | null = null;
              let current = h2.nextElementSibling;
              while (current && current.tagName !== 'H2') {
                if (current.tagName === 'P') {
                  lastPara = current;
                }
                current = current.nextElementSibling;
              }
              
              // Insert image after the last paragraph or after h2 if no paragraph
              const imageElement = document.createElement('img');
              imageElement.src = imageInfo.url;
              imageInfo.description && (imageElement.alt = imageInfo.description);
              imageElement.setAttribute('data-align', 'center');
              imageElement.className = 'editor-image';
              
              if (lastPara) {
                lastPara.insertAdjacentElement('afterend', imageElement);
              } else {
                h2.insertAdjacentElement('afterend', imageElement);
              }
              
              imagesInsertedCount++;
              logger.debug('[Content Update] Image inserted into HTML (backup method)', {
                sectionIndex: index,
                imageUrl: imageInfo.url.substring(0, 50),
              }, 'AIAutoWriterContainer');
            }
          }
        });
        
        htmlWithImages = tempDiv.innerHTML;
        logger.info('[Content Update] HTML updated with images (backup method)', {
          originalLength: content.length,
          updatedLength: htmlWithImages.length,
          imagesInserted: imagesInsertedCount,
          totalImagesRecorded: sectionImagesRef.current.size,
        }, 'AIAutoWriterContainer');
      }
      
      // Set HTML content with images
      editor.commands.setContent(htmlWithImages);
      logger.info('[Content Update] Auto-writer editor content updated from AI chat', { 
        length: htmlWithImages.length,
        imagesInContent: sectionImagesRef.current.size,
      }, 'AIAutoWriterContainer');
    }
  }, []);

  const insertImageAfterSection = useCallback((sectionIndex: number, imageUrl: string, imageDescription?: string) => {
    logger.info('[Image Insert] Starting image insertion for section', {
      sectionIndex,
      imageUrl: imageUrl.substring(0, 100),
      imageDescription: imageDescription?.substring(0, 50),
    }, 'AIAutoWriterContainer');

    // Store image info for this section as backup
    sectionImagesRef.current.set(sectionIndex, {
      url: imageUrl,
      description: imageDescription,
    });
    
    logger.debug('[Image Insert] Image info stored in ref', {
      sectionIndex,
      totalImagesRecorded: sectionImagesRef.current.size,
    }, 'AIAutoWriterContainer');

    // Use WordEditorPanel's insertImageAfterSection method which uses ProseMirror API
    // This is more reliable than DOM manipulation
    if (!wordEditorRef.current) {
      logger.warn('[Image Insert] Word editor ref not available', {
        sectionIndex,
      }, 'AIAutoWriterContainer');
      return false;
    }

    // Try to insert using WordEditorPanel's method
    // This method uses ProseMirror API which is more reliable
    const success = wordEditorRef.current.insertImageAfterSection(sectionIndex, imageUrl, imageDescription);
    
    if (success) {
      logger.success('[Image Insert] Image inserted successfully using ProseMirror API', {
        sectionIndex,
        imageUrl: imageUrl.substring(0, 50),
      }, 'AIAutoWriterContainer');
    } else {
      logger.warn('[Image Insert] Failed to insert image using ProseMirror API', {
        sectionIndex,
        imageUrl: imageUrl.substring(0, 50),
      }, 'AIAutoWriterContainer');
    }

    return success;
  }, []);

  const exposeDocumentFunctions = useCallback(() => {
    if (!wordEditorRef.current || !onDocumentFunctionsReady) {
      return;
    }

    onDocumentFunctionsReady(getEditorContent, updateEditorContent);
    logger.debug('Auto-writer document functions exposed to parent', undefined, 'AIAutoWriterContainer');
  }, [getEditorContent, updateEditorContent, onDocumentFunctionsReady]);

  useEffect(() => {
    exposeDocumentFunctions();
  }, [exposeDocumentFunctions]);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsResizing(true);
    logger.info('Auto-writer panels resizing started', { leftPanelWidth }, 'AIAutoWriterContainer');
  };

  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (!isResizing || !containerRef.current) {
      return;
    }

    const bounds = containerRef.current.getBoundingClientRect();
    const newWidth = ((event.clientX - bounds.left) / bounds.width) * 100;

    if (newWidth >= MIN_LEFT_WIDTH && newWidth <= MAX_LEFT_WIDTH) {
      onLeftPanelWidthChange(Number(newWidth.toFixed(2)));
    }
  }, [isResizing, onLeftPanelWidthChange]);

  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      logger.info('Auto-writer panels resizing stopped', { leftPanelWidth }, 'AIAutoWriterContainer');
    }
  }, [isResizing, leftPanelWidth]);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp, isResizing]);

  const handleContentChangeInternal = (content: string) => {
    logger.debug('Auto-writer editor content changed', { length: content.length }, 'AIAutoWriterContainer');
    onContentChange?.(content);
  };

  return (
    <div
      ref={containerRef}
      className="h-full flex relative bg-background"
      data-testid="auto-writer-container"
    >
      <section
        className="h-full overflow-hidden transition-[width]"
        style={{ width: `${leftPanelWidth}%` }}
        aria-label="Document editor"
      >
        <WordEditorPanel
          ref={wordEditorRef}
          onContentChange={handleContentChangeInternal}
        />
      </section>

      <div
        className={`w-1 bg-border cursor-col-resize hover:bg-primary transition-colors relative group ${isResizing ? 'bg-primary' : ''}`}
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panels"
        tabIndex={0}
        data-testid="auto-writer-resizer"
      >
        <div className="absolute inset-y-0 -left-1 -right-1 flex items-center justify-center">
          <div className="w-1 h-12 bg-border group-hover:bg-primary rounded-full transition-colors" />
        </div>
      </div>

      <section
        className="h-full overflow-hidden border-l border-border bg-background"
        style={{ width: `${100 - leftPanelWidth}%` }}
        aria-label="AI assistant"
      >
        <ChatDialog
          isOpen
          onClose={() => logger.debug('Embedded chat close invoked', undefined, 'AIAutoWriterContainer')}
          variant="embedded"
          title="AI Document Auto-Writer"
          getDocumentContent={getEditorContent}
          updateDocumentContent={updateEditorContent}
          insertImageAfterSection={insertImageAfterSection}
          className="bg-background"
          agentVariant="auto-writer"
        />
      </section>
    </div>
  );
};

export default AIAutoWriterContainer;

