/* auth.js — Login, Register, Logout frontend logic */

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;

  if (page === 'login') initLogin();
  else if (page === 'register') initRegister();
});

function initLogin() {
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('error-msg');

  // If already logged in, redirect
  if (isLoggedIn()) {
    window.location.href = '/';
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    errorEl.style.display = 'none';

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
      const data = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      setToken(data.token);
      setUser(data.user);
      showToast('Welcome back, ' + data.user.username + '!', 'success');
      setTimeout(() => { window.location.href = '/'; }, 800);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'flex';
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  });
}

function initRegister() {
  const form = document.getElementById('register-form');
  const errorEl = document.getElementById('error-msg');

  if (isLoggedIn()) {
    window.location.href = '/';
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    errorEl.style.display = 'none';

    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPwd = document.getElementById('confirm-password').value;

    if (password !== confirmPwd) {
      errorEl.textContent = 'Passwords do not match.';
      errorEl.style.display = 'flex';
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Creating account…';

    try {
      const data = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password })
      });

      setToken(data.token);
      setUser(data.user);
      showToast('Account created! Welcome, ' + data.user.username + '!', 'success');
      setTimeout(() => { window.location.href = '/'; }, 800);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'flex';
      btn.disabled = false;
      btn.textContent = 'Create Account';
    }
  });
}
