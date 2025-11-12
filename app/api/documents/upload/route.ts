/**
 * Document Upload API
 * Handles uploading Word documents for AI validation
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  logger.info('Document upload request received', undefined, 'API:Upload');

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    // Validate file existence
    if (!file) {
      logger.warn('No file provided in upload request', undefined, 'API:Upload');
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    
    if (!allowedTypes.includes(file.type)) {
      logger.warn('Invalid file type uploaded', { fileType: file.type }, 'API:Upload');
      return NextResponse.json(
        { success: false, error: 'Invalid file type. Only Word documents (.doc, .docx) are allowed' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      logger.warn('File size exceeds limit', { fileSize: file.size, maxSize }, 'API:Upload');
      return NextResponse.json(
        { success: false, error: 'File size exceeds 10MB limit' },
        { status: 400 }
      );
    }

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    logger.info('File uploaded successfully', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    }, 'API:Upload');

    // Convert to base64 for transmission
    const base64Content = buffer.toString('base64');
    
    const duration = Date.now() - startTime;
    logger.success('Document upload completed', {
      fileName: file.name,
      duration: `${duration}ms`,
    }, 'API:Upload');

    return NextResponse.json({
      success: true,
      data: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        content: base64Content,
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Document upload failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration: `${duration}ms`,
    }, 'API:Upload');

    return NextResponse.json(
      { success: false, error: 'Failed to upload document' },
      { status: 500 }
    );
  }
}

