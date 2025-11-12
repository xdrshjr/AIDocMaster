/**
 * Electron API Server
 * 
 * This module provides a local API server within Electron to handle API routes
 * that are not available in static exports (output: 'export').
 * 
 * Handles:
 * - /api/chat - AI chat completions with streaming support
 * - /api/document-validation - Document validation with streaming support
 * 
 * This server only runs in packaged mode. In development mode, the Next.js
 * dev server handles these routes natively.
 */

const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

/**
 * API Server Logger
 */
class APILogger {
  constructor(mainLogger) {
    this.mainLogger = mainLogger;
  }

  info(message, data = null) {
    this.mainLogger.info(`[API Server] ${message}`, data);
  }

  debug(message, data = null) {
    this.mainLogger.debug(`[API Server] ${message}`, data);
  }

  error(message, data = null) {
    this.mainLogger.error(`[API Server] ${message}`, data);
  }

  warn(message, data = null) {
    this.mainLogger.warn(`[API Server] ${message}`, data);
  }

  success(message, data = null) {
    this.mainLogger.success(`[API Server] ${message}`, data);
  }
}

/**
 * Model Configuration Loader (Server-side)
 */
class ModelConfigLoader {
  constructor(app, logger) {
    this.app = app;
    this.logger = logger;
  }

  getModelConfigPath() {
    return path.join(this.app.getPath('userData'), 'model-configs.json');
  }

  /**
   * Load model configurations from file system
   */
  loadModelConfigs() {
    const configPath = this.getModelConfigPath();
    
    this.logger.debug('Loading model configs from file system', {
      path: configPath,
    });

    try {
      if (!fs.existsSync(configPath)) {
        this.logger.info('Model config file does not exist, returning empty config');
        return { models: [] };
      }

      const fileContent = fs.readFileSync(configPath, 'utf-8');
      const configs = JSON.parse(fileContent);

      this.logger.success('Model configurations loaded', {
        count: configs.models?.length || 0,
      });

      return configs;
    } catch (error) {
      this.logger.error('Failed to load model configurations', {
        error: error.message,
        stack: error.stack,
      });
      return { models: [] };
    }
  }

  /**
   * Get default model from configurations
   */
  getDefaultModel() {
    const configs = this.loadModelConfigs();
    
    if (!configs.models || configs.models.length === 0) {
      this.logger.warn('No models configured');
      return null;
    }

    // Find the default enabled model
    const defaultModel = configs.models.find(
      (model) => model.isDefault && model.isEnabled !== false
    );

    if (defaultModel) {
      this.logger.info('Found default model', {
        id: defaultModel.id,
        name: defaultModel.name,
        modelName: defaultModel.modelName,
      });
      return defaultModel;
    }

    // Fallback to first enabled model
    const firstEnabled = configs.models.find(
      (model) => model.isEnabled !== false
    );

    if (firstEnabled) {
      this.logger.info('Using first enabled model as fallback', {
        id: firstEnabled.id,
        name: firstEnabled.name,
        modelName: firstEnabled.modelName,
      });
      return firstEnabled;
    }

    this.logger.warn('No enabled models found');
    return null;
  }

  /**
   * Get LLM configuration for API calls
   */
  getLLMConfig() {
    this.logger.info('Getting LLM configuration');

    try {
      const defaultModel = this.getDefaultModel();

      if (defaultModel) {
        const config = {
          apiKey: defaultModel.apiKey,
          apiUrl: defaultModel.apiUrl,
          modelName: defaultModel.modelName,
          timeout: 120000, // 120 seconds
        };

        this.logger.success('Using user-configured model', {
          modelName: config.modelName,
          apiUrl: config.apiUrl,
        });

        return config;
      }

      // Fallback to environment variables
      this.logger.warn('No user-configured model, using environment variables');
      
      const config = {
        apiKey: process.env.LLM_API_KEY || '',
        apiUrl: process.env.LLM_API_URL || 'https://api.openai.com/v1',
        modelName: process.env.LLM_MODEL_NAME || 'gpt-4',
        timeout: parseInt(process.env.LLM_API_TIMEOUT || '120000', 10),
      };

      this.logger.info('Using environment variable configuration', {
        modelName: config.modelName,
        apiUrl: config.apiUrl,
        hasApiKey: !!config.apiKey,
      });

      return config;
    } catch (error) {
      this.logger.error('Error loading LLM configuration', {
        error: error.message,
        stack: error.stack,
      });

      // Return default config as last resort
      return {
        apiKey: process.env.LLM_API_KEY || '',
        apiUrl: process.env.LLM_API_URL || 'https://api.openai.com/v1',
        modelName: process.env.LLM_MODEL_NAME || 'gpt-4',
        timeout: 120000,
      };
    }
  }

