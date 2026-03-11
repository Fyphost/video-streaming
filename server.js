require('dotenv').config();
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { PORT } = require('./config');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' }
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Upload limit reached, please try again later.' }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' }
});

// Serve uploaded files (thumbnails served via API to prevent hotlinking/download forcing)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Apply rate limiters to API routes
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/videos/upload', uploadLimiter);
app.use('/api/videos', apiLimiter, require('./routes/videos'));
app.use('/api/users', apiLimiter, require('./routes/users'));
app.use('/api/comments', apiLimiter, require('./routes/comments'));
app.use('/api/likes', apiLimiter, require('./routes/likes'));
app.use('/api/messages', apiLimiter, require('./routes/messages'));
app.use('/api/playlists', apiLimiter, require('./routes/playlists'));

// Rate limiter for HTML page routes
const pageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});

// Serve HTML pages
app.get('/', pageLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'index.html'));
});

app.get('/login', pageLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'login.html'));
});

app.get('/register', pageLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'register.html'));
});

app.get('/upload', pageLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'upload.html'));
});

// /watch?id=123 (legacy numeric id)
app.get('/watch', pageLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'watch.html'));
});

// /watch/:vid_id (short ID format e.g. /watch/Vu9XzCyB)
app.get('/watch/:vid_id', pageLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'watch.html'));
});

app.get('/profile', pageLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'profile.html'));
});

// /@username — friendly user profile URL
app.get('/@:username', pageLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'profile.html'));
});

app.get('/messages', pageLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'messages.html'));
});

app.get('/search', pageLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'search.html'));
});

// /playlist/:pid — playlist page
app.get('/playlist/:pid', pageLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pages', 'playlist.html'));
});

// 404 fallback
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found.' });
  }
  res.sendFile(path.join(__dirname, 'public', 'pages', 'index.html'));
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`🚀 Video Streaming Platform running at http://localhost:${PORT}`);
});

module.exports = app;
