/**
 * Highlight Utilities
 * Helper functions for text search, highlight management, and position tracking
 */

import type { Editor } from '@tiptap/core';
import { logger } from './logger';

/**
 * Search for text in editor content and return position
 * Uses fuzzy matching to handle minor variations
 */
export const findTextPosition = (
  editor: Editor,
  searchText: string,
  chunkIndex?: number
): { from: number; to: number } | null => {
  logger.debug('Searching for text in editor', {
    searchTextLength: searchText.length,
    searchPreview: searchText.substring(0, 50),
    chunkIndex,
  }, 'HighlightUtils');

  if (!searchText || searchText.trim().length === 0) {
    logger.warn('Empty search text provided', undefined, 'HighlightUtils');
    return null;
  }

  const { doc } = editor.state;
  let fullText = '';
  const positionMap: { start: number; end: number; nodePos: number }[] = [];

  // Build full text and position map
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const start = fullText.length;
      fullText += node.text;
      const end = fullText.length;
      positionMap.push({ start, end, nodePos: pos });
    }
  });

  logger.debug('Built document text map', {
    fullTextLength: fullText.length,
    nodesCount: positionMap.length,
  }, 'HighlightUtils');

  // Normalize search text for better matching
  const normalizedSearch = normalizeText(searchText);
  const normalizedFull = normalizeText(fullText);

  // Try exact match first
  let index = normalizedFull.indexOf(normalizedSearch);
  
  if (index === -1) {
    // Try fuzzy match - search for first 30 characters
    const shortSearch = normalizedSearch.substring(0, Math.min(30, normalizedSearch.length));
    index = normalizedFull.indexOf(shortSearch);
    
    if (index === -1) {
      logger.warn('Text not found in editor (exact or fuzzy)', {
        searchPreview: searchText.substring(0, 50),
        chunkIndex,
      }, 'HighlightUtils');
      return null;
    }
    
    logger.debug('Found fuzzy match', { index, matchLength: shortSearch.length }, 'HighlightUtils');
  }

  // Map back to editor positions
  const matchStart = index;
  const matchEnd = index + normalizedSearch.length;

  // Find corresponding node positions
  let from = 0;
  let to = 0;

  for (const { start, end, nodePos } of positionMap) {
    if (matchStart >= start && matchStart < end) {
      from = nodePos + (matchStart - start);
    }
    if (matchEnd >= start && matchEnd <= end) {
      to = nodePos + (matchEnd - start);
      break;
    }
  }

  if (from === 0 && to === 0) {
    logger.warn('Could not map text position to editor', {
      matchStart,
      matchEnd,
    }, 'HighlightUtils');
    return null;
  }

  logger.success('Found text position in editor', {
    from,
    to,
    textLength: to - from,
    chunkIndex,
  }, 'HighlightUtils');

  return { from, to };
};

/**
 * Normalize text for better matching
 * Removes extra whitespace and standardizes formatting
 */
