"""
Image Service Domain Routes
Handles image service configuration and search operations
"""

import os
import sys
import json
import random
import logging
import requests
from datetime import datetime
from pathlib import Path
from flask import Blueprint, request, jsonify

logger = logging.getLogger(__name__)

# Create blueprint for image service domain
image_service_bp = Blueprint('image_service', __name__, url_prefix='/api/image-services')


def _get_image_service_config_path():
    """
    Determine image service configuration file path based on environment
    Returns the path to image-service-configs.json
    """
    electron_user_data = os.environ.get('ELECTRON_USER_DATA')
    
    if electron_user_data:
        # Running in Electron - use the userData path provided by Electron
        config_dir = Path(electron_user_data)
        logger.debug('[Image Service Domain] Using Electron userData path for image service configs', extra={
            'path': str(config_dir)
        })
    elif getattr(sys, 'frozen', False):
        # Running as packaged executable (non-Electron)
        if sys.platform == 'win32':
            config_dir = Path(os.environ.get('APPDATA', '')) / 'EcritisAgent'
        else:
            config_dir = Path.home() / '.config' / 'EcritisAgent'
        logger.debug('[Image Service Domain] Using packaged app config path for image service configs', extra={
            'path': str(config_dir)
        })
    else:
        # Running in development
        config_dir = Path(__file__).parent.parent.parent / 'userData'
        logger.debug('[Image Service Domain] Using development config path for image service configs', extra={
            'path': str(config_dir)
        })
    
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir / 'image-service-configs.json'


@image_service_bp.route('/configs', methods=['GET', 'POST'])
def image_service_configs():
    """
    Manage image service configurations with persistent storage
    GET: Retrieve all image service configurations
    POST: Save image service configurations
    """
    if request.method == 'GET':
        logger.info('[Image Service Domain] Image service configurations retrieval requested')
        
        try:
            config_path = _get_image_service_config_path()
            
            # Check if file exists
            if not config_path.exists():
                logger.info('[Image Service Domain] Image service config file does not exist, creating default configuration')
                
                # Create default image service configuration with Unsplash
                current_time = datetime.now().isoformat()
                default_api_keys = [
                    'pNt91wUHTHCzruNDxcJcP5POjKb-qV_RSIE4ZXDvMk4',
                    'fKuy32Nf8HRuRyFYPyaORvdZ0hc-oeQ-xb9zPz2Baeo',
                ]
                
                default_service_id = f'image_service_{datetime.now().timestamp()}'
                default_config = {
                    'imageServices': [
                        {
                            'id': default_service_id,
                            'name': 'Unsplash',
                            'type': 'unsplash',
                            'apiKeys': default_api_keys,
                            'isDefault': True,
                            'isDeletable': False,
                            'createdAt': current_time,
                            'updatedAt': current_time
                        }
                    ],
                    'defaultServiceId': default_service_id
                }
                
                # Save default configuration
                with open(config_path, 'w', encoding='utf-8') as f:
                    json.dump(default_config, f, indent=2, ensure_ascii=False)
                
                logger.info('[Image Service Domain] Default image service configuration created successfully', extra={
                    'count': len(default_config['imageServices']),
                    'path': str(config_path)
                })
                
                return jsonify({
                    'success': True,
                    'data': default_config,
                    'count': len(default_config['imageServices']),
                    'configPath': str(config_path)
                })
            
            # Load existing configuration
            with open(config_path, 'r', encoding='utf-8') as f:
                configs = json.load(f)
            
            logger.info(f'[Image Service Domain] Returning {len(configs.get("imageServices", []))} image service configurations', extra={
                'total_count': len(configs.get('imageServices', []))
            })
            
            return jsonify({
                'success': True,
                'data': configs,
                'count': len(configs.get('imageServices', [])),
                'configPath': str(config_path)
            })
        
        except Exception as e:
            logger.error(f'[Image Service Domain] Failed to retrieve image service configurations: {str(e)}', exc_info=True)
            return jsonify({
                'success': False,
                'error': 'Failed to retrieve image service configurations',
                'details': str(e)
            }), 500
    
    # POST request - save image service configurations
    logger.info('[Image Service Domain] Image service configuration save requested')
    
    try:
        data = request.get_json()
        
        if not data:
            logger.warning('[Image Service Domain] No data provided in image service config save request')
            return jsonify({
                'success': False,
                'error': 'Request body is required'
            }), 400
        
        # Validate required fields
        if 'imageServices' not in data:
            logger.warning('[Image Service Domain] imageServices array missing in request data')
            return jsonify({
                'success': False,
                'error': 'imageServices array is required'
            }), 400
        
        imageServices = data.get('imageServices', [])
        logger.debug(f'[Image Service Domain] Saving {len(imageServices)} image service configurations')
        
        # Validate each image service configuration
        for idx, service in enumerate(imageServices):
            required_fields = ['id', 'name', 'type', 'apiKeys']
            missing_fields = [field for field in required_fields if field not in service or (field != 'apiKeys' and not service[field])]
            
            if missing_fields:
                logger.warning(f'[Image Service Domain] Service at index {idx} missing required fields: {missing_fields}')
                return jsonify({
                    'success': False,
                    'error': f'Service at index {idx} is missing required fields: {", ".join(missing_fields)}'
                }), 400
            
            if not isinstance(service['apiKeys'], list) or len(service['apiKeys']) == 0:
                logger.warning(f'[Image Service Domain] Service at index {idx} has invalid apiKeys (must be non-empty array)')
                return jsonify({
                    'success': False,
                    'error': f'Service at index {idx} has invalid apiKeys (must be non-empty array)'
                }), 400
            
            # Log service info
            logger.debug(f'[Image Service Domain] Service {idx}: {service.get("name")} (type: {service.get("type")}, apiKeys: {len(service.get("apiKeys", []))})')
        
        # Add timestamps if not present
        current_time = datetime.now().isoformat()
        for service in imageServices:
            if 'updatedAt' not in service:
                service['updatedAt'] = current_time
            if 'createdAt' not in service:
                service['createdAt'] = current_time
        
        # Get configuration file path
        config_path = _get_image_service_config_path()
        
        # Save to file
        config_data = {
            'imageServices': imageServices,
            'defaultServiceId': data.get('defaultServiceId')
        }
        
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config_data, f, indent=2, ensure_ascii=False)
        
        logger.info(f'[Image Service Domain] Image service configurations saved successfully: {len(imageServices)} services', extra={
            'count': len(imageServices),
            'path': str(config_path)
        })
        
        return jsonify({
            'success': True,
            'message': 'Image service configurations saved successfully',
            'count': len(imageServices),
            'configPath': str(config_path)
        })
    
    except Exception as e:
        logger.error(f'[Image Service Domain] Failed to save image service configurations: {str(e)}', exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to save image service configurations',
            'details': str(e)
        }), 500


