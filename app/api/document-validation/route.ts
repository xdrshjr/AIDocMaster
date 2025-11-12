/**
 * Document Validation API
 * Handles AI-powered document validation with streaming support
 * Validates grammar, punctuation, word usage, and logical errors
 */

import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { getLLMConfig, validateLLMConfig, type ChatMessage } from '@/lib/chatClient';

export const runtime = 'edge';

/**
 * POST /api/document-validation
 * Stream document validation results from LLM
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  logger.info('Document validation request received', undefined, 'API:DocValidation');

  try {
    // Parse request body
    const body = await request.json();
    const { content, chunkIndex, totalChunks } = body as { 
      content: string; 
      chunkIndex: number;
      totalChunks: number;
    };

    // Validate input
    if (!content || typeof content !== 'string') {
      logger.warn('Invalid content in validation request', { content }, 'API:DocValidation');
      return new Response(
        JSON.stringify({ error: 'Content string is required' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.debug('Processing document validation request', {
      contentLength: content.length,
      chunkIndex,
      totalChunks,
    }, 'API:DocValidation');

    // Get and validate LLM configuration
    const config = getLLMConfig();
    const validation = validateLLMConfig(config);

    if (!validation.valid) {
      logger.error('LLM configuration validation failed', { error: validation.error }, 'API:DocValidation');
      return new Response(
        JSON.stringify({ error: validation.error || 'Invalid LLM configuration' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Prepare system message for document validation
    const systemMessage: ChatMessage = {
      role: 'system',
      content: `You are an expert document reviewer and editor. Your task is to analyze the provided document content and identify issues in the following categories:

1. **Grammar Errors**: Incorrect verb tenses, subject-verb agreement, article usage, etc.
2. **Word Usage Errors**: Incorrect word choice, confused words, inappropriate vocabulary
3. **Punctuation Errors**: Missing or incorrect punctuation marks, comma splices, etc.
4. **Logical Errors**: Inconsistent statements, unclear arguments, missing transitions

IMPORTANT: You must respond with ONLY a valid JSON object in the following format:

{
  "issues": [
    {
      "id": "unique_id_1",
      "category": "Grammar|WordUsage|Punctuation|Logic",
      "severity": "high|medium|low",
      "location": "Exact quote of the problematic text",
      "issue": "Brief description of the problem",
      "suggestion": "How to fix it",
      "lineNumber": 1
    }
  ],
  "summary": {
    "totalIssues": 0,
    "grammarCount": 0,
    "wordUsageCount": 0,
    "punctuationCount": 0,
    "logicCount": 0
  }
}

If no issues are found, return:
{
  "issues": [],
  "summary": {
    "totalIssues": 0,
    "grammarCount": 0,
    "wordUsageCount": 0,
    "punctuationCount": 0,
    "logicCount": 0
  }
}

Be thorough but concise. Focus on actual errors rather than stylistic preferences. Return ONLY the JSON object, no additional text before or after.`,
    };

    const userMessage: ChatMessage = {
      role: 'user',
      content: `Please analyze the following document content (chunk ${chunkIndex + 1} of ${totalChunks}):\n\n${content}`,
    };

    const fullMessages = [systemMessage, userMessage];

    logger.debug('Sending validation request to LLM API', {
      endpoint: config.apiUrl,
      model: config.modelName,
      messageCount: fullMessages.length,
      chunkIndex,
      contentLength: content.length,
      responseFormat: 'JSON',
    }, 'API:DocValidation');

    // Create streaming response
    const endpoint = `${config.apiUrl.replace(/\/$/, '')}/chat/completions`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    const llmResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        messages: fullMessages,
        stream: true,
        temperature: 0.3, // Lower temperature for more focused, consistent validation
        max_tokens: 2000,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!llmResponse.ok) {
      const errorText = await llmResponse.text();
      logger.error('LLM API request failed', {
        status: llmResponse.status,
        statusText: llmResponse.statusText,
        error: errorText,
        duration: `${Date.now() - startTime}ms`,
      }, 'API:DocValidation');
      
      return new Response(
        JSON.stringify({ 
          error: `LLM API error: ${llmResponse.status} ${llmResponse.statusText}`,
          details: errorText,
        }),
        {
          status: llmResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    if (!llmResponse.body) {
      logger.error('LLM response body is empty', undefined, 'API:DocValidation');
      return new Response(
        JSON.stringify({ error: 'Empty response from LLM API' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.success('Streaming validation response started', {
      chunkIndex,
      duration: `${Date.now() - startTime}ms`,
      format: 'JSON structured response',
    }, 'API:DocValidation');

    // Create a transformed stream that logs completion
    const transformedStream = new ReadableStream({
      async start(controller) {
        const reader = llmResponse.body!.getReader();
        const decoder = new TextDecoder();
        let totalChunks = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              logger.success('Validation stream completed', {
                totalChunks,
                chunkIndex,
                duration: `${Date.now() - startTime}ms`,
                message: 'JSON validation results streamed successfully',
              }, 'API:DocValidation');
              controller.close();
              break;
            }

            totalChunks++;
            controller.enqueue(value);

            // Log progress periodically
            if (totalChunks % 10 === 0) {
              logger.debug('Validation stream progress', {
                chunks: totalChunks,
                chunkSize: value.length,
                chunkIndex,
              }, 'API:DocValidation');
            }
          }
        } catch (error) {
          logger.error('Error in validation stream', {
            error: error instanceof Error ? error.message : 'Unknown error',
            totalChunks,
            chunkIndex,
            duration: `${Date.now() - startTime}ms`,
          }, 'API:DocValidation');
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });

    // Return streaming response
    return new Response(transformedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('Document validation request timed out', { duration: `${duration}ms` }, 'API:DocValidation');
      return new Response(
        JSON.stringify({ error: 'Request timed out' }),
        {
          status: 504,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.error('Document validation request failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    }, 'API:DocValidation');

    return new Response(
      JSON.stringify({ 
        error: 'Failed to process validation request',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

/**
 * GET /api/document-validation
 * Health check endpoint
 */
export async function GET() {
  logger.info('Document validation API health check', undefined, 'API:DocValidation');

  try {
    const config = getLLMConfig();
    const validation = validateLLMConfig(config);

    return new Response(
      JSON.stringify({
        status: 'ok',
        configured: validation.valid,
        model: config.modelName,
        endpoint: config.apiUrl,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Document validation API health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'API:DocValidation');

    return new Response(
      JSON.stringify({ status: 'error', configured: false }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

