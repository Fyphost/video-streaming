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

// ── Date formatting (Indian Standard Time — IST, UTC+5:30) ─────
// Dates are displayed in IST since this platform targets Indian users.
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - date) / 1000);

  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Kolkata'
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata'
  });
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
  // Prefer short vid_id URL, fall back to ?id=
  const watchUrl = video.vid_id ? `/watch/${video.vid_id}` : `/watch?id=${video.id}`;
  card.onclick = () => { window.location.href = watchUrl; };

  const thumbnailHtml = video.thumbnail
    ? `<img src="/uploads/${video.thumbnail}" alt="${escapeHtml(video.title)}" loading="lazy" oncontextmenu="return false" draggable="false">`
    : `<div class="placeholder"><i class="fa-solid fa-play"></i></div>`;

  const uploaderAvatar = video.avatar
    ? `<img src="/uploads/${video.avatar}" alt="${escapeHtml(video.username)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover">`
    : `<span class="avatar-placeholder">${avatarInitials(video.username)}</span>`;

  const profileUrl = video.username ? `/@${encodeURIComponent(video.username)}` : '#';
  const bluetick = video.bluetick === 2 ? ' <i class="fa-solid fa-circle-check bluetick-icon" title="Verified"></i>' : '';
  const categoryTag = video.category ? `<span class="category-tag">${escapeHtml(video.category)}</span>` : '';

  card.innerHTML = `
    <div class="video-thumbnail">
      ${thumbnailHtml}
      ${categoryTag}
    </div>
    <div class="video-info">
      <div class="video-title">${escapeHtml(video.title)}</div>
      <div class="video-meta">
        <a class="uploader" href="${profileUrl}" onclick="event.stopPropagation()">
          ${uploaderAvatar}
          ${escapeHtml(video.username)}${bluetick}
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
    <a class="navbar-brand" href="/">
      <div class="logo-icon"><i class="fa-solid fa-play"></i></div>
      <span class="brand-name">StreamHub</span>
    </a>
    <div class="navbar-search-wrapper">
      <form class="navbar-search" id="search-form" onsubmit="handleSearch(event)" role="search">
        <input type="search" placeholder="Search videos..." id="search-input" value="${escapeHtml(searchQuery)}" aria-label="Search videos" autocomplete="off">
        <button type="submit" aria-label="Search"><i class="fa-solid fa-magnifying-glass"></i></button>
      </form>
      <div class="search-suggestions" id="navbar-suggestions"></div>
    </div>
    <div class="navbar-actions">
      <button class="search-toggle-btn" id="search-toggle-btn" aria-label="Open search" aria-expanded="false">
        <i class="fa-solid fa-magnifying-glass"></i>
      </button>
      ${user ? `
        <a href="/upload" class="btn btn-primary btn-sm navbar-upload-btn"><i class="fa-solid fa-upload"></i> <span class="btn-label">Upload</span></a>
        <div class="user-menu">
          <div class="user-avatar-btn" id="avatar-btn" onclick="toggleDropdown()" aria-label="User menu" aria-haspopup="true" aria-expanded="false">
            ${user.avatar ? `<img src="/uploads/${user.avatar}" alt="${escapeHtml(user.username)}">` : escapeHtml(avatarInitials(user.username))}
          </div>
          <div class="user-dropdown" id="user-dropdown">
            <a href="/@${encodeURIComponent(user.username)}"><i class="fa-solid fa-user"></i> My Profile</a>
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

  // Mobile search toggle
  const searchToggleBtn = document.getElementById('search-toggle-btn');
  if (searchToggleBtn) {
    searchToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navbarEl.classList.toggle('search-open');
      searchToggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      if (isOpen) {
        const input = document.getElementById('search-input');
        if (input) input.focus();
      }
    });
  }

  // Close mobile search on outside click
  document.addEventListener('click', (e) => {
    if (!navbarEl.contains(e.target) && navbarEl.classList.contains('search-open')) {
      navbarEl.classList.remove('search-open');
      if (searchToggleBtn) searchToggleBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // AJAX search suggestions
  const searchInput = document.getElementById('search-input');
  const suggestionsEl = document.getElementById('navbar-suggestions');
  let suggestTimer = null;
  if (searchInput && suggestionsEl) {
    searchInput.addEventListener('input', () => {
      clearTimeout(suggestTimer);
      const val = searchInput.value.trim();
      if (!val) { suggestionsEl.innerHTML = ''; suggestionsEl.style.display = 'none'; return; }
      suggestTimer = setTimeout(async () => {
        try {
          const data = await fetch(`/api/videos/suggestions?q=${encodeURIComponent(val)}`).then(r => r.json());
          if (!data.suggestions || !data.suggestions.length) {
            suggestionsEl.style.display = 'none';
            return;
          }
          suggestionsEl.innerHTML = '';
          data.suggestions.forEach(s => {
            const div = document.createElement('div');
            div.className = 'suggestion-item';
            div.textContent = s;
            div.addEventListener('mousedown', (e) => { e.preventDefault(); applySuggestion(s); });
            suggestionsEl.appendChild(div);
          });
          suggestionsEl.style.display = 'block';
        } catch {}
      }, 200);
    });

    searchInput.addEventListener('blur', () => {
      setTimeout(() => { suggestionsEl.style.display = 'none'; }, 200);
    });
  }

  // Build mobile bottom navigation
  buildBottomNav(activePage);
}

// ── Bottom Navigation (mobile) ─────────────────────────────────
function buildBottomNav(activePage) {
  const user = getUser();

  // Remove any existing bottom nav before re-building
  const existing = document.getElementById('bottom-nav');
  if (existing) existing.remove();

  const nav = document.createElement('nav');
  nav.className = 'bottom-nav';
  nav.id = 'bottom-nav';
  nav.setAttribute('aria-label', 'Mobile navigation');

  nav.innerHTML = `
    <a href="/" class="bottom-nav-item ${activePage === 'home' ? 'active' : ''}" aria-label="Home">
      <i class="fa-solid fa-house"></i>
      <span>Home</span>
    </a>
    <a href="/search" class="bottom-nav-item ${activePage === 'search' ? 'active' : ''}" aria-label="Search">
      <i class="fa-solid fa-magnifying-glass"></i>
      <span>Search</span>
    </a>
    ${user ? `
      <a href="/upload" class="bottom-nav-item ${activePage === 'upload' ? 'active' : ''}" aria-label="Upload">
        <i class="fa-solid fa-cloud-arrow-up"></i>
        <span>Upload</span>
      </a>
      <a href="/messages" class="bottom-nav-item ${activePage === 'messages' ? 'active' : ''}" aria-label="Messages">
        <i class="fa-solid fa-comments"></i>
        <span>Messages</span>
      </a>
      <a href="/@${encodeURIComponent(user.username)}" class="bottom-nav-item ${activePage === 'profile' ? 'active' : ''}" aria-label="Profile">
        <i class="fa-solid fa-circle-user"></i>
        <span>Profile</span>
      </a>
    ` : `
      <a href="/login" class="bottom-nav-item" aria-label="Sign In">
        <i class="fa-solid fa-right-to-bracket"></i>
        <span>Sign In</span>
      </a>
    `}
  `;

  document.body.appendChild(nav);
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

function applySuggestion(val) {
  const input = document.getElementById('search-input');
  if (input) {
    input.value = val;
    window.location.href = `/search?q=${encodeURIComponent(val)}`;
  }
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
        <li><a href="/history" class="${activePage === 'history' ? 'active' : ''}"><span class="icon"><i class="fa-solid fa-clock-rotate-left"></i></span> History</a></li>
        <li><a href="/@${encodeURIComponent(user.username)}" class="${activePage === 'profile' ? 'active' : ''}"><span class="icon"><i class="fa-solid fa-user"></i></span> Profile</a></li>
        <li><a href="/upload" class="${activePage === 'upload' ? 'active' : ''}"><span class="icon"><i class="fa-solid fa-upload"></i></span> Upload</a></li>
        ${user.is_admin ? `<li><a href="/admin/bluetick" class="${activePage === 'admin-bluetick' ? 'active' : ''}"><span class="icon"><i class="fa-solid fa-shield-halved"></i></span> Admin</a></li>` : ''}
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