  /**
   * Validate LLM configuration
   */
  validateLLMConfig(config) {
    if (!config.apiKey) {
      this.logger.error('LLM API key is missing');
      return { valid: false, error: 'LLM API key is not configured' };
    }

    if (!config.apiUrl) {
      this.logger.error('LLM API URL is missing');
      return { valid: false, error: 'LLM API URL is not configured' };
    }

    if (!config.modelName) {
      this.logger.error('LLM model name is missing');
      return { valid: false, error: 'LLM model name is not configured' };
    }

    return { valid: true };
  }
}

/**
 * API Route Handlers
 */
class APIRouteHandlers {
  constructor(app, logger) {
    this.app = app;
    this.logger = logger;
    this.configLoader = new ModelConfigLoader(app, logger);
  }

  /**
   * Handle POST /api/chat
   */
  async handleChatRequest(reqBody, res) {
    const startTime = Date.now();
    this.logger.info('Chat request received');

    try {
      const { messages } = reqBody;

      // Validate messages
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        this.logger.warn('Invalid messages in chat request', { 
          hasMessages: !!messages,
          isArray: Array.isArray(messages),
        });
        
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Messages array is required and must not be empty' }));
        return;
      }

      this.logger.debug('Processing chat request', {
        messageCount: messages.length,
        lastMessageRole: messages[messages.length - 1]?.role,
      });

      // Get and validate LLM configuration
      const config = this.configLoader.getLLMConfig();
      const validation = this.configLoader.validateLLMConfig(config);

      if (!validation.valid) {
        this.logger.error('LLM configuration validation failed', { 
          error: validation.error 
        });
        
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: validation.error || 'Invalid LLM configuration' }));
        return;
      }

      // Prepare system message
      const systemMessage = {
        role: 'system',
        content: 'You are a helpful AI assistant for DocAIMaster, an AI-powered document editing and validation tool. You help users with document-related questions, provide guidance on using the tool, and assist with document editing tasks. Be concise, friendly, and professional.',
      };

      const fullMessages = [systemMessage, ...messages];

      this.logger.debug('Sending request to LLM API', {
        endpoint: config.apiUrl,
        model: config.modelName,
        messageCount: fullMessages.length,
      });

      // Call LLM API with streaming
      const endpoint = `${config.apiUrl.replace(/\/$/, '')}/chat/completions`;
      const https = require('https');
      const http = require('http');
      const urlModule = require('url');
      
      const parsedUrl = urlModule.parse(endpoint);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      const requestBody = JSON.stringify({
        model: config.modelName,
        messages: fullMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2000,
      });

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Length': Buffer.byteLength(requestBody),
        },
        timeout: config.timeout,
      };

      const llmReq = protocol.request(endpoint, options, (llmRes) => {
        if (llmRes.statusCode !== 200) {
          let errorData = '';
          llmRes.on('data', (chunk) => {
            errorData += chunk.toString();
          });
          llmRes.on('end', () => {
            this.logger.error('LLM API request failed', {
              status: llmRes.statusCode,
              statusMessage: llmRes.statusMessage,
              error: errorData,
              duration: `${Date.now() - startTime}ms`,
            });
            
            res.writeHead(llmRes.statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              error: `LLM API error: ${llmRes.statusCode} ${llmRes.statusMessage}`,
              details: errorData,
            }));
          });
          return;
        }

        this.logger.success('Streaming chat response started', {
          duration: `${Date.now() - startTime}ms`,
        });

        // Stream the response to the client
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        let totalChunks = 0;

        llmRes.on('data', (chunk) => {
          totalChunks++;
          res.write(chunk);

          // Log progress periodically
          if (totalChunks % 10 === 0) {
            this.logger.debug('Chat stream progress', {
              chunks: totalChunks,
              chunkSize: chunk.length,
            });
          }
        });

        llmRes.on('end', () => {
          this.logger.success('Chat stream completed', {
            totalChunks,
            duration: `${Date.now() - startTime}ms`,
          });
          res.end();
        });

        llmRes.on('error', (error) => {
          this.logger.error('Error in chat stream', {
            error: error.message,
            totalChunks,
            duration: `${Date.now() - startTime}ms`,
          });
          res.end();
        });
      });

      llmReq.on('timeout', () => {
        this.logger.error('Chat request timed out', {
          duration: `${Date.now() - startTime}ms`,
        });
        llmReq.destroy();
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request timed out' }));
      });

      llmReq.on('error', (error) => {
        this.logger.error('Chat request failed', {
          error: error.message,
          stack: error.stack,
          duration: `${Date.now() - startTime}ms`,
        });
        
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'Failed to process chat request',
            details: error.message,
          }));
        }
      });

      llmReq.write(requestBody);
      llmReq.end();

    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Chat request failed', {
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`,
      });

      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Failed to process chat request',
          details: error.message,
        }));
      }
    }
  }

  /**
   * Handle POST /api/document-validation
   */
  async handleDocumentValidationRequest(reqBody, res) {
    const startTime = Date.now();
    this.logger.info('Document validation request received');

    try {
      const { content, chunkIndex, totalChunks } = reqBody;

      // Validate input
      if (!content || typeof content !== 'string') {
        this.logger.warn('Invalid content in validation request', { 
          hasContent: !!content, 
          contentType: typeof content 
        });
        
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Content is required and must be a string' }));
        return;
      }

      this.logger.debug('Processing validation request', {
        contentLength: content.length,
        chunkIndex,
        totalChunks,
      });

      // Get and validate LLM configuration
      const config = this.configLoader.getLLMConfig();
      const validation = this.configLoader.validateLLMConfig(config);

      if (!validation.valid) {
        this.logger.error('LLM configuration validation failed', { 
          error: validation.error 
        });
        
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: validation.error || 'Invalid LLM configuration' }));
        return;
      }

      // Prepare validation prompt
      const systemMessage = {
        role: 'system',
        content: `You are an expert document validator and editor. Your task is to analyze document content and identify issues in four categories:

