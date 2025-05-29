#!/usr/bin/env node

/**
 * Task Master
 * Copyright (c) 2025 Eyal Toledano, Ralph Khreish
 *
 * This software is licensed under the MIT License with Commons Clause.
 * You may use this software for any purpose, including commercial applications,
 * and modify and redistribute it freely, subject to the following restrictions:
 *
 * 1. You may not sell this software or offer it as a service.
 * 2. The origin of this software must not be misrepresented.
 * 3. Altered source versions must be plainly marked as such.
 *
 * For the full license text, see the LICENSE file in the root directory.
 */

/**
 * Claude Task Master - Simplified Core Library
 * A task management system for AI-driven development with Claude
 * 
 * ⚠️ MIGRATION NOTICE: CLI interface has been removed in Phase 1.1 architecture restructuring.
 * Only core library functionality remains.
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Get package information
const packageJson = require('./package.json');

// Export core AI services (only Anthropic integration remains)
export { 
  generateTextService, 
  streamTextService, 
  generateObjectService 
} from './scripts/modules/ai-services-unified.js';

// Export version information
export const version = packageJson.version;

// Export project initialization function (programmatic usage only)
export const initProject = async (options = {}) => {
  const init = await import('./scripts/init.js');
  return init.initializeProject(options);
};
