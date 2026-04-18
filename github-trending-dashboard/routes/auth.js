// Auth routes are handled in users.js
// This file exists for future expansion of auth-specific routes

import express from 'express';
import { authenticateToken } from './users.js';

const router = express.Router();

// ── Verify token endpoint ────────────────────────────────────────────────────
router.post('/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    data: {
      user: req.user,
      valid: true
    }
  });
});

// ── Logout (client-side token removal) ───────────────────────────────────────
router.post('/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

export default router;