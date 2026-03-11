const express = require('express');
const router = express.Router();
const { db, generateUniqueId } = require('../database/init');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

// GET /api/playlists/my - get current user's playlists
router.get('/my', authenticateToken, (req, res) => {
  try {
    const playlists = db.all(
      `SELECT p.*, u.username, u.avatar,
              (SELECT COUNT(*) FROM playlist_videos WHERE playlist_id = p.id) as video_count
       FROM playlists p JOIN users u ON p.user_id = u.id
       WHERE p.user_id = ? ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    return res.json({ playlists });
  } catch (err) {
    console.error('Get my playlists error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/playlists/:pid - get playlist by short pid
router.get('/:pid', optionalAuth, (req, res) => {
  try {
    const playlist = db.get(
      `SELECT p.*, u.username, u.avatar,
              (SELECT COUNT(*) FROM playlist_videos WHERE playlist_id = p.id) as video_count
       FROM playlists p JOIN users u ON p.user_id = u.id
       WHERE p.pid = ?`,
      [req.params.pid]
    );
    if (!playlist) return res.status(404).json({ error: 'Playlist not found.' });

    if (!playlist.is_public && (!req.user || req.user.id !== playlist.user_id)) {
      return res.status(403).json({ error: 'This playlist is private.' });
    }

    const videos = db.all(
      `SELECT pv.position, v.id, v.vid_id, v.title, v.description, v.filename, v.thumbnail,
              v.category, v.views, v.created_at, u.id as user_id, u.username, u.avatar, u.bluetick,
              (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as like_count
       FROM playlist_videos pv
       JOIN videos v ON pv.video_id = v.id
       JOIN users u ON v.user_id = u.id
       WHERE pv.playlist_id = ? ORDER BY pv.position ASC, pv.added_at ASC`,
      [playlist.id]
    );

    return res.json({ playlist, videos });
  } catch (err) {
    console.error('Get playlist error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/playlists - create a playlist
router.post('/', authenticateToken, (req, res) => {
  try {
    const { title, description, is_public = 1 } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });

    const pid = generateUniqueId('playlists', 'pid', 6);
    const result = db.run(
      'INSERT INTO playlists (pid, user_id, title, description, is_public) VALUES (?, ?, ?, ?, ?)',
      [pid, req.user.id, title.trim(), description || '', is_public ? 1 : 0]
    );

    const playlist = db.get('SELECT * FROM playlists WHERE id = ?', [result.lastInsertRowid]);
    return res.status(201).json({ message: 'Playlist created.', playlist });
  } catch (err) {
    console.error('Create playlist error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// POST /api/playlists/:pid/videos - add a video to playlist
router.post('/:pid/videos', authenticateToken, (req, res) => {
  try {
    const playlist = db.get('SELECT * FROM playlists WHERE pid = ? AND user_id = ?', [req.params.pid, req.user.id]);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found or not authorized.' });

    const { video_id } = req.body;
    if (!video_id) return res.status(400).json({ error: 'video_id is required.' });

    const video = db.get('SELECT id FROM videos WHERE id = ?', [video_id]);
    if (!video) return res.status(404).json({ error: 'Video not found.' });

    // Get current max position
    const maxPos = db.get('SELECT MAX(position) as mp FROM playlist_videos WHERE playlist_id = ?', [playlist.id]);
    const position = (maxPos && maxPos.mp !== null) ? maxPos.mp + 1 : 0;

    try {
      db.run(
        'INSERT INTO playlist_videos (playlist_id, video_id, position) VALUES (?, ?, ?)',
        [playlist.id, video_id, position]
      );
      return res.status(201).json({ message: 'Video added to playlist.' });
    } catch (insertErr) {
      if (insertErr.message && insertErr.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'Video already in playlist.' });
      }
      throw insertErr;
    }
  } catch (err) {
    console.error('Add video to playlist error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/playlists/:pid/videos/:videoId - remove video from playlist
router.delete('/:pid/videos/:videoId', authenticateToken, (req, res) => {
  try {
    const playlist = db.get('SELECT * FROM playlists WHERE pid = ? AND user_id = ?', [req.params.pid, req.user.id]);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found or not authorized.' });

    db.run('DELETE FROM playlist_videos WHERE playlist_id = ? AND video_id = ?', [playlist.id, req.params.videoId]);
    return res.json({ message: 'Video removed from playlist.' });
  } catch (err) {
    console.error('Remove video from playlist error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// DELETE /api/playlists/:pid - delete a playlist
router.delete('/:pid', authenticateToken, (req, res) => {
  try {
    const playlist = db.get('SELECT * FROM playlists WHERE pid = ? AND user_id = ?', [req.params.pid, req.user.id]);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found or not authorized.' });

    db.run('DELETE FROM playlists WHERE id = ?', [playlist.id]);
    return res.json({ message: 'Playlist deleted.' });
  } catch (err) {
    console.error('Delete playlist error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;
