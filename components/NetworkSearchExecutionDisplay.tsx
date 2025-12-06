/**
 * NetworkSearchExecutionDisplay Component
 * Displays the execution process of network search in chat
 * Shows:
 * - Search query preparation
 * - Search execution status
 * - Search results
 * - Answer synthesis process
 * - Final answer generation
 */

'use client';

import { Globe, CheckCircle, Loader2, AlertCircle, Sparkles, Search } from 'lucide-react';

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
  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="my-4 space-y-3">
      {/* Execution Steps */}
      {steps.map((step, index) => (
        <div
          key={index}
          className="bg-muted/40 border border-border/50 rounded-lg p-3 animate-fadeIn"
        >
          {/* Search Query Step */}
          {step.type === 'search_query' && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <Search className="w-4 h-4 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
                  准备搜索查询
                </h4>
                {step.query && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {step.query}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Search Execution Step */}
          {step.type === 'search_execution' && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {step.status === 'running' && (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                )}
                {step.status === 'success' && (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                )}
                {step.status === 'error' && (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                )}
                {step.status === 'pending' && (
                  <Globe className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    执行网络搜索
                  </h4>
                </div>
                {step.status === 'running' && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    正在搜索网络...
                  </p>
                )}
                {step.error && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                    错误: {step.error}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Search Results Step */}
          {step.type === 'search_results' && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <CheckCircle className="w-4 h-4 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-xs font-semibold text-green-600 dark:text-green-400">
                    搜索结果
                  </h4>
                  {step.results && step.results.length > 0 && (
                    <span className="px-2 py-0.5 text-xs font-mono bg-green-500/10 text-green-600 dark:text-green-400 rounded">
                      {step.results.length} 条结果
                    </span>
                  )}
                </div>
                {step.results && step.results.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {step.results.slice(0, 5).map((result, idx) => (
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
                    {step.results.length > 5 && (
                      <p className="text-xs text-muted-foreground/70 italic">
                        还有 {step.results.length - 5} 条结果...
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Synthesizing Step */}
          {step.type === 'synthesizing' && (
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
          {step.type === 'final_answer' && (
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
      ))}

      {/* Completion Indicator */}
      {isComplete && steps.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
          <p className="text-xs text-green-600 dark:text-green-400 font-medium">
            网络搜索完成
          </p>
        </div>
      )}
    </div>
  );
};

export default NetworkSearchExecutionDisplay;


