/**
 * AI Document Validation API
 * Handles document validation requests using OpenAI-compatible LLM API
 * Provides streaming responses with validation issues and suggestions
 */

import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { validateLLMConfig, type ChatMessage } from '@/lib/chatClient';
import { getLLMConfigServer } from '@/lib/modelConfigServer';

// Use Node.js runtime instead of Edge to support file system access and proper fetch
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/document-validation
 * Validate document content and return issues with suggestions
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  logger.info('Document validation request received', undefined, 'API:DocumentValidation');

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
      logger.warn('Invalid content in validation request', { 
        hasContent: !!content, 
        contentType: typeof content 
      }, 'API:DocumentValidation');
      return new Response(
        JSON.stringify({ error: 'Content is required and must be a string' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.debug('Processing validation request', {
      contentLength: content.length,
      chunkIndex,
      totalChunks,
    }, 'API:DocumentValidation');

    // Get and validate LLM configuration (server-side with cookie/file system support)
    const config = await getLLMConfigServer(request);
    const validation = validateLLMConfig(config);

    if (!validation.valid) {
      logger.error('LLM configuration validation failed', { error: validation.error }, 'API:DocumentValidation');
      return new Response(
        JSON.stringify({ error: validation.error || 'Invalid LLM configuration' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Prepare validation prompt
    const systemMessage: ChatMessage = {
      role: 'system',
      content: `You are an expert document validator and editor. Your task is to analyze document content and identify issues in four categories:

1. Grammar: grammatical errors, verb tense issues, subject-verb agreement
2. WordUsage: incorrect word choice, redundancy, unclear phrasing
3. Punctuation: missing or incorrect punctuation marks
4. Logic: logical inconsistencies, unclear arguments, missing transitions

For each issue you find, provide:
- id: a unique identifier (use format: "issue-{category}-{number}")
- category: one of "Grammar", "WordUsage", "Punctuation", or "Logic"
- severity: "high", "medium", or "low"
- location: a brief description of where the issue occurs
- issue: a clear description of the problem
- suggestion: a specific recommendation for improvement

Return your response as a valid JSON object with this exact structure:
{
  "issues": [
    {
      "id": "issue-grammar-1",
      "category": "Grammar",
      "severity": "high",
      "location": "First paragraph",
      "issue": "Description of the issue",
      "suggestion": "Specific suggestion to fix it"
    }
  ],
  "summary": {
    "totalIssues": 5,
    "grammarCount": 2,
    "wordUsageCount": 1,
    "punctuationCount": 1,
    "logicCount": 1
  }
}

Important: Return ONLY the JSON object, no additional text or explanations. If no issues are found, return an empty issues array with all counts set to 0.`,
    };

    const userMessage: ChatMessage = {
      role: 'user',
      content: `Please validate the following document content (chunk ${chunkIndex + 1} of ${totalChunks}):\n\n${content}`,
    };

    const messages = [systemMessage, userMessage];

    logger.debug('Sending validation request to LLM API', {
      endpoint: config.apiUrl,
      model: config.modelName,
      chunkIndex,
    }, 'API:DocumentValidation');

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
        messages: messages,
        stream: true,
        temperature: 0.3, // Lower temperature for more consistent validation
        max_tokens: 4000,
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
      }, 'API:DocumentValidation');
      
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
      logger.error('LLM response body is empty', undefined, 'API:DocumentValidation');
      return new Response(
        JSON.stringify({ error: 'Empty response from LLM API' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.success('Streaming validation response started', {
      duration: `${Date.now() - startTime}ms`,
      chunkIndex,
    }, 'API:DocumentValidation');

    // Create a transformed stream that logs completion
    const transformedStream = new ReadableStream({
      async start(controller) {
        const reader = llmResponse.body!.getReader();
        let totalChunks = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              logger.success('Validation stream completed', {
                totalChunks,
                duration: `${Date.now() - startTime}ms`,
                chunkIndex,
              }, 'API:DocumentValidation');
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
              }, 'API:DocumentValidation');
            }
          }
        } catch (error) {
          logger.error('Error in validation stream', {
            error: error instanceof Error ? error.message : 'Unknown error',
            totalChunks,
            duration: `${Date.now() - startTime}ms`,
            chunkIndex,
          }, 'API:DocumentValidation');
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
      logger.error('Validation request timed out', { duration: `${duration}ms` }, 'API:DocumentValidation');
      return new Response(
        JSON.stringify({ error: 'Request timed out' }),
        {
          status: 504,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    logger.error('Validation request failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    }, 'API:DocumentValidation');

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
  logger.info('Document validation API health check', undefined, 'API:DocumentValidation');

  try {
    const config = await getLLMConfigServer();
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
    }, 'API:DocumentValidation');

    return new Response(
      JSON.stringify({ status: 'error', configured: false }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

