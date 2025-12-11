/**
 * Auto Writer Agent API Proxy
 * Streams auto writer agent SSE responses from Flask backend.
 */

import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';
import { buildFlaskApiUrl } from '@/lib/flaskConfig';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const start = Date.now();
  logger.info('AutoWriter API proxy received request', undefined, 'API:AutoWriter');

  try {
    const body = await request.json();
    const { prompt, language = 'zh', modelId, enableNetworkSearch = true } = body as {
      prompt: string;
      language?: string;
      modelId?: string;
      enableNetworkSearch?: boolean;
    };

    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'prompt is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const flaskUrl = buildFlaskApiUrl('/api/auto-writer-agent');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 300000);

    let flaskResponse: Response;
    try {
      flaskResponse = await fetch(flaskUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt, 
          language, 
          modelId, 
          enableNetworkSearch 
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!flaskResponse.ok || !flaskResponse.body) {
      const text = await flaskResponse.text();
      logger.error('AutoWriter backend returned error', { status: flaskResponse.status, text }, 'API:AutoWriter');
      return new Response(text, {
        status: flaskResponse.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const proxiedStream = new ReadableStream({
      async start(controller) {
        const reader = flaskResponse.body!.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.close();
              break;
            }
            if (value) {
              controller.enqueue(value);
            }
          }
        } catch (error) {
          logger.error('AutoWriter proxy stream failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
          }, 'API:AutoWriter');
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });

    logger.success('AutoWriter proxy streaming', {
      duration: `${Date.now() - start}ms`,
    }, 'API:AutoWriter');

    return new Response(proxiedStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    logger.error('AutoWriter API proxy failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'API:AutoWriter');
    return new Response(
      JSON.stringify({
        error: 'AutoWriter proxy failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}








