/**
 * Chat Bot Configuration Service
 * Manages chat bot configurations with support for system prompts, models, temperature, etc.
 * Supports browser localStorage, Electron file system storage
 */

import { logger } from './logger';
import { loadModelConfigs } from './modelConfig';

export interface ChatBotConfig {
  id: string;
  name: string;
  systemPrompt: string;
  modelId: string;
  temperature: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  isEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChatBotConfigList {
  bots: ChatBotConfig[];
}

const CHAT_BOT_CONFIG_KEY = 'docaimaster_chat_bot_configs';

/**
 * Check if running in Electron environment
 */
const isElectron = (): boolean => {
  return typeof window !== 'undefined' && 
         typeof (window as any).electronAPI !== 'undefined';
};

/**
 * Generate unique ID for chat bot
 */
export const generateChatBotId = (): string => {
  return `chatbot_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Validate chat bot configuration
 */
export const validateChatBotConfig = (config: Partial<ChatBotConfig>): { valid: boolean; error?: string } => {
  logger.debug('Validating chat bot configuration', { configId: config.id }, 'ChatBotConfig');

  if (!config.name || config.name.trim().length === 0) {
    logger.warn('Chat bot name is required', undefined, 'ChatBotConfig');
    return { valid: false, error: 'Chat bot name is required' };
  }

  if (!config.systemPrompt || config.systemPrompt.trim().length === 0) {
    logger.warn('System prompt is required', undefined, 'ChatBotConfig');
    return { valid: false, error: 'System prompt is required' };
  }

  if (!config.modelId || config.modelId.trim().length === 0) {
    logger.warn('Model ID is required', undefined, 'ChatBotConfig');
    return { valid: false, error: 'Model ID is required' };
  }

  if (config.temperature !== undefined) {
    if (typeof config.temperature !== 'number' || config.temperature < 0 || config.temperature > 2) {
      logger.warn('Temperature must be between 0 and 2', { temperature: config.temperature }, 'ChatBotConfig');
      return { valid: false, error: 'Temperature must be between 0 and 2' };
    }
  }

  logger.debug('Chat bot configuration validated successfully', { configId: config.id }, 'ChatBotConfig');
  return { valid: true };
};

/**
 * Load chat bot configurations from storage
 */
export const loadChatBotConfigs = async (): Promise<ChatBotConfigList> => {
  logger.info('Loading chat bot configurations', undefined, 'ChatBotConfig');

  try {
    if (isElectron()) {
      // Use Electron IPC to load from file system
      logger.debug('Loading chat bot configs from Electron file system', undefined, 'ChatBotConfig');
      const result = await (window as any).electronAPI.loadChatBotConfigs();
      
      if (result.success) {
        logger.success('Chat bot configurations loaded from Electron', {
          count: result.data.bots.length,
        }, 'ChatBotConfig');
        return result.data;
      } else {
        logger.warn('Failed to load chat bot configs from Electron, using defaults', {
          error: result.error,
        }, 'ChatBotConfig');
        return { bots: [] };
      }
    } else {
      // Use localStorage for browser
      logger.debug('Loading chat bot configs from localStorage', undefined, 'ChatBotConfig');
      const stored = localStorage.getItem(CHAT_BOT_CONFIG_KEY);
      
      if (stored) {
        const parsed = JSON.parse(stored) as ChatBotConfigList;
        logger.success('Chat bot configurations loaded from localStorage', {
          count: parsed.bots.length,
        }, 'ChatBotConfig');
        return parsed;
      }
      
      logger.info('No stored chat bot configurations found', undefined, 'ChatBotConfig');
      return { bots: [] };
    }
  } catch (error) {
    logger.error('Failed to load chat bot configurations', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ChatBotConfig');
    return { bots: [] };
  }
};

/**
 * Save chat bot configurations to storage
 */
export const saveChatBotConfigs = async (configs: ChatBotConfigList): Promise<{ success: boolean; error?: string }> => {
  logger.info('Saving chat bot configurations', {
    count: configs.bots.length,
  }, 'ChatBotConfig');

  try {
    let saveResult: { success: boolean; error?: string } = { success: false };
    
    if (isElectron()) {
      // Use Electron IPC to save to file system
      logger.debug('Saving chat bot configs to Electron file system', undefined, 'ChatBotConfig');
      const result = await (window as any).electronAPI.saveChatBotConfigs(configs);
      
      if (result.success) {
        logger.success('Chat bot configurations saved to Electron', {
          count: configs.bots.length,
        }, 'ChatBotConfig');
      } else {
        logger.error('Failed to save chat bot configs to Electron', {
          error: result.error,
        }, 'ChatBotConfig');
      }
      
      saveResult = result;
    } else {
      // Use localStorage for browser
      logger.debug('Saving chat bot configs to localStorage', undefined, 'ChatBotConfig');
      localStorage.setItem(CHAT_BOT_CONFIG_KEY, JSON.stringify(configs));
      
      logger.success('Chat bot configurations saved to localStorage', {
        count: configs.bots.length,
      }, 'ChatBotConfig');
      
      saveResult = { success: true };
    }
    
    return saveResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to save chat bot configurations', {
      error: errorMessage,
    }, 'ChatBotConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Add a new chat bot configuration
 */
export const addChatBotConfig = async (config: Omit<ChatBotConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<{ success: boolean; error?: string; bot?: ChatBotConfig }> => {
  logger.info('Adding new chat bot configuration', {
    name: config.name,
  }, 'ChatBotConfig');

  // Validate configuration
  const validation = validateChatBotConfig(config);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  try {
    // Load existing configs
    const configList = await loadChatBotConfigs();

    // Create new bot with metadata
    const newBot: ChatBotConfig = {
      ...config,
      id: generateChatBotId(),
      isEnabled: config.isEnabled !== false,
      temperature: config.temperature ?? 0.7,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Add to list
    configList.bots.push(newBot);

    // Save to storage
    const saveResult = await saveChatBotConfigs(configList);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    logger.success('Chat bot configuration added successfully', {
      id: newBot.id,
      name: newBot.name,
    }, 'ChatBotConfig');

    return { success: true, bot: newBot };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to add chat bot configuration', {
      error: errorMessage,
    }, 'ChatBotConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Update an existing chat bot configuration
 */
export const updateChatBotConfig = async (id: string, updates: Partial<Omit<ChatBotConfig, 'id' | 'createdAt'>>): Promise<{ success: boolean; error?: string }> => {
  logger.info('Updating chat bot configuration', { id }, 'ChatBotConfig');

  try {
    // Load existing configs
    const configList = await loadChatBotConfigs();

    // Find bot to update
    const botIndex = configList.bots.findIndex(b => b.id === id);
    
    if (botIndex === -1) {
      logger.warn('Chat bot configuration not found', { id }, 'ChatBotConfig');
      return { success: false, error: 'Chat bot not found' };
    }

    // Update bot
    const updatedBot = {
      ...configList.bots[botIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Validate updated configuration
    const validation = validateChatBotConfig(updatedBot);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    configList.bots[botIndex] = updatedBot;

    // Save to storage
    const saveResult = await saveChatBotConfigs(configList);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    logger.success('Chat bot configuration updated successfully', { id }, 'ChatBotConfig');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to update chat bot configuration', {
      error: errorMessage,
      id,
    }, 'ChatBotConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Delete a chat bot configuration
 */
export const deleteChatBotConfig = async (id: string): Promise<{ success: boolean; error?: string }> => {
  logger.info('Deleting chat bot configuration', { id }, 'ChatBotConfig');

  try {
    // Load existing configs
    const configList = await loadChatBotConfigs();

    // Find bot to delete
    const botIndex = configList.bots.findIndex(b => b.id === id);
    
    if (botIndex === -1) {
      logger.warn('Chat bot configuration not found', { id }, 'ChatBotConfig');
      return { success: false, error: 'Chat bot not found' };
    }

    const deletedBot = configList.bots[botIndex];

    // Remove bot
    configList.bots.splice(botIndex, 1);

    // Save to storage
    const saveResult = await saveChatBotConfigs(configList);
    
    if (!saveResult.success) {
      return { success: false, error: saveResult.error };
    }

    logger.success('Chat bot configuration deleted successfully', {
      id,
      name: deletedBot.name,
    }, 'ChatBotConfig');

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('Failed to delete chat bot configuration', {
      error: errorMessage,
      id,
    }, 'ChatBotConfig');
    return { success: false, error: errorMessage };
  }
};

/**
 * Get chat bot configuration by ID
 */
export const getChatBotById = async (id: string): Promise<ChatBotConfig | null> => {
  logger.debug('Getting chat bot by ID', { id }, 'ChatBotConfig');

  try {
    const configList = await loadChatBotConfigs();
    const bot = configList.bots.find(b => b.id === id);
    
    if (bot) {
      logger.debug('Chat bot found', { id, name: bot.name }, 'ChatBotConfig');
    } else {
      logger.debug('Chat bot not found', { id }, 'ChatBotConfig');
    }
    
    return bot || null;
  } catch (error) {
    logger.error('Failed to get chat bot by ID', {
      error: error instanceof Error ? error.message : 'Unknown error',
      id,
    }, 'ChatBotConfig');
    return null;
  }
};

/**
 * Get available models for chat bot configuration
 */
export const getAvailableModels = async (): Promise<Array<{ id: string; name: string }>> => {
  logger.debug('Getting available models for chat bot', undefined, 'ChatBotConfig');

  try {
    const modelConfigs = await loadModelConfigs();
    const models = modelConfigs.models
      .filter(m => m.isEnabled !== false)
      .map(m => ({ id: m.id, name: m.name }));
    
    logger.debug('Available models retrieved', { count: models.length }, 'ChatBotConfig');
    return models;
  } catch (error) {
    logger.error('Failed to get available models', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'ChatBotConfig');
    return [];
  }
};


