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
          ? Object.assign(document.createElement('img'), { src: `/uploads/${u.avatar}`, alt: u.username, style: 'width:24px;height:24px;border-radius:50%;object-fit:cover;margin-right:8px' })
          : (() => {
              const s = document.createElement('span');
              s.style.cssText = 'width:24px;height:24px;border-radius:50%;background:var(--primary-light);color:var(--primary);display:inline-flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:600;margin-right:8px';
              s.textContent = avatarInitials(u.username);
              return s;
            })();

        const nameEl = document.createElement('span');
        nameEl.textContent = u.username;

        div.appendChild(avatarEl);
        div.appendChild(nameEl);
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
      ${avatarHtml}
      <a href="/@${encodeURIComponent(username)}" style="text-decoration:none;color:var(--text-primary)">${escapeHtml(username)}</a>
    </div>
    <div class="chat-messages" id="chat-messages"></div>
    <div id="reply-preview" class="reply-preview" style="display:none"></div>
    <div class="chat-input-area">
      <textarea id="msg-input" placeholder="Type a message…" rows="1" onkeydown="handleMsgKeydown(event, ${userId})"></textarea>
      <button class="btn btn-primary" onclick="sendMessage(${userId})"><i class="fa-solid fa-paper-plane"></i></button>
    </div>
  `;

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

    const replyHtml = msg.reply_to_id && msg.reply_to_content
      ? `<div class="reply-quote"><strong>${escapeHtml(msg.reply_to_username || 'User')}</strong>: ${escapeHtml(msg.reply_to_content.substring(0, 80))}${msg.reply_to_content.length > 80 ? '…' : ''}</div>`
      : '';

    div.innerHTML = `
      <div class="chat-message-bubble">
        ${replyHtml}
        ${escapeHtml(msg.content)}
        <div class="chat-message-actions">
          <button class="msg-reply-btn" title="Reply"><i class="fa-solid fa-reply"></i></button>
        </div>
      </div>
      <div class="chat-message-time">${formatDate(msg.created_at)}</div>
    `;

    const replyBtn = div.querySelector('.msg-reply-btn');
    if (replyBtn) {
      replyBtn.addEventListener('click', () => {
        setReplyTo(msg.id, msg.content.substring(0, 60), msg.sender_username || 'User');
      });
    }

    container.appendChild(div);
  });

  if (wasAtBottom || !container.dataset.scrolled) {
    container.scrollTop = container.scrollHeight;
    container.dataset.scrolled = '1';
  }
}

function setReplyTo(msgId, content, username) {
  replyToMsg = { id: msgId, content, username };
  const preview = document.getElementById('reply-preview');
  if (preview) {
    preview.style.display = 'flex';
    preview.innerHTML = `
      <div style="flex:1;font-size:0.82rem;color:var(--text-secondary)">
        Replying to <strong>${escapeHtml(username)}</strong>: ${escapeHtml(content)}…
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
