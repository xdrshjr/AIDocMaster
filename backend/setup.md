# Flask Backend Setup

## Development Mode

### 1. Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Run Flask Backend Manually (Optional)

The Flask backend will automatically start when Electron starts, but you can also run it manually for testing:

```bash
cd backend
python app.py
```

The backend will start on `http://127.0.0.1:5000` by default.

### 3. Test the Backend

```bash
# Health check
curl http://127.0.0.1:5000/health

# Get logs
curl http://127.0.0.1:5000/api/logs?lines=50
```

## Production Mode (Packaged with Electron)

### Requirements

For the packaged application to work, users need to have Python installed on their system:

- **Windows**: Python 3.8+ (from python.org or Microsoft Store)
- **Recommendation**: Add Python to PATH during installation

### Optional: Bundle Python with Electron

To bundle Python with the Electron application (so users don't need to install Python separately):

1. **Download Python Embeddable Package**:
   - Go to https://www.python.org/downloads/windows/
   - Download "Windows embeddable package (64-bit)" for Python 3.11+

2. **Extract to project**:
   ```bash
   mkdir python-embed
   # Extract the downloaded zip to python-embed/
   ```

3. **Install pip in embedded Python**:
   ```bash
   cd python-embed
   # Download get-pip.py
   python get-pip.py
   ```

4. **Install dependencies**:
   ```bash
   python -m pip install -r ../backend/requirements.txt
   ```

5. **Update electron-builder.json** to include Python:
   ```json
   "extraResources": [
     {
       "from": "python-embed",
       "to": "python",
       "filter": ["**/*"]
     },
     {
       "from": "backend",
       "to": "backend",
       "filter": ["**/*"]
     }
   ]
   ```

6. **The Flask launcher will automatically detect** the bundled Python in `resources/python/python.exe`

## Log Files

Backend logs are stored in:

- **Windows**: `%APPDATA%\AIDocMaster\logs\flask_backend.log`
- **Linux/Mac**: `~/.config/AIDocMaster/logs/flask_backend.log`
- **Development**: `backend/logs/flask_backend.log`

View logs through the application using:
```javascript
const logs = await window.electronAPI.getFlaskLogs(100);
console.log(logs.logs);
```

## Configuration

The Flask backend loads LLM configuration from the same `model-configs.json` file that the Electron app uses:

- **Windows**: `%APPDATA%\AIDocMaster\model-configs.json`
- **Linux/Mac**: `~/.config/AIDocMaster/model-configs.json`
- **Development**: `userData/model-configs.json` (relative to project root)

## API Endpoints

- `GET /health` - Health check
- `POST /api/chat` - Chat completions (streaming)
- `GET /api/chat` - Chat API health check
- `POST /api/document-validation` - Document validation (streaming)
- `GET /api/document-validation` - Validation API health check
- `GET /api/logs?lines=N` - Get last N lines of logs (default: 100)

## Troubleshooting

### Flask backend not starting

1. Check if Python is installed: `python --version`
2. Check if Flask is installed: `pip list | grep Flask`
3. Check Electron logs: Look in `%APPDATA%\AIDocMaster\app.log`

### LLM API calls failing

1. Check Flask backend logs
2. Verify model configuration in Settings
3. Test LLM API endpoint manually

### Port conflicts

The Flask backend will automatically find an available port starting from 5000. Check the logs to see which port was assigned.








