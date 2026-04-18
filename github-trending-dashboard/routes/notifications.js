import express from 'express';
import { body, param, query, validationResult } from 'express-validator';
import pool from '../config/database.js';
import { logger } from '../server.js';
import nodemailer from 'nodemailer';

const router = express.Router();

// Email transporter (configure with your email service)
const emailTransporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// ── Get user notifications ───────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    const client = await pool.connect();

    try {
      let query = `
        SELECT id, type, title, message, data, read, created_at
        FROM notifications
        WHERE user_id = $1
      `;

      const params = [userId];
      let paramIndex = 2;

      if (unreadOnly === 'true') {
        query += ` AND read = false`;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, (page - 1) * limit);

      const result = await client.query(query, params);
      const notifications = result.rows;

      // Get total count
      const countQuery = `
        SELECT COUNT(*) as total
        FROM notifications
        WHERE user_id = $1 ${unreadOnly === 'true' ? 'AND read = false' : ''}
      `;
      const countResult = await client.query(countQuery, [userId]);
      const total = parseInt(countResult.rows[0].total);

      res.json({
        success: true,
        data: {
          notifications,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error fetching notifications:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch notifications'
    });
  }
});

// ── Mark notification as read ────────────────────────────────────────────────
router.put('/:id/read', [
  param('id').isInt().toInt()
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
    const notificationId = req.params.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const client = await pool.connect();

    try {
      const result = await client.query(`
        UPDATE notifications
        SET read = true
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `, [notificationId, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Notification not found'
        });
      }

      res.json({
        success: true,
        message: 'Notification marked as read'
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark notification as read'
    });
  }
});

// ── Mark all notifications as read ───────────────────────────────────────────
router.put('/read-all', async (req, res) => {
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
      await client.query(`
        UPDATE notifications
        SET read = true
        WHERE user_id = $1 AND read = false
      `, [userId]);

      res.json({
        success: true,
        message: 'All notifications marked as read'
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error marking all notifications as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark all notifications as read'
    });
  }
});

// ── Create notification (internal use) ───────────────────────────────────────
export const createNotification = async (userId, type, title, message, data = {}) => {
  try {
    const client = await pool.connect();

    try {
      await client.query(`
        INSERT INTO notifications (user_id, type, title, message, data)
        VALUES ($1, $2, $3, $4, $5)
      `, [userId, type, title, message, JSON.stringify(data)]);

      logger.info(`📬 Created notification for user ${userId}: ${title}`);

      // Emit real-time notification via Socket.io
      const { io } = await import('../server.js');
      io.to(`user-${userId}`).emit('notification', {
        type,
        title,
        message,
        data,
        created_at: new Date().toISOString()
      });

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error creating notification:', error);
  }
};

// ── Send email notification ──────────────────────────────────────────────────
const sendEmailNotification = async (email, subject, htmlContent) => {
  try {
    if (!emailTransporter || !process.env.SMTP_HOST) {
      logger.warn('Email service not configured, skipping email notification');
      return;
    }

    await emailTransporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@githubtrending.com',
      to: email,
      subject,
      html: htmlContent
    });

    logger.info(`📧 Email sent to ${email}: ${subject}`);

  } catch (error) {
    logger.error('❌ Error sending email notification:', error);
  }
};

