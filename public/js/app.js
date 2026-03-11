/* ============================================================
   app.js — Shared utilities for Video Streaming Platform
   ============================================================ */

const API_BASE = '';

// ── Token / Auth helpers ──────────────────────────────────────
function getToken() {
  return localStorage.getItem('token');
}

function setToken(token) {
  localStorage.setItem('token', token);
}

function removeToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

function getUser() {
  try {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
}

function setUser(user) {
  localStorage.setItem('user', JSON.stringify(user));
}

function isLoggedIn() {
  return !!getToken();
}

// ── API helpers ────────────────────────────────────────────────
async function apiRequest(url, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(API_BASE + url, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

async function apiUpload(url, formData) {
  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(API_BASE + url, {
    method: 'POST',
    headers,
    body: formData
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

// ── Toast notifications ────────────────────────────────────────
function showToast(message, type = 'default', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Date formatting ────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatViews(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n ? n.toString() : '0';
}

// ── Avatar helpers ─────────────────────────────────────────────
function avatarUrl(filename) {
  if (!filename) return null;
  return `/uploads/${filename}`;
}

function avatarInitials(username) {
  if (!username) return '?';
  return username.charAt(0).toUpperCase();
}

function createAvatarEl(user, size = 36) {
  if (user && user.avatar) {
    const img = document.createElement('img');
    img.src = avatarUrl(user.avatar);
    img.alt = user.username;
    img.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;object-fit:cover`;
    img.onerror = () => {
      const span = document.createElement('span');
      span.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:${size * 0.4}px`;
      span.textContent = avatarInitials(user.username);
      img.replaceWith(span);
    };
    return img;
  } else {
    const span = document.createElement('span');
    span.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:${size * 0.4}px;flex-shrink:0`;
    span.textContent = avatarInitials(user ? user.username : '?');
    return span;
  }
}

// ── Video card builder ─────────────────────────────────────────
function buildVideoCard(video) {
  const card = document.createElement('div');
  card.className = 'video-card';
  card.onclick = () => { window.location.href = `/watch?id=${video.id}`; };

  const thumbnailHtml = video.thumbnail
    ? `<img src="/uploads/${video.thumbnail}" alt="${escapeHtml(video.title)}" loading="lazy">`
    : `<div class="placeholder"><i class="fa-solid fa-play"></i></div>`;

  const uploaderAvatar = video.avatar
    ? `<img src="/uploads/${video.avatar}" alt="${escapeHtml(video.username)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover">`
    : `<span class="avatar-placeholder">${avatarInitials(video.username)}</span>`;

  card.innerHTML = `
    <div class="video-thumbnail">
      ${thumbnailHtml}
    </div>
    <div class="video-info">
      <div class="video-title">${escapeHtml(video.title)}</div>
      <div class="video-meta">
        <a class="uploader" href="/profile?user=${encodeURIComponent(video.username)}" onclick="event.stopPropagation()">
          ${uploaderAvatar}
          ${escapeHtml(video.username)}
        </a>
        <span>•</span>
        <span>${formatViews(video.views)} views</span>
        <span>•</span>
        <span>${formatDate(video.created_at)}</span>
      </div>
    </div>
  `;

  return card;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Navbar builder ─────────────────────────────────────────────
function buildNavbar(activePage) {
  const user = getUser();
  const searchQuery = new URLSearchParams(window.location.search).get('q') || '';

  const navbarEl = document.getElementById('navbar');
  if (!navbarEl) return;

  navbarEl.innerHTML = `
    <button class="mobile-menu-btn" id="mobile-menu-btn" aria-label="Toggle menu">
      <i class="fa-solid fa-bars"></i>
    </button>
    <a class="navbar-brand" href="/">
      <div class="logo-icon"><i class="fa-solid fa-play"></i></div>
      StreamHub
    </a>
    <form class="navbar-search" id="search-form" onsubmit="handleSearch(event)">
      <input type="text" placeholder="Search videos..." id="search-input" value="${escapeHtml(searchQuery)}" aria-label="Search videos">
      <button type="submit" aria-label="Search"><i class="fa-solid fa-magnifying-glass"></i></button>
    </form>
    <div class="navbar-actions">
      ${user ? `
        <a href="/upload" class="btn btn-primary btn-sm"><i class="fa-solid fa-upload"></i> <span class="btn-label">Upload</span></a>
        <div class="user-menu">
          <div class="user-avatar-btn" id="avatar-btn" onclick="toggleDropdown()" aria-label="User menu" aria-haspopup="true">
            ${user.avatar ? `<img src="/uploads/${user.avatar}" alt="${escapeHtml(user.username)}">` : escapeHtml(avatarInitials(user.username))}
          </div>
          <div class="user-dropdown" id="user-dropdown">
            <a href="/profile?user=${encodeURIComponent(user.username)}"><i class="fa-solid fa-user"></i> My Profile</a>
            <a href="/messages"><i class="fa-solid fa-envelope"></i> Messages</a>
            <hr>
            <button onclick="logout()"><i class="fa-solid fa-right-from-bracket"></i> Logout</button>
          </div>
        </div>
      ` : `
        <a href="/login" class="btn btn-outline btn-sm">Login</a>
        <a href="/register" class="btn btn-primary btn-sm">Sign Up</a>
      `}
    </div>
  `;

  // Mobile menu toggle
  const mobileBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  if (mobileBtn && sidebar) {
    mobileBtn.addEventListener('click', () => {
      sidebar.classList.toggle('show');
      if (overlay) overlay.classList.toggle('show');
    });
  }

  if (overlay && sidebar) {
    overlay.addEventListener('click', () => {
      sidebar.classList.remove('show');
      overlay.classList.remove('show');
    });
  }
}

function toggleDropdown() {
  const dropdown = document.getElementById('user-dropdown');
  const btn = document.getElementById('avatar-btn');
  if (dropdown) {
    const isOpen = dropdown.classList.toggle('show');
    if (btn) btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('user-dropdown');
  const btn = document.getElementById('avatar-btn');
  if (menu && btn && !btn.contains(e.target) && !menu.contains(e.target)) {
    menu.classList.remove('show');
    btn.setAttribute('aria-expanded', 'false');
  }
});

function handleSearch(e) {
  e.preventDefault();
  const q = document.getElementById('search-input').value.trim();
  if (q) window.location.href = `/search?q=${encodeURIComponent(q)}`;
}

// ── Sidebar builder ────────────────────────────────────────────
function buildSidebar(activePage) {
  const sidebarEl = document.getElementById('sidebar');
  if (!sidebarEl) return;

  const user = getUser();

  sidebarEl.innerHTML = `
    <ul class="sidebar-nav">
      <li><a href="/" class="${activePage === 'home' ? 'active' : ''}"><span class="icon"><i class="fa-solid fa-house"></i></span> Home</a></li>
      <li><a href="/search" class="${activePage === 'search' ? 'active' : ''}"><span class="icon"><i class="fa-solid fa-magnifying-glass"></i></span> Explore</a></li>
      ${user ? `
        <li><a href="/?tab=feed" class="${activePage === 'feed' ? 'active' : ''}"><span class="icon"><i class="fa-solid fa-tv"></i></span> Subscriptions</a></li>
        <hr class="sidebar-divider">
        <li><a href="/messages" class="${activePage === 'messages' ? 'active' : ''}"><span class="icon"><i class="fa-solid fa-envelope"></i></span> Messages</a></li>
        <li><a href="/profile?user=${encodeURIComponent(user.username)}" class="${activePage === 'profile' ? 'active' : ''}"><span class="icon"><i class="fa-solid fa-user"></i></span> Profile</a></li>
        <li><a href="/upload" class="${activePage === 'upload' ? 'active' : ''}"><span class="icon"><i class="fa-solid fa-upload"></i></span> Upload</a></li>
      ` : `
        <hr class="sidebar-divider">
        <li><a href="/login"><span class="icon"><i class="fa-solid fa-right-to-bracket"></i></span> Sign In</a></li>
      `}
    </ul>
  `;
}

// ── Logout ─────────────────────────────────────────────────────
async function logout() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch {}
  removeToken();
  window.location.href = '/login';
}

// ── Refresh user profile (to get avatar) ──────────────────────
async function refreshUserProfile() {
  if (!isLoggedIn()) return;
  try {
    const data = await apiRequest('/api/users/me/profile');
    setUser(data);
  } catch {}
}
