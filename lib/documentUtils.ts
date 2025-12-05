/**
 * Document Utilities
 * Helper functions for document processing, text extraction, and chunking
 */

import { logger } from './logger';

/**
 * Extract plain text from HTML content
 * Removes all HTML tags and returns clean text
 */
export const extractTextFromHTML = (html: string): string => {
  logger.debug('Extracting text from HTML', { htmlLength: html.length }, 'DocumentUtils');

  try {
    // Create a temporary div element to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    // Get text content (automatically strips HTML tags)
    const text = tempDiv.textContent || tempDiv.innerText || '';

    // Clean up: remove extra whitespace and normalize line breaks
    const cleanedText = text
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s*\n/g, '\n') // Remove empty lines
      .trim();

    logger.debug('Text extraction completed', {
      originalLength: html.length,
      extractedLength: cleanedText.length,
    }, 'DocumentUtils');

    return cleanedText;
  } catch (error) {
    logger.error('Failed to extract text from HTML', {
      error: error instanceof Error ? error.message : 'Unknown error',
      htmlLength: html.length,
    }, 'DocumentUtils');
    return '';
  }
};

/**
 * Split text into chunks of specified size
 * Attempts to split at sentence boundaries for better context
 */
export const splitTextIntoChunks = (
  text: string,
  chunkSize: number = 3000
): string[] => {
  logger.info('Splitting text into chunks', {
    textLength: text.length,
    chunkSize,
  }, 'DocumentUtils');

  if (!text || text.length === 0) {
    logger.warn('Empty text provided for chunking', undefined, 'DocumentUtils');
    return [];
  }

  if (text.length <= chunkSize) {
    logger.debug('Text fits in single chunk', { textLength: text.length }, 'DocumentUtils');
    return [text];
  }

  const chunks: string[] = [];
  let currentPosition = 0;

  while (currentPosition < text.length) {
    let endPosition = currentPosition + chunkSize;

    // If this is not the last chunk, try to split at a sentence boundary
    if (endPosition < text.length) {
      // Look for sentence endings (. ! ?) within the last 200 characters of the chunk
      const searchStart = Math.max(endPosition - 200, currentPosition);
      const searchText = text.substring(searchStart, endPosition + 100);
      
      // Find the last sentence ending
      const sentenceEndings = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
      let lastSentenceEnd = -1;
      
      for (const ending of sentenceEndings) {
        const pos = searchText.lastIndexOf(ending);
        if (pos > lastSentenceEnd) {
          lastSentenceEnd = pos;
        }
      }

      // If we found a sentence ending, adjust the end position
      if (lastSentenceEnd > 0) {
        endPosition = searchStart + lastSentenceEnd + 1;
        logger.debug('Found sentence boundary for chunk split', {
          originalEnd: currentPosition + chunkSize,
          adjustedEnd: endPosition,
        }, 'DocumentUtils');
      } else {
        // If no sentence ending found, try to split at word boundary
        while (endPosition > currentPosition && 
               text[endPosition] !== ' ' && 
               text[endPosition] !== '\n') {
          endPosition--;
        }
        
        if (endPosition === currentPosition) {
          // If no word boundary found, use the original chunk size
          endPosition = currentPosition + chunkSize;
        }
      }
    }

    const chunk = text.substring(currentPosition, endPosition).trim();
    
    if (chunk.length > 0) {
      chunks.push(chunk);
      logger.debug('Created chunk', {
        chunkIndex: chunks.length - 1,
        chunkLength: chunk.length,
        startPosition: currentPosition,
        endPosition,
      }, 'DocumentUtils');
    }

    currentPosition = endPosition;
  }

  logger.success('Text chunking completed', {
    totalChunks: chunks.length,
    averageChunkSize: Math.round(text.length / chunks.length),
  }, 'DocumentUtils');

  return chunks;
};

/**
 * Validate document content before processing
 */
