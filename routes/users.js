const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../database/init');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const uploadsDir = path.join(__dirname, '..', 'uploads');

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'avatar_' + uuidv4() + ext);
  }
});

const avatarUpload = multer({
  storage: avatarStorage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only image files allowed'), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// GET /api/users/:username - get user profile
router.get('/:username', optionalAuth, (req, res) => {
  try {
    const user = db.get(
      'SELECT id, username, email, avatar, bio, created_at FROM users WHERE username = ?',
      [req.params.username]
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const { follower_count } = db.get(
      'SELECT COUNT(*) as follower_count FROM follows WHERE following_id = ?',
      [user.id]
    );
    const { following_count } = db.get(
      'SELECT COUNT(*) as following_count FROM follows WHERE follower_id = ?',
      [user.id]
    );

    const videos = db.all(`
      SELECT v.id, v.title, v.description, v.filename, v.thumbnail, v.views, v.created_at,
             (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as like_count
      FROM videos v
      WHERE v.user_id = ?
      ORDER BY v.created_at DESC
    `, [user.id]);

    let is_following = false;
    if (req.user && req.user.id !== user.id) {
      const follow = db.get(
        'SELECT id FROM follows WHERE follower_id = ? AND following_id = ?',
        [req.user.id, user.id]
      );
      is_following = !!follow;
    }

    return res.json({
      ...user,
      follower_count,
      following_count,
      videos,
      is_following
    });
  } catch (err) {
    console.error('Get user error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/users/me/profile - get current user profile
router.get('/me/profile', authenticateToken, (req, res) => {
  try {
    const user = db.get(
      'SELECT id, username, email, avatar, bio, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const { follower_count } = db.get(
      'SELECT COUNT(*) as follower_count FROM follows WHERE following_id = ?',
      [user.id]
    );
    const { following_count } = db.get(
      'SELECT COUNT(*) as following_count FROM follows WHERE follower_id = ?',
      [user.id]
    );

    return res.json({ ...user, follower_count, following_count });
  } catch (err) {
    console.error('Get profile error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/users/me - update profile
router.put('/me', authenticateToken, (req, res) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    const { bio } = req.body;
    const avatarFile = req.file;

    try {
      if (avatarFile) {
        db.run('UPDATE users SET avatar = ?, bio = ? WHERE id = ?', [avatarFile.filename, bio || '', req.user.id]);
      } else {
        db.run('UPDATE users SET bio = ? WHERE id = ?', [bio || '', req.user.id]);
      }

      const user = db.get(
        'SELECT id, username, email, avatar, bio, created_at FROM users WHERE id = ?',
        [req.user.id]
      );
      return res.json({ message: 'Profile updated.', user });
    } catch (dbErr) {
      console.error('Update profile error:', dbErr);
      return res.status(500).json({ error: 'Server error.' });
    }
  });
});

// POST /api/users/:id/follow - follow a user
router.post('/:id/follow', authenticateToken, (req, res) => {
  try {
    const targetId = parseInt(req.params.id);

    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'You cannot follow yourself.' });
    }

    const target = db.get('SELECT id FROM users WHERE id = ?', [targetId]);
    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const existing = db.get(
      'SELECT id FROM follows WHERE follower_id = ? AND following_id = ?',
      [req.user.id, targetId]
    );

    if (existing) {
      // Unfollow
      db.run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', [req.user.id, targetId]);
      return res.json({ following: false, message: 'Unfollowed successfully.' });
    } else {
      // Follow
      db.run('INSERT INTO follows (follower_id, following_id) VALUES (?, ?)', [req.user.id, targetId]);
      return res.json({ following: true, message: 'Followed successfully.' });
    }
  } catch (err) {
    console.error('Follow error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/users/me/liked - get liked videos for current user
router.get('/me/liked', authenticateToken, (req, res) => {
  try {
    const videos = db.all(`
      SELECT v.id, v.title, v.description, v.filename, v.thumbnail, v.views, v.created_at,
             u.id as user_id, u.username, u.avatar,
             (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as like_count
      FROM likes l
      JOIN videos v ON l.video_id = v.id
      JOIN users u ON v.user_id = u.id
      WHERE l.user_id = ?
      ORDER BY l.created_at DESC
    `, [req.user.id]);

    return res.json({ videos });
  } catch (err) {
    console.error('Liked videos error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