1. Grammar: grammatical errors, verb tense issues, subject-verb agreement
2. WordUsage: incorrect word choice, redundancy, unclear phrasing
3. Punctuation: missing or incorrect punctuation marks
4. Logic: logical inconsistencies, unclear arguments, missing transitions

For each issue you find, provide:
- id: a unique identifier (use format: "issue-{category}-{number}")
- category: one of "Grammar", "WordUsage", "Punctuation", or "Logic"
- severity: "high", "medium", or "low"
- location: a brief description of where the issue occurs
- issue: a clear description of the problem
- suggestion: a specific recommendation for improvement

Return your response as a valid JSON object with this exact structure:
{
  "issues": [
    {
      "id": "issue-grammar-1",
      "category": "Grammar",
      "severity": "high",
      "location": "First paragraph",
      "issue": "Description of the issue",
      "suggestion": "Specific suggestion to fix it"
    }
  ],
  "summary": {
    "totalIssues": 5,
    "grammarCount": 2,
    "wordUsageCount": 1,
    "punctuationCount": 1,
    "logicCount": 1
  }
}

Important: Return ONLY the JSON object, no additional text or explanations. If no issues are found, return an empty issues array with all counts set to 0.`,
      };

      const userMessage = {
        role: 'user',
        content: `Please validate the following document content (chunk ${chunkIndex + 1} of ${totalChunks}):\n\n${content}`,
      };

      const messages = [systemMessage, userMessage];

      this.logger.debug('Sending validation request to LLM API', {
        endpoint: config.apiUrl,
        model: config.modelName,
        chunkIndex,
      });

      // Call LLM API with streaming
      const endpoint = `${config.apiUrl.replace(/\/$/, '')}/chat/completions`;
      const https = require('https');
      const http = require('http');
      const urlModule = require('url');
      
      const parsedUrl = urlModule.parse(endpoint);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;

      const requestBody = JSON.stringify({
        model: config.modelName,
        messages: messages,
        stream: true,
        temperature: 0.3,
        max_tokens: 4000,
      });

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Length': Buffer.byteLength(requestBody),
        },
        timeout: config.timeout,
      };

      const llmReq = protocol.request(endpoint, options, (llmRes) => {
        if (llmRes.statusCode !== 200) {
          let errorData = '';
          llmRes.on('data', (chunk) => {
            errorData += chunk.toString();
          });
          llmRes.on('end', () => {
            this.logger.error('LLM API request failed', {
              status: llmRes.statusCode,
              statusMessage: llmRes.statusMessage,
              error: errorData,
              duration: `${Date.now() - startTime}ms`,
            });
            
            res.writeHead(llmRes.statusCode, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
              error: `LLM API error: ${llmRes.statusCode} ${llmRes.statusMessage}`,
              details: errorData,
            }));
          });
          return;
        }

        this.logger.success('Streaming validation response started', {
          duration: `${Date.now() - startTime}ms`,
          chunkIndex,
        });

        // Stream the response to the client
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });

        let totalChunks = 0;

        llmRes.on('data', (chunk) => {
          totalChunks++;
          res.write(chunk);

          // Log progress periodically
          if (totalChunks % 10 === 0) {
            this.logger.debug('Validation stream progress', {
              chunks: totalChunks,
              chunkSize: chunk.length,
              chunkIndex,
            });
          }
        });

        llmRes.on('end', () => {
          this.logger.success('Validation stream completed', {
            totalChunks,
            duration: `${Date.now() - startTime}ms`,
            chunkIndex,
          });
          res.end();
        });

        llmRes.on('error', (error) => {
          this.logger.error('Error in validation stream', {
            error: error.message,
            totalChunks,
            duration: `${Date.now() - startTime}ms`,
            chunkIndex,
          });
          res.end();
        });
      });

      llmReq.on('timeout', () => {
        this.logger.error('Validation request timed out', {
          duration: `${Date.now() - startTime}ms`,
        });
        llmReq.destroy();
        res.writeHead(504, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Request timed out' }));
      });

      llmReq.on('error', (error) => {
        this.logger.error('Validation request failed', {
          error: error.message,
          stack: error.stack,
          duration: `${Date.now() - startTime}ms`,
        });
        
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            error: 'Failed to process validation request',
            details: error.message,
          }));
        }
      });

      llmReq.write(requestBody);
      llmReq.end();

    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Validation request failed', {
        error: error.message,
        stack: error.stack,
        duration: `${duration}ms`,
      });

      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Failed to process validation request',
          details: error.message,
        }));
      }
    }
  }

  /**
   * Handle GET /api/chat (health check)
   */
  async handleChatHealthCheck(res) {
    this.logger.info('Chat API health check');

    try {
      const config = this.configLoader.getLLMConfig();
      const validation = this.configLoader.validateLLMConfig(config);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        configured: validation.valid,
        model: config.modelName,
        endpoint: config.apiUrl,
      }));
    } catch (error) {
      this.logger.error('Chat API health check failed', {
        error: error.message,
      });

      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', configured: false }));
    }
  }

  /**
   * Handle GET /api/document-validation (health check)
   */
  async handleDocumentValidationHealthCheck(res) {
    this.logger.info('Document validation API health check');

    try {
      const config = this.configLoader.getLLMConfig();
      const validation = this.configLoader.validateLLMConfig(config);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        configured: validation.valid,
        model: config.modelName,
        endpoint: config.apiUrl,
      }));
    } catch (error) {
      this.logger.error('Document validation API health check failed', {
        error: error.message,
      });

      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', configured: false }));
    }
  }
}

/**
 * Electron API Server
 */
class ElectronAPIServer {
  constructor(app, mainLogger, port = 3001) {
    this.app = app;
    this.port = port;
    this.server = null;
    this.logger = new APILogger(mainLogger);
    this.routeHandlers = new APIRouteHandlers(app, this.logger);
  }

  /**
   * Parse request body
   */
  parseRequestBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      
      req.on('data', (chunk) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          if (body) {
            resolve(JSON.parse(body));
          } else {
            resolve({});
          }
        } catch (error) {
          reject(new Error('Invalid JSON in request body'));
        }
      });

      req.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Handle incoming requests
   */
  async handleRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://localhost:${this.port}`);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    this.logger.debug('Incoming request', {
      method,
      pathname,
      headers: req.headers,
    });

    // Enable CORS for Electron renderer process
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS preflight
    if (method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    try {
      // Route handling
      if (pathname === '/api/chat') {
        if (method === 'POST') {
          const body = await this.parseRequestBody(req);
          await this.routeHandlers.handleChatRequest(body, res);
        } else if (method === 'GET') {
          await this.routeHandlers.handleChatHealthCheck(res);
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      } else if (pathname === '/api/document-validation') {
        if (method === 'POST') {
          const body = await this.parseRequestBody(req);
          await this.routeHandlers.handleDocumentValidationRequest(body, res);
        } else if (method === 'GET') {
          await this.routeHandlers.handleDocumentValidationHealthCheck(res);
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      } else {
        this.logger.warn('Route not found', { pathname, method });
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Route not found' }));
      }
    } catch (error) {
      this.logger.error('Request handling failed', {
        error: error.message,
        stack: error.stack,
        pathname,
        method,
      });

      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Internal server error',
          details: error.message,
        }));
      }
    }
  }

  /**
   * Start the API server
   */
  start() {
    return new Promise((resolve, reject) => {
      this.logger.info('Starting API server', { port: this.port });

      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          this.logger.warn('Port already in use, trying next port', {
            currentPort: this.port,
            nextPort: this.port + 1,
          });
          this.port += 1;
          
          // Retry with next port
          setTimeout(() => {
            this.server.close();
            this.start().then(resolve).catch(reject);
          }, 100);
        } else {
          this.logger.error('Server error', {
            error: error.message,
            stack: error.stack,
          });
          reject(error);
        }
      });

      this.server.listen(this.port, 'localhost', () => {
        this.logger.success('API server started successfully', {
          port: this.port,
          address: `http://localhost:${this.port}`,
        });
        resolve(this.port);
      });
    });
  }

  /**
   * Stop the API server
   */
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.logger.info('Stopping API server');
        
        this.server.close(() => {
          this.logger.success('API server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the current server port
   */
  getPort() {
    return this.port;
  }
}

module.exports = ElectronAPIServer;