export const validateDocumentContent = (content: string): {
  valid: boolean;
  error?: string;
} => {
  logger.debug('Validating document content', {
    contentLength: content?.length || 0,
  }, 'DocumentUtils');

  if (!content || typeof content !== 'string') {
    logger.warn('Invalid content type', { content }, 'DocumentUtils');
    return {
      valid: false,
      error: 'Content must be a non-empty string',
    };
  }

  if (content.trim().length === 0) {
    logger.warn('Empty content after trimming', undefined, 'DocumentUtils');
    return {
      valid: false,
      error: 'Content is empty',
    };
  }

  // Minimum content length (at least 10 characters for meaningful validation)
  if (content.trim().length < 10) {
    logger.warn('Content too short for validation', {
      length: content.trim().length,
    }, 'DocumentUtils');
    return {
      valid: false,
      error: 'Content is too short (minimum 10 characters)',
    };
  }

  logger.debug('Content validation passed', {
    contentLength: content.length,
  }, 'DocumentUtils');

  return { valid: true };
};

/**
 * Calculate estimated validation time based on content length
 */
export const estimateValidationTime = (textLength: number, chunkSize: number = 3000): {
  chunks: number;
  estimatedSeconds: number;
} => {
  const chunks = Math.ceil(textLength / chunkSize);
  // Estimate ~10-15 seconds per chunk (LLM processing time)
  const estimatedSeconds = chunks * 12;

  logger.debug('Calculated validation time estimate', {
    textLength,
    chunkSize,
    chunks,
    estimatedSeconds,
  }, 'DocumentUtils');

  return {
    chunks,
    estimatedSeconds,
  };
};

/**
 * Format chunk progress message
 */
export const formatChunkProgress = (
  currentChunk: number,
  totalChunks: number,
  template: string = 'Analyzing chunk {{current}} of {{total}}...'
): string => {
  return template
    .replace('{{current}}', String(currentChunk))
    .replace('{{total}}', String(totalChunks));
};

/**
 * Document Paragraph Structure
 * Represents a paragraph in the document
 */
export interface DocumentParagraph {
  id: string;
  index: number;
  content: string; // HTML content of the paragraph
  text: string; // Plain text content (for search)
}

/**
 * Extract paragraphs from HTML content
 * Splits HTML into paragraph-level chunks (p, h1-h6, li, etc.)
 */
export const extractParagraphsFromHTML = (html: string): DocumentParagraph[] => {
  logger.info('Extracting paragraphs from HTML', { htmlLength: html.length }, 'DocumentUtils');

  try {
    if (!html || html.trim().length === 0) {
      logger.warn('Empty HTML provided for paragraph extraction', undefined, 'DocumentUtils');
      return [];
    }

    // Create a temporary div element to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;

    const paragraphs: DocumentParagraph[] = [];
    let index = 0;

    // Function to extract text content from a node
    const getTextContent = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || '';
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        let text = '';
        for (const child of Array.from(element.childNodes)) {
          text += getTextContent(child);
        }
        return text;
      }
      return '';
    };

    // Function to process a node and extract its HTML
    const processNode = (node: Node, parentTag?: string): void => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();

        // Paragraph-level elements
        if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'div'].includes(tagName)) {
          const htmlContent = element.outerHTML;
          const textContent = getTextContent(element).trim();

          // Only add if it has meaningful content
          if (textContent.length > 0 || htmlContent.includes('<img') || htmlContent.includes('<br')) {
            paragraphs.push({
              id: `para-${index}`,
              index: index++,
              content: htmlContent,
              text: textContent,
            });
            logger.debug('Extracted paragraph', {
              index: index - 1,
              tagName,
              textLength: textContent.length,
              htmlLength: htmlContent.length,
            }, 'DocumentUtils');
          }
        } else {
          // Process children recursively
          for (const child of Array.from(element.childNodes)) {
            processNode(child, tagName);
          }
        }
      } else if (node.nodeType === Node.TEXT_NODE && parentTag !== 'p' && parentTag !== 'li') {
        // Standalone text nodes (not inside p or li)
        const text = node.textContent?.trim() || '';
        if (text.length > 0) {
          paragraphs.push({
            id: `para-${index}`,
            index: index++,
            content: `<p>${text}</p>`,
            text: text,
          });
          logger.debug('Extracted standalone text paragraph', {
            index: index - 1,
            textLength: text.length,
          }, 'DocumentUtils');
        }
      }
    };

    // Process all child nodes
    for (const child of Array.from(tempDiv.childNodes)) {
      processNode(child);
    }

    // If no paragraphs found, create one from the entire content
    if (paragraphs.length === 0 && html.trim().length > 0) {
      const text = extractTextFromHTML(html);
      if (text.trim().length > 0) {
        paragraphs.push({
          id: 'para-0',
          index: 0,
          content: html,
          text: text,
        });
        logger.info('Created single paragraph from entire HTML', {
          textLength: text.length,
        }, 'DocumentUtils');
      }
    }

    logger.success('Paragraph extraction completed', {
      totalParagraphs: paragraphs.length,
      averageLength: paragraphs.length > 0
        ? Math.round(paragraphs.reduce((sum, p) => sum + p.text.length, 0) / paragraphs.length)
        : 0,
    }, 'DocumentUtils');

    return paragraphs;
  } catch (error) {
    logger.error('Failed to extract paragraphs from HTML', {
      error: error instanceof Error ? error.message : 'Unknown error',
      htmlLength: html.length,
    }, 'DocumentUtils');
    return [];
  }
};

