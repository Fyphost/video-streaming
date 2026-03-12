/* profile.js — Profile & follow logic */

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page !== 'profile') return;

  buildNavbar('profile');
  buildSidebar('profile');

  // Support both ?user=username and /@username path
  const params = new URLSearchParams(window.location.search);
  let username = params.get('user');

  if (!username) {
    // Check /@username path
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length === 2 && pathParts[1].startsWith('@')) {
      username = decodeURIComponent(pathParts[1].slice(1));
    }
  }

  if (!username) {
    // If no user specified, redirect to current user's profile
    const user = getUser();
    if (user) {
      window.location.href = `/@${encodeURIComponent(user.username)}`;
    } else {
      window.location.href = '/login';
    }
    return;
  }

  loadProfile(username);
});

async function loadProfile(username) {
  const headerEl = document.getElementById('profile-header');
  const videosEl = document.getElementById('profile-videos');
  const currentUser = getUser();

  try {
    const data = await apiRequest(`/api/users/${username}`);

    // Canonicalize URL to /@username
    if (window.location.search) {
      window.history.replaceState({}, '', `/@${encodeURIComponent(data.username)}`);
    }

    // Render header
    const isMe = currentUser && currentUser.id === data.id;
    const avatarHtml = data.avatar
      ? `<img src="/uploads/${data.avatar}" class="profile-avatar-large" alt="${escapeHtml(data.username)}">`
      : `<div class="profile-avatar-large">${avatarInitials(data.username)}</div>`;

    const bluetick = data.bluetick === 2 ? ' <img src="/img/bluetick.svg" class="bluetick-icon" alt="✓" title="Verified">' : '';

    headerEl.innerHTML = `
      ${avatarHtml}
      <div class="profile-info">
        <h1>${escapeHtml(data.username)}${bluetick}</h1>
        <p class="profile-bio">${escapeHtml(data.bio || 'No bio yet.')}</p>
        <div class="profile-stats">
          <div class="stat">
            <span class="value">${data.videos ? data.videos.length : 0}</span>
            <span class="label">Videos</span>
          </div>
          <div class="stat">
            <span class="value">${formatViews(data.follower_count)}</span>
            <span class="label">Followers</span>
          </div>
          <div class="stat">
            <span class="value">${formatViews(data.following_count)}</span>
            <span class="label">Following</span>
          </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
          ${isMe ? `
            <button class="btn btn-outline" onclick="showEditProfile()"><i class="fa-solid fa-pen"></i> Edit Profile</button>
            <a href="/upload" class="btn btn-primary"><i class="fa-solid fa-upload"></i> Upload Video</a>
            ${data.bluetick !== 2 ? `<button class="btn btn-outline" onclick="applyBluetick()" title="Apply for Verified Badge"><i class="fa-solid fa-circle-check" style="color:#1a73e8"></i> Get Verified</button>` : ''}
          ` : `
            <button class="btn ${data.is_following ? 'btn-primary' : 'btn-outline'}" id="follow-btn" onclick="toggleFollowProfile(${data.id})">
              <i class="fa-solid fa-user-plus"></i> ${data.is_following ? 'Following' : 'Follow'}
            </button>
            <button class="btn btn-outline" onclick="openMessageToUser(${data.id})"><i class="fa-solid fa-comment-dots"></i> Message</button>
          `}
        </div>
      </div>
    `;

    // Render videos
    if (!data.videos || data.videos.length === 0) {
      videosEl.innerHTML = `
        <div class="empty-state">
          <div class="icon"><i class="fa-solid fa-video"></i></div>
          <h3>${isMe ? 'You haven\'t uploaded any videos' : escapeHtml(data.username) + ' hasn\'t uploaded any videos'}</h3>
          ${isMe ? '<a href="/upload" class="btn btn-primary" style="margin-top:12px">Upload Your First Video</a>' : ''}
        </div>`;
    } else {
      const grid = document.createElement('div');
      grid.className = 'video-grid';
      data.videos.forEach(v => {
        const videoWithUser = { ...v, username: data.username, avatar: data.avatar };
        grid.appendChild(buildVideoCard(videoWithUser));
      });
      videosEl.appendChild(grid);
    }

    // Show tabs if it's the current user
    if (isMe) {
      const tabsEl = document.getElementById('profile-tabs');
      if (tabsEl) tabsEl.style.display = 'flex';
    }

  } catch (err) {
    headerEl.innerHTML = `
      <div class="empty-state">
        <div class="icon"><i class="fa-solid fa-circle-xmark"></i></div>
        <h3>User not found</h3>
        <p>${escapeHtml(err.message)}</p>
      </div>`;
  }
}

