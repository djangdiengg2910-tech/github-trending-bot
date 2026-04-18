import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import pool from '../config/database.js';
import {
  fetchTrendingRepos,
  fetchRepoDetails,
  searchRepos,
  getTrendingLanguages
} from '../services/githubService.js';
import { searchRateLimiter } from '../middleware/rateLimiter.js';
import { logger } from '../server.js';

const router = express.Router();

// ── Get trending repositories ────────────────────────────────────────────────
router.get('/trending', [
  query('language').optional().isString().trim(),
  query('timeRange').optional().isIn(['day', 'week', 'month']).withMessage('timeRange must be day, week, or month'),
  query('sortBy').optional().isIn(['stars', 'forks', 'updated', 'trending']).withMessage('sortBy must be stars, forks, updated, or trending'),
  query('minStars').optional().isInt({ min: 0 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('page').optional().isInt({ min: 1 }).toInt()
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

    const {
      language = '',
      timeRange = 'week',
      sortBy = 'trending',
      minStars = 0,
      limit = 50,
      page = 1
    } = req.query;

    logger.info(`📊 Fetching trending repos: lang=${language}, time=${timeRange}, sort=${sortBy}, minStars=${minStars}, limit=${limit}, page=${page}`);

    const repos = await fetchTrendingRepos({
      language,
      timeRange,
      sortBy,
      minStars,
      limit: limit * page, // Fetch more to handle pagination
      forceRefresh: false
    });

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedRepos = repos.slice(startIndex, endIndex);

    // Get total count from database for more accurate pagination
    const client = await pool.connect();
    let totalCount = repos.length;

    try {
      if (language || minStars > 0) {
        const countQuery = `
          SELECT COUNT(*) as count
          FROM repositories
          WHERE stars >= $1
          ${language ? 'AND language = $2' : ''}
          AND last_fetched >= CURRENT_DATE - INTERVAL '${timeRange === 'day' ? '1 day' : timeRange === 'month' ? '30 days' : '7 days'}'
        `;
        const countParams = language ? [minStars, language] : [minStars];
        const countResult = await client.query(countQuery, countParams);
        totalCount = parseInt(countResult.rows[0].count);
      }
    } catch (error) {
      logger.warn('Could not get accurate count from database:', error.message);
    } finally {
      client.release();
    }

    res.json({
      success: true,
      data: {
        repos: paginatedRepos,
        pagination: {
          page,
          limit,
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        },
        filters: {
          language,
          timeRange,
          sortBy,
          minStars
        }
      }
    });

  } catch (error) {
    logger.error('❌ Error fetching trending repos:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trending repositories'
    });
  }
});

