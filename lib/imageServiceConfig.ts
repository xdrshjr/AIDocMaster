/**
 * Image Service Configuration Service
 * Manages image service configurations (e.g., Unsplash)
 * Supports browser localStorage, Electron file system storage, and Python backend persistence
 */

import { logger } from './logger';
import { buildFlaskApiUrl } from './flaskConfig';

export interface ImageServiceConfig {
  id: string;
  name: string;
  type: 'unsplash' | 'custom';
  apiKeys: string[]; // Multiple API keys for load balancing
  isDefault?: boolean;
  isDeletable?: boolean; // Whether this service can be deleted
  createdAt?: string;
  updatedAt?: string;
}

export interface ImageServiceConfigList {
  imageServices: ImageServiceConfig[];
  defaultServiceId?: string;
}

const IMAGE_SERVICE_CONFIG_KEY = 'docaimaster_image_service_configs';
const IMAGE_SERVICE_CONFIGS_UPDATED_EVENT = 'docaimaster_image_service_configs_updated';

/**
 * Get the browser event name used when image service configurations change
 */
export const getImageServiceConfigsUpdatedEventName = (): string => {
  return IMAGE_SERVICE_CONFIGS_UPDATED_EVENT;
};

/**
 * Emit a browser event to notify listeners that image service configs have changed
 */