async function toggleFollowProfile(userId) {
  if (!isLoggedIn()) {
    window.location.href = '/login';
    return;
  }

  try {
    const data = await apiRequest(`/api/users/${userId}/follow`, { method: 'POST' });
    const btn = document.getElementById('follow-btn');
    if (btn) {
      btn.innerHTML = `<i class="fa-solid fa-user-plus"></i> ${data.following ? 'Following' : 'Follow'}`;
      btn.classList.toggle('btn-primary', data.following);
      btn.classList.toggle('btn-outline', !data.following);
    }
    showToast(data.message, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openMessageToUser(userId) {
  if (!isLoggedIn()) {
    window.location.href = '/login';
    return;
  }
  window.location.href = `/messages?user=${userId}`;
}

function showEditProfile() {
  const modal = document.getElementById('edit-profile-modal');
  if (!modal) return;

  const user = getUser();
  if (!user) return;

  // Pre-fill fields from the API
  apiRequest('/api/users/me/profile').then(data => {
    const bioInput = document.getElementById('edit-bio');
    const usernameInput = document.getElementById('edit-username');
    const preview = document.getElementById('avatar-preview');

    if (bioInput) {
      bioInput.value = data.bio || '';
      updateBioCount();
    }
    if (usernameInput) usernameInput.value = data.username || '';

    // Show current avatar in preview
    if (preview) {
      if (data.avatar) {
        preview.style.backgroundImage = `url('/uploads/${data.avatar}')`;
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
        preview.textContent = '';
      } else {
        preview.style.backgroundImage = '';
        preview.textContent = avatarInitials(data.username);
      }
    }
  }).catch(() => {});

  // Avatar preview on file select
  const avatarInput = document.getElementById('edit-avatar');
  const preview = document.getElementById('avatar-preview');
  if (avatarInput && preview) {
    avatarInput.onchange = () => {
      const file = avatarInput.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.style.backgroundImage = `url('${e.target.result}')`;
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
        preview.textContent = '';
      };
      reader.readAsDataURL(file);
    };
  }

  // Username availability check (debounced)
  const usernameInput = document.getElementById('edit-username');
  if (usernameInput) {
    let debounceTimer;
    usernameInput.oninput = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => checkUsernameAvailability(usernameInput.value.trim()), 500);
    };
  }

  modal.style.display = 'flex';
}

async function checkUsernameAvailability(username) {
  const statusEl = document.getElementById('username-status');
  if (!statusEl) return;

  const currentUser = getUser();
  if (!username || username === (currentUser && currentUser.username)) {
    statusEl.innerHTML = '';
    return;
  }

  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:var(--danger)"></i>';
    return;
  }

  try {
    // Use fetch directly so we can inspect the status code precisely
    const token = getToken();
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const response = await fetch(`/api/users/${encodeURIComponent(username)}`, { headers });

    if (response.ok) {
      // User found — username already taken
      statusEl.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:var(--danger)" title="Username taken"></i>';
    } else if (response.status === 404) {
      // No such user — username is available
      statusEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--success)" title="Username available"></i>';
    } else {
      // Server/network error — clear status, don't mislead
      statusEl.innerHTML = '';
    }
  } catch {
    // Network failure — clear status silently
    statusEl.innerHTML = '';
  }
}

function updateBioCount() {
  const bio = document.getElementById('edit-bio');
  const counter = document.getElementById('bio-char-count');
  if (bio && counter) counter.textContent = bio.value.length;
}

