/**
 * Search Service Configuration Service
 * Manages search service configurations (e.g., Tavily)
 * Supports browser localStorage, Electron file system storage, and Python backend persistence
 */

import { logger } from './logger';
import { buildFlaskApiUrl } from './flaskConfig';

export interface SearchServiceConfig {
  id: string;
  name: string;
  type: 'tavily' | 'custom';
  apiKeys: string[]; // Multiple API keys for load balancing
  isDefault?: boolean;
  isDeletable?: boolean; // Whether this service can be deleted
  createdAt?: string;
  updatedAt?: string;
}

export interface SearchServiceConfigList {
  searchServices: SearchServiceConfig[];
  defaultServiceId?: string;
}

const SEARCH_SERVICE_CONFIG_KEY = 'docaimaster_search_service_configs';
const SEARCH_SERVICE_CONFIGS_UPDATED_EVENT = 'docaimaster_search_service_configs_updated';

/**
 * Get the browser event name used when search service configurations change
 */
export const getSearchServiceConfigsUpdatedEventName = (): string => {
  return SEARCH_SERVICE_CONFIGS_UPDATED_EVENT;
};

/**
 * Emit a browser event to notify listeners that search service configs have changed
 */
const emitSearchServiceConfigsUpdatedEvent = (configs: SearchServiceConfigList): void => {
  if (typeof window === 'undefined') {
    logger.debug('Skipping search service configs updated event emit on non-browser environment', undefined, 'SearchServiceConfig');
    return;
  }

  try {
    const detail = {
      servicesCount: configs.searchServices.length,
      defaultServiceId: configs.defaultServiceId,
    };

    logger.info('Emitting search service configuration updated event', detail, 'SearchServiceConfig');

    const event = new CustomEvent(SEARCH_SERVICE_CONFIGS_UPDATED_EVENT, { detail });
    window.dispatchEvent(event);
  } catch (error) {
    logger.error('Failed to emit search service configuration updated event', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'SearchServiceConfig');
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
 * Generate unique ID for search service
 */
export const generateSearchServiceId = (): string => {
  return `search_service_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Validate search service configuration
 */
export const validateSearchServiceConfig = (config: Partial<SearchServiceConfig>): { valid: boolean; error?: string } => {
  logger.debug('Validating search service configuration', { configId: config.id }, 'SearchServiceConfig');

  if (!config.name || config.name.trim().length === 0) {
    logger.warn('Search service name is required', undefined, 'SearchServiceConfig');
    return { valid: false, error: 'Search service name is required' };
  }

  if (!config.type) {
    logger.warn('Search service type is required', undefined, 'SearchServiceConfig');
    return { valid: false, error: 'Search service type is required' };
  }

  if (!config.apiKeys || !Array.isArray(config.apiKeys) || config.apiKeys.length === 0) {
    logger.warn('At least one API key is required', undefined, 'SearchServiceConfig');
    return { valid: false, error: 'At least one API key is required' };
  }

  // Validate API keys are non-empty strings
  const invalidKeys = config.apiKeys.filter(key => !key || typeof key !== 'string' || key.trim().length === 0);
  if (invalidKeys.length > 0) {
    logger.warn('Invalid API keys found', { invalidCount: invalidKeys.length }, 'SearchServiceConfig');
    return { valid: false, error: 'All API keys must be non-empty strings' };
  }

  logger.debug('Search service configuration validated successfully', { configId: config.id }, 'SearchServiceConfig');
  return { valid: true };
};

/**
 * Try to load search service configurations from Python backend
 */
const tryLoadFromPythonBackend = async (): Promise<SearchServiceConfigList | null> => {
  try {
    logger.debug('Attempting to load search service configs from Python backend', undefined, 'SearchServiceConfig');
    
    const apiUrl = buildFlaskApiUrl('/api/search-services/configs');
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.data) {
        logger.success('Search service configurations loaded from Python backend', {
          count: result.data.searchServices?.length || 0,
        }, 'SearchServiceConfig');
        return result.data;
      }
    }
    
    logger.debug('Python backend did not return search service configs', {
      status: response.status,
    }, 'SearchServiceConfig');
    return null;
  } catch (error) {
    logger.debug('Could not load from Python backend (non-critical)', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'SearchServiceConfig');
    return null;
  }
};

/**
 * Get default search service configurations
 */
export const getDefaultSearchServiceConfigs = (): SearchServiceConfigList => {
  const currentTime = new Date().toISOString();
  
  // Default Tavily service with default API keys
  const defaultApiKeys = [
    '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',
    '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',
  ];
  
  const tavilyService: SearchServiceConfig = {
    id: generateSearchServiceId(),
    name: 'Tavily Search',
    type: 'tavily',
    apiKeys: defaultApiKeys,
    isDefault: true,
    isDeletable: false, // Cannot be deleted
    createdAt: currentTime,
    updatedAt: currentTime,
  };
  
  return {
    searchServices: [tavilyService],
    defaultServiceId: tavilyService.id,
  };
};

/**
 * Load search service configurations from storage
 */
export const loadSearchServiceConfigs = async (): Promise<SearchServiceConfigList> => {
  logger.info('Loading search service configurations', undefined, 'SearchServiceConfig');

  try {
    let configList: SearchServiceConfigList;
    
    // Priority: Electron IPC > Python backend > localStorage
    if (isElectron()) {
      // Use Electron IPC to load from file system
      logger.debug('Loading search service configs from Electron file system', undefined, 'SearchServiceConfig');
      const result = await (window as any).electronAPI.loadSearchServiceConfigs();
      
      if (result.success) {
        logger.success('Search service configurations loaded from Electron', {
          count: result.data.searchServices.length,
        }, 'SearchServiceConfig');
        configList = result.data;
      } else {
        logger.warn('Failed to load search service configs from Electron, trying Python backend', {
          error: result.error,
        }, 'SearchServiceConfig');
        
        // Fallback to Python backend if Electron IPC fails
        const backendConfigs = await tryLoadFromPythonBackend();
        if (backendConfigs && backendConfigs.searchServices.length > 0) {
          logger.info('Using search service configurations from Python backend (fallback)', {
            count: backendConfigs.searchServices.length,
          }, 'SearchServiceConfig');
          configList = backendConfigs;
        } else {
          logger.info('No configs from backend, using defaults', undefined, 'SearchServiceConfig');
          configList = getDefaultSearchServiceConfigs();
        }
      }
    } else {
      // Browser environment: try Python backend first, then localStorage
      const backendConfigs = await tryLoadFromPythonBackend();
      if (backendConfigs && backendConfigs.searchServices.length > 0) {
        logger.info('Using search service configurations from Python backend', {
          count: backendConfigs.searchServices.length,
        }, 'SearchServiceConfig');
        configList = backendConfigs;
      } else {
        // Use localStorage for browser
        logger.debug('Loading search service configs from localStorage', undefined, 'SearchServiceConfig');
        const stored = localStorage.getItem(SEARCH_SERVICE_CONFIG_KEY);
        
        if (stored) {
          const parsed = JSON.parse(stored) as SearchServiceConfigList;
          logger.success('Search service configurations loaded from localStorage', {
            count: parsed.searchServices.length,
          }, 'SearchServiceConfig');
          configList = parsed;
        } else {
          logger.info('No stored search service configurations found, using defaults', undefined, 'SearchServiceConfig');
          configList = getDefaultSearchServiceConfigs();
        }
      }
    }

    // Ensure default Tavily service exists
    const hasTavily = configList.searchServices.some(service => service.type === 'tavily' && !service.isDeletable);
    if (!hasTavily) {
      logger.info('Default Tavily service not found, adding it', undefined, 'SearchServiceConfig');
      const defaultConfigs = getDefaultSearchServiceConfigs();
      const tavilyService = defaultConfigs.searchServices[0];
      configList.searchServices.unshift(tavilyService);
      if (!configList.defaultServiceId) {
        configList.defaultServiceId = tavilyService.id;
      }
    }

    return configList;
  } catch (error) {
    logger.error('Failed to load search service configurations', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'SearchServiceConfig');
    return getDefaultSearchServiceConfigs();
  }
};

/**
 * Sync search service configurations to Python backend
 */
const syncToPythonBackend = async (configs: SearchServiceConfigList): Promise<void> => {
  try {
    logger.debug('Syncing search service configs to Python backend', {
      count: configs.searchServices.length,
    }, 'SearchServiceConfig');
    
    const apiUrl = buildFlaskApiUrl('/api/search-services/configs');
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(configs),
    });
    
    if (response.ok) {
      const result = await response.json();
      logger.success('Search service configurations synced to Python backend', {
        count: result.count,
      }, 'SearchServiceConfig');
    } else {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      logger.warn('Failed to sync to Python backend, continuing with local storage', {
        status: response.status,
        error: errorData.error,
      }, 'SearchServiceConfig');
    }
  } catch (error) {
    logger.warn('Exception while syncing to Python backend, continuing with local storage', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'SearchServiceConfig');
  }
};

/**
 * Save search service configurations to storage
 */
export const saveSearchServiceConfigs = async (configs: SearchServiceConfigList): Promise<{ success: boolean; error?: string }> => {
  logger.info('Saving search service configurations', {
    count: configs.searchServices.length,
  }, 'SearchServiceConfig');

  try {
    let saveResult: { success: boolean; error?: string } = { success: false };
    
    if (isElectron()) {
      // Use Electron IPC to save to file system
      logger.debug('Saving search service configs to Electron file system', undefined, 'SearchServiceConfig');
      const result = await (window as any).electronAPI.saveSearchServiceConfigs(configs);
      
      if (result.success) {
        logger.success('Search service configurations saved to Electron', {
          count: configs.searchServices.length,
        }, 'SearchServiceConfig');
      } else {
        logger.error('Failed to save search service configs to Electron', {
          error: result.error,
        }, 'SearchServiceConfig');
      }
      
      saveResult = result;
    } else {
      // Use localStorage for browser
      logger.debug('Saving search service configs to localStorage', undefined, 'SearchServiceConfig');
      localStorage.setItem(SEARCH_SERVICE_CONFIG_KEY, JSON.stringify(configs));
      
      logger.success('Search service configurations saved to localStorage', {
        count: configs.searchServices.length,
      }, 'SearchServiceConfig');
      
      saveResult = { success: true };
    }
    
    // Additionally sync to Python backend
    syncToPythonBackend(configs).catch(err => {
      logger.debug('Background sync to Python backend failed (non-critical)', {
        error: err instanceof Error ? err.message : 'Unknown error',
      }, 'SearchServiceConfig');
    });
    
    // Emit event to notify listeners
    if (saveResult.success) {
      emitSearchServiceConfigsUpdatedEvent(configs);
    }
    
    return saveResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to save search service configurations', {
      error: errorMessage,
    }, 'SearchServiceConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Add a new search service configuration
 */
export const addSearchServiceConfig = async (config: Omit<SearchServiceConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; error?: string; service?: SearchServiceConfig }> => {
  logger.info('Adding new search service configuration', {
    name: config.name,
    type: config.type,
  }, 'SearchServiceConfig');

  // Validate configuration
  const validation = validateSearchServiceConfig(config);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // Load existing configs
    const configList = await loadSearchServiceConfigs();

    // Create new service with metadata
    const newService: SearchServiceConfig = {
      ...config,
      id: generateSearchServiceId(),
      isDeletable: config.isDeletable !== undefined ? config.isDeletable : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add to list
    configList.searchServices.push(newService);

    // Save to storage
    const saveResult = await saveSearchServiceConfigs(configList);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    logger.success('Search service configuration added successfully', {
      id: newService.id,
      name: newService.name,
    }, 'SearchServiceConfig');

    return { success: true, service: newService };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to add search service configuration', {
      error: errorMessage,
    }, 'SearchServiceConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Update an existing search service configuration
 */
export const updateSearchServiceConfig = async (id: string, updates: Partial<Omit<SearchServiceConfig, 'id' | 'createdAt'>>): Promise<{ success: boolean; error?: string }> => {
  logger.info('Updating search service configuration', { id }, 'SearchServiceConfig');

  try {
    // Load existing configs
    const configList = await loadSearchServiceConfigs();

    // Find service to update
    const serviceIndex = configList.searchServices.findIndex(s => s.id === id);
    
    if (serviceIndex === -1) {
      logger.warn('Search service configuration not found', { id }, 'SearchServiceConfig');
      return { success: false, error: 'Search service not found' };
    }

    // Update service
    const updatedService = {
      ...configList.searchServices[serviceIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Validate updated configuration
    const validation = validateSearchServiceConfig(updatedService);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    configList.searchServices[serviceIndex] = updatedService;

    // Save to storage
    const saveResult = await saveSearchServiceConfigs(configList);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    logger.success('Search service configuration updated successfully', { id }, 'SearchServiceConfig');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update search service configuration', {
      error: errorMessage,
      id,
    }, 'SearchServiceConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Delete a search service configuration
 */
export const deleteSearchServiceConfig = async (id: string): Promise<{ success: boolean; error?: string }> => {
  logger.info('Deleting search service configuration', { id }, 'SearchServiceConfig');

  try {
    // Load existing configs
    const configList = await loadSearchServiceConfigs();

    // Find service to delete
    const serviceIndex = configList.searchServices.findIndex(s => s.id === id);
    
    if (serviceIndex === -1) {
      logger.warn('Search service configuration not found', { id }, 'SearchServiceConfig');
      return { success: false, error: 'Search service not found' };
    }

    const serviceToDelete = configList.searchServices[serviceIndex];

    // Check if service is deletable
    if (!serviceToDelete.isDeletable) {
      logger.warn('Attempted to delete non-deletable service', { id, name: serviceToDelete.name }, 'SearchServiceConfig');
      return { success: false, error: 'This service cannot be deleted' };
    }

    // Remove service
    configList.searchServices.splice(serviceIndex, 1);

    // Update default service if needed
    if (configList.defaultServiceId === id) {
      configList.defaultServiceId = configList.searchServices[0]?.id;
    }

    // Save to storage
    const saveResult = await saveSearchServiceConfigs(configList);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    logger.success('Search service configuration deleted successfully', {
      id,
      name: serviceToDelete.name,
    }, 'SearchServiceConfig');

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete search service configuration', {
      error: errorMessage,
      id,
    }, 'SearchServiceConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Get a random API key from a service's API keys array
 */
export const getRandomApiKey = (service: SearchServiceConfig): string => {
  if (!service.apiKeys || service.apiKeys.length === 0) {
    logger.warn('No API keys available for service', { serviceId: service.id, serviceName: service.name }, 'SearchServiceConfig');
    return '';
  }
  
  const randomIndex = Math.floor(Math.random() * service.apiKeys.length);
  const selectedKey = service.apiKeys[randomIndex];
  
  logger.debug('Selected random API key', {
    serviceId: service.id,
    serviceName: service.name,
    keyIndex: randomIndex,
    totalKeys: service.apiKeys.length,
  }, 'SearchServiceConfig');
  
  return selectedKey;
};

/**
 * Get search service by ID
 */
export const getSearchServiceById = async (id: string): Promise<SearchServiceConfig | null> => {
  logger.debug('Getting search service by ID', { id }, 'SearchServiceConfig');

  try {
    const configList = await loadSearchServiceConfigs();
    const service = configList.searchServices.find(s => s.id === id);
    
    if (service) {
      logger.debug('Search service found', { id, name: service.name }, 'SearchServiceConfig');
    } else {
      logger.debug('Search service not found', { id }, 'SearchServiceConfig');
    }
    
    return service || null;
  } catch (error) {
    logger.error('Failed to get search service by ID', {
      error: error instanceof Error ? error.message : 'Unknown error',
      id,
    }, 'SearchServiceConfig');
    return null;
  }
};

/**
 * Get default search service configuration
 */
export const getDefaultSearchService = async (): Promise<SearchServiceConfig | null> => {
  logger.debug('Getting default search service', undefined, 'SearchServiceConfig');

  try {
    const configList = await loadSearchServiceConfigs();
    
    // First try to get service by defaultServiceId
    if (configList.defaultServiceId) {
      const defaultService = configList.searchServices.find(
        s => s.id === configList.defaultServiceId
      );
      if (defaultService) {
        logger.debug('Default search service found by ID', {
          id: defaultService.id,
          name: defaultService.name,
        }, 'SearchServiceConfig');
        return defaultService;
      }
    }
    
    // Fallback to first service marked as default
    const defaultService = configList.searchServices.find(s => s.isDefault);
    if (defaultService) {
      logger.debug('Default search service found by isDefault flag', {
        id: defaultService.id,
        name: defaultService.name,
      }, 'SearchServiceConfig');
      return defaultService;
    }
    
    // Fallback to first available service
    if (configList.searchServices.length > 0) {
      logger.debug('Using first available search service as default', {
        id: configList.searchServices[0].id,
        name: configList.searchServices[0].name,
      }, 'SearchServiceConfig');
      return configList.searchServices[0];
    }
    
    logger.warn('No search service available', undefined, 'SearchServiceConfig');
    return null;
  } catch (error) {
    logger.error('Failed to get default search service', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'SearchServiceConfig');
    return null;
  }
};

