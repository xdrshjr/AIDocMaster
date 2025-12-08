/**
 * NetworkSearchExecutionDisplay Component
 * Displays the execution process of network search in chat
 * Shows:
 * - Only the current active step during search process
 * - Only search results after search completes
 * Features:
 * - Single step display during search (shows current active step only)
 * - Only search results remain visible after completion
 */

'use client';

import { useMemo, useState, useCallback } from 'react';
import { Globe, CheckCircle, Loader2, AlertCircle, Sparkles, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';

export interface NetworkSearchExecutionStep {
  type: 'search_query' | 'search_execution' | 'search_results' | 'synthesizing' | 'final_answer';
  query?: string;
  results?: Array<{
    title: string;
    url: string;
    content: string;
    score?: number;
  }>;
  status?: 'pending' | 'running' | 'success' | 'error';
  error?: string;
  timestamp?: Date;
}

export interface NetworkSearchExecutionDisplayProps {
  steps: NetworkSearchExecutionStep[];
  isComplete?: boolean;
}

const NetworkSearchExecutionDisplay = ({ steps, isComplete = false }: NetworkSearchExecutionDisplayProps) => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  
  // State for search results expansion (default collapsed)
  const [isSearchResultsExpanded, setIsSearchResultsExpanded] = useState(false);

  const handleToggleSearchResults = useCallback(() => {
    setIsSearchResultsExpanded(prev => {
      const newState = !prev;
      logger.debug('Toggled search results expansion', {
        expanded: newState,
      }, 'NetworkSearchExecutionDisplay');
      return newState;
    });
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleToggleSearchResults();
    }
  }, [handleToggleSearchResults]);

  if (steps.length === 0) {
    return null;
  }

  // Determine which step to display
  // If complete: only show search_results (if exists), otherwise show latest step
  // If not complete: show the latest active step
  const stepToDisplay = useMemo(() => {
    if (isComplete) {
      // When complete, prioritize search_results
      const searchResultsStep = steps.find(step => step.type === 'search_results');
      if (searchResultsStep) {
        logger.debug('Search complete, showing only search results', {
          totalSteps: steps.length,
        }, 'NetworkSearchExecutionDisplay');
        return searchResultsStep;
      }
      // If no search results but complete, show the latest step (fallback)
      const latestStep = steps[steps.length - 1];
      if (latestStep) {
        logger.debug('Search complete but no results found, showing latest step', {
          totalSteps: steps.length,
          latestStepType: latestStep.type,
        }, 'NetworkSearchExecutionDisplay');
        return latestStep;
      }
      logger.debug('Search complete but no steps available', {
        totalSteps: steps.length,
      }, 'NetworkSearchExecutionDisplay');
      return null;
    } else {
      // During search, show the latest active step
      // Priority: search_execution (running) > search_query > synthesizing > final_answer > search_results
      const runningExecution = steps.find(step => 
        step.type === 'search_execution' && step.status === 'running'
      );
      if (runningExecution) {
        logger.debug('Showing running search execution step', undefined, 'NetworkSearchExecutionDisplay');
        return runningExecution;
      }

      const latestExecution = steps.filter(step => step.type === 'search_execution').pop();
      if (latestExecution) {
        logger.debug('Showing latest search execution step', {
          status: latestExecution.status,
        }, 'NetworkSearchExecutionDisplay');
        return latestExecution;
      }

      const latestStep = steps[steps.length - 1];
      logger.debug('Showing latest step', {
        stepType: latestStep?.type,
      }, 'NetworkSearchExecutionDisplay');
      return latestStep;
    }
  }, [steps, isComplete]);

  if (!stepToDisplay) {
    return null;
  }

  logger.debug('Rendering network search execution display', {
    stepCount: steps.length,
    isComplete,
    displayingStepType: stepToDisplay.type,
    locale,
    stepTypes: steps.map(s => s.type),
  }, 'NetworkSearchExecutionDisplay');

  return (
    <div className="my-4">
      <div className="bg-muted/40 border border-border/50 rounded-lg p-3 animate-fadeIn">
        {/* Search Query Step */}
        {stepToDisplay.type === 'search_query' && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <Search className="w-4 h-4 text-blue-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
                准备搜索查询
              </h4>
              {stepToDisplay.query && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {stepToDisplay.query}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Search Execution Step */}
        {stepToDisplay.type === 'search_execution' && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              {stepToDisplay.status === 'running' && (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              )}
              {stepToDisplay.status === 'success' && (
                <CheckCircle className="w-4 h-4 text-green-500" />
              )}
              {stepToDisplay.status === 'error' && (
                <AlertCircle className="w-4 h-4 text-red-500" />
              )}
              {stepToDisplay.status === 'pending' && (
                <Globe className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className={`text-xs font-semibold ${
                stepToDisplay.status === 'success' 
                  ? 'text-green-600 dark:text-green-400' 
                  : 'text-blue-600 dark:text-blue-400'
              }`}>
                {stepToDisplay.status === 'success' ? '完成搜索' : '执行网络搜索'}
              </h4>
              {stepToDisplay.status === 'running' && (
                <p className="text-xs text-muted-foreground mt-2 italic">
                  正在搜索网络...
                </p>
              )}
              {stepToDisplay.error && (
                <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                  错误: {stepToDisplay.error}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Search Results Step */}
        {stepToDisplay.type === 'search_results' && (
          <div className="relative">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <CheckCircle className="w-4 h-4 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold text-green-600 dark:text-green-400">
                      搜索结果
                    </h4>
                    {stepToDisplay.results && stepToDisplay.results.length > 0 && (
                      <span className="px-2 py-0.5 text-xs font-mono bg-green-500/10 text-green-600 dark:text-green-400 rounded">
                        {stepToDisplay.results.length} 条结果
                      </span>
                    )}
                  </div>
                  {stepToDisplay.results && stepToDisplay.results.length > 0 && (
                    <button
                      onClick={handleToggleSearchResults}
                      onKeyDown={handleKeyDown}
                      className="flex items-center gap-1.5 flex-shrink-0 px-2 py-1 rounded-md hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground text-xs"
                      aria-label={isSearchResultsExpanded ? dict.chat.collapseSearchResults : dict.chat.expandSearchResults}
                      aria-expanded={isSearchResultsExpanded}
                      tabIndex={0}
                    >
                      {isSearchResultsExpanded ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" />
                          <span>{dict.chat.collapseSearchResults}</span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" />
                          <span>{dict.chat.expandSearchResults}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                {isSearchResultsExpanded && stepToDisplay.results && stepToDisplay.results.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {stepToDisplay.results.slice(0, 5).map((result, idx) => (
                      <div
                        key={idx}
                        className="bg-background/50 rounded p-2 border border-border/30"
                      >
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline block mb-1"
                        >
                          {result.title}
                        </a>
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                          {result.content}
                        </p>
                        {result.score !== undefined && (
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            相关性: {(result.score * 100).toFixed(1)}%
                          </p>
                        )}
                      </div>
                    ))}
                    {stepToDisplay.results.length > 5 && (
                      <p className="text-xs text-muted-foreground/70 italic">
                        还有 {stepToDisplay.results.length - 5} 条结果...
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Synthesizing Step */}
        {stepToDisplay.type === 'synthesizing' && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4 text-purple-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-1">
                汇总搜索结果
              </h4>
              <p className="text-xs text-muted-foreground italic">
                正在根据搜索结果生成答案...
              </p>
            </div>
          </div>
        )}

        {/* Final Answer Step */}
        {stepToDisplay.type === 'final_answer' && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4 text-purple-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-1">
                生成最终答案
              </h4>
              <p className="text-xs text-muted-foreground italic">
                正在生成最终回答...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NetworkSearchExecutionDisplay;


