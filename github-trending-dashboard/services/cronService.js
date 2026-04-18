import cron from 'node-cron';
import { logger } from '../server.js';
import { fetchTrendingRepos, getTrendingLanguages } from './githubService.js';
import pool from '../config/database.js';
import { io } from '../server.js';

export const startCronJobs = () => {
  logger.info('🚀 Starting cron jobs...');

  // Update trending repositories every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    logger.info('🔄 Updating trending repositories...');
    try {
      await updateTrendingData();
      logger.info('✅ Trending repositories updated successfully');
    } catch (error) {
      logger.error('❌ Failed to update trending repositories:', error);
    }
  });

  // Update repository snapshots daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    logger.info('📊 Creating daily repository snapshots...');
    try {
      await createDailySnapshots();
      logger.info('✅ Daily snapshots created successfully');
    } catch (error) {
      logger.error('❌ Failed to create daily snapshots:', error);
    }
  });

  // Clean up old data weekly (Sundays at 3 AM)
  cron.schedule('0 3 * * 0', async () => {
    logger.info('🧹 Cleaning up old data...');
    try {
      await cleanupOldData();
      logger.info('✅ Old data cleaned up successfully');
    } catch (error) {
      logger.error('❌ Failed to clean up old data:', error);
    }
  });

  // Update trending languages hourly
  cron.schedule('0 * * * *', async () => {
    logger.info('🌍 Updating trending languages...');
    try {
      await updateTrendingLanguages();
      logger.info('✅ Trending languages updated successfully');
    } catch (error) {
      logger.error('❌ Failed to update trending languages:', error);
    }
  });

  logger.info('✅ All cron jobs scheduled');
};

// Update trending repositories data
const updateTrendingData = async () => {
  const client = await pool.connect();

  try {
    // Fetch trending repos for different time ranges and languages
    const timeRanges = ['day', 'week', 'month'];
    const languages = ['', 'javascript', 'python', 'typescript', 'go', 'rust', 'java'];

    for (const timeRange of timeRanges) {
      for (const language of languages) {
        try {
          const repos = await fetchTrendingRepos({
            language,
            timeRange,
            limit: 200,
            forceRefresh: true
          });

          // Upsert repositories to database
          for (const repo of repos) {
            await client.query(`
              INSERT INTO repositories (
                github_id, name, full_name, owner, owner_avatar, description,
                language, topics, stars, forks, open_issues, size,
                created_at, updated_at, pushed_at, homepage, license,
                archived, disabled, star_growth_24h, star_growth_7d, star_growth_30d,
                trending_score, last_fetched, updated_at_db
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
                $23, $24, CURRENT_TIMESTAMP
              )
              ON CONFLICT (github_id) DO UPDATE SET
                name = EXCLUDED.name,
                full_name = EXCLUDED.full_name,
                owner = EXCLUDED.owner,
                owner_avatar = EXCLUDED.owner_avatar,
                description = EXCLUDED.description,
                language = EXCLUDED.language,
                topics = EXCLUDED.topics,
                stars = EXCLUDED.stars,
                forks = EXCLUDED.forks,
                open_issues = EXCLUDED.open_issues,
                size = EXCLUDED.size,
                updated_at = EXCLUDED.updated_at,
                pushed_at = EXCLUDED.pushed_at,
                homepage = EXCLUDED.homepage,
                license = EXCLUDED.license,
                archived = EXCLUDED.archived,
                disabled = EXCLUDED.disabled,
                star_growth_24h = EXCLUDED.star_growth_24h,
                star_growth_7d = EXCLUDED.star_growth_7d,
                star_growth_30d = EXCLUDED.star_growth_30d,
                trending_score = EXCLUDED.trending_score,
                last_fetched = EXCLUDED.last_fetched,
                updated_at_db = CURRENT_TIMESTAMP
            `, [
              repo.github_id, repo.name, repo.full_name, repo.owner, repo.owner_avatar,
              repo.description, repo.language, repo.topics, repo.stars, repo.forks,
              repo.open_issues, repo.size, repo.created_at, repo.updated_at, repo.pushed_at,
              repo.homepage, repo.license, repo.archived, repo.disabled,
              repo.star_growth_24h, repo.star_growth_7d, repo.star_growth_30d,
              repo.trending_score, new Date()
            ]);
          }

          logger.info(`✅ Updated ${repos.length} repos for ${language || 'all'} languages, ${timeRange} range`);

        } catch (error) {
          logger.error(`❌ Failed to update repos for ${language || 'all'} languages, ${timeRange} range:`, error);
        }
      }
    }

    // Notify connected clients about data update
    io.emit('data-updated', {
      type: 'trending-repos',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('❌ Error updating trending data:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Create daily snapshots for trend analysis
const createDailySnapshots = async () => {
  const client = await pool.connect();

  try {
    const today = new Date().toISOString().split('T')[0];

    // Get all repositories
    const reposResult = await client.query(`
      SELECT id, github_id, stars, forks, open_issues
      FROM repositories
      WHERE last_fetched >= CURRENT_DATE - INTERVAL '1 day'
    `);

    const repos = reposResult.rows;

    // Create snapshots
    for (const repo of repos) {
      await client.query(`
        INSERT INTO repo_snapshots (repo_id, stars, forks, open_issues, snapshot_date)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (repo_id, snapshot_date) DO UPDATE SET
          stars = EXCLUDED.stars,
          forks = EXCLUDED.forks,
          open_issues = EXCLUDED.open_issues
      `, [repo.id, repo.stars, repo.forks, repo.open_issues, today]);
    }

    logger.info(`✅ Created snapshots for ${repos.length} repositories`);

  } catch (error) {
    logger.error('❌ Error creating daily snapshots:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Clean up old data (keep last 90 days of snapshots)
const cleanupOldData = async () => {
  const client = await pool.connect();

  try {
    // Delete old snapshots
    const snapshotResult = await client.query(`
      DELETE FROM repo_snapshots
      WHERE snapshot_date < CURRENT_DATE - INTERVAL '90 days'
    `);

    // Delete old search history (keep last 30 days)
    const searchResult = await client.query(`
      DELETE FROM search_history
      WHERE created_at < CURRENT_DATE - INTERVAL '30 days'
    `);

    // Delete old notifications (keep last 30 days)
    const notificationResult = await client.query(`
      DELETE FROM notifications
      WHERE created_at < CURRENT_DATE - INTERVAL '30 days'
    `);

    logger.info(`🧹 Cleaned up ${snapshotResult.rowCount} snapshots, ${searchResult.rowCount} search records, ${notificationResult.rowCount} notifications`);

  } catch (error) {
    logger.error('❌ Error cleaning up old data:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Update trending languages data
const updateTrendingLanguages = async () => {
  try {
    const languages = await getTrendingLanguages();

    // Store in cache (already cached by the service)
    // Could also store in database if needed for historical tracking

    logger.info(`✅ Updated trending languages: ${languages.slice(0, 5).map(l => l.language).join(', ')}`);

  } catch (error) {
    logger.error('❌ Error updating trending languages:', error);
    throw error;
  }
};