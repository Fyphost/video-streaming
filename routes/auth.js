const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../database/init');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config');

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required.' });
    }

    if (username.length < 3 || username.length > 30) {
      return res.status(400).json({ error: 'Username must be between 3 and 30 characters.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = db.get(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    if (existing) {
      return res.status(409).json({ error: 'Username or email already taken.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const result = db.run(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );

    const token = jwt.sign(
      { id: result.lastInsertRowid, username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(201).json({
      message: 'Account created successfully.',
      token,
      user: { id: result.lastInsertRowid, username, email }
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Server error during registration.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      message: 'Logged in successfully.',
      token,
      user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar, bluetick: user.bluetick, is_admin: user.is_admin || 0 }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error during login.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  // Client-side logout: instruct client to discard the JWT token
  return res.json({ message: 'Logged out successfully.' });
});

module.exports = router;
