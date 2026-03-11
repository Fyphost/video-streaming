/* messages.js — Direct messaging logic */

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.dataset.page !== 'messages') return;

  buildNavbar('messages');
  buildSidebar('messages');

  if (!isLoggedIn()) {
    window.location.href = '/login';
    return;
  }

  loadConversations();

  // Check for ?user= param to open a conversation
  const params = new URLSearchParams(window.location.search);
  const userId = params.get('user');
  if (userId) openConversationById(parseInt(userId));
});

let activeConversationId = null;
let pollInterval = null;
let replyToMsg = null; // currently replying to this message object

// Detect mobile layout
function isMobile() {
  return window.innerWidth <= 768;
}

// Show conversations panel (mobile)
function showConversationsPanel() {
  const convPanel = document.getElementById('conversations-panel');
  const chatPanel = document.getElementById('chat-panel');
  if (convPanel) convPanel.classList.remove('panel-hidden');
  if (chatPanel) chatPanel.classList.remove('panel-visible');
}

// Show chat panel (mobile)
function showChatPanel() {
  const convPanel = document.getElementById('conversations-panel');
  const chatPanel = document.getElementById('chat-panel');
  if (isMobile()) {
    if (convPanel) convPanel.classList.add('panel-hidden');
    if (chatPanel) chatPanel.classList.add('panel-visible');
  }
}

async function loadConversations() {
  const listEl = document.getElementById('conversations-list');
  if (!listEl) return;

  try {
    const data = await apiRequest('/api/messages/conversations');
    renderConversationList(data.conversations || []);
  } catch (err) {
    listEl.innerHTML = `<p style="padding:16px;color:var(--danger)">${escapeHtml(err.message)}</p>`;
  }
}

function renderConversationList(conversations) {
  const listEl = document.getElementById('conversations-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (!conversations || conversations.length === 0) {
    listEl.innerHTML = '<p style="padding:16px;color:var(--text-secondary);font-size:0.85rem">No conversations yet.</p>';
    return;
  }

  conversations.forEach(conv => {
    listEl.appendChild(buildConversationItem(conv));
  });
}

function buildConversationItem(conv) {
  const item = document.createElement('div');
  item.className = `conversation-item ${activeConversationId === conv.other_user_id ? 'active' : ''}`;
  item.id = `conv-${conv.other_user_id}`;
  item.onclick = () => openConversation(conv.other_user_id, conv.other_username, conv.other_avatar);

  const avatar = conv.other_avatar
    ? `<img src="/uploads/${conv.other_avatar}" class="conversation-avatar" style="width:44px;height:44px;border-radius:50%;object-fit:cover" alt="${escapeHtml(conv.other_username)}">`
    : `<div class="conversation-avatar">${avatarInitials(conv.other_username)}</div>`;

  item.innerHTML = `
    ${avatar}
    <div class="conversation-info">
      <div class="conversation-name">${escapeHtml(conv.other_username)}</div>
      <div class="conversation-preview">${escapeHtml(conv.last_message || '')}</div>
    </div>
    ${conv.unread_count > 0 ? `<div class="unread-badge">${conv.unread_count}</div>` : ''}
  `;

  return item;
}

// Search conversations / users
let searchTimer = null;
async function searchConversations(query) {
  const suggestionsEl = document.getElementById('conv-suggestions');
  if (!suggestionsEl) return;

  clearTimeout(searchTimer);
  if (!query.trim()) {
    suggestionsEl.style.display = 'none';
    loadConversations(); // reload full list
    return;
  }

  searchTimer = setTimeout(async () => {
    try {
      const data = await apiRequest(`/api/users/search?q=${encodeURIComponent(query.trim())}&limit=6`);
      if (!data.users || !data.users.length) {
        suggestionsEl.style.display = 'none';
        return;
      }
      suggestionsEl.innerHTML = '';
      data.users.forEach(u => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';

        const avatarEl = u.avatar
          ? Object.assign(document.createElement('img'), { src: `/uploads/${u.avatar}`, alt: u.username, style: 'width:28px;height:28px;border-radius:50%;object-fit:cover;margin-right:8px;flex-shrink:0' })
          : (() => {
              const s = document.createElement('span');
              s.style.cssText = 'width:28px;height:28px;border-radius:50%;background:var(--primary-light);color:var(--primary);display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:600;margin-right:8px;flex-shrink:0';
              s.textContent = avatarInitials(u.username);
              return s;
            })();

        const nameEl = document.createElement('span');
        nameEl.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
        nameEl.textContent = u.username;

        const bluetickEl = u.bluetick === 2 ? (() => {
          const ic = document.createElement('i');
          ic.className = 'fa-solid fa-circle-check bluetick-icon';
          ic.style.marginLeft = '4px';
          return ic;
        })() : null;

        div.appendChild(avatarEl);
        div.appendChild(nameEl);
        if (bluetickEl) div.appendChild(bluetickEl);
        div.addEventListener('mousedown', (e) => {
          e.preventDefault();
          openConversation(u.id, u.username, u.avatar || '');
          suggestionsEl.style.display = 'none';
          const searchInput = document.getElementById('conv-search');
          if (searchInput) searchInput.value = '';
        });
        suggestionsEl.appendChild(div);
      });
      suggestionsEl.style.display = 'block';
    } catch {}
  }, 200);
}

