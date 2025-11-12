/**
 * ValidationResultPanel Component
 * Displays validation results for the uploaded document with elegant streaming UI
 * Shows structured JSON validation issues in a scrollable, beautiful format
 */

'use client';

import { useEffect, useRef } from 'react';
import { logger } from '@/lib/logger';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { formatChunkProgress } from '@/lib/documentUtils';
import type { ValidationResult, ValidationIssue } from './AIDocValidationContainer';

interface ValidationResultPanelProps {
  results?: ValidationResult[];
  isValidating?: boolean;
  currentChunk?: number;
  totalChunks?: number;
}

const ValidationResultPanel = ({ 
  results = [], 
  isValidating = false,
  currentChunk = 0,
  totalChunks = 0,
}: ValidationResultPanelProps) => {
  const dict = getDictionary('en');
  const resultsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logger.component('ValidationResultPanel', 'mounted');
  }, []);

  // Auto-scroll to bottom when new results arrive
  useEffect(() => {
    if (resultsEndRef.current) {
      resultsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    
    // Log results update for debugging
    if (results.length > 0) {
      logger.debug('Validation results updated', {
        totalResults: results.length,
        totalIssues: results.reduce((sum, r) => sum + r.issues.length, 0),
      }, 'ValidationResultPanel');
    }
  }, [results]);

  const hasResults = results.length > 0;
  const totalIssuesCount = results.reduce((sum, r) => sum + r.issues.length, 0);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="border-b-4 border-border px-6 py-4 bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-foreground">
              {dict.docValidation.validationResults}
            </h2>
            {hasResults && !isValidating && (
              <span className="px-2.5 py-0.5 bg-primary/10 text-primary text-xs font-semibold rounded-full">
                {totalIssuesCount} {totalIssuesCount === 1 ? 'issue' : 'issues'} found
              </span>
            )}
          </div>
          
          {/* Status Indicator */}
          {isValidating && (
            <div className="flex items-center gap-2 text-sm">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                <span className="text-muted-foreground">
                  {formatChunkProgress(currentChunk, totalChunks, dict.docValidation.chunkProgress)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Content Area - Scrollable */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-6">
        {!hasResults && !isValidating && (
          // Empty State
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-md">
              <div className="w-20 h-20 mx-auto mb-6 bg-card border-4 border-border rounded-full flex items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Ready for AI Validation
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {dict.docValidation.validationPlaceholder}
              </p>
              <div className="bg-card border-2 border-border p-4 text-left">
                <p className="text-xs font-medium text-foreground mb-2">
                  Click the AI Check button to analyze:
                </p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>Grammar and spelling</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>Word usage and vocabulary</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>Punctuation correctness</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>Logical consistency</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {(hasResults || isValidating) && (
          <div className="space-y-4">
            {results.map((result, index) => (
              <ValidationResultCard 
                key={`result-${result.chunkIndex}-${index}`}
                result={result}
                totalChunks={totalChunks}
              />
            ))}
            
            {/* Loading Indicator for Current Chunk */}
            {isValidating && (
              <div className="bg-card border-2 border-border rounded-lg p-6 shadow-sm animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <div>
                    <p className="font-medium text-foreground">
                      {dict.docValidation.validating}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatChunkProgress(currentChunk, totalChunks, dict.docValidation.chunkProgress)}
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={resultsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
};

// Validation Result Card Component - Displays structured JSON results
const ValidationResultCard = ({ 
  result, 
  totalChunks 
}: { 
  result: ValidationResult;
  totalChunks: number;
}) => {
  const dict = getDictionary('en');
  const hasError = !!result.error;
  const hasIssues = result.issues.length > 0;

  // Log card rendering for debugging
  useEffect(() => {
    logger.debug('Rendering validation result card', {
      chunkIndex: result.chunkIndex,
      issuesCount: result.issues.length,
      hasError,
    }, 'ValidationResultCard');
  }, [result.chunkIndex, result.issues.length, hasError]);

  return (
    <div className={`bg-card border-2 rounded-lg shadow-sm transition-all duration-200 ${
      hasError ? 'border-red-500' : hasIssues ? 'border-border hover:border-primary' : 'border-green-500'
    }`}>
      {/* Card Header */}
      <div className={`px-4 py-3 border-b-2 flex items-center justify-between rounded-t-lg ${
        hasError ? 'bg-red-50 border-red-200' : hasIssues ? 'bg-muted/30 border-border' : 'bg-green-50 border-green-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${
            hasError ? 'bg-red-500' : hasIssues ? 'bg-amber-500' : 'bg-green-500'
          }`} />
          <span className="text-sm font-semibold text-foreground">
            {totalChunks > 1 
              ? `Section ${result.chunkIndex + 1} of ${totalChunks}`
              : 'Validation Result'
            }
          </span>
          {hasIssues && !hasError && (
            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-medium rounded">
              {result.issues.length} {result.issues.length === 1 ? 'issue' : 'issues'}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {result.timestamp.toLocaleTimeString()}
        </span>
      </div>

      {/* Card Content */}
      <div className="p-4">
        {hasError ? (
          // Error Display
          <div className="flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm text-red-700 flex-1">{result.error}</p>
          </div>
        ) : !hasIssues ? (
          // No Issues Display
          <div className="flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-green-700 mb-1">
                {dict.docValidation.noIssuesFound}
              </p>
              <p className="text-xs text-muted-foreground">
                This section appears to be well-written with no significant issues detected.
              </p>
            </div>
          </div>
        ) : (
          // Issues Display - Structured and Elegant
          <div className="space-y-3">
            {/* Summary Stats */}
            {result.summary && (
              <div className="flex flex-wrap gap-2 pb-3 border-b border-border">
                {result.summary.grammarCount > 0 && (
                  <StatBadge 
                    label="Grammar" 
                    count={result.summary.grammarCount} 
                    color="blue"
                  />
                )}
                {result.summary.wordUsageCount > 0 && (
                  <StatBadge 
                    label="Word Usage" 
                    count={result.summary.wordUsageCount} 
                    color="purple"
                  />
                )}
                {result.summary.punctuationCount > 0 && (
                  <StatBadge 
                    label="Punctuation" 
                    count={result.summary.punctuationCount} 
                    color="pink"
                  />
                )}
                {result.summary.logicCount > 0 && (
                  <StatBadge 
                    label="Logic" 
                    count={result.summary.logicCount} 
                    color="orange"
                  />
                )}
              </div>
            )}
            
            {/* Individual Issues */}
            <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
              {result.issues.map((issue, idx) => (
                <IssueCard key={issue.id || `issue-${idx}`} issue={issue} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Stat Badge Component
const StatBadge = ({ label, count, color }: { label: string; count: number; color: string }) => {
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-800 border-blue-200',
    purple: 'bg-purple-100 text-purple-800 border-purple-200',
    pink: 'bg-pink-100 text-pink-800 border-pink-200',
    orange: 'bg-orange-100 text-orange-800 border-orange-200',
  };

  return (
    <div className={`px-2.5 py-1 border rounded-md text-xs font-medium ${colorClasses[color as keyof typeof colorClasses]}`}>
      {label}: {count}
    </div>
  );
};

// Issue Card Component - Elegant display of individual validation issues
const IssueCard = ({ issue }: { issue: ValidationIssue }) => {
  const severityConfig = {
    high: {
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      iconColor: 'text-red-500',
      textColor: 'text-red-900',
      label: 'High',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
    },
    medium: {
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      iconColor: 'text-amber-500',
      textColor: 'text-amber-900',
      label: 'Medium',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
    low: {
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      iconColor: 'text-blue-500',
      textColor: 'text-blue-900',
      label: 'Low',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4" />
          <path d="M12 8h.01" />
        </svg>
      ),
    },
  };

  const categoryConfig = {
    Grammar: { label: 'Grammar', color: 'bg-blue-100 text-blue-700' },
    WordUsage: { label: 'Word Usage', color: 'bg-purple-100 text-purple-700' },
    Punctuation: { label: 'Punctuation', color: 'bg-pink-100 text-pink-700' },
    Logic: { label: 'Logic', color: 'bg-orange-100 text-orange-700' },
  };

  const severity = severityConfig[issue.severity];
  const category = categoryConfig[issue.category];

  return (
    <div className={`p-3 border-l-4 ${severity.borderColor} ${severity.bgColor} rounded-r transition-all duration-200 hover:shadow-md`}>
      {/* Issue Header */}
      <div className="flex items-start gap-2 mb-2">
        <div className={`${severity.iconColor} flex-shrink-0 mt-0.5`}>
          {severity.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 text-xs font-semibold rounded ${category.color}`}>
              {category.label}
            </span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${severity.bgColor} ${severity.textColor}`}>
              {severity.label}
            </span>
            {issue.lineNumber && (
              <span className="text-xs text-muted-foreground">
                Line {issue.lineNumber}
              </span>
            )}
          </div>
          
          {/* Issue Description */}
          <p className={`text-sm font-medium ${severity.textColor} mb-2`}>
            {issue.issue}
          </p>
          
          {/* Location */}
          {issue.location && (
            <div className="mb-2">
              <p className="text-xs text-muted-foreground mb-1">Found in:</p>
              <code className="block px-2 py-1.5 bg-white/70 border border-border rounded text-xs text-foreground break-words">
                {issue.location}
              </code>
            </div>
          )}
          
          {/* Suggestion */}
          {issue.suggestion && (
            <div className="mt-2 pt-2 border-t border-border/50">
              <div className="flex items-start gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
                <div className="flex-1">
                  <p className="text-xs font-medium text-green-700 mb-0.5">Suggestion:</p>
                  <p className="text-xs text-green-800">{issue.suggestion}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ValidationResultPanel;

