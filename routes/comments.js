const express = require('express');
const router = express.Router();
const { db } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

// GET /api/comments/:videoId - get comments for a video
router.get('/:videoId', (req, res) => {
  try {
    const comments = db.all(`
      SELECT c.id, c.content, c.created_at, u.id as user_id, u.username, u.avatar
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.video_id = ?
      ORDER BY c.created_at ASC
    `, [req.params.videoId]);

    return res.json({ comments });
  } catch (err) {
    console.error('Get comments error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/comments/:videoId - add a comment
router.post('/:videoId', authenticateToken, (req, res) => {
  try {
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment content is required.' });
    }

    if (content.length > 1000) {
      return res.status(400).json({ error: 'Comment must be under 1000 characters.' });
    }

    const video = db.get('SELECT id FROM videos WHERE id = ?', [req.params.videoId]);
    if (!video) {
      return res.status(404).json({ error: 'Video not found.' });
    }

    const result = db.run(
      'INSERT INTO comments (user_id, video_id, content) VALUES (?, ?, ?)',
      [req.user.id, req.params.videoId, content.trim()]
    );

    const comment = db.get(`
      SELECT c.id, c.content, c.created_at, u.id as user_id, u.username, u.avatar
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `, [result.lastInsertRowid]);

    return res.status(201).json({ message: 'Comment added.', comment });
  } catch (err) {
    console.error('Add comment error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/comments/:id - delete a comment (own comment OR video owner)
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const comment = db.get('SELECT c.*, v.user_id as video_owner_id FROM comments c JOIN videos v ON c.video_id = v.id WHERE c.id = ?', [req.params.id]);

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    // Allow deletion if the user is the comment author OR the video owner
    if (comment.user_id !== req.user.id && comment.video_owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this comment.' });
    }

    db.run('DELETE FROM comments WHERE id = ?', [req.params.id]);

    return res.json({ message: 'Comment deleted.' });
  } catch (err) {
    console.error('Delete comment error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
