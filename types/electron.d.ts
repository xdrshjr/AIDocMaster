/**
 * Type definitions for Electron API exposed via preload script
 */

interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  getAppName: () => Promise<string>;
  getWindowBounds: () => Promise<{ x: number; y: number; width: number; height: number } | null>;
  isElectron: () => boolean;
  getPlatform: () => string;
  loadModelConfigs: () => Promise<{
    success: boolean;
    error?: string;
    data: {
      models: Array<{
        id: string;
        name: string;
        apiUrl: string;
        apiKey: string;
        modelName: string;
        isDefault?: boolean;
        createdAt?: string;
        updatedAt?: string;
      }>;
      defaultModelId?: string;
    };
  }>;
  saveModelConfigs: (configs: {
    models: Array<{
      id: string;
      name: string;
      apiUrl: string;
      apiKey: string;
      modelName: string;
      isDefault?: boolean;
      createdAt?: string;
      updatedAt?: string;
    }>;
    defaultModelId?: string;
  }) => Promise<{
    success: boolean;
    error?: string;
  }>;
  getApiServerPort: () => Promise<number | null>;
  getFlaskBackendPort: () => Promise<number | null>;
  getFlaskBackendStatus: () => Promise<{
    isRunning: boolean;
    isStarting: boolean;
    port: number | null;
    pid: number | null;
  }>;
  getFlaskLogs: (lines?: number) => Promise<{
    success: boolean;
    error?: string;
    logs: string;
    total_lines?: number;
    returned_lines?: number;
    log_file?: string;
  }>;
}

interface Window {
  electron?: ElectronAPI;
  electronAPI?: ElectronAPI;
}

