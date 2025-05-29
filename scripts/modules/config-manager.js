import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { log, findProjectRoot } from './utils.js';

// Calculate __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FILE_NAME = '.orchestratorconfig';

// Default configuration values for the orchestrator
const DEFAULTS = {
	codegen: {
		token: null,
		orgId: null,
		apiUrl: 'https://api.codegen.sh'
	},
	claude: {
		webClientConfirmation: null,
		apiKey: null
	},
	agentapi: {
		baseUrl: 'http://localhost:8000',
		enabled: false
	},
	linear: {
		apiKey: null,
		teamId: null
	},
	wsl2: {
		enabled: false,
		instanceName: 'default'
	},
	database: {
		type: 'sqlite',
		path: './orchestrator.db'
	},
	global: {
		logLevel: 'info',
		debug: false,
		projectName: 'AI Development Orchestrator'
	}
};

// Internal config loading
let loadedConfig = null;
let loadedConfigRoot = null;

// Custom Error for configuration issues
class ConfigurationError extends Error {
	constructor(message) {
		super(message);
		this.name = 'ConfigurationError';
	}
}

function _loadAndValidateConfig(explicitRoot = null) {
	const defaults = DEFAULTS;
	let rootToUse = explicitRoot;
	let configSource = explicitRoot
		? `explicit root (${explicitRoot})`
		: 'defaults (no root provided yet)';

	// If no explicit root, try to find it
	if (!rootToUse) {
		rootToUse = findProjectRoot();
		if (rootToUse) {
			configSource = `found root (${rootToUse})`;
		} else {
			// No root found, return defaults immediately
			return defaults;
		}
	}

	// Proceed with loading from the determined rootToUse
	const configPath = path.join(rootToUse, CONFIG_FILE_NAME);
	let config = { ...defaults }; // Start with a deep copy of defaults
	let configExists = false;

	if (fs.existsSync(configPath)) {
		configExists = true;
		try {
			const rawData = fs.readFileSync(configPath, 'utf-8');
			const parsedConfig = JSON.parse(rawData);

			// Deep merge parsed config onto defaults
			config = {
				codegen: { ...defaults.codegen, ...parsedConfig?.codegen },
				claude: { ...defaults.claude, ...parsedConfig?.claude },
				agentapi: { ...defaults.agentapi, ...parsedConfig?.agentapi },
				linear: { ...defaults.linear, ...parsedConfig?.linear },
				wsl2: { ...defaults.wsl2, ...parsedConfig?.wsl2 },
				database: { ...defaults.database, ...parsedConfig?.database },
				global: { ...defaults.global, ...parsedConfig?.global }
			};
			configSource = `file (${configPath})`;
		} catch (error) {
			console.error(
				chalk.red(
					`Error reading or parsing ${configPath}: ${error.message}. Using default configuration.`
				)
			);
			config = { ...defaults };
			configSource = `defaults (parse error at ${configPath})`;
		}
	} else {
		// Config file doesn't exist
		if (explicitRoot) {
			console.warn(
				chalk.yellow(
					`Warning: ${CONFIG_FILE_NAME} not found at provided project root (${explicitRoot}). Using default configuration. Run 'task-master config' to configure.`
				)
			);
		} else {
			console.warn(
				chalk.yellow(
					`Warning: ${CONFIG_FILE_NAME} not found at derived root (${rootToUse}). Using defaults.`
				)
			);
		}
		config = { ...defaults };
		configSource = `defaults (file not found at ${configPath})`;
	}

	return config;
}

/**
 * Gets the current configuration, loading it if necessary.
 * @param {string|null} explicitRoot - Optional explicit path to the project root.
 * @param {boolean} forceReload - Force reloading the config file.
 * @returns {object} The loaded configuration object.
 */
function getConfig(explicitRoot = null, forceReload = false) {
	// Determine if a reload is necessary
	const needsLoad =
		!loadedConfig ||
		forceReload ||
		(explicitRoot && explicitRoot !== loadedConfigRoot);

	if (needsLoad) {
		const newConfig = _loadAndValidateConfig(explicitRoot);

		if (forceReload || explicitRoot) {
			loadedConfig = newConfig;
			loadedConfigRoot = explicitRoot;
		}
		return newConfig;
	}

	return loadedConfig;
}

// Configuration getters
function getCodegenConfig(explicitRoot = null) {
	const config = getConfig(explicitRoot);
	return config?.codegen || DEFAULTS.codegen;
}

