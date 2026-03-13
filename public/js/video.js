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
            <div class="icon"><i class="fa-solid fa-inbox"></i></div>
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
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="icon"><i class="fa-solid fa-triangle-exclamation"></i></div><h3>Failed to load videos</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function loadFeed(container) {
  if (!isLoggedIn()) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="icon"><i class="fa-solid fa-lock"></i></div><h3>Sign in to see your feed</h3><a href="/login" class="btn btn-primary" style="margin-top:12px">Sign In</a></div>`;
    return;
  }

  container.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Loading feed...</p></div>';

  try {
    const data = await apiRequest('/api/videos/feed');
    container.innerHTML = '';

    if (!data.videos || data.videos.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="icon"><i class="fa-solid fa-tv"></i></div>
          <h3>Your feed is empty</h3>
          <p>Follow some creators to see their videos here!</p>
          <a href="/" class="btn btn-primary" style="margin-top:12px">Explore Videos</a>
        </div>`;
      return;
    }

    data.videos.forEach(v => container.appendChild(buildVideoCard(v)));
  } catch (err) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="icon"><i class="fa-solid fa-triangle-exclamation"></i></div><h3>Failed to load feed</h3><p>${escapeHtml(err.message)}</p></div>`;
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
  let autoThumbBlob = null; // canvas-captured thumbnail

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
    dropzone.querySelector('.icon').innerHTML = '<i class="fa-solid fa-circle-check"></i>';

    // Auto-generate thumbnail from first frame using HTML5 Canvas
    captureVideoThumbnail(file);
  }

  function createFileList(file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt.files;
  }

  function captureVideoThumbnail(file) {
    const objectUrl = URL.createObjectURL(file);
    const videoEl = document.createElement('video');
    videoEl.src = objectUrl;
    videoEl.muted = true;
    videoEl.preload = 'metadata';

    videoEl.addEventListener('loadedmetadata', () => {
      // Seek to 10% of duration (or 1s, whichever is smaller) — safe for short clips
      videoEl.currentTime = Math.min(1, videoEl.duration * 0.1) || 0;
    }, { once: true });

    videoEl.addEventListener('seeked', () => {
      const canvas = document.getElementById('thumb-canvas');
      if (!canvas) return;
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, 1280, 720);

      canvas.toBlob((blob) => {
        if (!blob) return;
        autoThumbBlob = blob;
        const preview = document.getElementById('auto-thumb-preview');
        const row = document.getElementById('auto-thumb-row');
        if (preview) preview.src = URL.createObjectURL(blob);
        if (row) row.style.display = 'block';
      }, 'image/jpeg', 0.85);

      URL.revokeObjectURL(objectUrl);
    }, { once: true });

    videoEl.load();
  }

  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('title').value.trim();
    const description = document.getElementById('description').value.trim();
    const category = document.getElementById('category') ? document.getElementById('category').value : '';

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
    if (category) formData.append('category', category);

    // Use custom thumbnail if provided, otherwise use auto-captured frame
    if (thumbnailInput && thumbnailInput.files[0]) {
      formData.append('thumbnail', thumbnailInput.files[0]);
    } else if (autoThumbBlob) {
      formData.append('thumbnail', autoThumbBlob, 'auto-thumbnail.jpg');
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
      // Redirect to short URL if vid_id exists
      const redirectUrl = data.video.vid_id ? `/watch/${data.video.vid_id}` : `/watch?id=${data.video.id}`;
      setTimeout(() => { window.location.href = redirectUrl; }, 1000);
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
  // Support both ?id= (numeric) and /watch/:vid_id (path param)
  let videoId = params.get('id');
  let vidId = null;

  // Check if we loaded via /watch/:vid_id path
  const pathParts = window.location.pathname.split('/');
  if (pathParts.length === 3 && pathParts[1] === 'watch' && pathParts[2]) {
    vidId = pathParts[2];
  }

  if (!videoId && !vidId) {
    window.location.href = '/';
    return;
  }

  try {
    let video;
    if (vidId) {
      video = await apiRequest(`/api/videos/by-vid/${encodeURIComponent(vidId)}`);
    } else {
      video = await apiRequest(`/api/videos/${videoId}`);
    }
    // Canonicalize URL to /watch/:vid_id
    if (video.vid_id && window.location.pathname === '/watch') {
      window.history.replaceState({}, '', `/watch/${video.vid_id}`);
    }
    renderVideoPlayer(video);
    loadRelatedVideos(video);
    loadComments(video.id);
  } catch (err) {
    document.getElementById('watch-content').innerHTML = `
      <div class="empty-state">
        <div class="icon"><i class="fa-solid fa-circle-xmark"></i></div>
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

  const bluetick = video.bluetick === 2 ? ' <img src="/img/bluetick.svg" class="bluetick-icon" alt="✓" title="Verified">' : '';
  const watchUrl = video.vid_id ? `${window.location.origin}/watch/${video.vid_id}` : `${window.location.origin}/watch?id=${video.id}`;
  const categoryTag = video.category ? `<span class="category-tag" style="margin-left:8px">${escapeHtml(video.category)}</span>` : '';

  // Update page meta tags for SEO
  document.title = `${video.title} — StreamHub`;
  updateMetaTag('name', 'description', video.description || `Watch ${video.title} on StreamHub`);
  updateMetaTag('property', 'og:title', video.title);
  updateMetaTag('property', 'og:description', video.description || `Watch ${video.title} on StreamHub`);
  updateMetaTag('property', 'og:url', watchUrl);
  updateMetaTag('property', 'og:type', 'video.other');
  if (video.thumbnail) {
    updateMetaTag('property', 'og:image', `${window.location.origin}/api/videos/thumbnail/${video.thumbnail}`);
    updateMetaTag('name', 'twitter:image', `${window.location.origin}/api/videos/thumbnail/${video.thumbnail}`);
  }
  updateMetaTag('name', 'twitter:title', video.title);
  updateMetaTag('name', 'twitter:description', video.description || `Watch ${video.title} on StreamHub`);

  // Inject JSON-LD VideoObject schema for Google search
  let schemaEl = document.getElementById('video-schema');
  if (!schemaEl) {
    schemaEl = document.createElement('script');
    schemaEl.id = 'video-schema';
    schemaEl.type = 'application/ld+json';
    document.head.appendChild(schemaEl);
  }
  schemaEl.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    'name': video.title,
    'description': video.description || video.title,
    'thumbnailUrl': video.thumbnail ? `${window.location.origin}/api/videos/thumbnail/${video.thumbnail}` : '',
    'uploadDate': video.created_at,
    'contentUrl': `${window.location.origin}/api/videos/stream/${video.filename}`,
    'url': watchUrl,
    'interactionStatistic': {
      '@type': 'InteractionCounter',
      'interactionType': 'https://schema.org/WatchAction',
      'userInteractionCount': video.views || 0
    },
    'author': {
      '@type': 'Person',
      'name': video.username,
      'url': `${window.location.origin}/@${video.username}`
    }
  });

  el.innerHTML = `
    <div class="video-player-wrapper">
      <video controls autoplay id="video-el" playsinline controlslist="nodownload" oncontextmenu="return false">
        <source src="/api/videos/stream/${encodeURIComponent(video.filename)}" type="${mime}">
        Your browser does not support the video tag.
      </video>
    </div>
    <div class="video-details">
      <h1>${escapeHtml(video.title)}${categoryTag}</h1>
      <div class="video-actions-bar">
        <div class="video-stats">
          <span><i class="fa-solid fa-eye"></i> ${formatViews(video.views)} views</span>
          <span>•</span>
          <span>${formatDate(video.created_at)}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button class="like-btn ${video.liked_by_me ? 'liked' : ''}" id="like-btn" onclick="toggleLike(${video.id})" aria-label="Like this video" aria-pressed="${video.liked_by_me ? 'true' : 'false'}">
            <i class="fa-solid fa-heart"></i> <span id="like-count">${video.like_count || 0}</span>
          </button>
          <button class="btn btn-outline btn-sm" id="share-video-btn"><i class="fa-solid fa-share-nodes"></i> Share</button>
          ${isOwner ? `
            <button class="btn btn-outline btn-sm" onclick="openChangeThumbnail(${video.id})"><i class="fa-solid fa-image"></i> Thumbnail</button>
            <button class="btn btn-danger btn-sm" onclick="deleteVideo(${video.id})"><i class="fa-solid fa-trash"></i> Delete</button>
          ` : ''}
        </div>
      </div>
      <div class="uploader-info">
        ${uploaderAvatar}
        <div class="uploader-details">
          <div class="name"><a href="/@${encodeURIComponent(video.username)}">${escapeHtml(video.username)}${bluetick}</a></div>
          <div class="follower-count stat-clickable" id="follower-count" style="cursor:pointer" title="View followers">Loading…</div>
        </div>
        ${user && user.id !== video.user_id ? `
          <button class="btn btn-outline" id="follow-btn" onclick="toggleFollow(${video.user_id})">Follow</button>
        ` : ''}
      </div>
      ${video.description ? `<div style="color:var(--text-secondary);font-size:0.9rem;margin-top:8px;line-height:1.6">${escapeHtml(video.description)}</div>` : ''}
    </div>
  `;

  // Attach share button event listener (avoids inline onclick XSS risks)
  const shareBtn = document.getElementById('share-video-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => openShareModal(watchUrl, video.title));
  }

  // Initialise Plyr video player if available
  if (typeof Plyr !== 'undefined') {
    new Plyr('#video-el', {
      controls: ['play-large', 'rewind', 'play', 'fast-forward', 'progress', 'current-time', 'duration', 'mute', 'volume', 'fullscreen'],
      keyboard: { focused: true, global: false }
    });
  }

  // Record watch history for logged-in users
  if (isLoggedIn()) {
    apiRequest(`/api/users/me/history/${video.id}`, { method: 'POST' }).catch((err) => {
      console.error('Watch history recording failed:', err);
    });
  }

  loadUploaderInfo(video.user_id, video.username);
}

