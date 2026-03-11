/* video.js — Video upload, watch, feed logic */

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  buildNavbar(page);
  buildSidebar(page);

  if (page === 'home') initHomePage();
  else if (page === 'upload') initUploadPage();
  else if (page === 'watch') initWatchPage();
});

// ─── HOME PAGE ────────────────────────────────────────────────
async function initHomePage() {
  const params = new URLSearchParams(window.location.search);
  const tab = params.get('tab') || 'all';

  const tabsEl = document.getElementById('tabs');
  const gridEl = document.getElementById('video-grid');

  if (tabsEl) {
    tabsEl.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
      btn.onclick = () => {
        const url = btn.dataset.tab === 'all' ? '/' : `/?tab=${btn.dataset.tab}`;
        window.location.href = url;
      };
    });

    // Only show subscriptions tab if logged in
    const feedTab = tabsEl.querySelector('[data-tab="feed"]');
    if (feedTab && !isLoggedIn()) feedTab.style.display = 'none';
  }

  if (tab === 'feed' && isLoggedIn()) {
    await loadFeed(gridEl);
  } else {
    await loadAllVideos(gridEl);
  }
}

let currentPage = 1;
const PAGE_SIZE = 12;

async function loadAllVideos(container, page = 1, append = false) {
  if (!append) {
    container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading videos...</p></div>';
  }

  try {
    const data = await apiRequest(`/api/videos?page=${page}&limit=${PAGE_SIZE}`);
    if (!append) container.innerHTML = '';

    if (!data.videos || data.videos.length === 0) {
      if (page === 1) {
        container.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1">
            <div class="icon">📭</div>
            <h3>No videos yet</h3>
            <p>Be the first to upload a video!</p>
            ${isLoggedIn() ? '<a href="/upload" class="btn btn-primary" style="margin-top:12px">Upload Video</a>' : ''}
          </div>`;
      }
      return;
    }

    data.videos.forEach(v => {
      container.appendChild(buildVideoCard(v));
    });

    // Pagination
    const paginationEl = document.getElementById('pagination');
    if (paginationEl && data.total > PAGE_SIZE) {
      const totalPages = Math.ceil(data.total / PAGE_SIZE);
      paginationEl.innerHTML = '';

      const prevBtn = document.createElement('button');
      prevBtn.textContent = '← Prev';
      prevBtn.disabled = page <= 1;
      prevBtn.onclick = () => loadAllVideos(container, page - 1);

      const pageInfo = document.createElement('span');
      pageInfo.style.cssText = 'padding:8px;font-size:0.9rem;color:var(--text-secondary)';
      pageInfo.textContent = `Page ${page} of ${totalPages}`;

      const nextBtn = document.createElement('button');
      nextBtn.textContent = 'Next →';
      nextBtn.disabled = page >= totalPages;
      nextBtn.onclick = () => loadAllVideos(container, page + 1);

      paginationEl.append(prevBtn, pageInfo, nextBtn);
      if (page === totalPages) nextBtn.disabled = true;
    }
  } catch (err) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="icon">⚠️</div><h3>Failed to load videos</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function loadFeed(container) {
  if (!isLoggedIn()) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="icon">🔒</div><h3>Sign in to see your feed</h3><a href="/login" class="btn btn-primary" style="margin-top:12px">Sign In</a></div>`;
    return;
  }

  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading feed...</p></div>';

  try {
    const data = await apiRequest('/api/videos/feed');
    container.innerHTML = '';

    if (!data.videos || data.videos.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="icon">📺</div>
          <h3>Your feed is empty</h3>
          <p>Follow some creators to see their videos here!</p>
          <a href="/" class="btn btn-primary" style="margin-top:12px">Explore Videos</a>
        </div>`;
      return;
    }

    data.videos.forEach(v => container.appendChild(buildVideoCard(v)));
  } catch (err) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="icon">⚠️</div><h3>Failed to load feed</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

// ─── UPLOAD PAGE ──────────────────────────────────────────────
function initUploadPage() {
  if (!isLoggedIn()) {
    window.location.href = '/login';
    return;
  }

  const dropzone = document.getElementById('dropzone');
  const videoInput = document.getElementById('video-input');
  const thumbnailInput = document.getElementById('thumbnail-input');
  const selectedFile = document.getElementById('selected-file');
  const uploadForm = document.getElementById('upload-form');
  const progressBar = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');

  // Dropzone click to browse
  dropzone.addEventListener('click', () => videoInput.click());

  // Drag and drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleVideoFile(file);
  });

  videoInput.addEventListener('change', () => {
    if (videoInput.files[0]) handleVideoFile(videoInput.files[0]);
  });

  function handleVideoFile(file) {
    const allowed = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'];
    if (!allowed.includes(file.type) && !file.name.match(/\.(mp4|webm|ogg|mov|avi)$/i)) {
      showToast('Please select a valid video file (MP4, WebM, OGG, MOV, AVI)', 'error');
      return;
    }
    videoInput.files = createFileList(file);
    selectedFile.innerHTML = `<strong>${escapeHtml(file.name)}</strong> (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
    selectedFile.style.display = 'block';
    dropzone.querySelector('.icon').textContent = '✅';
  }

  function createFileList(file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt.files;
  }

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('title').value.trim();
    const description = document.getElementById('description').value.trim();

    if (!title) {
      showToast('Please enter a title', 'error');
      return;
    }

    if (!videoInput.files[0]) {
      showToast('Please select a video file', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('video', videoInput.files[0]);
    formData.append('title', title);
    formData.append('description', description);
    if (thumbnailInput.files[0]) {
      formData.append('thumbnail', thumbnailInput.files[0]);
    }

    const btn = uploadForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Uploading…';

    // Show progress
    document.getElementById('upload-progress').style.display = 'block';

    try {
      const xhr = new XMLHttpRequest();
      const token = getToken();

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          progressBar.style.width = pct + '%';
          progressText.textContent = pct + '%';
        }
      };

      const uploadPromise = new Promise((resolve, reject) => {
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) resolve(data);
            else reject(new Error(data.error || `Upload failed`));
          } catch {
            reject(new Error('Invalid server response'));
          }
        };
        xhr.onerror = () => reject(new Error('Network error'));
      });

      xhr.open('POST', '/api/videos/upload');
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.send(formData);

      const data = await uploadPromise;
      showToast('Video uploaded successfully!', 'success');
      setTimeout(() => { window.location.href = `/watch?id=${data.video.id}`; }, 1000);
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Upload Video';
      document.getElementById('upload-progress').style.display = 'none';
    }
  });
}

