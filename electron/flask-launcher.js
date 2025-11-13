/**
 * Flask Backend Launcher for Electron
 * 
 * This module manages the Python Flask backend process lifecycle:
 * - Starts Flask server when Electron starts
 * - Monitors Flask process health
 * - Stops Flask server gracefully when Electron quits
 * - Handles errors and provides detailed logging
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

/**
 * Flask Backend Manager
 */
class FlaskBackendManager {
  constructor(app, logger) {
    this.app = app;
    this.logger = logger;
    this.flaskProcess = null;
    this.flaskPort = 5000;
    this.isStarting = false;
    this.isRunning = false;
    this.startAttempts = 0;
    this.maxStartAttempts = 3;
  }

  /**
   * Get Python executable path
   */
  getPythonPath() {
    // Check for bundled Python first (for packaged app)
    if (this.app.isPackaged) {
      const bundledPython = path.join(
        process.resourcesPath,
        'python',
        'python.exe'
      );
      
      if (fs.existsSync(bundledPython)) {
        this.logger.info('Using bundled Python', { path: bundledPython });
        return bundledPython;
      }
      
      this.logger.warn('Bundled Python not found, falling back to system Python');
    }
    
    // Fallback to system Python
    const systemPython = process.platform === 'win32' ? 'python' : 'python3';
    this.logger.info('Using system Python', { command: systemPython });
    return systemPython;
  }

  /**
   * Get Flask app path
   */
  getFlaskAppPath() {
    if (this.app.isPackaged) {
      // In packaged mode, Flask app is in resources
      const flaskPath = path.join(process.resourcesPath, 'backend', 'app.py');
      this.logger.debug('Packaged Flask app path', { path: flaskPath });
      return flaskPath;
    } else {
      // In development mode, Flask app is in project directory
      const flaskPath = path.join(__dirname, '..', 'backend', 'app.py');
      this.logger.debug('Development Flask app path', { path: flaskPath });
      return flaskPath;
    }
  }

  /**
   * Get backend directory path
   */
  getBackendDir() {
    if (this.app.isPackaged) {
      return path.join(process.resourcesPath, 'backend');
    } else {
      return path.join(__dirname, '..', 'backend');
    }
  }

  /**
   * Find available port
   */
  async findAvailablePort(startPort = 5000) {
    return new Promise((resolve) => {
      const server = http.createServer();
      
      server.listen(startPort, '127.0.0.1', () => {
        const port = server.address().port;
        server.close(() => {
          this.logger.debug('Found available port', { port });
          resolve(port);
        });
      });
      
      server.on('error', () => {
        // Port in use, try next one
        this.logger.debug('Port in use, trying next', { port: startPort });
        resolve(this.findAvailablePort(startPort + 1));
      });
    });
  }

  /**
   * Check if Flask server is responding
   */
  async checkFlaskHealth(maxAttempts = 10, delayMs = 1000) {
    this.logger.info('Checking Flask backend health', {
      port: this.flaskPort,
      maxAttempts,
      delayMs,
    });

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await new Promise(resolve => setTimeout(resolve, delayMs));

        const response = await new Promise((resolve, reject) => {
          const req = http.get(`http://127.0.0.1:${this.flaskPort}/health`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try {
                resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
              } catch (e) {
                resolve({ statusCode: res.statusCode, data: null });
              }
            });
          });

