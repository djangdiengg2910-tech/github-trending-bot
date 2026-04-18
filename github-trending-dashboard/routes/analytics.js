import express from 'express';
import { query, validationResult } from 'express-validator';
import pool from '../config/database.js';
import { cacheGet, cacheSet } from '../config/redis.js';
import { logger } from '../server.js';

const router = express.Router();

// ── Get trend analytics ──────────────────────────────────────────────────────
router.get('/trends', [
  query('period').optional().isIn(['day', 'week', 'month', 'year']).withMessage('period must be day, week, month, or year'),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { period = 'week', limit = 50 } = req.query;

    logger.info(`📊 Fetching trend analytics for ${period}, limit ${limit}`);

    const cacheKey = `analytics:trends:${period}:${limit}`;
    const cached = await cacheGet(cacheKey);

    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    const client = await pool.connect();

    try {
      // Calculate date range
      const now = new Date();
      let startDate;

      switch (period) {
        case 'day':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'year':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      // Get top trending repositories
      const trendingQuery = `
        SELECT
          r.id, r.name, r.full_name, r.owner, r.owner_avatar, r.language,
          r.stars, r.forks, r.trending_score,
          r.star_growth_24h, r.star_growth_7d, r.star_growth_30d,
          r.last_fetched
        FROM repositories r
        WHERE r.last_fetched >= $1
        ORDER BY r.trending_score DESC
        LIMIT $2
      `;

      const trendingResult = await client.query(trendingQuery, [startDate, limit]);
      const trendingRepos = trendingResult.rows;

      // Get language trends
      const languageQuery = `
        SELECT
          language,
          COUNT(*) as repo_count,
          SUM(stars) as total_stars,
          AVG(stars) as avg_stars,
          SUM(star_growth_7d) as total_growth_7d
        FROM repositories
        WHERE language IS NOT NULL
          AND last_fetched >= $1
        GROUP BY language
        ORDER BY total_growth_7d DESC
        LIMIT 20
      `;

      const languageResult = await client.query(languageQuery, [startDate]);
      const languageTrends = languageResult.rows.map(lang => ({
        ...lang,
        avg_stars: Math.round(lang.avg_stars),
        growth_rate: lang.repo_count > 0 ? Math.round(lang.total_growth_7d / lang.repo_count) : 0
      }));

      // Get daily growth statistics
      const dailyStatsQuery = `
        SELECT
          DATE(snapshot_date) as date,
          COUNT(*) as total_repos,
          SUM(stars) as total_stars,
          AVG(stars) as avg_stars
        FROM repo_snapshots
        WHERE snapshot_date >= $1
        GROUP BY DATE(snapshot_date)
        ORDER BY date ASC
      `;

      const dailyStatsResult = await client.query(dailyStatsQuery, [startDate]);
      const dailyStats = dailyStatsResult.rows;

      // Generate insights
      const insights = generateInsights(trendingRepos, languageTrends, dailyStats, period);

      const analytics = {
        period,
        trending_repos: trendingRepos,
        language_trends: languageTrends,
        daily_stats: dailyStats,
        insights,
        generated_at: new Date().toISOString()
      };

      // Cache for 1 hour
      await cacheSet(cacheKey, analytics, 3600);

      res.json({
        success: true,
        data: analytics
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error fetching trend analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trend analytics'
    });
  }
});

// ── Get top gaining repositories ─────────────────────────────────────────────
router.get('/top-gainers', [
  query('period').optional().isIn(['24h', '7d', '30d']).withMessage('period must be 24h, 7d, or 30d'),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { period = '7d', limit = 50 } = req.query;

    logger.info(`🚀 Fetching top gainers for ${period}, limit ${limit}`);

    const cacheKey = `analytics:gainers:${period}:${limit}`;
    const cached = await cacheGet(cacheKey);

    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    const client = await pool.connect();

    try {
      let growthColumn;
      switch (period) {
        case '24h':
          growthColumn = 'star_growth_24h';
          break;
        case '7d':
          growthColumn = 'star_growth_7d';
          break;
        case '30d':
          growthColumn = 'star_growth_30d';
          break;
        default:
          growthColumn = 'star_growth_7d';
      }

      const query = `
        SELECT
          id, name, full_name, owner, owner_avatar, language,
          stars, forks, ${growthColumn} as growth,
          trending_score, last_fetched
        FROM repositories
        WHERE ${growthColumn} > 0
          AND last_fetched >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY ${growthColumn} DESC
        LIMIT $1
      `;

      const result = await client.query(query, [limit]);
      const gainers = result.rows;

      // Cache for 30 minutes
      await cacheSet(cacheKey, gainers, 1800);

      res.json({
        success: true,
        data: {
          period,
          gainers,
          generated_at: new Date().toISOString()
        }
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error fetching top gainers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch top gaining repositories'
    });
  }
});

// ── Get language comparison ──────────────────────────────────────────────────
router.get('/languages/compare', [
  query('languages').isString().withMessage('languages parameter is required'),
  query('period').optional().isIn(['day', 'week', 'month']).withMessage('period must be day, week, or month')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { languages, period = 'week' } = req.query;
    const languageList = languages.split(',').map(l => l.trim()).slice(0, 5); // Max 5 languages

    logger.info(`⚖️ Comparing languages: ${languageList.join(', ')} for ${period}`);

    const cacheKey = `analytics:lang-compare:${languageList.join(',')}:${period}`;
    const cached = await cacheGet(cacheKey);

    if (cached) {
      return res.json({
        success: true,
        data: cached,
        cached: true
      });
    }

    const client = await pool.connect();

    try {
      // Calculate date range
      const now = new Date();
      let startDate;

      switch (period) {
        case 'day':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      }

      const comparison = [];

      for (const language of languageList) {
        const query = `
          SELECT
            COUNT(*) as repo_count,
            SUM(stars) as total_stars,
            AVG(stars) as avg_stars,
            SUM(star_growth_7d) as total_growth_7d,
            SUM(star_growth_30d) as total_growth_30d,
            AVG(trending_score) as avg_trending_score
          FROM repositories
          WHERE language = $1
            AND last_fetched >= $2
        `;

        const result = await client.query(query, [language, startDate]);
        const stats = result.rows[0];

        if (stats.repo_count > 0) {
          comparison.push({
            language,
            repo_count: parseInt(stats.repo_count),
            total_stars: parseInt(stats.total_stars || 0),
            avg_stars: Math.round(parseFloat(stats.avg_stars || 0)),
            total_growth_7d: parseInt(stats.total_growth_7d || 0),
            total_growth_30d: parseInt(stats.total_growth_30d || 0),
            avg_trending_score: Math.round(parseFloat(stats.avg_trending_score || 0) * 10000) / 10000,
            growth_rate_7d: Math.round((parseInt(stats.total_growth_7d || 0) / parseInt(stats.repo_count)) * 100) / 100,
            growth_rate_30d: Math.round((parseInt(stats.total_growth_30d || 0) / parseInt(stats.repo_count)) * 100) / 100
          });
        }
      }

      // Sort by total stars descending
      comparison.sort((a, b) => b.total_stars - a.total_stars);

      const result = {
        languages: languageList,
        period,
        comparison,
        generated_at: new Date().toISOString()
      };

      // Cache for 1 hour
      await cacheSet(cacheKey, result, 3600);

      res.json({
        success: true,
        data: result
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error comparing languages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compare languages'
    });
  }
});

// ── Generate insights from analytics data ────────────────────────────────────
function generateInsights(trendingRepos, languageTrends, dailyStats, period) {
  const insights = [];

  // Top trending repository
  if (trendingRepos.length > 0) {
    const topRepo = trendingRepos[0];
    insights.push({
      type: 'top_repo',
      title: 'Top Trending Repository',
      description: `${topRepo.full_name} is leading with a trending score of ${topRepo.trending_score.toFixed(4)}`,
      data: {
        repo: topRepo.full_name,
        score: topRepo.trending_score,
        language: topRepo.language,
        stars: topRepo.stars
      }
    });
  }

  // Fastest growing language
  if (languageTrends.length > 0) {
    const fastestGrowing = languageTrends.reduce((prev, current) =>
      (prev.growth_rate > current.growth_rate) ? prev : current
    );

    if (fastestGrowing.growth_rate > 0) {
      insights.push({
        type: 'fastest_growing_language',
        title: 'Fastest Growing Language',
        description: `${fastestGrowing.language} repositories are growing at ${fastestGrowing.growth_rate} stars per repo this ${period}`,
        data: {
          language: fastestGrowing.language,
          growth_rate: fastestGrowing.growth_rate,
          repo_count: fastestGrowing.repo_count
        }
      });
    }
  }

  // Most popular language
  if (languageTrends.length > 0) {
    const mostPopular = languageTrends.reduce((prev, current) =>
      (prev.total_stars > current.total_stars) ? prev : current
    );

    insights.push({
      type: 'most_popular_language',
      title: 'Most Popular Language',
      description: `${mostPopular.language} has the most stars with ${mostPopular.total_stars.toLocaleString()} total stars across ${mostPopular.repo_count} repositories`,
      data: {
        language: mostPopular.language,
        total_stars: mostPopular.total_stars,
        repo_count: mostPopular.repo_count
      }
    });
  }

  // Growth trend
  if (dailyStats.length >= 2) {
    const recent = dailyStats.slice(-7); // Last 7 days
    if (recent.length >= 2) {
      const first = recent[0];
      const last = recent[recent.length - 1];
      const growth = ((last.total_stars - first.total_stars) / first.total_stars) * 100;

      insights.push({
        type: 'overall_growth',
        title: 'Overall Growth Trend',
        description: `Total stars ${growth >= 0 ? 'increased' : 'decreased'} by ${Math.abs(growth).toFixed(1)}% in the last 7 days`,
        data: {
          growth_percentage: growth,
          start_stars: first.total_stars,
          end_stars: last.total_stars
        }
      });
    }
  }

  // New emerging languages
  const emergingLanguages = languageTrends
    .filter(lang => lang.repo_count >= 5 && lang.growth_rate > 10)
    .sort((a, b) => b.growth_rate - a.growth_rate)
    .slice(0, 3);

  if (emergingLanguages.length > 0) {
    insights.push({
      type: 'emerging_languages',
      title: 'Emerging Languages',
      description: `${emergingLanguages.map(l => l.language).join(', ')} are showing strong growth with high star acquisition rates`,
      data: {
        languages: emergingLanguages.map(l => ({
          name: l.language,
          growth_rate: l.growth_rate
        }))
      }
    });
  }

  return insights;
}

export default router;