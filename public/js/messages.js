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

async function loadConversations() {
  const listEl = document.getElementById('conversations-list');
  if (!listEl) return;

  try {
    const data = await apiRequest('/api/messages/conversations');
    listEl.innerHTML = '';

    if (!data.conversations || data.conversations.length === 0) {
      listEl.innerHTML = '<p style="padding:16px;color:var(--text-secondary);font-size:0.85rem">No conversations yet.</p>';
      return;
    }

    data.conversations.forEach(conv => {
      listEl.appendChild(buildConversationItem(conv));
    });
  } catch (err) {
    listEl.innerHTML = `<p style="padding:16px;color:var(--danger)">${escapeHtml(err.message)}</p>`;
  }
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

async function openConversationById(userId) {
  try {
    const data = await apiRequest(`/api/messages/${userId}`);
    openConversation(userId, data.other_user.username, data.other_user.avatar, data.messages);
  } catch {}
}

async function openConversation(userId, username, avatar, existingMessages = null) {
  activeConversationId = userId;

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
      ${avatarHtml}
      <a href="/profile?user=${encodeURIComponent(username)}" style="text-decoration:none;color:var(--text-primary)">${escapeHtml(username)}</a>
    </div>
    <div class="chat-messages" id="chat-messages"></div>
    <div class="chat-input-area">
      <textarea id="msg-input" placeholder="Type a message…" rows="1" onkeydown="handleMsgKeydown(event, ${userId})"></textarea>
      <button class="btn btn-primary" onclick="sendMessage(${userId})">Send</button>
    </div>
  `;

  const messagesEl = document.getElementById('chat-messages');

  if (existingMessages) {
    renderMessages(messagesEl, existingMessages);
  } else {
    await fetchMessages(userId);
  }

  // Auto-refresh messages every 3 seconds
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(() => fetchMessages(userId), 3000);
}

async function fetchMessages(userId) {
  try {
    const data = await apiRequest(`/api/messages/${userId}`);
    const messagesEl = document.getElementById('chat-messages');
    if (messagesEl) renderMessages(messagesEl, data.messages);

    // Update conversation unread badge
    const badge = document.querySelector(`#conv-${userId} .unread-badge`);
    if (badge) badge.remove();
  } catch {}
}

function renderMessages(container, messages) {
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
    div.innerHTML = `
      <div class="chat-message-bubble">${escapeHtml(msg.content)}</div>
      <div class="chat-message-time">${formatDate(msg.created_at)}</div>
    `;
    container.appendChild(div);
  });

  container.scrollTop = container.scrollHeight;
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

  try {
    await apiRequest(`/api/messages/${userId}`, {
      method: 'POST',
      body: JSON.stringify({ content })
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