async function openConversationById(userId) {
  try {
    const data = await apiRequest(`/api/messages/${userId}`);
    openConversation(userId, data.other_user.username, data.other_user.avatar, data.messages);
  } catch {}
}

async function openConversation(userId, username, avatar, existingMessages = null) {
  activeConversationId = userId;
  replyToMsg = null;

  // Close suggestions
  const suggestionsEl = document.getElementById('conv-suggestions');
  if (suggestionsEl) suggestionsEl.style.display = 'none';

  // Update active state in sidebar
  document.querySelectorAll('.conversation-item').forEach(el => {
    el.classList.toggle('active', el.id === `conv-${userId}`);
  });

  const chatPanel = document.getElementById('chat-panel');
  if (!chatPanel) return;

  const avatarHtml = avatar
    ? `<img src="/uploads/${avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover" alt="${escapeHtml(username)}">`
    : `<div style="width:36px;height:36px;border-radius:50%;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:600">${avatarInitials(username)}</div>`;

  chatPanel.innerHTML = `
    <div class="chat-header">
      <button class="chat-back-btn" onclick="goBackToConversations()" aria-label="Back to conversations">
        <i class="fa-solid fa-arrow-left"></i>
      </button>
      ${avatarHtml}
      <a href="/@${encodeURIComponent(username)}" style="text-decoration:none;color:var(--text-primary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(username)}</a>
    </div>
    <div class="chat-messages" id="chat-messages"></div>
    <div id="reply-preview" class="reply-preview" style="display:none"></div>
    <div class="chat-input-area">
      <label for="msg-photo-input" class="msg-photo-btn" title="Send photo">
        <i class="fa-solid fa-image"></i>
        <input type="file" id="msg-photo-input" accept="image/*" style="display:none">
      </label>
      <textarea id="msg-input" placeholder="Type a message…" rows="1" onkeydown="handleMsgKeydown(event, ${userId})"></textarea>
      <button class="btn btn-primary" onclick="sendMessage(${userId})"><i class="fa-solid fa-paper-plane"></i></button>
    </div>
  `;

  // Show chat panel (handles mobile transition)
  showChatPanel();

  // Photo input handler
  const photoInput = document.getElementById('msg-photo-input');
  if (photoInput) {
    photoInput.addEventListener('change', () => {
      const file = photoInput.files[0];
      if (file) sendPhotoMessage(userId, file);
      photoInput.value = '';
    });
  }

  const messagesEl = document.getElementById('chat-messages');

  if (existingMessages) {
    renderMessages(messagesEl, existingMessages, userId);
  } else {
    await fetchMessages(userId);
  }

  // Auto-refresh messages every 3 seconds
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => fetchMessages(userId), 3000);
}

function goBackToConversations() {
  if (pollInterval) clearInterval(pollInterval);
  activeConversationId = null;
  showConversationsPanel();
  loadConversations();
}

async function fetchMessages(userId) {
  try {
    const data = await apiRequest(`/api/messages/${userId}`);
    const messagesEl = document.getElementById('chat-messages');
    if (messagesEl) renderMessages(messagesEl, data.messages, userId);

    // Update conversation unread badge
    const badge = document.querySelector(`#conv-${userId} .unread-badge`);
    if (badge) badge.remove();
  } catch {}
}