// ─── WATCH PAGE ───────────────────────────────────────────────
async function initWatchPage() {
  const params = new URLSearchParams(window.location.search);
  const videoId = params.get('id');

  if (!videoId) {
    window.location.href = '/';
    return;
  }

  try {
    const video = await apiRequest(`/api/videos/${videoId}`);
    renderVideoPlayer(video);
    loadRelatedVideos(video);
    loadComments(videoId);
  } catch (err) {
    document.getElementById('watch-content').innerHTML = `
      <div class="empty-state">
        <div class="icon">❌</div>
        <h3>Video not found</h3>
        <p>${escapeHtml(err.message)}</p>
        <a href="/" class="btn btn-primary" style="margin-top:12px">Go Home</a>
      </div>`;
  }
}

function renderVideoPlayer(video) {
  const el = document.getElementById('video-player-area');
  if (!el) return;

  const ext = video.filename ? video.filename.split('.').pop().toLowerCase() : 'mp4';
  const mimeMap = { mp4: 'video/mp4', webm: 'video/webm', ogg: 'video/ogg', mov: 'video/quicktime', avi: 'video/x-msvideo' };
  const mime = mimeMap[ext] || 'video/mp4';

  const user = getUser();
  const isOwner = user && user.id === video.user_id;
  const uploaderAvatar = video.avatar
    ? `<img src="/uploads/${video.avatar}" alt="${escapeHtml(video.username)}" class="uploader-avatar" style="width:48px;height:48px;border-radius:50%;object-fit:cover">`
    : `<div class="uploader-avatar" style="background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1rem;width:48px;height:48px;border-radius:50%">${avatarInitials(video.username)}</div>`;

  el.innerHTML = `
    <div class="video-player-wrapper">
      <video controls autoplay id="video-el">
        <source src="/api/videos/stream/${encodeURIComponent(video.filename)}" type="${mime}">
        Your browser does not support the video tag.
      </video>
    </div>
    <div class="video-details">
      <h1>${escapeHtml(video.title)}</h1>
      <div class="video-actions-bar">
        <div class="video-stats">
          <span>👁 ${formatViews(video.views)} views</span>
          <span>•</span>
          <span>${formatDate(video.created_at)}</span>
        </div>
        <button class="like-btn ${video.liked_by_me ? 'liked' : ''}" id="like-btn" onclick="toggleLike(${video.id})">
          ❤️ <span id="like-count">${video.like_count || 0}</span>
        </button>
        ${isOwner ? `<button class="btn btn-danger btn-sm" onclick="deleteVideo(${video.id})">🗑 Delete</button>` : ''}
      </div>
      <div class="uploader-info">
        ${uploaderAvatar}
        <div class="uploader-details">
          <div class="name"><a href="/profile?user=${encodeURIComponent(video.username)}">${escapeHtml(video.username)}</a></div>
          <div class="follower-count" id="follower-count">Loading…</div>
        </div>
        ${user && user.id !== video.user_id ? `
          <button class="btn btn-outline" id="follow-btn" onclick="toggleFollow(${video.user_id})">Follow</button>
        ` : ''}
      </div>
      ${video.description ? `<div style="color:var(--text-secondary);font-size:0.9rem;margin-top:8px;line-height:1.6">${escapeHtml(video.description)}</div>` : ''}
    </div>
  `;

  loadUploaderInfo(video.user_id, video.username);
}

