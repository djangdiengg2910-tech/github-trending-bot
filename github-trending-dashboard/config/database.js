import pkg from 'pg';
import { logger } from '../server.js';

const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'github_trending',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Event handlers
pool.on('connect', (client) => {
  logger.info('New client connected to database');
});

pool.on('error', (err, client) => {
  logger.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Test database connection
export const testConnection = async () => {
  try {
    const client = await pool.connect();
    logger.info('✅ Database connected successfully');
    client.release();
    return true;
  } catch (err) {
    logger.error('❌ Database connection failed:', err);
    return false;
  }
};

// Initialize database tables
export const initializeDatabase = async () => {
  try {
    await testConnection();

    // Create tables
    await createTables();

    logger.info('✅ Database initialized successfully');
  } catch (error) {
    logger.error('❌ Database initialization failed:', error);
    throw error;
  }
};

// Create database tables
const createTables = async () => {
  const client = await pool.connect();

  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        avatar_url VARCHAR(500),
        github_id VARCHAR(255),
        preferences JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Repositories table
    await client.query(`
      CREATE TABLE IF NOT EXISTS repositories (
        id SERIAL PRIMARY KEY,
        github_id BIGINT UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        owner VARCHAR(255) NOT NULL,
        owner_avatar VARCHAR(500),
        description TEXT,
        language VARCHAR(100),
        topics TEXT[],
        stars INTEGER DEFAULT 0,
        forks INTEGER DEFAULT 0,
        open_issues INTEGER DEFAULT 0,
        size INTEGER DEFAULT 0,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        pushed_at TIMESTAMP,
        homepage VARCHAR(500),
        license VARCHAR(100),
        archived BOOLEAN DEFAULT FALSE,
        disabled BOOLEAN DEFAULT FALSE,
        star_growth_24h INTEGER DEFAULT 0,
        star_growth_7d INTEGER DEFAULT 0,
        star_growth_30d INTEGER DEFAULT 0,
        trending_score DECIMAL(10,4) DEFAULT 0,
        last_fetched TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at_db TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at_db TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Repository snapshots for trend analysis
    await client.query(`
      CREATE TABLE IF NOT EXISTS repo_snapshots (
        id SERIAL PRIMARY KEY,
        repo_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
        stars INTEGER NOT NULL,
        forks INTEGER NOT NULL,
        open_issues INTEGER NOT NULL,
        snapshot_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(repo_id, snapshot_date)
      )
    `);

    // User favorites/watchlist
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_favorites (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        repo_id INTEGER REFERENCES repositories(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, repo_id)
      )
    `);

    // Notifications
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        data JSONB DEFAULT '{}',
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Search history
    await client.query(`
      CREATE TABLE IF NOT EXISTS search_history (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        query VARCHAR(500) NOT NULL,
        filters JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_repositories_stars ON repositories(stars DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_repositories_language ON repositories(language)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_repositories_trending_score ON repositories(trending_score DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_repositories_updated_at ON repositories(updated_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_repo_snapshots_repo_date ON repo_snapshots(repo_id, snapshot_date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read)`);

    logger.info('✅ Database tables created successfully');
  } catch (error) {
    logger.error('❌ Error creating tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

export default pool;