/* comments.js — Comments logic for watch page */

async function loadComments(videoId) {
  const container = document.getElementById('comments-list');
  const countEl = document.getElementById('comment-count');

  if (!container) return;

  try {
    const data = await apiRequest(`/api/comments/${videoId}`);
    if (countEl) countEl.textContent = data.comments.length;

    container.innerHTML = '';

    if (data.comments.length === 0) {
      container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.9rem">No comments yet. Be the first!</p>';
      return;
    }

    data.comments.forEach(c => {
      container.appendChild(buildCommentEl(c, videoId));
    });
  } catch (err) {
    container.innerHTML = `<p style="color:var(--danger)">${escapeHtml(err.message)}</p>`;
  }
}

function buildCommentEl(comment, videoId) {
  const user = getUser();
  const isCommentOwner = user && user.id === comment.user_id;
  // Video owner check: the watch page exposes current video owner via a global
  const isVideoOwner = user && typeof window._currentVideoOwnerId !== 'undefined' && user.id === window._currentVideoOwnerId;
  const canDelete = isCommentOwner || isVideoOwner;

  const div = document.createElement('div');
  div.className = 'comment-item';
  div.id = `comment-${comment.id}`;

  const avatar = comment.avatar
    ? `<img src="/uploads/${comment.avatar}" class="comment-avatar" style="width:36px;height:36px;border-radius:50%;object-fit:cover" alt="${escapeHtml(comment.username)}">`
    : `<div class="comment-avatar">${avatarInitials(comment.username)}</div>`;

  const bluetick = comment.bluetick === 2 ? ` <img src="/img/bluetick.svg" class="bluetick-icon" alt="✓" title="Verified">` : '';

  div.innerHTML = `
    ${avatar}
    <div class="comment-body">
      <span class="comment-username">${escapeHtml(comment.username)}${bluetick}</span>
      <span class="comment-time">${formatDate(comment.created_at)}</span>
      <div class="comment-text">${escapeHtml(comment.content)}</div>
      ${canDelete ? `<button class="comment-delete-btn" onclick="deleteComment(${comment.id}, '${videoId}')">Delete</button>` : ''}
    </div>
  `;

  return div;
}

async function submitComment(videoId) {
  if (!isLoggedIn()) {
    window.location.href = '/login';
    return;
  }

  const textarea = document.getElementById('comment-text');
  const content = textarea ? textarea.value.trim() : '';

  if (!content) {
    showToast('Please write a comment', 'error');
    return;
  }

  const btn = document.getElementById('comment-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Posting…'; }

  try {
    const data = await apiRequest(`/api/comments/${videoId}`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });

    const container = document.getElementById('comments-list');
    const emptyMsg = container.querySelector('p');
    if (emptyMsg) emptyMsg.remove();

    container.prepend(buildCommentEl(data.comment, videoId));

    const countEl = document.getElementById('comment-count');
    if (countEl) countEl.textContent = parseInt(countEl.textContent || 0) + 1;

    if (textarea) textarea.value = '';
    showToast('Comment posted!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Post'; }
  }
}

async function deleteComment(commentId, videoId) {
  if (!confirm('Delete this comment?')) return;

  try {
    await apiRequest(`/api/comments/${commentId}`, { method: 'DELETE' });

    const el = document.getElementById(`comment-${commentId}`);
    if (el) el.remove();

    const countEl = document.getElementById('comment-count');
    if (countEl) {
      const n = parseInt(countEl.textContent || 0) - 1;
      countEl.textContent = Math.max(0, n);
    }

    const container = document.getElementById('comments-list');
    if (container && !container.children.length) {
      container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.9rem">No comments yet. Be the first!</p>';
    }

    showToast('Comment deleted.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}
