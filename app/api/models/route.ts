/**
 * Model Configuration API
 * Handles CRUD operations for LLM model configurations
 * Provides endpoints for managing custom model settings
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const runtime = 'edge';

/**
 * GET /api/models
 * Health check and configuration status
 */
export async function GET() {
  logger.info('Model configuration API health check', undefined, 'API:Models');

  try {
    return NextResponse.json({
      status: 'ok',
      message: 'Model configuration API is running',
      endpoints: {
        GET: '/api/models - Health check',
        POST: '/api/models - Manage model configurations',
      },
    });
  } catch (error) {
    logger.error('Model configuration API health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'API:Models');

    return NextResponse.json(
      { status: 'error', message: 'API health check failed' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/models
 * Handle model configuration operations
 * 
 * Operations:
 * - list: Get all model configurations
 * - add: Add new model configuration
 * - update: Update existing model configuration
 * - delete: Delete model configuration
 * - setDefault: Set default model
 * - toggleEnabled: Toggle model enabled/disabled status
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  logger.info('Model configuration request received', undefined, 'API:Models');

  try {
    const body = await request.json();
    const { operation, data } = body;

    logger.debug('Processing model configuration operation', {
      operation,
      hasData: !!data,
    }, 'API:Models');

    // Validate operation
    if (!operation) {
      logger.warn('Missing operation in request', undefined, 'API:Models');
      return NextResponse.json(
        { error: 'Operation is required' },
        { status: 400 }
      );
    }

    // Route to appropriate handler
    switch (operation) {
      case 'list':
        logger.info('Listing model configurations', undefined, 'API:Models');
        return NextResponse.json({
          success: true,
          message: 'Model configurations retrieved (client-side storage)',
          note: 'Models are stored in browser localStorage or Electron file system',
        });

      case 'validate':
        logger.info('Validating model configuration', undefined, 'API:Models');
        
        if (!data) {
          return NextResponse.json(
            { error: 'Model data is required for validation' },
            { status: 400 }
          );
        }

        // Basic validation
        const errors: string[] = [];
        
        if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
          errors.push('Model name is required');
        }
        
        if (!data.apiUrl || typeof data.apiUrl !== 'string' || data.apiUrl.trim().length === 0) {
          errors.push('API URL is required');
        } else {
          try {
            new URL(data.apiUrl);
          } catch {
            errors.push('Invalid API URL format');
          }
        }
        
        if (!data.apiKey || typeof data.apiKey !== 'string' || data.apiKey.trim().length === 0) {
          errors.push('API key is required');
        }
        
        if (!data.modelName || typeof data.modelName !== 'string' || data.modelName.trim().length === 0) {
          errors.push('Model name is required');
        }

        if (errors.length > 0) {
          logger.warn('Model configuration validation failed', { errors }, 'API:Models');
          return NextResponse.json({
            valid: false,
            errors,
          });
        }

        logger.success('Model configuration validated successfully', undefined, 'API:Models');
        return NextResponse.json({
          valid: true,
          errors: [],
        });

      case 'getDefaultModel':
        logger.info('Getting default model configuration', undefined, 'API:Models');
        return NextResponse.json({
          success: true,
          message: 'Default model retrieved (client-side storage)',
          note: 'Default model is retrieved from browser localStorage or Electron file system',
        });

      default:
        logger.warn('Unknown operation requested', { operation }, 'API:Models');
        return NextResponse.json(
          { error: `Unknown operation: ${operation}` },
          { status: 400 }
        );
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Model configuration request failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      duration: `${duration}ms`,
    }, 'API:Models');

    return NextResponse.json(
      {
        error: 'Failed to process model configuration request',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