function renderMessages(container, messages, userId) {
  const wasAtBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 50;
  const currentUser = getUser();

  container.innerHTML = '';

  if (!messages || messages.length === 0) {
    container.innerHTML = `
      <div class="chat-empty">
        <div class="icon">💬</div>
        <p>No messages yet. Say hello!</p>
      </div>`;
    return;
  }

  messages.forEach(msg => {
    const isSent = msg.sender_id === currentUser.id;
    const div = document.createElement('div');
    div.className = `chat-message ${isSent ? 'sent' : 'received'}`;
    div.dataset.msgId = msg.id;

    const replyHtml = msg.reply_to_id && (msg.reply_to_content || msg.reply_to_image)
      ? `<div class="reply-quote">
           <strong>${escapeHtml(msg.reply_to_username || 'User')}</strong>:
           ${msg.reply_to_image ? '📷 Photo' : escapeHtml((msg.reply_to_content || '').substring(0, 80)) + ((msg.reply_to_content || '').length > 80 ? '…' : '')}
         </div>`
      : '';

    const imageHtml = msg.image
      ? `<div class="chat-msg-image-wrap"><img src="/uploads/${escapeHtml(msg.image)}" class="chat-msg-image" alt="Photo" loading="lazy" onclick="openImageFull('/uploads/${escapeHtml(msg.image)}')" oncontextmenu="return false" draggable="false"></div>`
      : '';

    const textHtml = msg.content ? `<span class="chat-msg-text">${escapeHtml(msg.content)}</span>` : '';

    div.innerHTML = `
      <div class="chat-message-bubble">
        ${replyHtml}
        ${imageHtml}
        ${textHtml}
        <div class="chat-message-actions">
          <button class="msg-reply-btn" title="Reply"><i class="fa-solid fa-reply"></i></button>
        </div>
      </div>
      <div class="chat-message-time">${formatDate(msg.created_at)}</div>
    `;

    const replyBtn = div.querySelector('.msg-reply-btn');
    if (replyBtn) {
      replyBtn.addEventListener('click', () => {
        const preview = msg.image ? '📷 Photo' : (msg.content || '').substring(0, 60);
        setReplyTo(msg.id, preview, msg.sender_username || 'User', !!msg.image);
      });
    }

    container.appendChild(div);
  });

  if (wasAtBottom || !container.dataset.scrolled) {
    container.scrollTop = container.scrollHeight;
    container.dataset.scrolled = '1';
  }
}

function setReplyTo(msgId, content, username, isImage = false) {
  replyToMsg = { id: msgId, content, username, isImage };
  const preview = document.getElementById('reply-preview');
  if (preview) {
    preview.style.display = 'flex';
    preview.innerHTML = `
      <div style="flex:1;font-size:0.82rem;color:var(--text-secondary)">
        Replying to <strong>${escapeHtml(username)}</strong>: ${isImage ? '📷 Photo' : escapeHtml(content)}…
      </div>
      <button onclick="clearReply()" style="background:none;border:none;cursor:pointer;color:var(--text-light);font-size:1rem">&times;</button>
    `;
  }
  const input = document.getElementById('msg-input');
  if (input) input.focus();
}

function clearReply() {
  replyToMsg = null;
  const preview = document.getElementById('reply-preview');
  if (preview) preview.style.display = 'none';
}

function handleMsgKeydown(event, userId) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage(userId);
  }
}

async function sendMessage(userId) {
  const input = document.getElementById('msg-input');
  const content = input ? input.value.trim() : '';

  if (!content) return;

  input.value = '';

  const body = { content };
  if (replyToMsg) body.reply_to_id = replyToMsg.id;
  clearReply();

  try {
    await apiRequest(`/api/messages/${userId}`, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    // Immediately fetch to show the sent message
    await fetchMessages(userId);

    // Refresh conversations list
    loadConversations();
  } catch (err) {
    showToast(err.message, 'error');
    if (input) input.value = content;
  }
}

// New conversation - search user
async function startNewConversation() {
  const searchInput = document.getElementById('conv-search');
  if (searchInput) {
    // On mobile, show the conversations panel first
    if (isMobile()) showConversationsPanel();
    searchInput.focus();
    showToast('Type a username in the search box above', 'default', 2000);
    return;
  }

  const username = prompt('Enter username to message:');
  if (!username) return;

  try {
    const data = await apiRequest(`/api/users/${username}`);
    const url = new URL(window.location.href);
    url.searchParams.set('user', data.id);
    window.history.pushState({}, '', url);
    openConversation(data.id, data.username, data.avatar);
    await loadConversations();
  } catch (err) {
    showToast('User not found: ' + username, 'error');
  }
}

async function sendPhotoMessage(userId, file) {
  const formData = new FormData();
  formData.append('image', file);

  const captionInput = document.getElementById('msg-input');
  const caption = captionInput ? captionInput.value.trim() : '';
  if (caption) {
    formData.append('content', caption);
    if (captionInput) captionInput.value = '';
  }
  if (replyToMsg) {
    formData.append('reply_to_id', replyToMsg.id);
    clearReply();
  }

  const token = getToken();
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  try {
    const response = await fetch(`/api/messages/${userId}/image`, {
      method: 'POST',
      headers,
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Upload failed');
    await fetchMessages(userId);
    loadConversations();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openImageFull(src) {
  let overlay = document.getElementById('img-full-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'img-full-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
  overlay.innerHTML = `<img src="${escapeHtml(src)}" style="max-width:95vw;max-height:90vh;border-radius:8px;object-fit:contain" oncontextmenu="return false" draggable="false">`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}
