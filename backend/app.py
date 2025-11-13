"""
Flask Backend for AIDocMaster
Handles all LLM API calls with comprehensive logging and error handling
"""

import os
import sys
import json
import logging
import requests
from datetime import datetime
from flask import Flask, request, Response, jsonify, stream_with_context
from flask_cors import CORS
from pathlib import Path
from logging.handlers import RotatingFileHandler

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configure logging
def setup_logging():
    """
    Setup comprehensive logging with file rotation and proper formatting
    Supports multiple log levels: DEBUG, INFO, WARNING, ERROR
    """
    # Determine log directory
    if getattr(sys, 'frozen', False):
        # Running as packaged executable
        if sys.platform == 'win32':
            log_dir = Path(os.environ.get('APPDATA', '')) / 'AIDocMaster' / 'logs'
        else:
            log_dir = Path.home() / '.config' / 'AIDocMaster' / 'logs'
    else:
        # Running in development
        log_dir = Path(__file__).parent / 'logs'
    
    # Create log directory if it doesn't exist
    log_dir.mkdir(parents=True, exist_ok=True)
    
    # Configure log file with rotation (max 10MB per file, keep 5 backups)
    log_file = log_dir / 'flask_backend.log'
    
    # Create formatter with detailed information
    formatter = logging.Formatter(
        '[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # File handler with rotation
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=10 * 1024 * 1024,  # 10MB
        backupCount=5,
        encoding='utf-8'
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(formatter)
    
    # Console handler for stdout
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.DEBUG)
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)
    
    # Configure Flask app logger
    app.logger.setLevel(logging.DEBUG)
    app.logger.addHandler(file_handler)
    app.logger.addHandler(console_handler)
    
    app.logger.info('=' * 80)
    app.logger.info('Flask Backend Logging Initialized')
    app.logger.info(f'Log file location: {log_file}')
    app.logger.info(f'Log level: DEBUG')
    app.logger.info('=' * 80)
    
    return log_file

# Initialize logging
log_file_path = setup_logging()

# Configuration loader
class ConfigLoader:
    """
    Loads LLM configuration from file system
    Supports both packaged and development modes
    """
    
    def __init__(self):
        self.config_file = 'model-configs.json'
        self.config_path = self._get_config_path()
        app.logger.info(f'ConfigLoader initialized with path: {self.config_path}')
    
    def _get_config_path(self):
        """Determine configuration file path based on environment"""
        if getattr(sys, 'frozen', False):
            # Running as packaged executable
            if sys.platform == 'win32':
                config_dir = Path(os.environ.get('APPDATA', '')) / 'AIDocMaster'
            else:
                config_dir = Path.home() / '.config' / 'AIDocMaster'
        else:
            # Running in development - look in parent directory
            config_dir = Path(__file__).parent.parent / 'userData'
        
        config_dir.mkdir(parents=True, exist_ok=True)
        return config_dir / self.config_file
    
    def load_model_configs(self):
        """Load model configurations from file"""
        app.logger.debug(f'Loading model configs from: {self.config_path}')
        
        try:
            if not self.config_path.exists():
                app.logger.info('Model config file does not exist, returning empty config')
                return {'models': []}
            
            with open(self.config_path, 'r', encoding='utf-8') as f:
                configs = json.load(f)
            
            app.logger.info(f'Model configurations loaded successfully, count: {len(configs.get("models", []))}')
            return configs
        
        except Exception as e:
            app.logger.error(f'Failed to load model configurations: {str(e)}', exc_info=True)
            return {'models': []}
    
    def get_default_model(self):
        """Get default enabled model from configurations"""
        app.logger.debug('Getting default model configuration')
        
        configs = self.load_model_configs()
        models = configs.get('models', [])
        
        if not models:
            app.logger.warning('No models configured')
            return None
        
        # Find default enabled model
        default_model = next(
            (m for m in models if m.get('isDefault') and m.get('isEnabled', True)),
            None
        )
        
        if default_model:
            app.logger.info(f'Found default model: {default_model.get("name")} ({default_model.get("modelName")})')
            return default_model
        
        # Fallback to first enabled model
        first_enabled = next(
            (m for m in models if m.get('isEnabled', True)),
            None
        )
        
        if first_enabled:
            app.logger.info(f'Using first enabled model as fallback: {first_enabled.get("name")}')
            return first_enabled
        
        app.logger.warning('No enabled models found')
        return None
    
    def get_llm_config(self):
        """Get LLM configuration for API calls"""
        app.logger.info('Getting LLM configuration')
        
        try:
            default_model = self.get_default_model()
            
            if default_model:
                config = {
                    'apiKey': default_model.get('apiKey', ''),
                    'apiUrl': default_model.get('apiUrl', ''),
                    'modelName': default_model.get('modelName', ''),
                    'timeout': 120  # 120 seconds timeout
                }
                
                app.logger.info(f'Using user-configured model: {config["modelName"]} at {config["apiUrl"]}')
                return config
            
            # Fallback to environment variables
            app.logger.warning('No user-configured model, using environment variables')
            
            config = {
                'apiKey': os.environ.get('LLM_API_KEY', ''),
                'apiUrl': os.environ.get('LLM_API_URL', 'https://api.openai.com/v1'),
                'modelName': os.environ.get('LLM_MODEL_NAME', 'gpt-4'),
                'timeout': 120
            }
            
            app.logger.info(f'Using environment config: {config["modelName"]} at {config["apiUrl"]}')
            return config
        
        except Exception as e:
            app.logger.error(f'Error loading LLM configuration: {str(e)}', exc_info=True)
            
            # Return default config as last resort
            return {
                'apiKey': os.environ.get('LLM_API_KEY', ''),
                'apiUrl': os.environ.get('LLM_API_URL', 'https://api.openai.com/v1'),
                'modelName': os.environ.get('LLM_MODEL_NAME', 'gpt-4'),
                'timeout': 120
            }
    
    def validate_llm_config(self, config):
        """Validate LLM configuration"""
        if not config.get('apiKey'):
            app.logger.error('LLM API key is missing')
            return {'valid': False, 'error': 'LLM API key is not configured'}
        
        if not config.get('apiUrl'):
            app.logger.error('LLM API URL is missing')
            return {'valid': False, 'error': 'LLM API URL is not configured'}
        
        if not config.get('modelName'):
            app.logger.error('LLM model name is missing')
            return {'valid': False, 'error': 'LLM model name is not configured'}
        
        return {'valid': True}

