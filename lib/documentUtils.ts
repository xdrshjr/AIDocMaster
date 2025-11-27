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



