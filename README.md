# StreamHub — Video Streaming Platform

A full-stack video streaming website built with **Node.js, Express, SQLite**, and **Vanilla HTML/CSS/JavaScript**.  
Theme: **White & Blue** — clean, modern, and responsive.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔐 **Authentication** | Sign up, login, logout with JWT & bcrypt |
| �� **Video Upload & Streaming** | Upload MP4/WebM/OGG, stream with range-request support |
| ❤️ **Like Videos** | Like/unlike toggle with live like counts |
| 👥 **Follow Users** | Follow/unfollow creators, followers/following counts |
| 💬 **Comments** | Comment on any video, delete your own comments |
| ✉️ **Direct Messaging** | Full inbox & real-time conversation view |
| 🔍 **Video Search** | Full-text search across titles, descriptions & usernames |
| 📺 **Subscription Feed** | See videos from creators you follow |

---

## 🛠 Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** SQLite (via `node-sqlite3-wasm` — no native compilation needed)
- **Auth:** `bcryptjs` + `jsonwebtoken`
- **File Upload:** `multer`
- **Frontend:** Vanilla HTML, CSS, JavaScript (no frameworks)

---

## 🚀 Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/Fyphost/video-streaming.git
cd video-streaming
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set a strong `JWT_SECRET`:

```
JWT_SECRET=your_super_secret_jwt_key_here
PORT=3000
```

### 4. Start the server

```bash
npm start
```

### 5. Open in browser

```
http://localhost:3000
```

---

## 📁 Project Structure

```
video-streaming/
├── package.json
├── server.js                  # Main Express server
├── .env.example               # Environment variables template
├── database/
│   └── init.js                # SQLite schema & initialization
├── middleware/
│   └── auth.js                # JWT authentication middleware
├── routes/
│   ├── auth.js                # Register, login, logout
│   ├── videos.js              # Upload, stream, list, search
│   ├── users.js               # Profile, follow/unfollow
│   ├── comments.js            # CRUD for comments
│   ├── likes.js               # Like toggle
│   └── messages.js            # Direct messaging
├── public/
│   ├── css/style.css          # White & Blue theme
│   ├── js/
│   │   ├── app.js             # Shared utilities
│   │   ├── auth.js            # Login/register frontend
│   │   ├── video.js           # Video player & upload
│   │   ├── comments.js        # Comments UI
│   │   ├── messages.js        # Messaging UI
│   │   └── profile.js         # Profile & follow UI
│   └── pages/                 # HTML pages
└── uploads/                   # Uploaded videos & thumbnails
```

---

## 🔒 Security Notes

- Passwords are hashed with **bcrypt** (salt rounds: 12)
- JWT tokens expire after **7 days**
- File uploads are validated by MIME type and extension
- Max upload size: **500MB** for videos, **5MB** for images

---

## 📝 API Endpoints

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/videos` | List videos (supports `?search=` & pagination) |
| GET | `/api/videos/feed` | Subscription feed |
| GET | `/api/videos/:id` | Get video details |
| POST | `/api/videos/upload` | Upload a video |
| DELETE | `/api/videos/:id` | Delete own video |
| GET | `/api/videos/stream/:filename` | Stream video (range requests) |
| GET | `/api/users/:username` | Get user profile |
| PUT | `/api/users/me` | Update profile |
| POST | `/api/users/:id/follow` | Follow/unfollow user |
| GET | `/api/comments/:videoId` | Get comments |
| POST | `/api/comments/:videoId` | Add comment |
| DELETE | `/api/comments/:id` | Delete own comment |
| POST | `/api/likes/:videoId` | Toggle like |
| GET | `/api/messages/conversations` | List conversations |
| GET | `/api/messages/:userId` | Get messages with user |
| POST | `/api/messages/:userId` | Send message |
