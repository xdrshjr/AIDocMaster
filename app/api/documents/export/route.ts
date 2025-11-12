/**
 * Document Export API
 * Handles exporting edited Word documents
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  logger.info('Document export request received', undefined, 'API:Export');

  try {
    const body = await request.json();
    const { content, fileName, format } = body;

    // Validate required fields
    if (!content) {
      logger.warn('No content provided in export request', undefined, 'API:Export');
      return NextResponse.json(
        { success: false, error: 'No content provided' },
        { status: 400 }
      );
    }

    if (!fileName) {
      logger.warn('No fileName provided in export request', undefined, 'API:Export');
      return NextResponse.json(
        { success: false, error: 'No fileName provided' },
        { status: 400 }
      );
    }

    // Validate format
    const allowedFormats = ['docx', 'html'];
    const exportFormat = format || 'docx';
    
    if (!allowedFormats.includes(exportFormat)) {
      logger.warn('Invalid export format', { format: exportFormat }, 'API:Export');
      return NextResponse.json(
        { success: false, error: 'Invalid export format' },
        { status: 400 }
      );
    }

    logger.info('Processing document export', {
      fileName,
      format: exportFormat,
      contentLength: content.length,
    }, 'API:Export');

    // For now, we'll return the content as-is since the actual conversion
    // will happen on the client side using html-docx-js
    const duration = Date.now() - startTime;
    logger.success('Document export prepared successfully', {
      fileName,
      format: exportFormat,
      duration: `${duration}ms`,
    }, 'API:Export');

    return NextResponse.json({
      success: true,
      data: {
        fileName,
        format: exportFormat,
        content,
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Document export failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: `${duration}ms`,
    }, 'API:Export');

    return NextResponse.json(
      { success: false, error: 'Failed to export document' },
      { status: 500 }
    );
  }
}