const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/["""'']/g, '"')
    .replace(/['']/g, "'")
    .trim();
};

/**
 * Highlight text in the editor with metadata
 */
export const highlightTextInEditor = (
  editor: Editor,
  searchText: string,
  issueId: string,
  chunkIndex: number,
  color: string = '#fef3c7'
): boolean => {
  logger.info('Attempting to highlight text in editor', {
    issueId,
    chunkIndex,
    textPreview: searchText.substring(0, 50),
  }, 'HighlightUtils');

  const position = findTextPosition(editor, searchText, chunkIndex);

  if (!position) {
    logger.warn('Cannot highlight: text position not found', {
      issueId,
      chunkIndex,
    }, 'HighlightUtils');
    return false;
  }

  try {
    // Set selection to the found text
    editor
      .chain()
      .focus()
      .setTextSelection({ from: position.from, to: position.to })
      .setHighlight({ issueId, chunkIndex, color })
      .run();

    logger.success('Text highlighted successfully', {
      issueId,
      chunkIndex,
      from: position.from,
      to: position.to,
    }, 'HighlightUtils');

    // Scroll to the highlighted text
    scrollToPosition(editor, position.from);

    return true;
  } catch (error) {
    logger.error('Failed to highlight text', {
      error: error instanceof Error ? error.message : 'Unknown error',
      issueId,
      chunkIndex,
    }, 'HighlightUtils');
    return false;
  }
};

/**
 * Remove highlight from editor by issue ID
 */
export const removeHighlight = (
  editor: Editor,
  issueId: string
): boolean => {
  logger.debug('Removing highlight', { issueId }, 'HighlightUtils');

  try {
    const { doc, tr } = editor.state;
    let found = false;

    doc.descendants((node, pos) => {
      if (node.marks) {
        const highlightMark = node.marks.find(
          mark => mark.type.name === 'highlight' && mark.attrs.issueId === issueId
        );

        if (highlightMark) {
          const from = pos;
          const to = pos + node.nodeSize;
          tr.removeMark(from, to, highlightMark.type);
          found = true;
          
          logger.debug('Removed highlight mark', { issueId, from, to }, 'HighlightUtils');
        }
      }
    });

    if (found) {
      editor.view.dispatch(tr);
      logger.success('Highlight removed', { issueId }, 'HighlightUtils');
      return true;
    }

    logger.debug('No highlight found to remove', { issueId }, 'HighlightUtils');
    return false;
  } catch (error) {
    logger.error('Failed to remove highlight', {
      error: error instanceof Error ? error.message : 'Unknown error',
      issueId,
    }, 'HighlightUtils');
    return false;
  }
};

/**
 * Clear all highlights from the editor
 */
export const clearAllHighlights = (editor: Editor): void => {
  logger.info('Clearing all highlights', undefined, 'HighlightUtils');
  
  try {
    // Don't use .focus() as it can cause transaction mismatch errors
    // when editor is not ready or during document loading
    editor.chain().clearAllHighlights().run();
    logger.success('All highlights cleared', undefined, 'HighlightUtils');
  } catch (error) {
    logger.error('Failed to clear highlights', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'HighlightUtils');
  }
};

/**
 * Scroll editor to a specific position
 */
export const scrollToPosition = (editor: Editor, position: number): void => {
  logger.debug('Scrolling to position', { position }, 'HighlightUtils');

  try {
    // First, set text selection at the position
    editor.commands.setTextSelection(position);
    
    // Get the DOM node at this position
    const domNode = editor.view.domAtPos(position);
    
    if (domNode && domNode.node) {
      // Find the actual element to scroll to
      let element: Element | null = null;
      
      if (domNode.node instanceof Element) {
        element = domNode.node;
      } else if (domNode.node.parentElement) {
        element = domNode.node.parentElement;
      }
      
      if (element) {
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          if (element) {
            element.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest',
            });
            
            logger.debug('Scrolled to position successfully', { position }, 'HighlightUtils');
          }
        });
      } else {
        logger.warn('Could not find element to scroll to', { position }, 'HighlightUtils');
      }
    } else {
      logger.warn('Could not find DOM node at position', { position }, 'HighlightUtils');
    }
    
    // Focus the editor after scrolling
    setTimeout(() => {
      editor.commands.focus();
    }, 100);
  } catch (error) {
    logger.warn('Failed to scroll to position', {
      error: error instanceof Error ? error.message : 'Unknown error',
      position,
    }, 'HighlightUtils');
  }
};

/**
 * Scroll to and flash a highlighted issue by issueId
 * This function finds the highlight in the editor and scrolls to it with a visual flash effect
 */
export const scrollToHighlightByIssueId = (
  editor: Editor,
  issueId: string
): boolean => {
  logger.info('Scrolling to highlight by issueId', { issueId }, 'HighlightUtils');

  try {
    const { doc } = editor.state;
    type PositionType = { from: number; to: number };
    let highlightPosition: PositionType | null = null;

    // Find the highlight mark with matching issueId
    doc.descendants((node, pos) => {
      if (node.marks) {
        const highlightMark = node.marks.find(
          mark => mark.type.name === 'highlight' && mark.attrs.issueId === issueId
        );

        if (highlightMark && !highlightPosition) {
          highlightPosition = {
            from: pos,
            to: pos + node.nodeSize,
          };
          
          logger.debug('Found highlight position', {
            issueId,
            from: highlightPosition.from,
            to: highlightPosition.to,
          }, 'HighlightUtils');
          
          return false; // Stop searching
        }
      }
      return true; // Continue searching
    });

    if (!highlightPosition) {
      logger.warn('Highlight not found for issueId', { issueId }, 'HighlightUtils');
      return false;
    }

    // At this point, highlightPosition is guaranteed to be non-null
    const position: PositionType = highlightPosition;

    // Scroll to the highlight position first
    scrollToPosition(editor, position.from);

    // Apply flash effect after a short delay to ensure DOM is ready and scroll is in progress
    setTimeout(() => {
      applyFlashEffect(editor, issueId);
    }, 200);

    logger.success('Scrolled to highlight successfully', {
      issueId,
      position: position,
    }, 'HighlightUtils');

    return true;
  } catch (error) {
    logger.error('Failed to scroll to highlight', {
      error: error instanceof Error ? error.message : 'Unknown error',
      issueId,
    }, 'HighlightUtils');
    return false;
  }
};

/**
 * Apply a visual flash effect to a highlight
 * Temporarily animates the highlight to draw attention
 */
export const applyFlashEffect = (editor: Editor, issueId: string): void => {
  logger.debug('Applying flash effect to highlight', { issueId }, 'HighlightUtils');

  try {
    // Find all mark elements with the specific issueId in the DOM
    const editorElement = editor.view.dom;
    const highlightElements = editorElement.querySelectorAll(`mark[data-issue-id="${issueId}"]`);

    if (highlightElements.length === 0) {
      logger.warn('No DOM elements found for flash effect', { issueId }, 'HighlightUtils');
      return;
    }

    logger.debug('Found highlight elements for flash', {
      issueId,
      elementCount: highlightElements.length,
    }, 'HighlightUtils');

    // Apply flash animation to all matching highlight elements
    highlightElements.forEach((element) => {
      const htmlElement = element as HTMLElement;
      
      // Store original styles
      const originalTransition = htmlElement.style.transition;
      const originalBoxShadow = htmlElement.style.boxShadow;
      const originalTransform = htmlElement.style.transform;
      const originalZIndex = htmlElement.style.zIndex;
      
      // Apply enhanced flash animation with more visible effects
      htmlElement.style.transition = 'all 0.3s ease-in-out';
      htmlElement.style.zIndex = '1000';
      htmlElement.style.position = 'relative';
      htmlElement.style.animation = 'flash 0.5s ease-in-out 3, pulse 0.5s ease-in-out 3';
      htmlElement.style.boxShadow = '0 0 0 4px rgba(249, 115, 22, 0.6), 0 0 12px rgba(249, 115, 22, 0.4)';
      
      // Remove animation after completion
      setTimeout(() => {
        htmlElement.style.animation = '';
        htmlElement.style.transition = originalTransition;
        htmlElement.style.boxShadow = originalBoxShadow;
        htmlElement.style.transform = originalTransform;
        htmlElement.style.zIndex = originalZIndex;
        
        logger.debug('Flash effect completed', { issueId }, 'HighlightUtils');
      }, 1500); // 0.5s * 3 iterations
    });

    logger.success('Flash effect applied successfully', {
      issueId,
      elementCount: highlightElements.length,
    }, 'HighlightUtils');
  } catch (error) {
    logger.error('Failed to apply flash effect', {
      error: error instanceof Error ? error.message : 'Unknown error',
      issueId,
    }, 'HighlightUtils');
  }
};

/**
 * Get severity color for highlight
 */
export const getSeverityColor = (severity: 'high' | 'medium' | 'low'): string => {
  const colors = {
    high: '#fecaca',      // red-200
    medium: '#fef3c7',    // amber-100
    low: '#dbeafe',       // blue-100
  };
  
  return colors[severity] || colors.medium;
};

/**
 * Extract text snippet from HTML around a specific location
 * Used for finding original text in document
 */
export const extractTextSnippet = (
  html: string,
  locationDescription: string,
  contextLength: number = 100
): string => {
  logger.debug('Extracting text snippet', {
    locationDescription,
    contextLength,
  }, 'HighlightUtils');

  try {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const fullText = tempDiv.textContent || '';

    // Try to find a unique phrase from location description
    const searchTerms = locationDescription.split(' ').slice(0, 5).join(' ');
    const normalizedFull = normalizeText(fullText);
    const normalizedSearch = normalizeText(searchTerms);

    const index = normalizedFull.indexOf(normalizedSearch);

    if (index !== -1) {
      const start = Math.max(0, index - contextLength);
      const end = Math.min(fullText.length, index + contextLength);
      let snippet = fullText.substring(start, end);

      if (start > 0) snippet = '...' + snippet;
      if (end < fullText.length) snippet = snippet + '...';

      logger.debug('Extracted text snippet', {
        snippetLength: snippet.length,
        locationDescription,
      }, 'HighlightUtils');

      return snippet;
    }

    logger.warn('Could not find location in text', {
      locationDescription,
    }, 'HighlightUtils');

    return '';
  } catch (error) {
    logger.error('Failed to extract text snippet', {
      error: error instanceof Error ? error.message : 'Unknown error',
      locationDescription,
    }, 'HighlightUtils');
    return '';
  }
};

