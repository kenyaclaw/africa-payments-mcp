/**
 * Configuration Manager
 */

import fs from 'fs/promises';
import { ServerConfig } from '../types/index.js';

export class ConfigManager {
  async load(path: string): Promise<ServerConfig> {
    const content = await fs.readFile(path, 'utf-8');
    const config = JSON.parse(content);
    
    // Validate and set defaults
    return this.validate(config);
  }

  private validate(config: any): ServerConfig {
    // Ensure required sections exist
    if (!config.providers) {
      throw new Error('Configuration must include "providers" section');
    }
    
    if (!config.defaults) {
      config.defaults = {
        currency: 'KES',
        country: 'KE',
      };
    }

    if (!config.server) {
      config.server = {
        logLevel: 'info',
      };
    }

    return config as ServerConfig;
  }
}