async function loadUploaderInfo(userId, username) {
  try {
    const data = await apiRequest(`/api/users/${username}`);
    const fcEl = document.getElementById('follower-count');
    if (fcEl) fcEl.textContent = `${formatViews(data.follower_count)} followers`;

    const followBtn = document.getElementById('follow-btn');
    if (followBtn && data.is_following) {
      followBtn.textContent = 'Following';
      followBtn.classList.add('btn-primary');
      followBtn.classList.remove('btn-outline');
    }
  } catch {}
}

async function toggleLike(videoId) {
  if (!isLoggedIn()) {
    window.location.href = '/login';
    return;
  }

  try {
    const data = await apiRequest(`/api/likes/${videoId}`, { method: 'POST' });
    const btn = document.getElementById('like-btn');
    const countEl = document.getElementById('like-count');

    if (btn) btn.classList.toggle('liked', data.liked);
    if (countEl) countEl.textContent = data.like_count;
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function toggleFollow(userId) {
  if (!isLoggedIn()) {
    window.location.href = '/login';
    return;
  }

  try {
    const data = await apiRequest(`/api/users/${userId}/follow`, { method: 'POST' });
    const btn = document.getElementById('follow-btn');
    if (btn) {
      btn.textContent = data.following ? 'Following' : 'Follow';
      btn.classList.toggle('btn-primary', data.following);
      btn.classList.toggle('btn-outline', !data.following);
    }
    showToast(data.message, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function deleteVideo(videoId) {
  if (!confirm('Delete this video? This action cannot be undone.')) return;

  try {
    await apiRequest(`/api/videos/${videoId}`, { method: 'DELETE' });
    showToast('Video deleted.', 'success');
    setTimeout(() => { window.location.href = '/'; }, 800);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadRelatedVideos(currentVideo) {
  const container = document.getElementById('related-videos');
  if (!container) return;

  try {
    const data = await apiRequest('/api/videos?limit=6');
    container.innerHTML = '<h3 style="font-size:1rem;font-weight:600;margin-bottom:12px">Up Next</h3>';

    data.videos
      .filter(v => v.id !== currentVideo.id)
      .slice(0, 5)
      .forEach(v => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;gap:10px;padding:8px 0;cursor:pointer;border-radius:8px;transition:background 0.2s';
        item.onmouseover = () => item.style.background = 'var(--bg)';
        item.onmouseout = () => item.style.background = '';
        item.onclick = () => { window.location.href = `/watch?id=${v.id}`; };

        const thumb = v.thumbnail
          ? `<img src="/uploads/${v.thumbnail}" style="width:120px;height:67px;object-fit:cover;border-radius:6px;flex-shrink:0" alt="${escapeHtml(v.title)}">`
          : `<div style="width:120px;height:67px;background:linear-gradient(135deg,#e8f0fe,#c5d8fd);border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--primary);font-size:1.5rem">▶</div>`;

        item.innerHTML = `
          ${thumb}
          <div style="flex:1;min-width:0">
            <div style="font-size:0.85rem;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${escapeHtml(v.title)}</div>
            <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:4px">${escapeHtml(v.username)}</div>
            <div style="font-size:0.78rem;color:var(--text-light)">${formatViews(v.views)} views</div>
          </div>
        `;

        container.appendChild(item);
      });
  } catch {}
}