// ── Check for trending alerts ────────────────────────────────────────────────
export const checkTrendingAlerts = async () => {
  try {
    const client = await pool.connect();

    try {
      // Get users with email notifications enabled
      const usersResult = await client.query(`
        SELECT id, email, preferences
        FROM users
        WHERE preferences->>'emailNotifications' = 'true'
      `);

      const users = usersResult.rows;

      for (const user of users) {
        const preferences = user.preferences || {};
        const favoriteLanguages = preferences.favoriteLanguages || [];

        if (favoriteLanguages.length === 0) continue;

        // Check for trending repos in favorite languages
        for (const language of favoriteLanguages) {
          const trendingQuery = `
            SELECT name, full_name, stars, trending_score
            FROM repositories
            WHERE language = $1
              AND last_fetched >= CURRENT_DATE - INTERVAL '1 day'
              AND trending_score > 0.5
            ORDER BY trending_score DESC
            LIMIT 3
          `;

          const trendingResult = await client.query(trendingQuery, [language]);

          if (trendingResult.rows.length > 0) {
            const topRepos = trendingResult.rows;

            // Create notification
            await createNotification(
              user.id,
              'trending_alert',
              `Trending ${language} repositories`,
              `${topRepos.length} ${language} repositories are trending today!`,
              {
                language,
                repositories: topRepos.map(repo => ({
                  name: repo.name,
                  full_name: repo.full_name,
                  stars: repo.stars,
                  score: repo.trending_score
                }))
              }
            );

            // Send email if configured
            if (user.email && process.env.SMTP_HOST) {
              const repoList = topRepos.map(repo =>
                `<li><strong>${repo.full_name}</strong> - ${repo.stars} stars</li>`
              ).join('');

              const emailHtml = `
                <h2>Trending ${language} Repositories</h2>
                <p>Here are the top trending ${language} repositories today:</p>
                <ul>${repoList}</ul>
                <p><a href="${process.env.CLIENT_URL || 'http://localhost:3000'}">View on GitHub Trending Dashboard</a></p>
              `;

              await sendEmailNotification(
                user.email,
                `Trending ${language} Repositories - GitHub Trending`,
                emailHtml
              );
            }
          }
        }
      }

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error checking trending alerts:', error);
  }
};

// ── Check for star milestone alerts ──────────────────────────────────────────
export const checkStarMilestones = async () => {
  try {
    const client = await pool.connect();

    try {
      // Get repositories that recently crossed star milestones
      const milestones = [100, 500, 1000, 5000, 10000, 50000, 100000];

      for (const milestone of milestones) {
        // Find repos that crossed this milestone recently
        const query = `
          SELECT r.id, r.name, r.full_name, r.stars, r.language
          FROM repositories r
          WHERE r.stars >= $1
            AND r.stars < $1 * 1.1  -- Within 10% of milestone
            AND r.last_fetched >= CURRENT_DATE - INTERVAL '1 day'
          ORDER BY r.stars DESC
          LIMIT 10
        `;

        const result = await client.query(query, [milestone]);
        const repos = result.rows;

        for (const repo of repos) {
          // Check if we already notified about this milestone
          const existingNotification = await client.query(`
            SELECT id FROM notifications
            WHERE type = 'star_milestone'
              AND data->>'repo_id' = $1
              AND data->>'milestone' = $2
              AND created_at >= CURRENT_DATE
          `, [repo.id.toString(), milestone.toString()]);

          if (existingNotification.rows.length === 0) {
            // Get users who have this repo in favorites
            const usersResult = await client.query(`
              SELECT DISTINCT u.id, u.email
              FROM user_favorites uf
              JOIN users u ON uf.user_id = u.id
              WHERE uf.repo_id = $1
                AND u.preferences->>'emailNotifications' = 'true'
            `, [repo.id]);

            for (const user of usersResult.rows) {
              await createNotification(
                user.id,
                'star_milestone',
                'Star Milestone Reached!',
                `${repo.full_name} just reached ${repo.stars} stars!`,
                {
                  repo_id: repo.id,
                  repo_name: repo.full_name,
                  milestone,
                  current_stars: repo.stars
                }
              );

              // Send email
              if (user.email && process.env.SMTP_HOST) {
                const emailHtml = `
                  <h2>Congratulations! 🎉</h2>
                  <p><strong>${repo.full_name}</strong> just reached <strong>${repo.stars} stars</strong>!</p>
                  <p>This repository has crossed the ${milestone} star milestone.</p>
                  <p><a href="https://github.com/${repo.full_name}">View on GitHub</a> | <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}">View on Dashboard</a></p>
                `;

                await sendEmailNotification(
                  user.email,
                  `${repo.full_name} reached ${repo.stars} stars!`,
                  emailHtml
                );
              }
            }
          }
        }
      }

    } finally {
      client.release();
    }

  } catch (error) {
    logger.error('❌ Error checking star milestones:', error);
  }
};

export default router;