/**
 * Knex Configuration for Database Migrations
 * Supports multiple environments and migration management
 */

import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config();

const baseConfig = {
    client: 'postgresql',
    migrations: {
        directory: join(__dirname, 'migrations'),
        tableName: 'knex_migrations',
        extension: 'js'
    },
    seeds: {
        directory: join(__dirname, 'seeds')
    },
    pool: {
        min: 2,
        max: 10,
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 100,
        propagateCreateError: false
    }
};

const environments = {
    development: {
        ...baseConfig,
        connection: {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 5432,
            database: process.env.DB_NAME || 'claude_task_master_dev',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            ssl: false
        },
        debug: process.env.DB_DEBUG === 'true'
    },

    test: {
        ...baseConfig,
        connection: {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT) || 5432,
            database: process.env.DB_NAME || 'claude_task_master_test',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || '',
            ssl: false
        },
        pool: {
            min: 1,
            max: 5
        }
    },

    staging: {
        ...baseConfig,
        connection: {
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT) || 5432,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ssl: {
                rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
            }
        },
        pool: {
            min: 5,
            max: 20
        }
    },

    production: {
        ...baseConfig,
        connection: {
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT) || 5432,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            ssl: {
                rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
            }
        },
        pool: {
            min: 10,
            max: 50
        },
        acquireConnectionTimeout: 60000
    }
};

const environment = process.env.NODE_ENV || 'development';

export default environments[environment];
export { environments };