function closeEditProfile() {
  const modal = document.getElementById('edit-profile-modal');
  if (modal) modal.style.display = 'none';
}

async function saveProfile() {
  const bioInput = document.getElementById('edit-bio');
  const avatarInput = document.getElementById('edit-avatar');
  const usernameInput = document.getElementById('edit-username');
  const btn = document.getElementById('save-profile-btn');

  const bio = bioInput ? bioInput.value.trim() : '';
  const newUsername = usernameInput ? usernameInput.value.trim() : '';

  // Validate username if changed
  const currentUser = getUser();
  if (newUsername && newUsername !== currentUser.username) {
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(newUsername)) {
      showToast('Username must be 3–30 characters (letters, numbers, underscores only)', 'error');
      return;
    }
  }

  const formData = new FormData();
  formData.append('bio', bio);
  if (newUsername) formData.append('username', newUsername);
  if (avatarInput && avatarInput.files[0]) {
    formData.append('avatar', avatarInput.files[0]);
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving…'; }

  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const response = await fetch('/api/users/me', {
      method: 'PUT',
      headers,
      body: formData
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    setUser(data.user);
    showToast('Profile updated!', 'success');
    closeEditProfile();
    window.location.reload();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes'; }
  }
}

async function applyBluetick() {
  // Show a simple modal for bluetick application with Instagram URL
  let modal = document.getElementById('bluetick-modal');
  if (modal) modal.remove();

  modal = document.createElement('div');
  modal.id = 'bluetick-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;display:flex;align-items:center;justify-content:center;padding:16px';
  modal.innerHTML = `
    <div class="card" style="width:100%;max-width:480px;padding:24px;position:relative">
      <button onclick="document.getElementById('bluetick-modal').remove()" style="position:absolute;top:12px;right:12px;background:none;border:none;font-size:1.3rem;cursor:pointer;color:var(--text-secondary)">&times;</button>
      <h3 style="margin-bottom:4px"><img src="/img/bluetick.svg" class="bluetick-icon" alt="✓" style="width:1.1em;height:1.1em;vertical-align:middle"> Apply for Verified Badge</h3>
      <p style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:16px">Tell us why you deserve a verified badge. Adding your Instagram profile helps verify your identity.</p>
      <div class="form-group" style="margin-bottom:12px">
        <label class="form-label">Instagram Profile URL (optional)</label>
        <input type="url" id="bluetick-instagram" class="form-control" placeholder="https://www.instagram.com/yourusername" autocomplete="off">
        <p class="form-hint">e.g. https://www.instagram.com/yourusername</p>
      </div>
      <div class="form-group" style="margin-bottom:16px">
        <label class="form-label">Why do you deserve verification? (optional)</label>
        <textarea id="bluetick-reason" class="form-control textarea" rows="3" placeholder="Describe your channel, reach, or why you should be verified…" maxlength="500" style="min-height:80px"></textarea>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-outline" onclick="document.getElementById('bluetick-modal').remove()">Cancel</button>
        <button class="btn btn-primary" id="bluetick-submit-btn" onclick="submitBluetickApplication()"><i class="fa-solid fa-paper-plane"></i> Submit Request</button>
      </div>
    </div>
  `;
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
}

async function submitBluetickApplication() {
  const igInput = document.getElementById('bluetick-instagram');
  const reasonInput = document.getElementById('bluetick-reason');
  const btn = document.getElementById('bluetick-submit-btn');

  const instagram_url = igInput ? igInput.value.trim() : '';
  const reason = reasonInput ? reasonInput.value.trim() : '';

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting…'; }

  try {
    await apiRequest('/api/users/me/bluetick', {
      method: 'POST',
      body: JSON.stringify({ reason, instagram_url })
    });
    showToast('Verification request submitted! Our team will review it shortly.', 'success');
    const modal = document.getElementById('bluetick-modal');
    if (modal) modal.remove();
  } catch (err) {
    showToast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Request'; }
  }
}