const emitImageServiceConfigsUpdatedEvent = (configs: ImageServiceConfigList): void => {
  if (typeof window === 'undefined') {
    logger.debug('Skipping image service configs updated event emit on non-browser environment', undefined, 'ImageServiceConfig');
    return;
  }

  try {
    const detail = {
      servicesCount: configs.imageServices.length,
      defaultServiceId: configs.defaultServiceId,
    };

    logger.info('Emitting image service configuration updated event', detail, 'ImageServiceConfig');

    const event = new CustomEvent(IMAGE_SERVICE_CONFIGS_UPDATED_EVENT, { detail });
    window.dispatchEvent(event);
  } catch (error) {
    logger.error('Failed to emit image service configuration updated event', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ImageServiceConfig');
  }
};

/**
 * Check if running in Electron environment
 */
const isElectron = (): boolean => {
  return typeof window !== 'undefined' && 
         typeof (window as any).electronAPI !== 'undefined';
};

/**
 * Generate unique ID for image service
 */
export const generateImageServiceId = (): string => {
  return `image_service_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Validate image service configuration
 */
export const validateImageServiceConfig = (config: Partial<ImageServiceConfig>): { valid: boolean; error?: string } => {
  logger.debug('Validating image service configuration', { configId: config.id }, 'ImageServiceConfig');

  if (!config.name || config.name.trim().length === 0) {
    logger.warn('Image service name is required', undefined, 'ImageServiceConfig');
    return { valid: false, error: 'Image service name is required' };
  }

  if (!config.type) {
    logger.warn('Image service type is required', undefined, 'ImageServiceConfig');
    return { valid: false, error: 'Image service type is required' };
  }

  if (!config.apiKeys || !Array.isArray(config.apiKeys) || config.apiKeys.length === 0) {
    logger.warn('At least one API key is required', undefined, 'ImageServiceConfig');
    return { valid: false, error: 'At least one API key is required' };
  }

  // Validate API keys are non-empty strings
  const invalidKeys = config.apiKeys.filter(key => !key || typeof key !== 'string' || key.trim().length === 0);
  if (invalidKeys.length > 0) {
    logger.warn('Invalid API keys found', { invalidCount: invalidKeys.length }, 'ImageServiceConfig');
    return { valid: false, error: 'All API keys must be non-empty strings' };
  }

  logger.debug('Image service configuration validated successfully', { configId: config.id }, 'ImageServiceConfig');
  return { valid: true };
};

/**
 * Try to load image service configurations from Python backend
 */
const tryLoadFromPythonBackend = async (): Promise<ImageServiceConfigList | null> => {
  try {
    logger.debug('Attempting to load image service configs from Python backend', undefined, 'ImageServiceConfig');
    
    const apiUrl = buildFlaskApiUrl('/api/image-services/configs');
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data) {
        logger.success('Image service configurations loaded from Python backend', {
          count: result.data.imageServices?.length || 0,
        }, 'ImageServiceConfig');
        return result.data;
      }
    }
    
    logger.debug('Python backend did not return image service configs', {
      status: response.status,
    }, 'ImageServiceConfig');
    return null;
  } catch (error) {
    logger.debug('Could not load from Python backend (non-critical)', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ImageServiceConfig');
    return null;
  }
};

/**
 * Get default image service configurations
 */
export const getDefaultImageServiceConfigs = (): ImageServiceConfigList => {
  const currentTime = new Date().toISOString();
  
  // Default Unsplash service with default API keys
  const defaultApiKeys = [
    'pNt91wUHTHCzruNDxcJcP5POjKb-qV_RSIE4ZXDvMk4',
    'fKuy32Nf8HRuRyFYPyaORvdZ0hc-oeQ-xb9zPz2Baeo',
  ];
  
  const unsplashService: ImageServiceConfig = {
    id: generateImageServiceId(),
    name: 'Unsplash',
    type: 'unsplash',
    apiKeys: defaultApiKeys,
    isDefault: true,
    isDeletable: false, // Cannot be deleted
    createdAt: currentTime,
    updatedAt: currentTime,
  };
  
  return {
    imageServices: [unsplashService],
    defaultServiceId: unsplashService.id,
  };
};

/**
 * Load image service configurations from storage
 */
export const loadImageServiceConfigs = async (): Promise<ImageServiceConfigList> => {
  logger.info('Loading image service configurations', undefined, 'ImageServiceConfig');

  try {
    let configList: ImageServiceConfigList;
    
    // Priority: Electron IPC > Python backend > localStorage
    if (isElectron()) {
      // Use Electron IPC to load from file system
      logger.debug('Loading image service configs from Electron file system', undefined, 'ImageServiceConfig');
      const result = await (window as any).electronAPI.loadImageServiceConfigs();
      
      if (result.success) {
        logger.success('Image service configurations loaded from Electron', {
          count: result.data.imageServices.length,
        }, 'ImageServiceConfig');
        configList = result.data;
      } else {
        logger.warn('Failed to load image service configs from Electron, trying Python backend', {
          error: result.error,
        }, 'ImageServiceConfig');
        
        // Fallback to Python backend if Electron IPC fails
        const backendConfigs = await tryLoadFromPythonBackend();
        if (backendConfigs && backendConfigs.imageServices.length > 0) {
          logger.info('Using image service configurations from Python backend (fallback)', {
            count: backendConfigs.imageServices.length,
          }, 'ImageServiceConfig');
          configList = backendConfigs;
        } else {
          logger.info('No configs from backend, using defaults', undefined, 'ImageServiceConfig');
          configList = getDefaultImageServiceConfigs();
        }
      }
    } else {
      // Browser environment: try Python backend first, then localStorage
      const backendConfigs = await tryLoadFromPythonBackend();
      if (backendConfigs && backendConfigs.imageServices.length > 0) {
        logger.info('Using image service configurations from Python backend', {
          count: backendConfigs.imageServices.length,
        }, 'ImageServiceConfig');
        configList = backendConfigs;
      } else {
        // Use localStorage for browser
        logger.debug('Loading image service configs from localStorage', undefined, 'ImageServiceConfig');
        const stored = localStorage.getItem(IMAGE_SERVICE_CONFIG_KEY);
        
        if (stored) {
          const parsed = JSON.parse(stored) as ImageServiceConfigList;
          logger.success('Image service configurations loaded from localStorage', {
            count: parsed.imageServices.length,
          }, 'ImageServiceConfig');
          configList = parsed;
        } else {
          logger.info('No stored image service configurations found, using defaults', undefined, 'ImageServiceConfig');
          configList = getDefaultImageServiceConfigs();
        }
      }
    }

    // Ensure default Unsplash service exists
    const hasUnsplash = configList.imageServices.some(service => service.type === 'unsplash' && !service.isDeletable);
    if (!hasUnsplash) {
      logger.info('Default Unsplash service not found, adding it', undefined, 'ImageServiceConfig');
      const defaultConfigs = getDefaultImageServiceConfigs();
      const unsplashService = defaultConfigs.imageServices[0];
      configList.imageServices.unshift(unsplashService);
      if (!configList.defaultServiceId) {
        configList.defaultServiceId = unsplashService.id;
      }
    }

    return configList;
  } catch (error) {
    logger.error('Failed to load image service configurations', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ImageServiceConfig');
    return getDefaultImageServiceConfigs();
  }
};

/**
 * Sync image service configurations to Python backend
 */
const syncToPythonBackend = async (configs: ImageServiceConfigList): Promise<void> => {
  try {
    logger.debug('Syncing image service configs to Python backend', {
      count: configs.imageServices.length,
    }, 'ImageServiceConfig');
    
    const apiUrl = buildFlaskApiUrl('/api/image-services/configs');
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(configs),
    });
    
    if (response.ok) {
      const result = await response.json();
      logger.success('Image service configurations synced to Python backend', {
        count: result.count,
      }, 'ImageServiceConfig');
    } else {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      logger.warn('Failed to sync to Python backend, continuing with local storage', {
        status: response.status,
        error: errorData.error,
      }, 'ImageServiceConfig');
    }
  } catch (error) {
    logger.warn('Exception while syncing to Python backend, continuing with local storage', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ImageServiceConfig');
  }
};

/**
 * Save image service configurations to storage
 */
export const saveImageServiceConfigs = async (configs: ImageServiceConfigList): Promise<{ success: boolean; error?: string }> => {
  logger.info('Saving image service configurations', {
    count: configs.imageServices.length,
  }, 'ImageServiceConfig');

  try {
    let saveResult: { success: boolean; error?: string } = { success: false };
    
    if (isElectron()) {
      // Use Electron IPC to save to file system
      logger.debug('Saving image service configs to Electron file system', undefined, 'ImageServiceConfig');
      const result = await (window as any).electronAPI.saveImageServiceConfigs(configs);
      
      if (result.success) {
        logger.success('Image service configurations saved to Electron', {
          count: configs.imageServices.length,
        }, 'ImageServiceConfig');
      } else {
        logger.error('Failed to save image service configs to Electron', {
          error: result.error,
        }, 'ImageServiceConfig');
      }
      
      saveResult = result;
    } else {
      // Use localStorage for browser
      logger.debug('Saving image service configs to localStorage', undefined, 'ImageServiceConfig');
      localStorage.setItem(IMAGE_SERVICE_CONFIG_KEY, JSON.stringify(configs));
      
      logger.success('Image service configurations saved to localStorage', {
        count: configs.imageServices.length,
      }, 'ImageServiceConfig');
      
      saveResult = { success: true };
    }
    
    // Additionally sync to Python backend
    syncToPythonBackend(configs).catch(err => {
      logger.debug('Background sync to Python backend failed (non-critical)', {
        error: err instanceof Error ? err.message : 'Unknown error',
      }, 'ImageServiceConfig');
    });
    
    // Emit event to notify listeners
    if (saveResult.success) {
      emitImageServiceConfigsUpdatedEvent(configs);
    }
    
    return saveResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to save image service configurations', {
      error: errorMessage,
    }, 'ImageServiceConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Add a new image service configuration
 */
export const addImageServiceConfig = async (config: Omit<ImageServiceConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; error?: string; service?: ImageServiceConfig }> => {
  logger.info('Adding new image service configuration', {
    name: config.name,
    type: config.type,
  }, 'ImageServiceConfig');

  // Validate configuration
  const validation = validateImageServiceConfig(config);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // Load existing configs
    const configList = await loadImageServiceConfigs();

    // Create new service with metadata
    const newService: ImageServiceConfig = {
      ...config,
      id: generateImageServiceId(),
      isDeletable: config.isDeletable !== undefined ? config.isDeletable : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add to list
    configList.imageServices.push(newService);

    // Save to storage
    const saveResult = await saveImageServiceConfigs(configList);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    logger.success('Image service configuration added successfully', {
      id: newService.id,
      name: newService.name,
    }, 'ImageServiceConfig');

    return { success: true, service: newService };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to add image service configuration', {
      error: errorMessage,
    }, 'ImageServiceConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Update an existing image service configuration
 */
export const updateImageServiceConfig = async (id: string, updates: Partial<Omit<ImageServiceConfig, 'id' | 'createdAt'>>): Promise<{ success: boolean; error?: string }> => {
  logger.info('Updating image service configuration', { id }, 'ImageServiceConfig');

  try {
    // Load existing configs
    const configList = await loadImageServiceConfigs();

    // Find service to update
    const serviceIndex = configList.imageServices.findIndex(s => s.id === id);
    
    if (serviceIndex === -1) {
      logger.warn('Image service configuration not found', { id }, 'ImageServiceConfig');
      return { success: false, error: 'Image service not found' };
    }

    // Update service
    const updatedService = {
      ...configList.imageServices[serviceIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Validate updated configuration
    const validation = validateImageServiceConfig(updatedService);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    configList.imageServices[serviceIndex] = updatedService;

    // Save to storage
    const saveResult = await saveImageServiceConfigs(configList);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    logger.success('Image service configuration updated successfully', { id }, 'ImageServiceConfig');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update image service configuration', {
      error: errorMessage,
      id,
    }, 'ImageServiceConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Delete an image service configuration
 */
export const deleteImageServiceConfig = async (id: string): Promise<{ success: boolean; error?: string }> => {
  logger.info('Deleting image service configuration', { id }, 'ImageServiceConfig');

  try {
    // Load existing configs
    const configList = await loadImageServiceConfigs();

    // Find service to delete
    const serviceIndex = configList.imageServices.findIndex(s => s.id === id);
    
    if (serviceIndex === -1) {
      logger.warn('Image service configuration not found', { id }, 'ImageServiceConfig');
      return { success: false, error: 'Image service not found' };
    }

    const serviceToDelete = configList.imageServices[serviceIndex];

    // Check if service is deletable
    if (!serviceToDelete.isDeletable) {
      logger.warn('Attempted to delete non-deletable service', { id, name: serviceToDelete.name }, 'ImageServiceConfig');
      return { success: false, error: 'This service cannot be deleted' };
    }

    // Remove service
    configList.imageServices.splice(serviceIndex, 1);

    // Update default service if needed
    if (configList.defaultServiceId === id) {
      configList.defaultServiceId = configList.imageServices[0]?.id;
    }

    // Save to storage
    const saveResult = await saveImageServiceConfigs(configList);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    logger.success('Image service configuration deleted successfully', {
      id,
      name: serviceToDelete.name,
    }, 'ImageServiceConfig');

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete image service configuration', {
      error: errorMessage,
      id,
    }, 'ImageServiceConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Get a random API key from a service's API keys array
 */
export const getRandomApiKey = (service: ImageServiceConfig): string => {
  if (!service.apiKeys || service.apiKeys.length === 0) {
    logger.warn('No API keys available for service', { serviceId: service.id, serviceName: service.name }, 'ImageServiceConfig');
    return '';
  }
  
  const randomIndex = Math.floor(Math.random() * service.apiKeys.length);
  const selectedKey = service.apiKeys[randomIndex];
  
  logger.debug('Selected random API key', {
    serviceId: service.id,
    serviceName: service.name,
    keyIndex: randomIndex,
    totalKeys: service.apiKeys.length,
  }, 'ImageServiceConfig');
  
  return selectedKey;
};

/**
 * Get image service by ID
 */
export const getImageServiceById = async (id: string): Promise<ImageServiceConfig | null> => {
  logger.debug('Getting image service by ID', { id }, 'ImageServiceConfig');

  try {
    const configList = await loadImageServiceConfigs();
    const service = configList.imageServices.find(s => s.id === id);
    
    if (service) {
      logger.debug('Image service found', { id, name: service.name }, 'ImageServiceConfig');
    } else {
      logger.debug('Image service not found', { id }, 'ImageServiceConfig');
    }
    
    return service || null;
  } catch (error) {
    logger.error('Failed to get image service by ID', {
      error: error instanceof Error ? error.message : 'Unknown error',
      id,
    }, 'ImageServiceConfig');
    return null;
  }
};







