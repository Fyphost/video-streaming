const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../database/init');
const { authenticateToken } = require('../middleware/auth');

const uploadsDir = path.join(__dirname, '..', 'uploads');

const msgImageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'msgimg_' + uuidv4() + ext);
  }
});

const msgImageUpload = multer({
  storage: msgImageStorage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only image files allowed for message photos'), false);
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const MAX_CAPTION_LENGTH = 500;
const MAX_MSG_LENGTH = 2000;

// Helper: full message SELECT
const MSG_SELECT = `
  SELECT m.id, m.content, m.image, m.read, m.created_at,
         m.sender_id, m.receiver_id, m.reply_to_id,
         u.username as sender_username, u.avatar as sender_avatar,
         rm.content as reply_to_content, rm.image as reply_to_image,
         ru.username as reply_to_username
  FROM messages m
  JOIN users u ON u.id = m.sender_id
  LEFT JOIN messages rm ON rm.id = m.reply_to_id
  LEFT JOIN users ru ON ru.id = rm.sender_id
`;

// GET /api/messages/unread/count — must be before /:userId
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

// GET /api/messages/conversations - list conversations
router.get('/conversations', authenticateToken, (req, res) => {
  try {
    const uid = req.user.id;

    const partners = db.all(`
      SELECT DISTINCT
        CASE WHEN sender_id = ? THEN receiver_id ELSE sender_id END AS other_id
      FROM messages
      WHERE sender_id = ? OR receiver_id = ?
    `, [uid, uid, uid]);

    const conversations = partners.map(p => {
      const otherId = p.other_id;
      const other = db.get('SELECT id, username, avatar, bluetick FROM users WHERE id = ?', [otherId]);
      if (!other) return null;

      const lastMsg = db.get(`
        SELECT content, image, created_at FROM messages
        WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
        ORDER BY created_at DESC LIMIT 1
      `, [uid, otherId, otherId, uid]);

      const { count: unread_count } = db.get(
        'SELECT COUNT(*) as count FROM messages WHERE sender_id = ? AND receiver_id = ? AND read = 0',
        [otherId, uid]
      );

      let lastMsgText = '';
      if (lastMsg) {
        lastMsgText = lastMsg.content || (lastMsg.image ? '📷 Photo' : '');
      }

      return {
        other_user_id: other.id,
        other_username: other.username,
        other_avatar: other.avatar,
        other_bluetick: other.bluetick,
        last_message: lastMsgText,
        last_message_time: lastMsg ? lastMsg.created_at : null,
        unread_count
      };
    }).filter(Boolean);

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

    const other = db.get('SELECT id, username, avatar, bluetick FROM users WHERE id = ?', [otherId]);
    if (!other) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const messages = db.all(`
      ${MSG_SELECT}
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

// POST /api/messages/:userId/image - send a photo message
router.post('/:userId/image', authenticateToken, (req, res) => {
  msgImageUpload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const receiverId = parseInt(req.params.userId);

      if (receiverId === req.user.id) {
        return res.status(400).json({ error: 'You cannot message yourself.' });
      }

      const receiver = db.get('SELECT id FROM users WHERE id = ?', [receiverId]);
      if (!receiver) return res.status(404).json({ error: 'User not found.' });

      if (!req.file) return res.status(400).json({ error: 'Image file is required.' });

      const caption = (req.body.content || '').trim().substring(0, MAX_CAPTION_LENGTH);
      const { reply_to_id } = req.body;

      let replyToId = null;
      if (reply_to_id) {
        const replyMsg = db.get('SELECT id FROM messages WHERE id = ?', [reply_to_id]);
        if (replyMsg) replyToId = parseInt(reply_to_id);
      }

      const result = db.run(
        'INSERT INTO messages (sender_id, receiver_id, content, image, reply_to_id) VALUES (?, ?, ?, ?, ?)',
        [req.user.id, receiverId, caption, req.file.filename, replyToId]
      );

      const message = db.get(`${MSG_SELECT} WHERE m.id = ?`, [result.lastInsertRowid]);
      return res.status(201).json({ message: 'Photo sent.', data: message });
    } catch (dbErr) {
      console.error('Send image message error:', dbErr);
      return res.status(500).json({ error: 'Server error.' });
    }
  });
});

// POST /api/messages/:userId - send a text message
router.post('/:userId', authenticateToken, (req, res) => {
  try {
    const receiverId = parseInt(req.params.userId);

    if (receiverId === req.user.id) {
      return res.status(400).json({ error: 'You cannot message yourself.' });
    }

    const { content, reply_to_id } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Message content is required.' });
    }

    if (content.length > MAX_MSG_LENGTH) {
      return res.status(400).json({ error: `Message must be under ${MAX_MSG_LENGTH} characters.` });
    }

    const receiver = db.get('SELECT id FROM users WHERE id = ?', [receiverId]);
    if (!receiver) {
      return res.status(404).json({ error: 'User not found.' });
    }

    let replyToId = null;
    if (reply_to_id) {
      const replyMsg = db.get('SELECT id FROM messages WHERE id = ?', [reply_to_id]);
      if (replyMsg) replyToId = reply_to_id;
    }

    const result = db.run(
      'INSERT INTO messages (sender_id, receiver_id, content, reply_to_id) VALUES (?, ?, ?, ?)',
      [req.user.id, receiverId, content.trim(), replyToId]
    );

    const message = db.get(`${MSG_SELECT} WHERE m.id = ?`, [result.lastInsertRowid]);
    return res.status(201).json({ message: 'Message sent.', data: message });
  } catch (err) {
    console.error('Send message error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;

