# Flask Backend Proxy Fix

## Problem Description

The AI Chat and AI Document Validation features were not correctly calling the Flask Python backend. Instead, the Next.js API routes were attempting to call LLM APIs directly, bypassing the Flask backend entirely.

### Issues Identified

1. **AI Chat Task**: `ChatPanel` and `ChatDialog` components were calling `/api/chat`, but the Next.js route was trying to call LLM APIs directly instead of proxying to Flask backend
2. **AI Document Validation**: The floating chat button's validation feature had the same issue - `/api/document-validation` was bypassing Flask
3. **Root Cause**: The architecture intended for Frontend → Next.js API → Flask Backend → LLM, but Next.js API routes were configured to call LLM directly

## Solution Implemented

Modified the Next.js API routes to proxy all requests to the Flask backend, ensuring all LLM communication goes through the Python backend which has comprehensive logging and error handling.

### Files Created

1. **`lib/flaskConfig.ts`** - New utility for Flask backend configuration
   - `getFlaskBackendUrl()` - Returns Flask backend URL (default: http://127.0.0.1:5000)
   - `buildFlaskApiUrl()` - Builds full Flask API endpoint URLs
   - `checkFlaskBackendHealth()` - Health check utility
   - Supports environment variables: `FLASK_PORT`, `FLASK_BACKEND_PORT`, `FLASK_HOST`

### Files Modified

1. **`app/api/chat/route.ts`** - Completely rewritten to proxy to Flask
   - Changed from direct LLM API calls to Flask backend proxying
   - POST endpoint now forwards all chat requests to `http://127.0.0.1:5000/api/chat`
   - GET endpoint checks Flask backend health
   - Enhanced error handling and logging
   - Streams Flask response to client with proper headers

2. **`app/api/document-validation/route.ts`** - Completely rewritten to proxy to Flask
   - Changed from direct LLM API calls to Flask backend proxying
   - POST endpoint forwards validation requests to `http://127.0.0.1:5000/api/document-validation`
   - GET endpoint checks Flask backend health
   - Maintains chunk-based validation streaming
   - Enhanced error handling and logging

## Architecture Flow

### Before (Broken)
```
Frontend → Next.js API Routes → LLM API (Direct, bypassing Flask)
                                  ↓
                           Flask Backend (Unused)
```

### After (Fixed)
```
Frontend → Next.js API Routes → Flask Backend → LLM API
                                       ↓
                              Comprehensive Logging
```

### In Electron Packaged Mode
```
Frontend → Electron API Server → Flask Backend → LLM API
           (port 3001)            (port 5000)
```

## Key Features

### Comprehensive Logging
- All requests are logged at DEBUG, INFO, SUCCESS, and ERROR levels
- Stream progress tracking with periodic progress logs
- Detailed error information for troubleshooting
- Both Next.js proxy and Flask backend provide detailed logs

### Error Handling
- Connection failures to Flask backend are properly handled
- Timeout errors are caught and reported clearly
- Error messages provide actionable information
- Empty responses are detected and reported

### Streaming Support
- Maintains streaming responses for real-time user feedback
- Progress logging during long-running requests
- Proper stream cleanup and resource release

## Configuration

### Environment Variables (Optional)

```bash
# Flask backend configuration
FLASK_PORT=5000              # Flask server port (default: 5000)
FLASK_HOST=127.0.0.1        # Flask server host (default: 127.0.0.1)

# Alternative port variable
FLASK_BACKEND_PORT=5000     # Alternative to FLASK_PORT
```

If not set, defaults to `http://127.0.0.1:5000`

## Testing

### Development Mode
1. Start Flask backend: `cd backend && python app.py`
2. Start Next.js dev server: `npm run dev`
3. Test AI Chat in browser - should connect to Flask on port 5000
4. Test AI Document Validation - should connect to Flask on port 5000

### Electron Packaged Mode
1. Build the application: `npm run build:desktop`
2. Run the packaged app
3. Flask launcher starts Flask backend automatically
4. Electron API server proxies to Flask backend
5. Frontend connects through Electron API server

## Log Locations

### Development Mode
- Flask logs: `backend/logs/flask_backend.log`
- Next.js logs: Console output
- Browser logs: DevTools Console

### Electron Packaged Mode
- Flask logs: `%APPDATA%/AIDocMaster/logs/flask_backend.log` (Windows)
- Electron logs: `%APPDATA%/AIDocMaster/app.log` (Windows)
- Flask logs: `~/.config/AIDocMaster/logs/flask_backend.log` (Linux/Mac)
- Electron logs: `~/.config/AIDocMaster/app.log` (Linux/Mac)

## Benefits

1. **Centralized LLM Handling**: All LLM API calls go through Flask backend
2. **Better Logging**: Comprehensive Python logging with rotation and levels
3. **Consistent Configuration**: Model configuration managed by Flask backend
4. **Error Handling**: Better error messages and debugging information
5. **Works in All Modes**: Development, browser, and Electron packaged modes
6. **Streaming Support**: Real-time responses maintained throughout the proxy chain

## Troubleshooting

### Flask Backend Not Running
**Error**: "Flask backend unavailable"
**Solution**: 
- Development: Start Flask manually: `cd backend && python app.py`
- Packaged: Check Electron logs, Flask should start automatically

### Connection Refused
**Error**: "Could not connect to Flask backend at http://127.0.0.1:5000"
**Solution**:
- Verify Flask is running on port 5000
- Check if another process is using port 5000
- Review Flask logs for startup errors

### Empty Responses
**Error**: "Empty response from Flask backend"
**Solution**:
- Check Flask logs for errors in LLM API calls
- Verify model configuration in settings
- Ensure LLM API key and URL are correct

### Stream Errors
**Error**: "Error in Flask stream proxy"
**Solution**:
- Check network connectivity
- Review Flask logs for LLM API issues
- Verify timeout settings are appropriate

## Implementation Date

November 13, 2025

## Related Files

- `backend/app.py` - Flask backend (already working correctly)
- `electron/api-server.js` - Electron API server (already proxying to Flask)
- `electron/flask-launcher.js` - Flask process manager (already working)
- `components/ChatPanel.tsx` - Chat interface (no changes needed)
- `components/ChatDialog.tsx` - Floating chat dialog (no changes needed)
- `components/AIDocValidationContainer.tsx` - Validation container (no changes needed)









