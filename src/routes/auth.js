const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan password wajib diisi.' });
    }

    const result = await db.query('SELECT * FROM users WHERE username = $1', [username.trim()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }

    const secret = process.env.JWT_SECRET || 'deepna_secret_jwt_key_super_safe_2026';
    const token = jwt.sign(
      { id: user.id, username: user.username },
      secret,
      { expiresIn: '7d' }
    );

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
      },
    });
  } catch (err) {
    console.error('Error in auth login:', err);
    return res.status(500).json({ error: 'Terjadi kesalahan pada server saat login.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  return res.json({ user: req.user });
});

module.exports = router;