/**
 * Convert paragraphs array back to HTML
 */
export const paragraphsToHTML = (paragraphs: DocumentParagraph[]): string => {
  logger.debug('Converting paragraphs to HTML', {
    paragraphCount: paragraphs.length,
  }, 'DocumentUtils');

  try {
    if (!paragraphs || paragraphs.length === 0) {
      logger.warn('Empty paragraphs array provided', undefined, 'DocumentUtils');
      return '';
    }

    // Sort by index to ensure correct order
    const sortedParagraphs = [...paragraphs].sort((a, b) => a.index - b.index);

    // Join all paragraph HTML content
    const html = sortedParagraphs.map(p => p.content).join('\n');

    logger.debug('Paragraphs converted to HTML', {
      paragraphCount: sortedParagraphs.length,
      htmlLength: html.length,
    }, 'DocumentUtils');

    return html;
  } catch (error) {
    logger.error('Failed to convert paragraphs to HTML', {
      error: error instanceof Error ? error.message : 'Unknown error',
      paragraphCount: paragraphs?.length || 0,
    }, 'DocumentUtils');
    return '';
  }
};

/**
 * Update a specific paragraph in the paragraphs array
 */
export const updateParagraph = (
  paragraphs: DocumentParagraph[],
  paragraphId: string,
  newContent: string
): DocumentParagraph[] => {
  logger.info('Updating paragraph', {
    paragraphId,
    newContentLength: newContent.length,
    totalParagraphs: paragraphs.length,
  }, 'DocumentUtils');

  try {
    const index = paragraphs.findIndex(p => p.id === paragraphId);
    if (index === -1) {
      logger.warn('Paragraph not found for update', { paragraphId }, 'DocumentUtils');
      return paragraphs;
    }

    const updatedParagraphs = [...paragraphs];
    const text = extractTextFromHTML(newContent);

    updatedParagraphs[index] = {
      ...updatedParagraphs[index],
      content: newContent,
      text: text,
    };

    logger.success('Paragraph updated successfully', {
      paragraphId,
      index,
      newContentLength: newContent.length,
    }, 'DocumentUtils');

    return updatedParagraphs;
  } catch (error) {
    logger.error('Failed to update paragraph', {
      error: error instanceof Error ? error.message : 'Unknown error',
      paragraphId,
    }, 'DocumentUtils');
    return paragraphs;
  }
};