@image_service_bp.route('/search', methods=['POST'])
def image_service_search():
    """
    Search images using configured image services (e.g., Unsplash)
    
    POST body:
        - query: Search query string
        - perPage: Number of results to return (default: 3)
        - page: Page number (default: 1)
        - serviceId: Optional service ID to use (default: uses default service)
    """
    start_time = datetime.now()
    logger.info('[Image Service Domain] Image search request received')
    
    try:
        data = request.get_json() or {}
        search_query = data.get('query', '')
        per_page = data.get('perPage', 3)
        page = data.get('page', 1)
        service_id = data.get('serviceId')
        
        if not search_query or not isinstance(search_query, str) or not search_query.strip():
            logger.warning('[Image Service Domain] Invalid search query in request')
            return jsonify({
                'success': False,
                'error': 'Search query is required and must be a non-empty string'
            }), 400
        
        # Validate per_page
        try:
            per_page = int(per_page)
            if per_page < 1 or per_page > 30:
                per_page = 3
        except (ValueError, TypeError):
            per_page = 3
        
        # Validate page
        try:
            page = int(page)
            if page < 1:
                page = 1
        except (ValueError, TypeError):
            page = 1
        
        logger.info(f'[Image Service Domain] Processing image search request', extra={
            'query': search_query,
            'perPage': per_page,
            'page': page,
            'serviceId': service_id or 'default'
        })
        
        # Load image service configurations
        config_path = _get_image_service_config_path()
        
        if not config_path.exists():
            logger.warning('[Image Service Domain] Image service config file not found')
            return jsonify({
                'success': False,
                'error': 'Image service configuration not found. Please configure image services in settings.'
            }), 404
        
        with open(config_path, 'r', encoding='utf-8') as f:
            configs = json.load(f)
        
        # Find the service to use
        services = configs.get('imageServices', [])
        if not services:
            logger.warning('[Image Service Domain] No image services configured')
            return jsonify({
                'success': False,
                'error': 'No image services configured. Please configure image services in settings.'
            }), 404
        
        # Select service
        selected_service = None
        if service_id:
            selected_service = next((s for s in services if s.get('id') == service_id), None)
            if not selected_service:
                logger.warning(f'[Image Service Domain] Service {service_id} not found, using default')
        
        if not selected_service:
            # Use default service
            default_service_id = configs.get('defaultServiceId')
            if default_service_id:
                selected_service = next((s for s in services if s.get('id') == default_service_id), None)
            
            if not selected_service:
                # Use first service
                selected_service = services[0]
        
        logger.info(f'[Image Service Domain] Using image service', extra={
            'serviceId': selected_service.get('id'),
            'serviceName': selected_service.get('name'),
            'serviceType': selected_service.get('type'),
            'apiKeyCount': len(selected_service.get('apiKeys', []))
        })
        
        # Get API keys
        api_keys = selected_service.get('apiKeys', [])
        if not api_keys:
            logger.error('[Image Service Domain] No API keys available for service')
            return jsonify({
                'success': False,
                'error': 'No API keys configured for the selected image service'
            }), 500
        
        # Select random API key
        selected_api_key = random.choice(api_keys)
        
        logger.debug(f'[Image Service Domain] Selected API key (index: {api_keys.index(selected_api_key)}/{len(api_keys)})')
        
        # Search based on service type
        service_type = selected_service.get('type', 'unsplash')
        
        if service_type == 'unsplash':
            # Search Unsplash API
            unsplash_api_url = 'https://api.unsplash.com/search/photos'
            
            search_params = {
                'query': search_query.strip(),
                'per_page': per_page,
                'page': page,
                'client_id': selected_api_key
            }
            
            logger.debug(f'[Image Service Domain] Calling Unsplash API', extra={
                'url': unsplash_api_url,
                'query': search_query,
                'perPage': per_page,
                'page': page
            })
            
            response = requests.get(unsplash_api_url, params=search_params, timeout=10)
            
            if response.status_code != 200:
                error_text = response.text
                logger.error(f'[Image Service Domain] Unsplash API error: {response.status_code} - {error_text}')
                return jsonify({
                    'success': False,
                    'error': f'Unsplash API error: {response.status_code}',
                    'details': error_text
                }), response.status_code
            
            result_data = response.json()
            results = result_data.get('results', [])
            total = result_data.get('total', 0)
            total_pages = result_data.get('total_pages', 1)
            
            logger.info(f'[Image Service Domain] Unsplash search completed', extra={
                'query': search_query,
                'resultCount': len(results),
                'total': total,
                'totalPages': total_pages,
                'currentPage': page
            })
            
            # Format results
            images = []
            for idx, photo in enumerate(results):
                image_data = {
                    'id': photo.get('id', f'unsplash_{idx}'),
                    'url': photo.get('urls', {}).get('regular', photo.get('urls', {}).get('small', '')),
                    'description': photo.get('description') or photo.get('alt_description') or 'No description',
                    'author': photo.get('user', {}).get('name', 'Unknown'),
                }
                images.append(image_data)
            
            duration = (datetime.now() - start_time).total_seconds()
            logger.info(f'[Image Service Domain] Image search completed in {duration:.2f}s', extra={
                'query': search_query,
                'imageCount': len(images),
                'page': page,
                'totalPages': total_pages
            })
            
            return jsonify({
                'success': True,
                'images': images,
                'count': len(images),
                'total': total,
                'totalPages': total_pages,
                'page': page,
                'query': search_query,
                'service': selected_service.get('name')
            })
        else:
            logger.warning(f'[Image Service Domain] Unsupported service type: {service_type}')
            return jsonify({
                'success': False,
                'error': f'Unsupported image service type: {service_type}'
            }), 400
    
    except requests.Timeout:
        logger.error('[Image Service Domain] Image search request timed out')
        return jsonify({
            'success': False,
            'error': 'Request timed out'
        }), 504
    
    except Exception as e:
        duration = (datetime.now() - start_time).total_seconds()
        logger.error(f'[Image Service Domain] Image search request failed after {duration:.2f}s: {str(e)}', exc_info=True)
        return jsonify({
            'success': False,
            'error': 'Failed to search images',
            'details': str(e)
        }), 500

