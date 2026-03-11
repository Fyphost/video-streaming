const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { db, generateUniqueId } = require('../database/init');
const { authenticateToken, optionalAuth } = require('../middleware/auth');

const uploadsDir = path.join(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, uuidv4() + ext);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'video') {
    const allowed = ['.mp4', '.webm', '.ogg', '.mov', '.avi'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed (mp4, webm, ogg, mov, avi)'), false);
    }
  } else if (file.fieldname === 'thumbnail') {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed for thumbnails'), false);
    }
  } else {
    cb(new Error('Unknown field'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

const thumbnailUpload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only image files are allowed for thumbnails'), false);
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// ── Common video SELECT snippet ─────────────────────────────────
const VIDEO_SELECT = `
  SELECT v.id, v.vid_id, v.title, v.description, v.filename, v.thumbnail, v.category,
         v.views, v.created_at, u.id as user_id, u.username, u.avatar, u.bluetick,
         (SELECT COUNT(*) FROM likes WHERE video_id = v.id) as like_count
  FROM videos v
  JOIN users u ON v.user_id = u.id
`;

// GET /api/videos - list all videos (with optional search & category)
router.get('/', optionalAuth, (req, res) => {
  try {
    const { search, category, page = 1, limit = 12 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = VIDEO_SELECT;
    const params = [];
    const conditions = [];

    if (search) {
      conditions.push('(v.title LIKE ? OR v.description LIKE ? OR u.username LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category) {
      conditions.push('v.category = ?');
      params.push(category);
    }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY v.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const videos = db.all(query, params);

    let countQuery = 'SELECT COUNT(*) as total FROM videos v JOIN users u ON v.user_id = u.id';
    const countParams = [];
    const countConditions = [];
    if (search) {
      countConditions.push('(v.title LIKE ? OR v.description LIKE ? OR u.username LIKE ?)');
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category) {
      countConditions.push('v.category = ?');
      countParams.push(category);
    }
    if (countConditions.length) countQuery += ' WHERE ' + countConditions.join(' AND ');
    const { total } = db.get(countQuery, countParams);

    return res.json({ videos, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('List videos error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/videos/trending - most viewed videos
router.get('/trending', optionalAuth, (req, res) => {
  try {
    const { limit = 12 } = req.query;
    const videos = db.all(
      VIDEO_SELECT + ' ORDER BY v.views DESC LIMIT ?',
      [parseInt(limit)]
    );
    return res.json({ videos });
  } catch (err) {
    console.error('Trending error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/videos/suggestions - AJAX search suggestions
router.get('/suggestions', (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) return res.json({ suggestions: [] });

    const rows = db.all(
      `SELECT DISTINCT v.title FROM videos v WHERE v.title LIKE ? LIMIT 8`,
      [`%${q.trim()}%`]
    );
    const suggestions = rows.map(r => r.title);
    return res.json({ suggestions });
  } catch (err) {
    console.error('Suggestions error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/videos/feed - videos from followed users
router.get('/feed', authenticateToken, (req, res) => {
  try {
    const { page = 1, limit = 12 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const videos = db.all(
      VIDEO_SELECT + `
      WHERE v.user_id IN (
        SELECT following_id FROM follows WHERE follower_id = ?
      )
      ORDER BY v.created_at DESC LIMIT ? OFFSET ?
    `, [req.user.id, parseInt(limit), offset]);

    return res.json({ videos });
  } catch (err) {
    console.error('Feed error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/videos/by-vid/:vid_id - get single video by short vid_id
router.get('/by-vid/:vid_id', optionalAuth, (req, res) => {
  try {
    const video = db.get(VIDEO_SELECT + ' WHERE v.vid_id = ?', [req.params.vid_id]);
    if (!video) return res.status(404).json({ error: 'Video not found.' });
    return serveVideoDetail(video, req, res);
  } catch (err) {
    console.error('Get video by vid_id error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/videos/:id - get single video by numeric id
router.get('/:id', optionalAuth, (req, res) => {
  try {
    const video = db.get(VIDEO_SELECT + ' WHERE v.id = ?', [req.params.id]);
    if (!video) return res.status(404).json({ error: 'Video not found.' });
    return serveVideoDetail(video, req, res);
  } catch (err) {
    console.error('Get video error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

function serveVideoDetail(video, req, res) {
  db.run('UPDATE videos SET views = views + 1 WHERE id = ?', [video.id]);
  const updated = db.get('SELECT views FROM videos WHERE id = ?', [video.id]);
  video.views = updated ? updated.views : video.views + 1;

  if (req.user) {
    const liked = db.get('SELECT id FROM likes WHERE user_id = ? AND video_id = ?', [req.user.id, video.id]);
    video.liked_by_me = !!liked;
  } else {
    video.liked_by_me = false;
  }

  return res.json(video);
}

// POST /api/videos/upload - upload a video
router.post('/upload', authenticateToken, (req, res) => {
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
  ])(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    const { title, description, category } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required.' });
    }

    if (!req.files || !req.files.video) {
      return res.status(400).json({ error: 'Video file is required.' });
    }

    const videoFile = req.files.video[0];
    const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

    try {
      const vid_id = generateUniqueId('videos', 'vid_id', 8);
      const result = db.run(
        'INSERT INTO videos (vid_id, user_id, title, description, filename, thumbnail, category) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [vid_id, req.user.id, title, description || '', videoFile.filename,
          thumbnailFile ? thumbnailFile.filename : null, category || '']
      );

      const video = db.get('SELECT * FROM videos WHERE id = ?', [result.lastInsertRowid]);

      return res.status(201).json({ message: 'Video uploaded successfully.', video });
    } catch (dbErr) {
      console.error('DB error during upload:', dbErr);
      if (videoFile) fs.unlink(path.join(uploadsDir, videoFile.filename), () => {});
      if (thumbnailFile) fs.unlink(path.join(uploadsDir, thumbnailFile.filename), () => {});
      return res.status(500).json({ error: 'Server error saving video.' });
    }
  });
});

// PUT /api/videos/:id/thumbnail - update thumbnail (owner only)
router.put('/:id/thumbnail', authenticateToken, (req, res) => {
  thumbnailUpload.single('thumbnail')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Thumbnail image required.' });

    try {
      const video = db.get('SELECT * FROM videos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
      if (!video) {
        fs.unlink(path.join(uploadsDir, req.file.filename), () => {});
        return res.status(404).json({ error: 'Video not found or not authorized.' });
      }

      // Delete old thumbnail if it existed
      if (video.thumbnail) {
        fs.unlink(path.join(uploadsDir, video.thumbnail), () => {});
      }

      db.run('UPDATE videos SET thumbnail = ? WHERE id = ?', [req.file.filename, video.id]);
      return res.json({ message: 'Thumbnail updated.', thumbnail: req.file.filename });
    } catch (dbErr) {
      console.error('Thumbnail update error:', dbErr);
      fs.unlink(path.join(uploadsDir, req.file.filename), () => {});
      return res.status(500).json({ error: 'Server error.' });
    }
  });
});

// DELETE /api/videos/:id - delete a video
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const video = db.get('SELECT * FROM videos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!video) {
      return res.status(404).json({ error: 'Video not found or not authorized.' });
    }

    if (video.filename) fs.unlink(path.join(uploadsDir, video.filename), () => {});
    if (video.thumbnail) fs.unlink(path.join(uploadsDir, video.thumbnail), () => {});

    db.run('DELETE FROM videos WHERE id = ?', [video.id]);

    return res.json({ message: 'Video deleted successfully.' });
  } catch (err) {
    console.error('Delete video error:', err);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/videos/thumbnail/:filename - serve thumbnail (inline only, not downloadable)
router.get('/thumbnail/:filename', (req, res) => {
  // Validate that this filename is actually a known thumbnail
  const row = db.get('SELECT id FROM videos WHERE thumbnail = ?', [req.params.filename]);
  if (!row) return res.status(404).json({ error: 'Not found.' });

  const filePath = path.join(uploadsDir, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found.' });

  const ext = path.extname(req.params.filename).toLowerCase();
  const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
  const contentType = mimeMap[ext] || 'image/jpeg';

  res.set({
    'Content-Type': contentType,
    'Content-Disposition': 'inline',
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff'
  });
  fs.createReadStream(filePath).pipe(res);
});

// GET /api/videos/stream/:filename - stream video with range support
router.get('/stream/:filename', (req, res) => {
  const filePath = path.join(uploadsDir, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found.' });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(req.params.filename).toLowerCase();
  const mimeTypes = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo'
  };
  const contentType = mimeTypes[ext] || 'video/mp4';

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    if (start >= fileSize || end >= fileSize) {
      return res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
    }

    const fileStream = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType
    });
    fileStream.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

module.exports = router;
