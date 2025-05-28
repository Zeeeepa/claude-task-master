/**
 * Database Connector
 * 
 * PostgreSQL database integration for storing deployment data,
 * validation results, and system metrics
 */

const { Pool } = require('pg');
const { EventEmitter } = require('events');

class DatabaseConnector extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      connectionString: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/ai_cicd',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      ...config
    };

    this.pool = null;
    this.isConnected = false;
    this.connectionAttempts = 0;
    this.maxConnectionAttempts = 5;
  }

  /**
   * Connect to the database
   */
  async connect() {
    try {
      console.log('Connecting to database...');
      
      this.pool = new Pool(this.config);
      
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.isConnected = true;
      this.connectionAttempts = 0;
      
      console.log('Database connected successfully');
      this.emit('connected');
      
      // Setup event handlers
      this.setupEventHandlers();
      
      // Initialize schema if needed
      await this.initializeSchema();
      
      return { success: true };
    } catch (error) {
      this.connectionAttempts++;
      console.error(`Database connection failed (attempt ${this.connectionAttempts}): ${error.message}`);
      
      if (this.connectionAttempts < this.maxConnectionAttempts) {
        const delay = Math.min(1000 * Math.pow(2, this.connectionAttempts), 30000);
        console.log(`Retrying connection in ${delay}ms...`);
        
        setTimeout(() => this.connect(), delay);
      } else {
        this.emit('connectionFailed', error);
        throw new Error(`Database connection failed after ${this.maxConnectionAttempts} attempts: ${error.message}`);
      }
    }
  }

  /**
   * Setup pool event handlers
   */
  setupEventHandlers() {
    this.pool.on('error', (err) => {
      console.error('Database pool error:', err);
      this.emit('error', err);
    });

    this.pool.on('connect', () => {
      this.emit('clientConnected');
    });

    this.pool.on('remove', () => {
      this.emit('clientRemoved');
    });
  }

  /**
   * Initialize database schema
   */
  async initializeSchema() {
    try {
      console.log('Initializing database schema...');
      
      const client = await this.pool.connect();
      
      try {
        // Create deployments table
        await client.query(`
          CREATE TABLE IF NOT EXISTS deployments (
            id VARCHAR(255) PRIMARY KEY,
            status VARCHAR(50) NOT NULL,
            repository_url TEXT NOT NULL,
            pr_branch VARCHAR(255) NOT NULL,
            requested_by VARCHAR(255),
            retry_of VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            completed_at TIMESTAMP WITH TIME ZONE,
            error_message TEXT,
            metadata JSONB
          )
        `);

        // Create validations table
        await client.query(`
          CREATE TABLE IF NOT EXISTS validations (
            id VARCHAR(255) PRIMARY KEY,
            session_id VARCHAR(255) NOT NULL,
            type VARCHAR(100) NOT NULL,
            status VARCHAR(50) NOT NULL,
            task_id VARCHAR(255),
            retry_of VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            completed_at TIMESTAMP WITH TIME ZONE,
            results JSONB,
            config JSONB
          )
        `);

        // Create webhook_events table
        await client.query(`
          CREATE TABLE IF NOT EXISTS webhook_events (
            id SERIAL PRIMARY KEY,
            source VARCHAR(100) NOT NULL,
            event VARCHAR(100) NOT NULL,
            payload JSONB NOT NULL,
            processed BOOLEAN DEFAULT FALSE,
            result TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `);

        // Create pr_deployments table
        await client.query(`
          CREATE TABLE IF NOT EXISTS pr_deployments (
            id SERIAL PRIMARY KEY,
            deployment_id VARCHAR(255) NOT NULL,
            repository_full_name VARCHAR(255) NOT NULL,
            pr_number INTEGER NOT NULL,
            pr_branch VARCHAR(255) NOT NULL,
            pr_title TEXT,
            author VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            FOREIGN KEY (deployment_id) REFERENCES deployments(id)
          )
        `);

        // Create repository_configs table
        await client.query(`
          CREATE TABLE IF NOT EXISTS repository_configs (
            id SERIAL PRIMARY KEY,
            repository_full_name VARCHAR(255) UNIQUE NOT NULL,
            auto_deploy_enabled BOOLEAN DEFAULT FALSE,
            continuous_deployment BOOLEAN DEFAULT FALSE,
            auto_merge_on_approval BOOLEAN DEFAULT FALSE,
            validation_tasks JSONB,
            production_validation_tasks JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          )
        `);

        // Create metrics table
        await client.query(`
          CREATE TABLE IF NOT EXISTS metrics (
            id SERIAL PRIMARY KEY,
            metric_name VARCHAR(100) NOT NULL,
            metric_value NUMERIC,
            metric_data JSONB,
            timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            source VARCHAR(100)
          )
        `);

        // Create indexes
        await client.query('CREATE INDEX IF NOT EXISTS idx_deployments_status ON deployments(status)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_deployments_created_at ON deployments(created_at)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_validations_session_id ON validations(session_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_validations_status ON validations(status)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_webhook_events_source ON webhook_events(source)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_pr_deployments_repo_pr ON pr_deployments(repository_full_name, pr_number)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_metrics_name_timestamp ON metrics(metric_name, timestamp)');

        console.log('Database schema initialized successfully');
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Schema initialization failed:', error);
      throw error;
    }
  }

  /**
   * Check database connection
   */
  async checkConnection() {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW() as current_time, version() as version');
      client.release();
      
      return {
        connected: true,
        currentTime: result.rows[0].current_time,
        version: result.rows[0].version,
        poolSize: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Create deployment record
   */
  async createDeployment(deployment) {
    try {
      const client = await this.pool.connect();
      
      try {
        const query = `
          INSERT INTO deployments (id, status, repository_url, pr_branch, requested_by, retry_of, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `;
        
        const values = [
          deployment.id,
          deployment.status,
          deployment.repositoryUrl,
          deployment.prBranch,
          deployment.requestedBy,
          deployment.retryOf || null,
          JSON.stringify(deployment.metadata || {})
        ];
        
        const result = await client.query(query, values);
        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Create deployment error:', error);
      throw error;
    }
  }

  /**
   * Get deployment by ID
   */
  async getDeployment(deploymentId) {
    try {
      const client = await this.pool.connect();
      
      try {
        const query = 'SELECT * FROM deployments WHERE id = $1';
        const result = await client.query(query, [deploymentId]);
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Get deployment error:', error);
      throw error;
    }
  }

  /**
   * Update deployment status
   */
  async updateDeploymentStatus(deploymentId, status, errorMessage = null) {
    try {
      const client = await this.pool.connect();
      
      try {
        const query = `
          UPDATE deployments 
          SET status = $2, updated_at = NOW(), error_message = $3,
              completed_at = CASE WHEN $2 IN ('completed', 'failed', 'stopped') THEN NOW() ELSE completed_at END
          WHERE id = $1
          RETURNING *
        `;
        
        const result = await client.query(query, [deploymentId, status, errorMessage]);
        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Update deployment status error:', error);
      throw error;
    }
  }

  /**
   * Get deployments with filtering
   */
  async getDeployments(filters = {}) {
    try {
      const client = await this.pool.connect();
      
      try {
        let query = 'SELECT * FROM deployments WHERE 1=1';
        const values = [];
        let paramCount = 0;

        if (filters.status) {
          paramCount++;
          query += ` AND status = $${paramCount}`;
          values.push(filters.status);
        }

        if (filters.repositoryUrl) {
          paramCount++;
          query += ` AND repository_url = $${paramCount}`;
          values.push(filters.repositoryUrl);
        }

        if (filters.requestedBy) {
          paramCount++;
          query += ` AND requested_by = $${paramCount}`;
          values.push(filters.requestedBy);
        }

        // Add ordering
        query += ` ORDER BY ${filters.sortBy || 'created_at'} ${filters.sortOrder || 'DESC'}`;

        // Add pagination
        const limit = filters.limit || 20;
        const offset = ((filters.page || 1) - 1) * limit;
        
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        values.push(limit);
        
        paramCount++;
        query += ` OFFSET $${paramCount}`;
        values.push(offset);

        const result = await client.query(query, values);
        
        // Get total count
        const countQuery = 'SELECT COUNT(*) FROM deployments WHERE 1=1' + 
          (filters.status ? ' AND status = $1' : '') +
          (filters.repositoryUrl ? ` AND repository_url = $${filters.status ? 2 : 1}` : '') +
          (filters.requestedBy ? ` AND requested_by = $${(filters.status ? 1 : 0) + (filters.repositoryUrl ? 1 : 0) + 1}` : '');
        
        const countValues = [];
        if (filters.status) countValues.push(filters.status);
        if (filters.repositoryUrl) countValues.push(filters.repositoryUrl);
        if (filters.requestedBy) countValues.push(filters.requestedBy);
        
        const countResult = await client.query(countQuery, countValues);
        
        return {
          deployments: result.rows,
          total: parseInt(countResult.rows[0].count)
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Get deployments error:', error);
      throw error;
    }
  }

  /**
   * Create validation record
   */
  async createValidation(validation) {
    try {
      const client = await this.pool.connect();
      
      try {
        const query = `
          INSERT INTO validations (id, session_id, type, status, task_id, retry_of, config)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `;
        
        const values = [
          validation.id,
          validation.sessionId,
          validation.type,
          validation.status,
          validation.taskId,
          validation.retryOf || null,
          JSON.stringify(validation.config || {})
        ];
        
        const result = await client.query(query, values);
        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Create validation error:', error);
      throw error;
    }
  }

  /**
   * Get validation by ID
   */
  async getValidation(validationId) {
    try {
      const client = await this.pool.connect();
      
      try {
        const query = 'SELECT * FROM validations WHERE id = $1';
        const result = await client.query(query, [validationId]);
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Get validation error:', error);
      throw error;
    }
  }

  /**
   * Update validation status and results
   */
  async updateValidationStatus(validationId, status, results = null) {
    try {
      const client = await this.pool.connect();
      
      try {
        const query = `
          UPDATE validations 
          SET status = $2, updated_at = NOW(), results = $3,
              completed_at = CASE WHEN $2 IN ('completed', 'failed') THEN NOW() ELSE completed_at END
          WHERE id = $1
          RETURNING *
        `;
        
        const result = await client.query(query, [validationId, status, JSON.stringify(results)]);
        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Update validation status error:', error);
      throw error;
    }
  }

  /**
   * Get validations with filtering
   */
  async getValidations(filters = {}) {
    try {
      const client = await this.pool.connect();
      
      try {
        let query = 'SELECT * FROM validations WHERE 1=1';
        const values = [];
        let paramCount = 0;

        if (filters.sessionId) {
          paramCount++;
          query += ` AND session_id = $${paramCount}`;
          values.push(filters.sessionId);
        }

        if (filters.type) {
          paramCount++;
          query += ` AND type = $${paramCount}`;
          values.push(filters.type);
        }

        if (filters.status) {
          paramCount++;
          query += ` AND status = $${paramCount}`;
          values.push(filters.status);
        }

        query += ' ORDER BY created_at DESC';

        // Add pagination
        const limit = filters.limit || 20;
        const offset = ((filters.page || 1) - 1) * limit;
        
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        values.push(limit);
        
        paramCount++;
        query += ` OFFSET $${paramCount}`;
        values.push(offset);

        const result = await client.query(query, values);
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM validations WHERE 1=1';
        const countValues = [];
        
        if (filters.sessionId) {
          countQuery += ' AND session_id = $1';
          countValues.push(filters.sessionId);
        }
        if (filters.type) {
          countQuery += ` AND type = $${countValues.length + 1}`;
          countValues.push(filters.type);
        }
        if (filters.status) {
          countQuery += ` AND status = $${countValues.length + 1}`;
          countValues.push(filters.status);
        }
        
        const countResult = await client.query(countQuery, countValues);
        
        return {
          validations: result.rows,
          total: parseInt(countResult.rows[0].count)
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Get validations error:', error);
      throw error;
    }
  }

  /**
   * Create webhook event record
   */
  async createWebhookEvent(event) {
    try {
      const client = await this.pool.connect();
      
      try {
        const query = `
          INSERT INTO webhook_events (source, event, payload, processed, result)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `;
        
        const values = [
          event.source,
          event.event,
          JSON.stringify(event.payload),
          event.processed || false,
          event.result
        ];
        
        const result = await client.query(query, values);
        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Create webhook event error:', error);
      throw error;
    }
  }

  /**
   * Get webhook events with filtering
   */
  async getWebhookEvents(filters = {}) {
    try {
      const client = await this.pool.connect();
      
      try {
        let query = 'SELECT * FROM webhook_events WHERE 1=1';
        const values = [];
        let paramCount = 0;

        if (filters.source) {
          paramCount++;
          query += ` AND source = $${paramCount}`;
          values.push(filters.source);
        }

        if (filters.event) {
          paramCount++;
          query += ` AND event = $${paramCount}`;
          values.push(filters.event);
        }

        if (filters.processed !== undefined) {
          paramCount++;
          query += ` AND processed = $${paramCount}`;
          values.push(filters.processed);
        }

        query += ' ORDER BY created_at DESC';

        // Add pagination
        const limit = filters.limit || 50;
        const offset = ((filters.page || 1) - 1) * limit;
        
        paramCount++;
        query += ` LIMIT $${paramCount}`;
        values.push(limit);
        
        paramCount++;
        query += ` OFFSET $${paramCount}`;
        values.push(offset);

        const result = await client.query(query, values);
        
        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM webhook_events WHERE 1=1';
        const countValues = [];
        
        if (filters.source) {
          countQuery += ' AND source = $1';
          countValues.push(filters.source);
        }
        if (filters.event) {
          countQuery += ` AND event = $${countValues.length + 1}`;
          countValues.push(filters.event);
        }
        if (filters.processed !== undefined) {
          countQuery += ` AND processed = $${countValues.length + 1}`;
          countValues.push(filters.processed);
        }
        
        const countResult = await client.query(countQuery, countValues);
        
        return {
          events: result.rows,
          total: parseInt(countResult.rows[0].count)
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Get webhook events error:', error);
      throw error;
    }
  }

  /**
   * Create PR deployment record
   */
  async createPRDeployment(prDeployment) {
    try {
      const client = await this.pool.connect();
      
      try {
        const query = `
          INSERT INTO pr_deployments (deployment_id, repository_full_name, pr_number, pr_branch, pr_title, author)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `;
        
        const values = [
          prDeployment.deploymentId,
          prDeployment.repositoryFullName,
          prDeployment.prNumber,
          prDeployment.prBranch,
          prDeployment.prTitle,
          prDeployment.author
        ];
        
        const result = await client.query(query, values);
        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Create PR deployment error:', error);
      throw error;
    }
  }

  /**
   * Get PR deployments
   */
  async getPRDeployments(repositoryFullName, prNumber) {
    try {
      const client = await this.pool.connect();
      
      try {
        const query = `
          SELECT pd.*, d.status, d.created_at as deployment_created_at
          FROM pr_deployments pd
          JOIN deployments d ON pd.deployment_id = d.id
          WHERE pd.repository_full_name = $1 AND pd.pr_number = $2
          ORDER BY pd.created_at DESC
        `;
        
        const result = await client.query(query, [repositoryFullName, prNumber]);
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Get PR deployments error:', error);
      throw error;
    }
  }

  /**
   * Get repository configuration
   */
  async getRepositoryConfig(repositoryFullName) {
    try {
      const client = await this.pool.connect();
      
      try {
        const query = 'SELECT * FROM repository_configs WHERE repository_full_name = $1';
        const result = await client.query(query, [repositoryFullName]);
        
        return result.rows[0] || null;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Get repository config error:', error);
      throw error;
    }
  }

  /**
   * Store metrics
   */
  async storeMetrics(metricName, metricValue, metricData = null, source = 'agentapi-middleware') {
    try {
      const client = await this.pool.connect();
      
      try {
        const query = `
          INSERT INTO metrics (metric_name, metric_value, metric_data, source)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `;
        
        const values = [
          metricName,
          metricValue,
          metricData ? JSON.stringify(metricData) : null,
          source
        ];
        
        const result = await client.query(query, values);
        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Store metrics error:', error);
      throw error;
    }
  }

  /**
   * Get metrics for a time period
   */
  async getMetrics(period = '24h') {
    try {
      const client = await this.pool.connect();
      
      try {
        const intervals = {
          '1h': '1 hour',
          '24h': '24 hours',
          '7d': '7 days',
          '30d': '30 days'
        };
        
        const interval = intervals[period] || '24 hours';
        
        const query = `
          SELECT metric_name, 
                 AVG(metric_value) as avg_value,
                 MIN(metric_value) as min_value,
                 MAX(metric_value) as max_value,
                 COUNT(*) as count
          FROM metrics 
          WHERE timestamp >= NOW() - INTERVAL '${interval}'
          GROUP BY metric_name
          ORDER BY metric_name
        `;
        
        const result = await client.query(query);
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Get metrics error:', error);
      throw error;
    }
  }

  /**
   * Get deployment statistics
   */
  async getDeploymentStatistics() {
    try {
      const client = await this.pool.connect();
      
      try {
        const query = `
          SELECT 
            COUNT(*) as total_deployments,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_deployments,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_deployments,
            COUNT(CASE WHEN status = 'running' THEN 1 END) as running_deployments,
            AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_duration_seconds
          FROM deployments
          WHERE created_at >= NOW() - INTERVAL '30 days'
        `;
        
        const result = await client.query(query);
        return result.rows[0];
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Get deployment statistics error:', error);
      throw error;
    }
  }

  /**
   * Get validation statistics
   */
  async getValidationStatistics() {
    try {
      const client = await this.pool.connect();
      
      try {
        const query = `
          SELECT 
            COUNT(*) as total_validations,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_validations,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_validations,
            COUNT(CASE WHEN status = 'running' THEN 1 END) as running_validations,
            type,
            COUNT(*) as count_by_type
          FROM validations
          WHERE created_at >= NOW() - INTERVAL '30 days'
          GROUP BY type
        `;
        
        const result = await client.query(query);
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Get validation statistics error:', error);
      throw error;
    }
  }

  /**
   * Get general statistics
   */
  async getStatistics() {
    try {
      const client = await this.pool.connect();
      
      try {
        const queries = await Promise.all([
          client.query('SELECT COUNT(*) as total FROM deployments'),
          client.query('SELECT COUNT(*) as total FROM validations'),
          client.query('SELECT COUNT(*) as total FROM webhook_events'),
          client.query('SELECT COUNT(*) as total FROM pr_deployments')
        ]);
        
        return {
          deployments: parseInt(queries[0].rows[0].total),
          validations: parseInt(queries[1].rows[0].total),
          webhookEvents: parseInt(queries[2].rows[0].total),
          prDeployments: parseInt(queries[3].rows[0].total),
          poolStats: {
            totalCount: this.pool.totalCount,
            idleCount: this.pool.idleCount,
            waitingCount: this.pool.waitingCount
          }
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Get statistics error:', error);
      throw error;
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect() {
    try {
      if (this.pool) {
        await this.pool.end();
        this.isConnected = false;
        console.log('Database disconnected');
        this.emit('disconnected');
      }
    } catch (error) {
      console.error('Database disconnect error:', error);
      throw error;
    }
  }
}

module.exports = DatabaseConnector;

