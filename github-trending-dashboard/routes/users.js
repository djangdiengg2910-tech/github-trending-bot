import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import pool from '../config/database.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { logger } from '../server.js';

const router = express.Router();

// ── User registration ────────────────────────────────────────────────────────
router.post('/register', authRateLimiter, [
  body('username').isLength({ min: 3, max: 30 }).withMessage('Username must be 3-30 characters'),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
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

    const { username, email, password } = req.body;

    logger.info(`👤 Registering new user: ${username} (${email})`);

    const client = await pool.connect();

    try {
      // Check if user already exists
      const existingUser = await client.query(
        'SELECT id FROM users WHERE email = $1 OR username = $2',
        [email, username]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'User with this email or username already exists'
        });
      }

      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user
      const result = await client.query(`
        INSERT INTO users (username, email, password_hash)
        VALUES ($1, $2, $3)
        RETURNING id, username, email, created_at
      `, [username, email, passwordHash]);

      const user = result.rows[0];

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      logger.info(`✅ User registered successfully: ${username} (ID: ${user.id})`);

      res.status(201).json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            created_at: user.created_at
          },
          token
        }
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error registering user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to register user'
    });
  }
});

// ── User login ───────────────────────────────────────────────────────────────
router.post('/login', authRateLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required')
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

    const { email, password } = req.body;

    logger.info(`🔐 Login attempt for: ${email}`);

    const client = await pool.connect();

    try {
      // Find user
      const result = await client.query(
        'SELECT id, username, email, password_hash, preferences FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      const user = result.rows[0];

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: 'Invalid email or password'
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.id, username: user.username },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      logger.info(`✅ User logged in successfully: ${user.username} (ID: ${user.id})`);

      res.json({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            preferences: user.preferences
          },
          token
        }
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error logging in user:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to login'
    });
  }
});

// ── Get user profile ─────────────────────────────────────────────────────────
router.get('/profile', async (req, res) => {
  try {
    // This would typically use authentication middleware
    // For now, we'll assume user ID comes from JWT token
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const client = await pool.connect();

    try {
      const result = await client.query(`
        SELECT id, username, email, avatar_url, preferences, created_at, updated_at
        FROM users
        WHERE id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const user = result.rows[0];

      res.json({
        success: true,
        data: { user }
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user profile'
    });
  }
});

// ── Update user preferences ──────────────────────────────────────────────────
router.put('/preferences', [
  body('favoriteLanguages').optional().isArray(),
  body('emailNotifications').optional().isBoolean(),
  body('theme').optional().isIn(['light', 'dark', 'auto'])
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

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { favoriteLanguages, emailNotifications, theme } = req.body;

    const client = await pool.connect();

    try {
      // Get current preferences
      const currentResult = await client.query(
        'SELECT preferences FROM users WHERE id = $1',
        [userId]
      );

      if (currentResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      const currentPrefs = currentResult.rows[0].preferences || {};
      const updatedPrefs = {
        ...currentPrefs,
        ...(favoriteLanguages !== undefined && { favoriteLanguages }),
        ...(emailNotifications !== undefined && { emailNotifications }),
        ...(theme !== undefined && { theme })
      };

      // Update preferences
      await client.query(`
        UPDATE users
        SET preferences = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [JSON.stringify(updatedPrefs), userId]);

      logger.info(`✅ Updated preferences for user ${userId}`);

      res.json({
        success: true,
        data: { preferences: updatedPrefs }
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error updating user preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update preferences'
    });
  }
});

// ── Get user's activity ──────────────────────────────────────────────────────
router.get('/activity', async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const client = await pool.connect();

    try {
      // Get recent search history
      const searchHistory = await client.query(`
        SELECT query, filters, created_at
        FROM search_history
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 20
      `, [userId]);

      // Get recent notifications
      const notifications = await client.query(`
        SELECT id, type, title, message, read, created_at
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `, [userId]);

      res.json({
        success: true,
        data: {
          search_history: searchHistory.rows,
          notifications: notifications.rows
        }
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error fetching user activity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user activity'
    });
  }
});

// ── Middleware to verify JWT token ───────────────────────────────────────────
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Access token required'
    });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, decoded) => {
    if (err) {
      return res.status(403).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    req.user = decoded;
    next();
  });
};

export default router;