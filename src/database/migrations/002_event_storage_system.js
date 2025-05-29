/**
 * @fileoverview Migration 002 - Event Storage System Tables
 * @description Creates all tables required for Phase 1.3 Database Event Storage System
 * @version 1.0.0
 */

/**
 * Migration 002: Event Storage System
 * Creates comprehensive event tracking tables for all development activities
 */
export const migration002 = {
  version: '002',
  description: 'Create event storage system tables for comprehensive activity tracking',
  
  /**
   * Apply the migration
   */
  async up(client, tablePrefix = 'voltagent_events') {
    console.log('[Migration 002] Creating event storage system tables...');

    // Create events table (general system events)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tablePrefix}_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(100) NOT NULL,
        event_name VARCHAR(200) NOT NULL,
        agent_id VARCHAR(100),
        session_id VARCHAR(100),
        user_id VARCHAR(100),
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        data JSONB,
        metadata JSONB,
        status VARCHAR(50) DEFAULT 'completed',
        duration_ms INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create task_events table (task-specific tracking)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tablePrefix}_task_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        task_id VARCHAR(100) NOT NULL,
        task_name VARCHAR(200) NOT NULL,
        agent_id VARCHAR(100) NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        event_name VARCHAR(200) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'started',
        input_data JSONB,
        output_data JSONB,
        error_data JSONB,
        metadata JSONB,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        duration_ms INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create agent_events table (agent activity tracking)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tablePrefix}_agent_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        agent_id VARCHAR(100) NOT NULL,
        agent_name VARCHAR(200),
        parent_agent_id VARCHAR(100),
        event_type VARCHAR(100) NOT NULL,
        event_name VARCHAR(200) NOT NULL,
        action VARCHAR(100),
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        context JSONB,
        result JSONB,
        error_data JSONB,
        metadata JSONB,
        duration_ms INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create deployment_events table (WSL2 deployment tracking)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tablePrefix}_deployment_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        deployment_id VARCHAR(100) NOT NULL,
        environment VARCHAR(100) NOT NULL,
        event_type VARCHAR(100) NOT NULL,
        event_name VARCHAR(200) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        branch_name VARCHAR(200),
        commit_hash VARCHAR(100),
        pr_number INTEGER,
        deployment_config JSONB,
        logs JSONB,
        error_data JSONB,
        metadata JSONB,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        duration_ms INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create event_batches table (batch processing optimization)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tablePrefix}_event_batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        batch_id VARCHAR(100) NOT NULL UNIQUE,
        event_count INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        error_data JSONB,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Create performance indexes
    console.log('[Migration 002] Creating performance indexes...');

    const indexes = [
      // Events table indexes
      `CREATE INDEX IF NOT EXISTS idx_events_timestamp ON ${tablePrefix}_events (timestamp DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_events_agent_id ON ${tablePrefix}_events (agent_id)`,
      `CREATE INDEX IF NOT EXISTS idx_events_event_type ON ${tablePrefix}_events (event_type)`,
      `CREATE INDEX IF NOT EXISTS idx_events_status ON ${tablePrefix}_events (status)`,
      `CREATE INDEX IF NOT EXISTS idx_events_session_id ON ${tablePrefix}_events (session_id)`,
      `CREATE INDEX IF NOT EXISTS idx_events_user_id ON ${tablePrefix}_events (user_id)`,
      
      // Task events indexes
      `CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON ${tablePrefix}_task_events (task_id)`,
      `CREATE INDEX IF NOT EXISTS idx_task_events_agent_id ON ${tablePrefix}_task_events (agent_id)`,
      `CREATE INDEX IF NOT EXISTS idx_task_events_status ON ${tablePrefix}_task_events (status)`,
      `CREATE INDEX IF NOT EXISTS idx_task_events_created_at ON ${tablePrefix}_task_events (created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_task_events_started_at ON ${tablePrefix}_task_events (started_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_task_events_completed_at ON ${tablePrefix}_task_events (completed_at DESC)`,
      
      // Agent events indexes
      `CREATE INDEX IF NOT EXISTS idx_agent_events_agent_id ON ${tablePrefix}_agent_events (agent_id)`,
      `CREATE INDEX IF NOT EXISTS idx_agent_events_parent_agent_id ON ${tablePrefix}_agent_events (parent_agent_id)`,
      `CREATE INDEX IF NOT EXISTS idx_agent_events_status ON ${tablePrefix}_agent_events (status)`,
      `CREATE INDEX IF NOT EXISTS idx_agent_events_created_at ON ${tablePrefix}_agent_events (created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_agent_events_action ON ${tablePrefix}_agent_events (action)`,
      
      // Deployment events indexes
      `CREATE INDEX IF NOT EXISTS idx_deployment_events_deployment_id ON ${tablePrefix}_deployment_events (deployment_id)`,
      `CREATE INDEX IF NOT EXISTS idx_deployment_events_environment ON ${tablePrefix}_deployment_events (environment)`,
      `CREATE INDEX IF NOT EXISTS idx_deployment_events_status ON ${tablePrefix}_deployment_events (status)`,
      `CREATE INDEX IF NOT EXISTS idx_deployment_events_pr_number ON ${tablePrefix}_deployment_events (pr_number)`,
      `CREATE INDEX IF NOT EXISTS idx_deployment_events_branch_name ON ${tablePrefix}_deployment_events (branch_name)`,
      `CREATE INDEX IF NOT EXISTS idx_deployment_events_started_at ON ${tablePrefix}_deployment_events (started_at DESC)`,
      
      // Event batches indexes
      `CREATE INDEX IF NOT EXISTS idx_event_batches_batch_id ON ${tablePrefix}_event_batches (batch_id)`,
      `CREATE INDEX IF NOT EXISTS idx_event_batches_status ON ${tablePrefix}_event_batches (status)`,
      `CREATE INDEX IF NOT EXISTS idx_event_batches_created_at ON ${tablePrefix}_event_batches (created_at DESC)`
    ];

    for (const indexQuery of indexes) {
      await client.query(indexQuery);
    }

    // Create triggers for automatic timestamp updates
    console.log('[Migration 002] Creating timestamp triggers...');

    const tables = ['events', 'task_events', 'agent_events', 'deployment_events', 'event_batches'];
    
    for (const table of tables) {
      // Create trigger function if it doesn't exist
      await client.query(`
        CREATE OR REPLACE FUNCTION update_${tablePrefix}_${table}_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ language 'plpgsql'
      `);

      // Create trigger
      await client.query(`
        DROP TRIGGER IF EXISTS trigger_${tablePrefix}_${table}_updated_at ON ${tablePrefix}_${table}
      `);
      
      await client.query(`
        CREATE TRIGGER trigger_${tablePrefix}_${table}_updated_at
          BEFORE UPDATE ON ${tablePrefix}_${table}
          FOR EACH ROW
          EXECUTE FUNCTION update_${tablePrefix}_${table}_updated_at()
      `);
    }

    console.log('[Migration 002] Event storage system tables created successfully');
  },

  /**
   * Rollback the migration
   */
  async down(client, tablePrefix = 'voltagent_events') {
    console.log('[Migration 002] Rolling back event storage system tables...');

    const tables = ['events', 'task_events', 'agent_events', 'deployment_events', 'event_batches'];
    
    // Drop triggers and functions
    for (const table of tables) {
      await client.query(`DROP TRIGGER IF EXISTS trigger_${tablePrefix}_${table}_updated_at ON ${tablePrefix}_${table}`);
      await client.query(`DROP FUNCTION IF EXISTS update_${tablePrefix}_${table}_updated_at()`);
    }

    // Drop tables
    for (const table of tables) {
      await client.query(`DROP TABLE IF EXISTS ${tablePrefix}_${table} CASCADE`);
    }

    console.log('[Migration 002] Event storage system tables rolled back successfully');
  }
};

export default migration002;

