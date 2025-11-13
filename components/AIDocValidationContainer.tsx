/**
 * AIDocValidationContainer Component
 * Main container for AI Document Validation task with split-panel layout
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { logger } from '@/lib/logger';
import WordEditorPanel from './WordEditorPanel';
import ValidationResultPanel from './ValidationResultPanel';
import { buildApiUrl } from '@/lib/apiConfig';

export interface ValidationIssue {
  id: string;
  category: 'Grammar' | 'WordUsage' | 'Punctuation' | 'Logic';
  severity: 'high' | 'medium' | 'low';
  location: string;
  issue: string;
  suggestion: string;
  lineNumber?: number;
  chunkIndex: number;
}

export interface ValidationSummary {
  totalIssues: number;
  grammarCount: number;
  wordUsageCount: number;
  punctuationCount: number;
  logicCount: number;
}

export interface ValidationResult {
  chunkIndex: number;
  issues: ValidationIssue[];
  summary: ValidationSummary;
  timestamp: Date;
  error?: string;
}

interface AIDocValidationContainerProps {
  onExportRequest?: () => void;
  onContentChange?: (content: string) => void;
  onExportReadyChange?: (ready: boolean) => void;
  validationResults: ValidationResult[];
  onValidationResultsChange: (results: ValidationResult[]) => void;
  leftPanelWidth: number;
  onLeftPanelWidthChange: (width: number) => void;
}

const AIDocValidationContainer = ({ 
  onExportRequest, 
  onContentChange,
  onExportReadyChange,
  validationResults,
  onValidationResultsChange,
  leftPanelWidth,
  onLeftPanelWidthChange,
}: AIDocValidationContainerProps) => {
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Validation state (only temporary/local state)
  const [isValidating, setIsValidating] = useState(false);
  const [currentChunk, setCurrentChunk] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);
  const [hasDocument, setHasDocument] = useState(false);
  
  // Reference to WordEditorPanel to get content
  const wordEditorRef = useRef<{ getContent: () => string } | null>(null);

  useEffect(() => {
    logger.component('AIDocValidationContainer', 'mounted', {
      hasValidationResults: validationResults.length > 0,
      validationResultsCount: validationResults.length,
      leftPanelWidth,
    });
  }, []);

  const handleContentChange = (content: string) => {
    onContentChange?.(content);
  };

  const handleExportReady = (ready: boolean) => {
    setHasDocument(ready);
    onExportReadyChange?.(ready);
  };

  const handleValidationClick = async () => {
    if (!wordEditorRef.current || !hasDocument) {
      logger.warn('Cannot start validation: no document loaded', undefined, 'AIDocValidationContainer');
      return;
    }

    const htmlContent = wordEditorRef.current.getContent();
    
    // Import document utilities dynamically
    const { extractTextFromHTML, splitTextIntoChunks, validateDocumentContent } = await import('@/lib/documentUtils');
    
    // Extract text from HTML
    const textContent = extractTextFromHTML(htmlContent);
    
    // Validate content
    const validation = validateDocumentContent(textContent);
    if (!validation.valid) {
      logger.error('Document content validation failed', { error: validation.error }, 'AIDocValidationContainer');
      onValidationResultsChange([{
        chunkIndex: 0,
        issues: [],
        summary: {
          totalIssues: 0,
          grammarCount: 0,
          wordUsageCount: 0,
          punctuationCount: 0,
          logicCount: 0,
        },
        timestamp: new Date(),
        error: `Error: ${validation.error}`,
      }]);
      return;
    }

    // Split into chunks
    const chunks = splitTextIntoChunks(textContent, 3000);
    
    logger.info('Starting document validation', {
      textLength: textContent.length,
      totalChunks: chunks.length,
    }, 'AIDocValidationContainer');

    setIsValidating(true);
    onValidationResultsChange([]);
    setTotalChunks(chunks.length);
    setCurrentChunk(0);

    try {
      // Process each chunk
      for (let i = 0; i < chunks.length; i++) {
        setCurrentChunk(i + 1);
        
        logger.debug('Validating chunk', {
          chunkIndex: i,
          chunkLength: chunks[i].length,
        }, 'AIDocValidationContainer');

        // Get appropriate API URL based on environment
        const apiUrl = await buildApiUrl('/api/document-validation');
        logger.debug('Using API URL for validation', { apiUrl, chunkIndex: i }, 'AIDocValidationContainer');

        // Call validation API
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: chunks[i],
            chunkIndex: i,
            totalChunks: chunks.length,
          }),
        });

        if (!response.ok) {
          let errorData: { error?: string; details?: string } = {};
          try {
            errorData = await response.json();
          } catch (parseError) {
            logger.warn('Failed to parse validation error response', {
              parseError: parseError instanceof Error ? parseError.message : 'Unknown error',
              chunkIndex: i,
            }, 'AIDocValidationContainer');
          }
          
          logger.error('Validation API request failed', { 
            status: response.status,
            statusText: response.statusText,
            error: errorData.error,
            details: errorData.details,
            chunkIndex: i,
          }, 'AIDocValidationContainer');
          
          const errorMessage = errorData.details || errorData.error || `Validation failed (${response.status} ${response.statusText})`;
          throw new Error(errorMessage);
        }

        if (!response.body) {
          throw new Error('Response body is empty');
        }

        // Process streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = '';
        let buffer = '';
        let streamChunkCount = 0;

        logger.info('Starting stream processing for chunk', {
          chunkIndex: i,
          totalChunks: chunks.length,
          chunkSize: chunks[i].length,
        }, 'AIDocValidationContainer');

        const streamStartTime = Date.now();
        let parseErrorCount = 0;
        let emptyChunkCount = 0;
        let lastProgressLog = Date.now();
        const progressLogInterval = 3000; // Log progress every 3 seconds
        const maxParseErrors = 15; // Higher for validation as responses are more complex

        try {
          while (true) {
            let readResult;
            
            try {
              readResult = await reader.read();
            } catch (readError) {
              logger.error('Failed to read from validation stream', {
                error: readError instanceof Error ? readError.message : 'Unknown error',
                chunkIndex: i,
                streamChunksReceived: streamChunkCount,
                accumulatedLength: accumulatedContent.length,
              }, 'AIDocValidationContainer');
              throw readError;
            }

            const { done, value } = readResult;
            
            if (done) {
              logger.success('Validation stream reading completed', {
                chunkIndex: i,
                streamChunksReceived: streamChunkCount,
                emptyChunkCount,
                parseErrorCount,
                accumulatedLength: accumulatedContent.length,
                streamDuration: `${Date.now() - streamStartTime}ms`,
              }, 'AIDocValidationContainer');
              break;
            }

            // Validate chunk
            if (!value || value.length === 0) {
              emptyChunkCount++;
              logger.warn('Received empty chunk from validation stream', {
                chunkIndex: i,
                streamChunkIndex: streamChunkCount,
                emptyChunkCount,
              }, 'AIDocValidationContainer');
              continue;
            }

            streamChunkCount++;
            
            try {
              buffer += decoder.decode(value, { stream: true });
            } catch (decodeError) {
              logger.error('Failed to decode validation chunk', {
                error: decodeError instanceof Error ? decodeError.message : 'Unknown error',
                chunkIndex: i,
                streamChunkIndex: streamChunkCount,
                chunkSize: value.length,
              }, 'AIDocValidationContainer');
              continue; // Skip this chunk but continue processing
            }

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmedLine = line.trim();
              
              if (!trimmedLine || trimmedLine === 'data: [DONE]') {
                continue;
              }

              if (trimmedLine.startsWith('data: ')) {
                try {
                  const jsonStr = trimmedLine.slice(6);
                  const data = JSON.parse(jsonStr);
                  const content = data.choices?.[0]?.delta?.content;
                  
                  if (content) {
                    accumulatedContent += content;
                    
                    // Log progress periodically
                    const now = Date.now();
                    if (now - lastProgressLog >= progressLogInterval) {
                      logger.debug('Validation stream accumulation progress', {
                        chunkIndex: i,
                        accumulatedLength: accumulatedContent.length,
                        streamChunks: streamChunkCount,
                        parseErrors: parseErrorCount,
                        elapsed: `${now - streamStartTime}ms`,
                        averageChunkSize: streamChunkCount > 0 ? Math.round(accumulatedContent.length / streamChunkCount) : 0,
                      }, 'AIDocValidationContainer');
                      lastProgressLog = now;
                    }
                  } else if (data.choices?.[0]?.finish_reason) {
                    logger.debug('Validation stream finished', {
                      finishReason: data.choices[0].finish_reason,
                      chunkIndex: i,
                      accumulatedLength: accumulatedContent.length,
                    }, 'AIDocValidationContainer');
                  }
                } catch (parseError) {
                  parseErrorCount++;
                  logger.warn('Failed to parse validation SSE chunk', {
                    error: parseError instanceof Error ? parseError.message : 'Unknown error',
                    chunkIndex: i,
                    linePreview: trimmedLine.substring(0, 100),
                    parseErrorCount,
                    streamChunkIndex: streamChunkCount,
                  }, 'AIDocValidationContainer');
                  
                  // Fail if too many parse errors
                  if (parseErrorCount >= maxParseErrors) {
                    logger.error('Too many parse errors in validation stream, aborting', {
                      parseErrorCount,
                      maxParseErrors,
                      chunkIndex: i,
                      streamChunksReceived: streamChunkCount,
                    }, 'AIDocValidationContainer');
                    throw new Error(`Validation stream parsing failed: ${parseErrorCount} errors exceeded maximum of ${maxParseErrors}`);
                  }
                }
              }
            }
          }

          // Process any remaining buffer content
          if (buffer.trim()) {
            logger.debug('Processing remaining validation buffer content', {
              chunkIndex: i,
              bufferLength: buffer.length,
              bufferPreview: buffer.substring(0, 100),
            }, 'AIDocValidationContainer');
          }
        } finally {
          try {
            reader.releaseLock();
            logger.debug('Validation stream reader released', {
              chunkIndex: i,
              streamChunksReceived: streamChunkCount,
              parseErrorCount,
            }, 'AIDocValidationContainer');
          } catch (releaseError) {
            logger.warn('Failed to release validation reader', {
              error: releaseError instanceof Error ? releaseError.message : 'Unknown error',
              chunkIndex: i,
            }, 'AIDocValidationContainer');
          }
        }

        logger.info('Stream processing completed, parsing JSON result', {
          chunkIndex: i,
          totalContentLength: accumulatedContent.length,
          streamChunksReceived: streamChunkCount,
          streamDuration: `${Date.now() - streamStartTime}ms`,
        }, 'AIDocValidationContainer');

        // Parse the accumulated JSON content
        const parseStartTime = Date.now();
        
        try {
          logger.debug('Starting JSON parsing', {
            chunkIndex: i,
            rawContentLength: accumulatedContent.length,
            contentPreview: accumulatedContent.substring(0, 100),
          }, 'AIDocValidationContainer');

          // Remove markdown code block markers if present
          let cleanedContent = accumulatedContent.trim();
          const hadMarkdown = cleanedContent.startsWith('```');
          
          if (cleanedContent.startsWith('```json')) {
            cleanedContent = cleanedContent.replace(/^```json\s*/, '').replace(/```\s*$/, '');
            logger.debug('Removed JSON markdown markers', { chunkIndex: i }, 'AIDocValidationContainer');
          } else if (cleanedContent.startsWith('```')) {
            cleanedContent = cleanedContent.replace(/^```\s*/, '').replace(/```\s*$/, '');
            logger.debug('Removed generic markdown markers', { chunkIndex: i }, 'AIDocValidationContainer');
          }

          logger.debug('Attempting JSON parse', {
            chunkIndex: i,
            cleanedContentLength: cleanedContent.length,
            hadMarkdown,
          }, 'AIDocValidationContainer');

          const validationData = JSON.parse(cleanedContent);
          
          logger.success('Successfully parsed JSON validation result', {
            chunkIndex: i,
            issuesFound: validationData.issues?.length || 0,
            summary: validationData.summary,
            parseDuration: `${Date.now() - parseStartTime}ms`,
            issueBreakdown: {
              grammar: validationData.issues?.filter((iss: ValidationIssue) => iss.category === 'Grammar').length || 0,
              wordUsage: validationData.issues?.filter((iss: ValidationIssue) => iss.category === 'WordUsage').length || 0,
              punctuation: validationData.issues?.filter((iss: ValidationIssue) => iss.category === 'Punctuation').length || 0,
              logic: validationData.issues?.filter((iss: ValidationIssue) => iss.category === 'Logic').length || 0,
            },
          }, 'AIDocValidationContainer');

          // Validate JSON structure
          if (!validationData.issues || !Array.isArray(validationData.issues)) {
            logger.warn('Invalid JSON structure: missing or invalid issues array', {
              chunkIndex: i,
              hasIssues: !!validationData.issues,
              issuesType: typeof validationData.issues,
            }, 'AIDocValidationContainer');
          }

          if (!validationData.summary) {
            logger.warn('Invalid JSON structure: missing summary object', {
              chunkIndex: i,
            }, 'AIDocValidationContainer');
          }

          // Create validation issues with chunk index
          const issues: ValidationIssue[] = (validationData.issues || []).map((issue: ValidationIssue, idx: number) => {
            // Validate individual issue structure
            if (!issue.id || !issue.category || !issue.severity) {
              logger.warn('Issue missing required fields', {
                chunkIndex: i,
                issueIndex: idx,
                hasId: !!issue.id,
                hasCategory: !!issue.category,
                hasSeverity: !!issue.severity,
              }, 'AIDocValidationContainer');
            }

            return {
              ...issue,
              chunkIndex: i,
            };
          });

          logger.debug('Mapped issues with chunk index', {
            chunkIndex: i,
            issuesCount: issues.length,
          }, 'AIDocValidationContainer');

          // Update validation results with parsed data
          const existingIndex = validationResults.findIndex(r => r.chunkIndex === i);
          const newResult: ValidationResult = {
            chunkIndex: i,
            issues,
            summary: validationData.summary || {
              totalIssues: issues.length,
              grammarCount: issues.filter(iss => iss.category === 'Grammar').length,
              wordUsageCount: issues.filter(iss => iss.category === 'WordUsage').length,
              punctuationCount: issues.filter(iss => iss.category === 'Punctuation').length,
              logicCount: issues.filter(iss => iss.category === 'Logic').length,
            },
            timestamp: new Date(),
          };

          logger.info('Updating validation results state', {
            chunkIndex: i,
            isUpdate: existingIndex >= 0,
            previousResultsCount: validationResults.length,
            newIssuesCount: issues.length,
          }, 'AIDocValidationContainer');

          if (existingIndex >= 0) {
            const updated = [...validationResults];
            updated[existingIndex] = newResult;
            onValidationResultsChange(updated);
          } else {
            onValidationResultsChange([...validationResults, newResult]);
          }

        } catch (parseError) {
          logger.error('Failed to parse validation JSON result', {
            error: parseError instanceof Error ? parseError.message : 'Unknown error',
            errorStack: parseError instanceof Error ? parseError.stack : undefined,
            chunkIndex: i,
            contentLength: accumulatedContent.length,
            contentPreview: accumulatedContent.substring(0, 200),
            contentSuffix: accumulatedContent.substring(Math.max(0, accumulatedContent.length - 100)),
            parseDuration: `${Date.now() - parseStartTime}ms`,
          }, 'AIDocValidationContainer');

          // Add error result
          onValidationResultsChange([...validationResults, {
            chunkIndex: i,
            issues: [],
            summary: {
              totalIssues: 0,
              grammarCount: 0,
              wordUsageCount: 0,
              punctuationCount: 0,
              logicCount: 0,
            },
            timestamp: new Date(),
            error: `Failed to parse validation result: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
          }]);
        }

        logger.success('Chunk validation completed', {
          chunkIndex: i,
          totalDuration: `${Date.now() - streamStartTime}ms`,
          contentLength: accumulatedContent.length,
        }, 'AIDocValidationContainer');
      }

      // Calculate final statistics
      const finalStats = {
        totalChunks: chunks.length,
        totalResults: validationResults.length,
        totalIssues: validationResults.reduce((sum, r) => sum + r.issues.length, 0),
        totalGrammar: validationResults.reduce((sum, r) => sum + (r.summary?.grammarCount || 0), 0),
        totalWordUsage: validationResults.reduce((sum, r) => sum + (r.summary?.wordUsageCount || 0), 0),
        totalPunctuation: validationResults.reduce((sum, r) => sum + (r.summary?.punctuationCount || 0), 0),
        totalLogic: validationResults.reduce((sum, r) => sum + (r.summary?.logicCount || 0), 0),
        errorsEncountered: validationResults.filter(r => r.error).length,
      };

      logger.success('Document validation completed successfully', {
        ...finalStats,
        averageIssuesPerChunk: (finalStats.totalIssues / chunks.length).toFixed(2),
      }, 'AIDocValidationContainer');

    } catch (error) {
      logger.error('Validation process failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
        currentChunk,
        totalChunks: chunks.length,
        completedChunks: validationResults.length,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      }, 'AIDocValidationContainer');
      
      onValidationResultsChange([...validationResults, {
        chunkIndex: currentChunk,
        issues: [],
        summary: {
          totalIssues: 0,
          grammarCount: 0,
          wordUsageCount: 0,
          punctuationCount: 0,
          logicCount: 0,
        },
        timestamp: new Date(),
        error: `Error: ${error instanceof Error ? error.message : 'Validation failed'}`,
      }]);
    } finally {
      logger.info('Validation process cleanup', {
        wasValidating: isValidating,
        finalResultsCount: validationResults.length,
      }, 'AIDocValidationContainer');
      
      setIsValidating(false);
      setCurrentChunk(0);
    }
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
      onLeftPanelWidthChange(newWidth);
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
          ref={wordEditorRef}
          onContentChange={handleContentChange}
          onExportReady={handleExportReady}
        />
      </div>

      {/* Resizer with AI Check Button */}
      <div
        className={`w-1 bg-border hover:bg-primary cursor-col-resize transition-colors relative group ${
          isResizing ? 'bg-primary' : ''
        }`}
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-y-0 -left-1 -right-1 flex items-center justify-center">
          <div className="w-1 h-12 bg-border group-hover:bg-primary rounded-full transition-colors" />
        </div>
        
        {/* AI Check Button */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <button
            onClick={handleValidationClick}
            disabled={!hasDocument || isValidating}
            className="w-12 h-12 rounded-full bg-primary text-primary-foreground border-2 border-border shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 group/btn"
            aria-label="AI Check"
            title="AI Check"
          >
            {isValidating ? (
              <svg className="animate-spin w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <path d="M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Right Panel - Validation Results */}
      <div 
        className="h-full overflow-hidden"
        style={{ width: `${100 - leftPanelWidth}%` }}
      >
        <ValidationResultPanel 
          results={validationResults}
          isValidating={isValidating}
          currentChunk={currentChunk}
          totalChunks={totalChunks}
        />
      </div>
    </div>
  );
};

export default AIDocValidationContainer;

