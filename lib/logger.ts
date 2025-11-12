/**
 * Logger utility for structured logging across the application
 * Provides different log levels and formatted output for better debugging
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug' | 'success';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
  context?: string;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  /**
   * Format timestamp in ISO format
   */
  private getTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Format log entry for console output
   */
  private formatLogEntry(entry: LogEntry): string {
    const { timestamp, level, message, context, data } = entry;
    const contextStr = context ? `[${context}]` : '';
    const dataStr = data ? `\n${JSON.stringify(data, null, 2)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${contextStr} ${message}${dataStr}`;
  }

  /**
   * Core logging method
   */
  private log(level: LogLevel, message: string, data?: unknown, context?: string): void {
    const entry: LogEntry = {
      timestamp: this.getTimestamp(),
      level,
      message,
      data,
      context,
    };

    const formattedMessage = this.formatLogEntry(entry);

    switch (level) {
      case 'error':
        console.error(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'debug':
        if (this.isDevelopment) {
          console.debug(formattedMessage);
        }
        break;
      case 'success':
        console.log(`✓ ${formattedMessage}`);
        break;
      default:
        console.log(formattedMessage);
    }
  }

  /**
   * Log informational messages
   */
  info(message: string, data?: unknown, context?: string): void {
    this.log('info', message, data, context);
  }

  /**
   * Log warning messages
   */
  warn(message: string, data?: unknown, context?: string): void {
    this.log('warn', message, data, context);
  }

  /**
   * Log error messages
   */
  error(message: string, error?: unknown, context?: string): void {
    this.log('error', message, error, context);
  }

  /**
   * Log debug messages (only in development)
   */
  debug(message: string, data?: unknown, context?: string): void {
    this.log('debug', message, data, context);
  }

  /**
   * Log success messages
   */
  success(message: string, data?: unknown, context?: string): void {
    this.log('success', message, data, context);
  }

  /**
   * Log API calls
   */
  apiCall(method: string, url: string, data?: unknown): void {
    this.info(`API Call: ${method} ${url}`, data, 'API');
  }

  /**
   * Log API responses
   */
  apiResponse(status: number, url: string, data?: unknown): void {
    const level = status >= 400 ? 'error' : status >= 300 ? 'warn' : 'info';
    this.log(level, `API Response: ${status} ${url}`, data, 'API');
  }

  /**
   * Log component lifecycle events
   */
  component(componentName: string, action: string, data?: unknown): void {
    this.debug(`Component ${componentName}: ${action}`, data, 'Component');
  }
}

// Export singleton instance
export const logger = new Logger();

