const express = require('express');
const router = express.Router();
const db = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

// POST /api/likes/:videoId - toggle like on a video
router.post('/:videoId', authenticateToken, (req, res) => {
  try {
    const videoId = parseInt(req.params.videoId);

    const video = db.get('SELECT id FROM videos WHERE id = ?', [videoId]);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    const existing = db.get(
      'SELECT id FROM likes WHERE user_id = ? AND video_id = ?',
      [req.user.id, videoId]
    );

    if (existing) {
      db.run('DELETE FROM likes WHERE user_id = ? AND video_id = ?', [req.user.id, videoId]);
      const { like_count } = db.get('SELECT COUNT(*) as like_count FROM likes WHERE video_id = ?', [videoId]);
      return res.json({ liked: false, like_count });
    } else {
      db.run('INSERT INTO likes (user_id, video_id) VALUES (?, ?)', [req.user.id, videoId]);
      const { like_count } = db.get('SELECT COUNT(*) as like_count FROM likes WHERE video_id = ?', [videoId]);
      return res.json({ liked: true, like_count });
    }
  } catch (err) {
    console.error('Like toggle error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/likes/:videoId - get like count and status
router.get('/:videoId', authenticateToken, (req, res) => {
  try {
    const videoId = parseInt(req.params.videoId);
    const { like_count } = db.get('SELECT COUNT(*) as like_count FROM likes WHERE video_id = ?', [videoId]);
    const liked = db.get(
      'SELECT id FROM likes WHERE user_id = ? AND video_id = ?',
      [req.user.id, videoId]
    );
    return res.json({ like_count, liked: !!liked });
  } catch (err) {
    console.error('Get likes error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