          req.on('error', reject);
          req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error('Health check timeout'));
          });
        });

        if (response.statusCode === 200) {
          this.logger.success('Flask backend is healthy', {
            attempt,
            port: this.flaskPort,
            response: response.data,
          });
          return true;
        }

        this.logger.warn('Flask health check returned non-200 status', {
          attempt,
          statusCode: response.statusCode,
        });

      } catch (error) {
        this.logger.debug('Flask health check failed', {
          attempt,
          error: error.message,
        });

        if (attempt === maxAttempts) {
          this.logger.error('Flask health check failed after all attempts', {
            attempts: maxAttempts,
            error: error.message,
          });
          return false;
        }
      }
    }

    return false;
  }

  /**
   * Start Flask backend process
   */
  async start() {
    if (this.isStarting || this.isRunning) {
      this.logger.warn('Flask backend already starting or running');
      return { success: false, error: 'Already starting or running', port: this.flaskPort };
    }

    this.isStarting = true;
    this.startAttempts++;

    if (this.startAttempts > this.maxStartAttempts) {
      this.logger.error('Max start attempts reached for Flask backend', {
        attempts: this.startAttempts,
      });
      this.isStarting = false;
      return { success: false, error: 'Max start attempts reached', port: null };
    }

    this.logger.info('Starting Flask backend', {
      attempt: this.startAttempts,
      maxAttempts: this.maxStartAttempts,
    });

    try {
      // Find available port
      this.flaskPort = await this.findAvailablePort(5000);
      this.logger.info('Using port for Flask backend', { port: this.flaskPort });

      // Get paths
      const pythonPath = this.getPythonPath();
      const flaskAppPath = this.getFlaskAppPath();
      const backendDir = this.getBackendDir();

      // Verify Flask app exists
      if (!fs.existsSync(flaskAppPath)) {
        throw new Error(`Flask app not found at: ${flaskAppPath}`);
      }

      this.logger.debug('Flask backend paths', {
        python: pythonPath,
        app: flaskAppPath,
        workDir: backendDir,
      });

      // Prepare environment variables
      const env = {
        ...process.env,
        FLASK_PORT: this.flaskPort.toString(),
        PYTHONUNBUFFERED: '1',
        PYTHONIOENCODING: 'utf-8',
      };

      // Spawn Flask process
      this.flaskProcess = spawn(pythonPath, [flaskAppPath], {
        cwd: backendDir,
        env: env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this.logger.success('Flask process spawned', {
        pid: this.flaskProcess.pid,
        port: this.flaskPort,
      });

      // Handle process output
      this.flaskProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          this.logger.info('[Flask stdout]', { output });
        }
      });

      this.flaskProcess.stderr.on('data', (data) => {
        const output = data.toString().trim();
        if (output) {
          // Flask logs go to stderr by default
          this.logger.info('[Flask stderr]', { output });
        }
      });

      // Handle process events
      this.flaskProcess.on('error', (error) => {
        this.logger.error('Flask process error', {
          error: error.message,
          stack: error.stack,
        });
        this.isRunning = false;
        this.isStarting = false;
      });

      this.flaskProcess.on('exit', (code, signal) => {
        this.logger.warn('Flask process exited', {
          code,
          signal,
          pid: this.flaskProcess?.pid,
        });
        this.isRunning = false;
        this.isStarting = false;
        this.flaskProcess = null;
      });

      // Wait for Flask to be ready
      const isHealthy = await this.checkFlaskHealth();

      if (isHealthy) {
        this.isRunning = true;
        this.isStarting = false;
        this.startAttempts = 0; // Reset attempts on success

        this.logger.success('Flask backend started successfully', {
          port: this.flaskPort,
          pid: this.flaskProcess.pid,
        });

        return { success: true, port: this.flaskPort, pid: this.flaskProcess.pid };
      } else {
        // Health check failed, kill the process
        this.logger.error('Flask backend failed health check');
        
        if (this.flaskProcess && !this.flaskProcess.killed) {
          this.flaskProcess.kill();
        }

        this.isRunning = false;
        this.isStarting = false;
        this.flaskProcess = null;

        return { success: false, error: 'Health check failed', port: null };
      }

    } catch (error) {
      this.logger.error('Failed to start Flask backend', {
        error: error.message,
        stack: error.stack,
      });

      this.isRunning = false;
      this.isStarting = false;

      if (this.flaskProcess && !this.flaskProcess.killed) {
        this.flaskProcess.kill();
        this.flaskProcess = null;
      }

      return { success: false, error: error.message, port: null };
    }
  }

  /**
   * Stop Flask backend process
   */
  async stop() {
    if (!this.flaskProcess || this.flaskProcess.killed) {
      this.logger.info('Flask backend already stopped or not running');
      return { success: true };
    }

    this.logger.info('Stopping Flask backend', {
      pid: this.flaskProcess.pid,
      port: this.flaskPort,
    });

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.flaskProcess && !this.flaskProcess.killed) {
          this.logger.warn('Flask process did not exit gracefully, forcing kill');
          this.flaskProcess.kill('SIGKILL');
        }
        
        this.isRunning = false;
        this.flaskProcess = null;
        resolve({ success: true, forced: true });
      }, 5000);

      this.flaskProcess.once('exit', () => {
        clearTimeout(timeout);
        this.logger.success('Flask backend stopped gracefully');
        this.isRunning = false;
        this.flaskProcess = null;
        resolve({ success: true, forced: false });
      });

      // Send SIGTERM for graceful shutdown
      this.flaskProcess.kill('SIGTERM');
    });
  }

  /**
   * Get Flask backend status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isStarting: this.isStarting,
      port: this.isRunning ? this.flaskPort : null,
      pid: this.flaskProcess?.pid || null,
    };
  }

  /**
   * Get Flask backend port
   */
  getPort() {
    return this.isRunning ? this.flaskPort : null;
  }
}

module.exports = FlaskBackendManager;