# Initialize config loader
config_loader = ConfigLoader()

# Health check endpoint
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    app.logger.debug('Health check requested')
    return jsonify({
        'status': 'ok',
        'service': 'AIDocMaster Flask Backend',
        'timestamp': datetime.utcnow().isoformat(),
        'log_file': str(log_file_path)
    })

# Chat completion endpoint
@app.route('/api/chat', methods=['POST', 'GET'])
def chat():
    """
    Handle chat completion requests with streaming support
    POST: Stream chat completions from LLM
    GET: Health check for chat API
    """
    if request.method == 'GET':
        app.logger.info('Chat API health check')
        
        try:
            config = config_loader.get_llm_config()
            validation = config_loader.validate_llm_config(config)
            
            return jsonify({
                'status': 'ok',
                'configured': validation['valid'],
                'model': config['modelName'],
                'endpoint': config['apiUrl']
            })
        except Exception as e:
            app.logger.error(f'Chat API health check failed: {str(e)}', exc_info=True)
            return jsonify({'status': 'error', 'configured': False}), 500
    
    # POST request - handle chat completion
    start_time = datetime.now()
    app.logger.info('Chat request received')
    
    try:
        # Parse request body
        data = request.get_json()
        messages = data.get('messages', [])
        
        if not messages or not isinstance(messages, list):
            app.logger.warning(f'Invalid messages in chat request: {type(messages)}')
            return jsonify({'error': 'Messages array is required and must not be empty'}), 400
        
        app.logger.debug(f'Processing chat request with {len(messages)} messages')
        
        # Get and validate LLM configuration
        config = config_loader.get_llm_config()
        validation = config_loader.validate_llm_config(config)
        
        if not validation['valid']:
            app.logger.error(f'LLM configuration validation failed: {validation.get("error")}')
            return jsonify({'error': validation.get('error', 'Invalid LLM configuration')}), 500
        
        # Prepare system message
        system_message = {
            'role': 'system',
            'content': 'You are a helpful AI assistant for DocAIMaster, an AI-powered document editing and validation tool. You help users with document-related questions, provide guidance on using the tool, and assist with document editing tasks. Be concise, friendly, and professional.'
        }
        
        full_messages = [system_message] + messages
        
        # Prepare LLM API request
        endpoint = f"{config['apiUrl'].rstrip('/')}/chat/completions"
        app.logger.debug(f'Sending request to LLM API: {endpoint}')
        
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {config['apiKey']}"
        }
        
        payload = {
            'model': config['modelName'],
            'messages': full_messages,
            'stream': True,
            'temperature': 0.7,
            'max_tokens': 2000
        }
        
        # Make streaming request to LLM API
        def generate():
            try:
                app.logger.info('Starting LLM API streaming request')
                
                with requests.post(
                    endpoint,
                    headers=headers,
                    json=payload,
                    stream=True,
                    timeout=config['timeout']
                ) as response:
                    
                    if response.status_code != 200:
                        error_text = response.text
                        app.logger.error(f'LLM API error: {response.status_code} - {error_text}')
                        yield json.dumps({
                            'error': f'LLM API error: {response.status_code}',
                            'details': error_text
                        }).encode('utf-8')
                        return
                    
                    app.logger.info('Streaming chat response started')
                    chunk_count = 0
                    
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            chunk_count += 1
                            yield chunk
                            
                            # Log progress periodically
                            if chunk_count % 10 == 0:
                                app.logger.debug(f'Chat stream progress: {chunk_count} chunks')
                    
                    duration = (datetime.now() - start_time).total_seconds()
                    app.logger.info(f'Chat stream completed: {chunk_count} chunks in {duration:.2f}s')
            
            except requests.Timeout:
                app.logger.error('Chat request timed out')
                yield json.dumps({'error': 'Request timed out'}).encode('utf-8')
            
            except Exception as e:
                app.logger.error(f'Error in chat stream: {str(e)}', exc_info=True)
                yield json.dumps({
                    'error': 'Failed to process chat request',
                    'details': str(e)
                }).encode('utf-8')
        
        return Response(
            stream_with_context(generate()),
            content_type='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        )
    
    except Exception as e:
        duration = (datetime.now() - start_time).total_seconds()
        app.logger.error(f'Chat request failed after {duration:.2f}s: {str(e)}', exc_info=True)
        return jsonify({
            'error': 'Failed to process chat request',
            'details': str(e)
        }), 500

# Document validation endpoint
@app.route('/api/document-validation', methods=['POST', 'GET'])
def document_validation():
    """
    Handle document validation requests with streaming support
    POST: Stream validation results from LLM
    GET: Health check for validation API
    """
    if request.method == 'GET':
        app.logger.info('Document validation API health check')
        
        try:
            config = config_loader.get_llm_config()
            validation = config_loader.validate_llm_config(config)
            
            return jsonify({
                'status': 'ok',
                'configured': validation['valid'],
                'model': config['modelName'],
                'endpoint': config['apiUrl']
            })
        except Exception as e:
            app.logger.error(f'Validation API health check failed: {str(e)}', exc_info=True)
            return jsonify({'status': 'error', 'configured': False}), 500
    
    # POST request - handle validation
    start_time = datetime.now()
    app.logger.info('Document validation request received')
    
    try:
        # Parse request body
        data = request.get_json()
        content = data.get('content')
        chunk_index = data.get('chunkIndex', 0)
        total_chunks = data.get('totalChunks', 1)
        
        if not content or not isinstance(content, str):
            app.logger.warning(f'Invalid content in validation request: {type(content)}')
            return jsonify({'error': 'Content is required and must be a string'}), 400
        
        app.logger.debug(f'Processing validation request: chunk {chunk_index + 1}/{total_chunks}, length: {len(content)}')
        
        # Get and validate LLM configuration
        config = config_loader.get_llm_config()
        validation = config_loader.validate_llm_config(config)
        
        if not validation['valid']:
            app.logger.error(f'LLM configuration validation failed: {validation.get("error")}')
            return jsonify({'error': validation.get('error', 'Invalid LLM configuration')}), 500
        
        # Prepare validation prompt
        system_message = {
            'role': 'system',
            'content': '''You are an expert document validator and editor. Your task is to analyze document content and identify issues in four categories:

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

Important: Return ONLY the JSON object, no additional text or explanations. If no issues are found, return an empty issues array with all counts set to 0.'''
        }
        
        user_message = {
            'role': 'user',
            'content': f'Please validate the following document content (chunk {chunk_index + 1} of {total_chunks}):\n\n{content}'
        }
        
        messages = [system_message, user_message]
        
        # Prepare LLM API request
        endpoint = f"{config['apiUrl'].rstrip('/')}/chat/completions"
        app.logger.debug(f'Sending validation request to LLM API: {endpoint}')
        
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f"Bearer {config['apiKey']}"
        }
        
        payload = {
            'model': config['modelName'],
            'messages': messages,
            'stream': True,
            'temperature': 0.3,  # Lower temperature for more consistent validation
            'max_tokens': 4000
        }
        
        # Make streaming request to LLM API
        def generate():
            try:
                app.logger.info(f'Starting LLM API validation streaming request for chunk {chunk_index}')
                
                with requests.post(
                    endpoint,
                    headers=headers,
                    json=payload,
                    stream=True,
                    timeout=config['timeout']
                ) as response:
                    
                    if response.status_code != 200:
                        error_text = response.text
                        app.logger.error(f'LLM API validation error: {response.status_code} - {error_text}')
                        yield json.dumps({
                            'error': f'LLM API error: {response.status_code}',
                            'details': error_text
                        }).encode('utf-8')
                        return
                    
                    app.logger.info(f'Streaming validation response started for chunk {chunk_index}')
                    chunk_count = 0
                    
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            chunk_count += 1
                            yield chunk
                            
                            # Log progress periodically
                            if chunk_count % 10 == 0:
                                app.logger.debug(f'Validation stream progress: {chunk_count} chunks (doc chunk {chunk_index})')
                    
                    duration = (datetime.now() - start_time).total_seconds()
                    app.logger.info(f'Validation stream completed for chunk {chunk_index}: {chunk_count} chunks in {duration:.2f}s')
            
            except requests.Timeout:
                app.logger.error(f'Validation request timed out for chunk {chunk_index}')
                yield json.dumps({'error': 'Request timed out'}).encode('utf-8')
            
            except Exception as e:
                app.logger.error(f'Error in validation stream for chunk {chunk_index}: {str(e)}', exc_info=True)
                yield json.dumps({
                    'error': 'Failed to process validation request',
                    'details': str(e)
                }).encode('utf-8')
        
        return Response(
            stream_with_context(generate()),
            content_type='text/event-stream',
            headers={
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        )
    
    except Exception as e:
        duration = (datetime.now() - start_time).total_seconds()
        app.logger.error(f'Validation request failed after {duration:.2f}s: {str(e)}', exc_info=True)
        return jsonify({
            'error': 'Failed to process validation request',
            'details': str(e)
        }), 500

# Get log file content endpoint
@app.route('/api/logs', methods=['GET'])
def get_logs():
    """
    Return recent log file content
    Useful for debugging and monitoring
    """
    app.logger.debug('Log file content requested')
    
    try:
        lines = request.args.get('lines', 100, type=int)
        
        if not log_file_path.exists():
            app.logger.warning('Log file does not exist')
            return jsonify({
                'error': 'Log file not found',
                'path': str(log_file_path)
            }), 404
        
        # Read last N lines from log file
        with open(log_file_path, 'r', encoding='utf-8') as f:
            all_lines = f.readlines()
            recent_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines
        
        app.logger.info(f'Returning {len(recent_lines)} log lines')
        
        return jsonify({
            'log_file': str(log_file_path),
            'total_lines': len(all_lines),
            'returned_lines': len(recent_lines),
            'content': ''.join(recent_lines)
        })
    
    except Exception as e:
        app.logger.error(f'Failed to read log file: {str(e)}', exc_info=True)
        return jsonify({
            'error': 'Failed to read log file',
            'details': str(e)
        }), 500

# Error handlers
@app.errorhandler(404)
def not_found(error):
    app.logger.warning(f'404 error: {request.path}')
    return jsonify({'error': 'Route not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    app.logger.error(f'500 error: {str(error)}', exc_info=True)
    return jsonify({'error': 'Internal server error'}), 500

# Main entry point
if __name__ == '__main__':
    port = int(os.environ.get('FLASK_PORT', 5000))
    
    app.logger.info('=' * 80)
    app.logger.info('Starting Flask Backend for AIDocMaster')
    app.logger.info(f'Port: {port}')
    app.logger.info(f'Environment: {"Production" if getattr(sys, "frozen", False) else "Development"}')
    app.logger.info(f'Python version: {sys.version}')
    app.logger.info(f'Log file: {log_file_path}')
    app.logger.info('=' * 80)
    
    app.run(host='127.0.0.1', port=port, debug=False, threaded=True)

