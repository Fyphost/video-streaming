/* profile.js — Profile & follow logic */

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page !== 'profile') return;

  buildNavbar('profile');
  buildSidebar('profile');

  const params = new URLSearchParams(window.location.search);
  const username = params.get('user');

  if (!username) {
    // If no user specified, redirect to current user's profile
    const user = getUser();
    if (user) {
      window.location.href = `/profile?user=${encodeURIComponent(user.username)}`;
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

    // Render header
    const isMe = currentUser && currentUser.id === data.id;
    const avatarHtml = data.avatar
      ? `<img src="/uploads/${data.avatar}" class="profile-avatar-large" alt="${escapeHtml(data.username)}">`
      : `<div class="profile-avatar-large">${avatarInitials(data.username)}</div>`;

    headerEl.innerHTML = `
      ${avatarHtml}
      <div class="profile-info">
        <h1>${escapeHtml(data.username)}</h1>
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
        <div style="margin-top:16px;display:flex;gap:8px">
          ${isMe ? `
            <button class="btn btn-outline" onclick="showEditProfile()">✏️ Edit Profile</button>
            <a href="/upload" class="btn btn-primary">+ Upload Video</a>
          ` : currentUser ? `
            <button class="btn ${data.is_following ? 'btn-primary' : 'btn-outline'}" id="follow-btn" onclick="toggleFollowProfile(${data.id})">
              ${data.is_following ? 'Following' : 'Follow'}
            </button>
            <a href="/messages?user=${data.id}" class="btn btn-outline">✉️ Message</a>
          ` : `
            <a href="/login" class="btn btn-primary">Follow</a>
          `}
        </div>
      </div>
    `;

    // Render videos
    if (!data.videos || data.videos.length === 0) {
      videosEl.innerHTML = `
        <div class="empty-state">
          <div class="icon">📹</div>
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
        <div class="icon">❌</div>
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
      btn.textContent = data.following ? 'Following' : 'Follow';
      btn.classList.toggle('btn-primary', data.following);
      btn.classList.toggle('btn-outline', !data.following);
    }
    showToast(data.message, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function showEditProfile() {
  const modal = document.getElementById('edit-profile-modal');
  if (!modal) return;

  const user = getUser();
  if (!user) return;

  // Pre-fill bio
  apiRequest('/api/users/me/profile').then(data => {
    const bioInput = document.getElementById('edit-bio');
    if (bioInput) bioInput.value = data.bio || '';
  }).catch(() => {});

  modal.style.display = 'flex';
}

function closeEditProfile() {
  const modal = document.getElementById('edit-profile-modal');
  if (modal) modal.style.display = 'none';
}

async function saveProfile() {
  const bioInput = document.getElementById('edit-bio');
  const avatarInput = document.getElementById('edit-avatar');
  const bio = bioInput ? bioInput.value.trim() : '';

  const formData = new FormData();
  formData.append('bio', bio);
  if (avatarInput && avatarInput.files[0]) {
    formData.append('avatar', avatarInput.files[0]);
  }

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

    // Reload profile
    window.location.reload();
  } catch (err) {
    showToast(err.message, 'error');
  }
}
