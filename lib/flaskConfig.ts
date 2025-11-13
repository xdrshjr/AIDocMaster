/**
 * Flask Backend Configuration Utility
 * 
 * Provides Flask backend URL for API route proxying.
 * The Flask backend handles all LLM API calls with comprehensive logging and error handling.
 */

import { logger } from './logger';

/**
 * Get Flask backend base URL
 * The Flask backend runs on localhost:5000 by default
 */
export const getFlaskBackendUrl = (): string => {
  // Check for custom Flask port from environment
  const flaskPort = process.env.FLASK_PORT || process.env.FLASK_BACKEND_PORT || '5000';
  const flaskHost = process.env.FLASK_HOST || '127.0.0.1';
  
  const baseUrl = `http://${flaskHost}:${flaskPort}`;
  
  logger.debug('Flask backend URL configuration', {
    baseUrl,
    host: flaskHost,
    port: flaskPort,
    source: process.env.FLASK_PORT ? 'FLASK_PORT env var' : 'default',
  }, 'FlaskConfig');
  
  return baseUrl;
};

/**
 * Build Flask API endpoint URL
 */
export const buildFlaskApiUrl = (endpoint: string): string => {
  const baseUrl = getFlaskBackendUrl();
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${normalizedEndpoint}`;
  
  logger.debug('Built Flask API URL', {
    endpoint,
    fullUrl: url,
  }, 'FlaskConfig');
  
  return url;
};

/**
 * Check if Flask backend is available
 */
export const checkFlaskBackendHealth = async (): Promise<boolean> => {
  try {
    const healthUrl = buildFlaskApiUrl('/health');
    logger.info('Checking Flask backend health', { url: healthUrl }, 'FlaskConfig');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(healthUrl, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const isHealthy = response.ok;
    
    if (isHealthy) {
      logger.success('Flask backend is healthy', {
        status: response.status,
        url: healthUrl,
      }, 'FlaskConfig');
    } else {
      logger.warn('Flask backend health check returned non-OK status', {
        status: response.status,
        statusText: response.statusText,
        url: healthUrl,
      }, 'FlaskConfig');
    }
    
    return isHealthy;
  } catch (error) {
    logger.error('Flask backend health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorType: error instanceof Error ? error.name : typeof error,
    }, 'FlaskConfig');
    
    return false;
  }
};