// ── Get repository details ───────────────────────────────────────────────────
router.get('/details/:owner/:name', [
  param('owner').isString().trim().notEmpty(),
  param('name').isString().trim().notEmpty()
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

    const { owner, name } = req.params;

    logger.info(`📋 Fetching repo details: ${owner}/${name}`);

    const repoDetails = await fetchRepoDetails(owner, name);

    res.json({
      success: true,
      data: repoDetails
    });

  } catch (error) {
    logger.error(`❌ Error fetching repo details for ${req.params.owner}/${req.params.name}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch repository details'
    });
  }
});

// ── Search repositories ──────────────────────────────────────────────────────
router.get('/search', searchRateLimiter, [
  query('q').isString().trim().notEmpty().withMessage('Search query is required'),
  query('language').optional().isString().trim(),
  query('minStars').optional().isInt({ min: 0 }).toInt(),
  query('maxStars').optional().isInt({ min: 0 }).toInt(),
  query('sortBy').optional().isIn(['best-match', 'stars', 'forks', 'updated']).withMessage('sortBy must be best-match, stars, forks, or updated'),
  query('order').optional().isIn(['asc', 'desc']).withMessage('order must be asc or desc'),
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

    const {
      q: query,
      language,
      minStars = 0,
      maxStars,
      sortBy = 'best-match',
      order = 'desc',
      limit = 50
    } = req.query;

    logger.info(`🔍 Searching repos: "${query}", lang=${language}, stars=${minStars}-${maxStars}, sort=${sortBy}, limit=${limit}`);

    const repos = await searchRepos(query, {
      language,
      minStars,
      maxStars,
      sortBy,
      order,
      limit
    });

    res.json({
      success: true,
      data: {
        repos,
        query,
        filters: {
          language,
          minStars,
          maxStars,
          sortBy,
          order
        }
      }
    });

  } catch (error) {
    logger.error('❌ Error searching repos:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search repositories'
    });
  }
});

// ── Get trending languages ───────────────────────────────────────────────────
router.get('/languages/trending', async (req, res) => {
  try {
    logger.info('🌍 Fetching trending languages');

    const languages = await getTrendingLanguages();

    res.json({
      success: true,
      data: languages
    });

  } catch (error) {
    logger.error('❌ Error fetching trending languages:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch trending languages'
    });
  }
});

// ── Get repository statistics ────────────────────────────────────────────────
router.get('/stats/:owner/:name', [
  param('owner').isString().trim().notEmpty(),
  param('name').isString().trim().notEmpty(),
  query('days').optional().isInt({ min: 1, max: 365 }).toInt()
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

    const { owner, name } = req.params;
    const days = req.query.days || 30;

    logger.info(`📈 Fetching repo stats: ${owner}/${name}, ${days} days`);

    const client = await pool.connect();

    try {
      // Get repository snapshots for trend analysis
      const result = await client.query(`
        SELECT rs.snapshot_date, rs.stars, rs.forks, rs.open_issues,
               r.name, r.full_name, r.language
        FROM repo_snapshots rs
        JOIN repositories r ON rs.repo_id = r.id
        WHERE r.full_name = $1
          AND rs.snapshot_date >= CURRENT_DATE - INTERVAL '${days} days'
        ORDER BY rs.snapshot_date ASC
      `, [`${owner}/${name}`]);

      const snapshots = result.rows;

      if (snapshots.length === 0) {
        return res.json({
          success: true,
          data: {
            repository: `${owner}/${name}`,
            days,
            snapshots: [],
            growth: {
              stars: 0,
              forks: 0,
              issues: 0
            }
          }
        });
      }

      // Calculate growth
      const first = snapshots[0];
      const last = snapshots[snapshots.length - 1];

      const growth = {
        stars: last.stars - first.stars,
        forks: last.forks - first.forks,
        issues: last.open_issues - first.open_issues
      };

      res.json({
        success: true,
        data: {
          repository: `${owner}/${name}`,
          language: snapshots[0].language,
          days,
          snapshots,
          growth
        }
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error(`❌ Error fetching repo stats for ${req.params.owner}/${req.params.name}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch repository statistics'
    });
  }
});

// ── Get user's favorite repositories ──────────────────────────────────────────
router.get('/favorites/:userId', [
  param('userId').isInt().toInt()
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

    const { userId } = req.params;

    logger.info(`⭐ Fetching favorites for user ${userId}`);

    const client = await pool.connect();

    try {
      const result = await client.query(`
        SELECT r.*, uf.created_at as favorited_at
        FROM user_favorites uf
        JOIN repositories r ON uf.repo_id = r.id
        WHERE uf.user_id = $1
        ORDER BY uf.created_at DESC
      `, [userId]);

      res.json({
        success: true,
        data: result.rows
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error(`❌ Error fetching favorites for user ${req.params.userId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch favorite repositories'
    });
  }
});

// ── Add repository to favorites ──────────────────────────────────────────────
router.post('/favorites', [
  body('userId').isInt().toInt(),
  body('repoId').isInt().toInt()
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

    const { userId, repoId } = req.body;

    logger.info(`➕ Adding favorite: user ${userId}, repo ${repoId}`);

    const client = await pool.connect();

    try {
      await client.query(`
        INSERT INTO user_favorites (user_id, repo_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, repo_id) DO NOTHING
      `, [userId, repoId]);

      res.json({
        success: true,
        message: 'Repository added to favorites'
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error adding favorite:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add repository to favorites'
    });
  }
});

// ── Remove repository from favorites ──────────────────────────────────────────
router.delete('/favorites/:userId/:repoId', [
  param('userId').isInt().toInt(),
  param('repoId').isInt().toInt()
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

    const { userId, repoId } = req.params;

    logger.info(`➖ Removing favorite: user ${userId}, repo ${repoId}`);

    const client = await pool.connect();

    try {
      const result = await client.query(`
        DELETE FROM user_favorites
        WHERE user_id = $1 AND repo_id = $2
      `, [userId, repoId]);

      if (result.rowCount === 0) {
        return res.status(404).json({
          success: false,
          error: 'Favorite not found'
        });
      }

      res.json({
        success: true,
        message: 'Repository removed from favorites'
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error removing favorite:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove repository from favorites'
    });
  }
});

export default router;