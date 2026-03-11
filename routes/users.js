const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database/init');
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
      'SELECT id, username, email, avatar, bio, bluetick, created_at FROM users WHERE username = ?',
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
      'SELECT id, username, email, avatar, bio, bluetick, is_admin, created_at FROM users WHERE id = ?',
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

    const { bio, username } = req.body;
    const avatarFile = req.file;

    // Validate and update username if provided
    if (username !== undefined && username !== '') {
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
        return res.status(400).json({ error: 'Username must be 3–30 characters (letters, numbers, underscores only).' });
      }
      // Check uniqueness
      const existing = db.get('SELECT id FROM users WHERE username = ? AND id != ?', [username, req.user.id]);
      if (existing) {
        return res.status(409).json({ error: 'Username already taken.' });
      }
    }

    try {
      const newUsername = (username !== undefined && username !== '') ? username : null;

      if (avatarFile && newUsername) {
        db.run('UPDATE users SET avatar = ?, bio = ?, username = ? WHERE id = ?', [avatarFile.filename, bio || '', newUsername, req.user.id]);
      } else if (avatarFile) {
        db.run('UPDATE users SET avatar = ?, bio = ? WHERE id = ?', [avatarFile.filename, bio || '', req.user.id]);
      } else if (newUsername) {
        db.run('UPDATE users SET bio = ?, username = ? WHERE id = ?', [bio || '', newUsername, req.user.id]);
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
      SELECT v.id, v.vid_id, v.title, v.description, v.filename, v.thumbnail, v.category, v.views, v.created_at,
             u.id as user_id, u.username, u.avatar, u.bluetick,
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

// POST /api/users/me/bluetick - apply for bluetick (verified badge)
router.post('/me/bluetick', authenticateToken, (req, res) => {
  try {
    const { reason, instagram_url } = req.body;

    // Basic Instagram URL validation if provided
    if (instagram_url && instagram_url.trim()) {
      const igUrl = instagram_url.trim();
      if (!/^https?:\/\/(www\.)?instagram\.com\//.test(igUrl)) {
        return res.status(400).json({ error: 'Please provide a valid Instagram profile URL.' });
      }
    }

    const existing = db.get('SELECT * FROM bluetick_requests WHERE user_id = ?', [req.user.id]);
    if (existing) {
      return res.status(409).json({ error: 'You have already applied for verification.', status: existing.status });
    }

    db.run(
      'INSERT INTO bluetick_requests (user_id, reason, instagram_url, status) VALUES (?, ?, ?, ?)',
      [req.user.id, reason || '', instagram_url ? instagram_url.trim() : '', 'pending']
    );

    return res.status(201).json({ message: 'Verification request submitted. Our team will review it shortly.' });
  } catch (err) {
    console.error('Bluetick request error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/users/search - search users by username
router.get('/search', (req, res) => {
  try {
    const { q, limit = 8 } = req.query;
    if (!q || q.trim().length < 1) return res.json({ users: [] });

    const users = db.all(
      'SELECT id, username, avatar, bluetick FROM users WHERE username LIKE ? LIMIT ?',
      [`%${q.trim()}%`, parseInt(limit)]
    );
    return res.json({ users });
  } catch (err) {
    console.error('User search error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/users/me/history - get watch history for current user
router.get('/me/history', authenticateToken, (req, res) => {
  try {
    const videos = db.all(`
      SELECT v.id, v.vid_id, v.title, v.description, v.filename, v.thumbnail, v.category, v.views, v.created_at,
             u.id as user_id, u.username, u.avatar, u.bluetick,
             (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as like_count,
             wh.watched_at
      FROM watch_history wh
      JOIN videos v ON wh.video_id = v.id
      JOIN users u ON v.user_id = u.id
      WHERE wh.user_id = ?
      ORDER BY wh.watched_at DESC
      LIMIT 50
    `, [req.user.id]);

    return res.json({ videos });
  } catch (err) {
    console.error('Watch history error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/users/me/history/:videoId - record a video watch
router.post('/me/history/:videoId', authenticateToken, (req, res) => {
  try {
    const videoId = parseInt(req.params.videoId);
    const video = db.get('SELECT id FROM videos WHERE id = ?', [videoId]);
    if (!video) return res.status(404).json({ error: 'Video not found.' });

    // Upsert: update watched_at if already watched
    db.run(
      `INSERT INTO watch_history (user_id, video_id, watched_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, video_id) DO UPDATE SET watched_at = CURRENT_TIMESTAMP`,
      [req.user.id, videoId]
    );

    return res.json({ message: 'History recorded.' });
  } catch (err) {
    console.error('Record history error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/admin/bluetick - list bluetick requests (admin only)
router.get('/admin/bluetick', authenticateToken, (req, res) => {
  try {
    const admin = db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
    if (!admin || !admin.is_admin) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const requests = db.all(`
      SELECT br.id, br.reason, br.instagram_url, br.status, br.created_at,
             u.id as user_id, u.username, u.avatar, u.bluetick
      FROM bluetick_requests br
      JOIN users u ON br.user_id = u.id
      ORDER BY br.created_at DESC
    `);
    return res.json({ requests });
  } catch (err) {
    console.error('Admin bluetick list error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// PUT /api/admin/bluetick/:id - approve or reject a bluetick request (admin only)
router.put('/admin/bluetick/:id', authenticateToken, (req, res) => {
  try {
    const admin = db.get('SELECT is_admin FROM users WHERE id = ?', [req.user.id]);
    if (!admin || !admin.is_admin) {
      return res.status(403).json({ error: 'Admin access required.' });
    }

    const { action } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be "approve" or "reject".' });
    }

    const request = db.get('SELECT * FROM bluetick_requests WHERE id = ?', [req.params.id]);
    if (!request) return res.status(404).json({ error: 'Request not found.' });

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    db.run('UPDATE bluetick_requests SET status = ? WHERE id = ?', [newStatus, request.id]);

    if (action === 'approve') {
      db.run('UPDATE users SET bluetick = 2 WHERE id = ?', [request.user_id]);
    } else {
      db.run('UPDATE users SET bluetick = 0 WHERE id = ?', [request.user_id]);
    }

    return res.json({ message: `Request ${newStatus}.` });
  } catch (err) {
    console.error('Admin bluetick action error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
