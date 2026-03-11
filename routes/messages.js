const express = require('express');
const router = express.Router();
const db = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

// GET /api/messages/conversations - list conversations
router.get('/conversations', authenticateToken, (req, res) => {
  try {
    const uid = req.user.id;

    // Get all unique partner IDs
    const partners = db.all(`
      SELECT DISTINCT
        CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS other_id
      FROM messages
      WHERE sender_id = ? OR receiver_id = ?
    `, [uid, uid, uid]);

    const conversations = partners.map(p => {
      const otherId = p.other_id;
      const other = db.get('SELECT id, username, avatar FROM users WHERE id = ?', [otherId]);
      if (!other) return null;

      const lastMsg = db.get(`
        SELECT content, created_at FROM messages
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `, [uid, otherId, otherId, uid]);

      const { count: unread_count } = db.get(
        'SELECT COUNT(*) as count FROM messages WHERE sender_id = ? AND receiver_id = ? AND read = 0',
        [otherId, uid]
      );

      return {
        other_user_id: other.id,
        other_username: other.username,
        other_avatar: other.avatar,
        last_message: lastMsg ? lastMsg.content : '',
        last_message_time: lastMsg ? lastMsg.created_at : null,
        unread_count
      };
    }).filter(Boolean);

    // Sort by last message time descending
    conversations.sort((a, b) => {
      if (!a.last_message_time) return 1;
      if (!b.last_message_time) return -1;
      return new Date(b.last_message_time) - new Date(a.last_message_time);
    });

    return res.json({ conversations });
  } catch (err) {
    console.error('Get conversations error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/messages/:userId - get messages with a specific user
router.get('/:userId', authenticateToken, (req, res) => {
  try {
    const otherId = parseInt(req.params.userId);

    const other = db.get('SELECT id, username, avatar FROM users WHERE id = ?', [otherId]);
    if (!other) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const messages = db.all(`
      SELECT m.id, m.content, m.read, m.created_at,
             m.sender_id, m.receiver_id,
             u.username as sender_username, u.avatar as sender_avatar
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE (m.sender_id = ? AND m.receiver_id = ?)
         OR (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.created_at ASC
    `, [req.user.id, otherId, otherId, req.user.id]);

    // Mark unread messages as read
    db.run(
      'UPDATE messages SET read = 1 WHERE sender_id = ? AND receiver_id = ? AND read = 0',
      [otherId, req.user.id]
    );

    return res.json({ messages, other_user: other });
  } catch (err) {
    console.error('Get messages error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/messages/:userId - send a message
router.post('/:userId', authenticateToken, (req, res) => {
  try {
    const receiverId = parseInt(req.params.userId);

    if (receiverId === req.user.id) {
      return res.status(400).json({ error: 'You cannot message yourself.' });
    }

    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    if (content.length > 2000) {
      return res.status(400).json({ error: 'Message must be under 2000 characters.' });
    }

    const receiver = db.get('SELECT id FROM users WHERE id = ?', [receiverId]);
    if (!receiver) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const result = db.run(
      'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
      [req.user.id, receiverId, content.trim()]
    );

    const message = db.get(`
      SELECT m.id, m.content, m.read, m.created_at, m.sender_id, m.receiver_id,
             u.username as sender_username, u.avatar as sender_avatar
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.id = ?
    `, [result.lastInsertRowid]);

    return res.status(201).json({ message: 'Message sent.', data: message });
  } catch (err) {
    console.error('Send message error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/messages/unread/count - get unread message count
router.get('/unread/count', authenticateToken, (req, res) => {
  try {
    const { count } = db.get(
      'SELECT COUNT(*) as count FROM messages WHERE receiver_id = ? AND read = 0',
      [req.user.id]
    );
    return res.json({ count });
  } catch (err) {
    console.error('Unread count error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
