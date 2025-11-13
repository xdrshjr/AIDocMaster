/**
 * API Configuration Utility
 * 
 * This module provides the appropriate API base URL based on the environment:
 * - In browser mode: Uses relative paths (/api/...)
 * - In Electron packaged mode: Uses localhost API server (http://localhost:PORT/api/...)
 * - In Electron dev mode: Uses Next.js dev server (http://localhost:3000/api/...)
 */

import { logger } from './logger';

/**
 * Get API base URL based on environment
 */
export const getApiBaseUrl = async (): Promise<string> => {
  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron();

  if (!isElectron || !window.electronAPI) {
    // Browser mode - use relative paths
    logger.debug('Running in browser mode, using relative API paths', undefined, 'APIConfig');
    return '';
  }

  // Electron mode - check if packaged or dev
  try {
    const apiServerPort = await window.electronAPI.getApiServerPort();

    if (apiServerPort) {
      // Packaged mode with API server
      const baseUrl = `http://localhost:${apiServerPort}`;
      logger.info('Running in Electron packaged mode, using API server', {
        baseUrl,
        port: apiServerPort,
      }, 'APIConfig');
      return baseUrl;
    } else {
      // Dev mode - use Next.js dev server
      const baseUrl = 'http://localhost:3000';
      logger.info('Running in Electron dev mode, using Next.js dev server', {
        baseUrl,
      }, 'APIConfig');
      return baseUrl;
    }
  } catch (error) {
    logger.error('Error getting API server port, using relative paths', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'APIConfig');
    return '';
  }
};

/**
 * Build full API URL for a given endpoint
 * Ensures trailing slash for consistency with Next.js trailingSlash config
 */
export const buildApiUrl = async (endpoint: string): Promise<string> => {
  const baseUrl = await getApiBaseUrl();
  
  // Ensure endpoint has trailing slash to match Next.js trailingSlash: true config
  // This prevents 308 redirects in dev mode
  const normalizedEndpoint = endpoint.endsWith('/') ? endpoint : `${endpoint}/`;
  const url = `${baseUrl}${normalizedEndpoint}`;
  
  logger.debug('Built API URL', {
    endpoint,
    normalizedEndpoint,
    baseUrl,
    fullUrl: url,
  }, 'APIConfig');
  
  return url;
};

/**
 * Check if API server is available (for packaged mode)
 */
export const checkApiServerAvailability = async (): Promise<boolean> => {
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron();

  if (!isElectron || !window.electronAPI) {
    // In browser mode, API routes are always available
    return true;
  }

  try {
    const apiServerPort = await window.electronAPI.getApiServerPort();
    
    if (apiServerPort) {
      // Try to reach the health check endpoint
      try {
        const response = await fetch(`http://localhost:${apiServerPort}/api/chat/`, {
          method: 'GET',
        });
        
        const isAvailable = response.ok;
        
        logger.info('API server availability check', {
          port: apiServerPort,
          available: isAvailable,
          status: response.status,
        }, 'APIConfig');
        
        return isAvailable;
      } catch (error) {
        logger.error('API server not reachable', {
          port: apiServerPort,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'APIConfig');
        return false;
      }
    } else {
      // Dev mode - assume Next.js dev server is running
      logger.debug('Running in dev mode, assuming API server is available', undefined, 'APIConfig');
      return true;
    }
  } catch (error) {
    logger.error('Error checking API server availability', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'APIConfig');
    return false;
  }
};