function getClaudeConfig(explicitRoot = null) {
	const config = getConfig(explicitRoot);
	return config?.claude || DEFAULTS.claude;
}

function getAgentApiConfig(explicitRoot = null) {
	const config = getConfig(explicitRoot);
	return config?.agentapi || DEFAULTS.agentapi;
}

function getLinearConfig(explicitRoot = null) {
	const config = getConfig(explicitRoot);
	return config?.linear || DEFAULTS.linear;
}

function getWsl2Config(explicitRoot = null) {
	const config = getConfig(explicitRoot);
	return config?.wsl2 || DEFAULTS.wsl2;
}

function getDatabaseConfig(explicitRoot = null) {
	const config = getConfig(explicitRoot);
	return config?.database || DEFAULTS.database;
}

function getGlobalConfig(explicitRoot = null) {
	const config = getConfig(explicitRoot);
	return config?.global || DEFAULTS.global;
}

// Specific getters
function getLogLevel(explicitRoot = null) {
	return getGlobalConfig(explicitRoot).logLevel;
}

function getDebugFlag(explicitRoot = null) {
	return getGlobalConfig(explicitRoot).debug;
}

function getProjectName(explicitRoot = null) {
	return getGlobalConfig(explicitRoot).projectName;
}

/**
 * Writes the configuration object to the file.
 * @param {Object} config The configuration object to write.
 * @param {string|null} explicitRoot - Optional explicit path to the project root.
 * @returns {boolean} True if successful, false otherwise.
 */
function writeConfig(config, explicitRoot = null) {
	let rootPath = explicitRoot;
	if (explicitRoot === null || explicitRoot === undefined) {
		const foundRoot = findProjectRoot();
		if (!foundRoot) {
			console.error(
				chalk.red(
					'Error: Could not determine project root. Configuration not saved.'
				)
			);
			return false;
		}
		rootPath = foundRoot;
	}

	const configPath =
		path.basename(rootPath) === CONFIG_FILE_NAME
			? rootPath
			: path.join(rootPath, CONFIG_FILE_NAME);

	try {
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
		loadedConfig = config; // Update the cache after successful write
		return true;
	} catch (error) {
		console.error(
			chalk.red(
				`Error writing configuration to ${configPath}: ${error.message}`
			)
		);
		return false;
	}
}

/**
 * Checks if the configuration file exists at the project root
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {boolean} True if the file exists, false otherwise
 */
function isConfigFilePresent(explicitRoot = null) {
	let rootPath = explicitRoot;
	if (explicitRoot === null || explicitRoot === undefined) {
		const foundRoot = findProjectRoot();
		if (!foundRoot) {
			return false;
		}
		rootPath = foundRoot;
	}

	const configPath = path.join(rootPath, CONFIG_FILE_NAME);
	return fs.existsSync(configPath);
}

/**
 * Validates if the Codegen SDK is properly configured
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {boolean} True if properly configured, false otherwise
 */
function isCodegenConfigured(explicitRoot = null) {
	const codegenConfig = getCodegenConfig(explicitRoot);
	return !!(codegenConfig.token && codegenConfig.orgId);
}

/**
 * Validates if Claude Code is properly configured
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {boolean} True if properly configured, false otherwise
 */
function isClaudeConfigured(explicitRoot = null) {
	const claudeConfig = getClaudeConfig(explicitRoot);
	return !!(claudeConfig.webClientConfirmation || claudeConfig.apiKey);
}

/**
 * Validates if AgentAPI is properly configured
 * @param {string|null} explicitRoot - Optional explicit path to the project root
 * @returns {boolean} True if properly configured, false otherwise
 */
function isAgentApiConfigured(explicitRoot = null) {
	const agentApiConfig = getAgentApiConfig(explicitRoot);
	return !!(agentApiConfig.enabled && agentApiConfig.baseUrl);
}

export {
	// Core config access
	getConfig,
	writeConfig,
	ConfigurationError,
	isConfigFilePresent,

	// Component-specific getters
	getCodegenConfig,
	getClaudeConfig,
	getAgentApiConfig,
	getLinearConfig,
	getWsl2Config,
	getDatabaseConfig,
	getGlobalConfig,

	// Global setting getters
	getLogLevel,
	getDebugFlag,
	getProjectName,

	// Validation functions
	isCodegenConfigured,
	isClaudeConfigured,
	isAgentApiConfigured,

	// Constants
	DEFAULTS
};

