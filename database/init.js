const { Database } = require('node-sqlite3-wasm');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbDir = path.join(__dirname, '..', 'database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'streaming.db');
const db = new Database(dbPath);

function generateShortId(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateUniqueId(table, column, length) {
  // Whitelist table/column names to prevent SQL injection
  const allowedTables = { videos: ['vid_id'], playlists: ['pid'] };
  if (!allowedTables[table] || !allowedTables[table].includes(column)) {
    throw new Error(`Invalid table/column for generateUniqueId: ${table}.${column}`);
  }

  let id;
  let attempts = 0;
  do {
    id = generateShortId(length);
    attempts++;
    if (attempts > 100) {
      throw new Error(`Could not generate a unique ${column} after 100 attempts`);
    }
  } while (db.get(`SELECT id FROM ${table} WHERE ${column} = ?`, [id]));
  return id;
}

function initDatabase() {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      avatar TEXT DEFAULT NULL,
      bio TEXT DEFAULT '',
      bluetick INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vid_id TEXT UNIQUE,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      filename TEXT NOT NULL,
      thumbnail TEXT DEFAULT NULL,
      category TEXT DEFAULT '',
      views INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      video_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, video_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      video_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS follows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      follower_id INTEGER NOT NULL,
      following_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(follower_id, following_id),
      FOREIGN KEY (follower_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (following_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      read INTEGER DEFAULT 0,
      reply_to_id INTEGER DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pid TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      is_public INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS playlist_videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      playlist_id INTEGER NOT NULL,
      video_id INTEGER NOT NULL,
      position INTEGER DEFAULT 0,
      added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(playlist_id, video_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bluetick_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      reason TEXT DEFAULT '',
      instagram_url TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS watch_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      video_id INTEGER NOT NULL,
      watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, video_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
    );
  `);

  migrateDatabase();
  seedAdminUser();

  console.log('Database initialized successfully');
}

function seedAdminUser() {
  const existing = db.get('SELECT id FROM users WHERE username = ?', ['admin']);
  const adminPassword = process.env.ADMIN_PASSWORD || 'SSss12@@';
  if (!existing) {
    const hash = bcrypt.hashSync(adminPassword, 12);
    db.run(
      'INSERT INTO users (username, email, password, is_admin) VALUES (?, ?, ?, 1)',
      ['admin', 'admin@streamhub.local', hash]
    );
  } else {
    // Ensure the admin user has is_admin=1
    db.run('UPDATE users SET is_admin = 1 WHERE username = ?', ['admin']);
  }
}

function migrateDatabase() {
  // Add new columns to existing tables (safe – each wrapped in try/catch)
  const migrations = [
    "ALTER TABLE users ADD COLUMN bluetick INTEGER DEFAULT 0",
    "ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0",
    "ALTER TABLE videos ADD COLUMN vid_id TEXT",
    "ALTER TABLE videos ADD COLUMN category TEXT DEFAULT ''",
    "ALTER TABLE messages ADD COLUMN reply_to_id INTEGER DEFAULT NULL",
    "ALTER TABLE messages ADD COLUMN image TEXT DEFAULT NULL",
    "ALTER TABLE bluetick_requests ADD COLUMN instagram_url TEXT DEFAULT ''"
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch (_) { /* column already exists */ }
  }

  // Backfill vid_id for videos that don't have one yet (wrapped in transaction for performance)
  const videosWithoutId = db.all("SELECT id FROM videos WHERE vid_id IS NULL OR vid_id = ''");
  if (videosWithoutId.length > 0) {
    db.exec('BEGIN');
    try {
      for (const v of videosWithoutId) {
        const vid_id = generateUniqueId('videos', 'vid_id', 8);
        db.run('UPDATE videos SET vid_id = ? WHERE id = ?', [vid_id, v.id]);
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

initDatabase();

module.exports = { db, generateUniqueId };