function updateMetaTag(attr, name, content) {
  let tag = document.querySelector(`meta[${attr}="${name}"]`);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attr, name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
}

async function loadUploaderInfo(userId, username) {
  try {
    const data = await apiRequest(`/api/users/${username}`);
    const fcEl = document.getElementById('follower-count');
    if (fcEl) {
      fcEl.textContent = `${formatViews(data.follower_count)} followers`;
      fcEl.onclick = () => showFollowList(username, 'followers');
    }

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
    if (btn) btn.setAttribute('aria-pressed', data.liked ? 'true' : 'false');
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
        const watchUrl = v.vid_id ? `/watch/${v.vid_id}` : `/watch?id=${v.id}`;
        item.onclick = () => { window.location.href = watchUrl; };

        const thumb = v.thumbnail
          ? `<img src="/uploads/${v.thumbnail}" style="width:120px;height:67px;object-fit:cover;border-radius:6px;flex-shrink:0" alt="${escapeHtml(v.title)}">`
          : `<div style="width:120px;height:67px;background:linear-gradient(135deg,#e8f0fe,#c5d8fd);border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--primary);font-size:1.5rem"><i class="fa-solid fa-play"></i></div>`;

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

// ─── SHARE MODAL ──────────────────────────────────────────────
function openShareModal(url, title) {
  let modal = document.getElementById('share-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'share-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h3><i class="fa-solid fa-share-nodes"></i> Share Video</h3>
        <button class="modal-close" onclick="document.getElementById('share-modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="share-link-row">
          <input type="text" id="share-link-input" value="${escapeHtml(url)}" readonly>
          <button class="btn btn-primary btn-sm" onclick="copyShareLink()"><i class="fa-solid fa-copy"></i> Copy</button>
        </div>
        <div class="share-platforms">
          <a href="https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}" target="_blank" rel="noopener" class="share-btn whatsapp"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a>
          <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}" target="_blank" rel="noopener" class="share-btn twitter"><i class="fa-brands fa-x-twitter"></i> X / Twitter</a>
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank" rel="noopener" class="share-btn facebook"><i class="fa-brands fa-facebook"></i> Facebook</a>
          <a href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}" target="_blank" rel="noopener" class="share-btn telegram"><i class="fa-brands fa-telegram"></i> Telegram</a>
        </div>
      </div>
    </div>
  `;

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

function copyShareLink() {
  const input = document.getElementById('share-link-input');
  if (input) {
    navigator.clipboard.writeText(input.value).then(() => {
      showToast('Link copied!', 'success');
    }).catch(() => {
      input.select();
      document.execCommand('copy');
      showToast('Link copied!', 'success');
    });
  }
}

// ─── CHANGE THUMBNAIL ─────────────────────────────────────────
function openChangeThumbnail(videoId) {
  let modal = document.getElementById('thumbnail-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'thumbnail-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h3><i class="fa-solid fa-image"></i> Change Thumbnail</h3>
        <button class="modal-close" onclick="document.getElementById('thumbnail-modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:12px">Upload a new thumbnail image (JPG, PNG, WebP — max 5MB)</p>
        <input type="file" id="new-thumbnail-input" accept="image/*" style="margin-bottom:12px;display:block">
        <button class="btn btn-primary" onclick="uploadNewThumbnail(${videoId})"><i class="fa-solid fa-upload"></i> Upload Thumbnail</button>
      </div>
    </div>
  `;

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

async function uploadNewThumbnail(videoId) {
  const input = document.getElementById('new-thumbnail-input');
  if (!input || !input.files[0]) {
    showToast('Please select an image file.', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('thumbnail', input.files[0]);

  try {
    const token = getToken();
    const res = await fetch(`/api/videos/${videoId}/thumbnail`, {
      method: 'PUT',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    showToast('Thumbnail updated!', 'success');
    const modal = document.getElementById('thumbnail-modal');
    if (modal) modal.remove();
    setTimeout(() => window.location.reload(), 800);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ─── ADD TO PLAYLIST ──────────────────────────────────────────
async function openAddToPlaylist(videoId) {
  if (!isLoggedIn()) {
    window.location.href = '/login';
    return;
  }

  let modal = document.getElementById('playlist-add-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'playlist-add-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <h3><i class="fa-solid fa-list-ul"></i> Add to Playlist</h3>
        <button class="modal-close" onclick="document.getElementById('playlist-add-modal').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <div id="playlist-list" style="margin-bottom:16px">
          <div class="loading-spinner" style="padding:16px"><div class="spinner"></div></div>
        </div>
        <hr style="border:none;border-top:1px solid var(--border);margin-bottom:16px">
        <div>
          <p style="font-size:0.88rem;font-weight:600;margin-bottom:8px">Create new playlist</p>
          <div style="display:flex;gap:8px">
            <input type="text" id="new-playlist-title" class="form-control" placeholder="Playlist title…" maxlength="100">
            <button class="btn btn-primary btn-sm" onclick="createAndAdd(${videoId})"><i class="fa-solid fa-plus"></i> Create</button>
          </div>
        </div>
      </div>
    </div>
  `;

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);

  // Load user's playlists
  try {
    const data = await apiRequest('/api/playlists/my');
    const listEl = document.getElementById('playlist-list');
    if (!listEl) return;

    if (!data.playlists || !data.playlists.length) {
      listEl.innerHTML = '<p style="font-size:0.85rem;color:var(--text-secondary)">No playlists yet. Create one below.</p>';
      return;
    }

    listEl.innerHTML = '';
    data.playlists.forEach(pl => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-outline btn-sm';
      btn.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;text-align:left;margin-bottom:8px;justify-content:flex-start';
      btn.innerHTML = `<i class="fa-solid fa-list-ul"></i> ${escapeHtml(pl.title)} <span style="margin-left:auto;color:var(--text-light);font-size:0.78rem">${pl.video_count} videos</span>`;
      btn.onclick = () => addToPlaylist(pl.pid, videoId);
      listEl.appendChild(btn);
    });
  } catch {}
}

async function addToPlaylist(pid, videoId) {
  try {
    await apiRequest(`/api/playlists/${pid}/videos`, {
      method: 'POST',
      body: JSON.stringify({ video_id: videoId })
    });
    showToast('Added to playlist!', 'success');
    const modal = document.getElementById('playlist-add-modal');
    if (modal) modal.remove();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function createAndAdd(videoId) {
  const titleInput = document.getElementById('new-playlist-title');
  const title = titleInput ? titleInput.value.trim() : '';
  if (!title) {
    showToast('Please enter a playlist title.', 'error');
    return;
  }

  try {
    const data = await apiRequest('/api/playlists', {
      method: 'POST',
      body: JSON.stringify({ title, is_public: 1 })
    });
    await addToPlaylist(data.playlist.pid, videoId);
  } catch (err) {
    showToast(err.message, 'error');
  }
}
