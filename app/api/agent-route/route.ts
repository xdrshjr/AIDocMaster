/**
 * Agent Router API Proxy
 * Proxies agent routing requests to Flask backend for LLM-based agent selection
 * 
 * This endpoint:
 * 1. Receives user requests from frontend
 * 2. Forwards to Flask backend agent router
 * 3. Streams SSE responses back to frontend
 */

import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { buildFlaskApiUrl } from '@/lib/flaskConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const start = Date.now();
  logger.info('Agent Router API proxy received request', undefined, 'API:AgentRoute');

  try {
    const body = await request.json();
    const { 
      request: userRequest, 
      content = '', 
      language = 'zh', 
      modelId 
    } = body as {
      request: string;
      content?: string;
      language?: string;
      modelId?: string;
    };

    if (!userRequest || typeof userRequest !== 'string') {
      logger.warn('Agent Router API: Invalid request parameter', { 
        hasRequest: !!userRequest,
        requestType: typeof userRequest 
      }, 'API:AgentRoute');
      
      return new Response(JSON.stringify({ error: 'request is required and must be a string' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    logger.debug('Agent Router API: Forwarding to Flask backend', {
      requestPreview: userRequest.substring(0, 100),
      hasContent: Boolean(content),
      contentLength: content?.length || 0,
      language,
      modelId: modelId || 'default',
    }, 'API:AgentRoute');

    // Build Flask backend URL
    const flaskUrl = buildFlaskApiUrl('/api/agent-route');
    logger.debug('Agent Router API: Flask URL', { flaskUrl }, 'API:AgentRoute');

    // Set timeout for long-running agent operations (5 minutes)
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      logger.warn('Agent Router API: Request timeout (5min)', undefined, 'API:AgentRoute');
      controller.abort();
    }, 300000);

    let flaskResponse: Response;
    try {
      flaskResponse = await fetch(flaskUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          request: userRequest, 
          content, 
          language, 
          modelId 
        }),
        signal: controller.signal,
      });
    } catch (fetchError) {
      logger.error('Agent Router API: Failed to connect to Flask backend', {
        error: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        flaskUrl,
      }, 'API:AgentRoute');
      
      return new Response(
        JSON.stringify({
          error: 'Failed to connect to backend',
          details: fetchError instanceof Error ? fetchError.message : 'Unknown error',
        }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    // Handle non-OK responses from Flask
    if (!flaskResponse.ok) {
      const text = await flaskResponse.text();
      logger.error('Agent Router API: Backend returned error', { 
        status: flaskResponse.status, 
        statusText: flaskResponse.statusText,
        responsePreview: text.substring(0, 200),
      }, 'API:AgentRoute');
      
      return new Response(text, {
        status: flaskResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Check if response body exists
    if (!flaskResponse.body) {
      logger.error('Agent Router API: Backend response body is empty', {
        status: flaskResponse.status,
      }, 'API:AgentRoute');
      
      return new Response(
        JSON.stringify({ error: 'Backend response body is empty' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Create proxy stream to forward SSE events
    const proxiedStream = new ReadableStream({
      async start(controller) {
        const reader = flaskResponse.body!.getReader();
        let chunkCount = 0;
        
        logger.info('Agent Router API: Starting SSE stream proxy', undefined, 'API:AgentRoute');
        
        try {
          while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
              logger.info('Agent Router API: Stream completed', {
                totalChunks: chunkCount,
                duration: `${Date.now() - start}ms`,
              }, 'API:AgentRoute');
              controller.close();
              break;
            }
            
            if (value) {
              chunkCount++;
              controller.enqueue(value);
              
              // Log progress periodically (every 50 chunks)
              if (chunkCount % 50 === 0) {
                logger.debug('Agent Router API: Streaming progress', {
                  chunks: chunkCount,
                  elapsed: `${Date.now() - start}ms`,
                }, 'API:AgentRoute');
              }
            }
          }
        } catch (error) {
          logger.error('Agent Router API: Stream proxy failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            chunksBeforeError: chunkCount,
          }, 'API:AgentRoute');
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });

    logger.success('Agent Router API: Proxy streaming started', {
      setupDuration: `${Date.now() - start}ms`,
    }, 'API:AgentRoute');

    return new Response(proxiedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
    
  } catch (error) {
    logger.error('Agent Router API: Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    }, 'API:AgentRoute');
    
    return new Response(
      JSON.stringify({
        error: 'Agent routing proxy failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

