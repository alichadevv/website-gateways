// ========== GLOBAL ==========
const API_BASE = '';
const TOKEN_KEY = 'token';

// ========== AUTH CHECK ==========
function checkAuth() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) {
    window.location.href = '/public/login.html';
    return null;
  }
  // Verify token by fetching profile
  return fetch('/api/user/profile', {
      headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => {
      if (!res.ok) throw new Error('Unauthorized');
      return res.json();
    })
    .catch(() => {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/public/login.html';
      return null;
    });
}

function getToken() { return localStorage.getItem(TOKEN_KEY); }

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = '/public/login.html';
}

// ========== FETCH HELPERS ==========
function authFetch(url, options = {}) {
  const token = getToken();
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
}

// ========== DRAWER ==========
function toggleDrawer() {
  document.getElementById('drawer').classList.toggle('open');
  document.getElementById('drawerOverlay').classList.toggle('open');
}

// ========== LOAD USER INFO ==========
function loadUserInfo() {
  const token = getToken();
  if (!token) return;
  fetch('/api/user/profile', { headers: { 'Authorization': 'Bearer ' + token } })
    .then(res => res.json())
    .then(user => {
      document.getElementById('drawerUsername').textContent = user.username;
      document.getElementById('headerUser').textContent = user.username;
      // Update saldo di navbar jika ada
      fetch('/api/dashboard', { headers: { 'Authorization': 'Bearer ' + token } })
        .then(r => r.json())
        .then(data => {
          const el = document.getElementById('headerSaldo');
          if (el) el.textContent = 'Rp ' + data.totalBalance.toLocaleString();
        });
    });
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', function() {
  // Cek auth untuk halaman yang membutuhkan login (selain login.html)
  if (!window.location.pathname.includes('public/login.html')) {
    checkAuth().then(user => {
      if (user) {
        loadUserInfo();
        // Jika ada fungsi load data spesifik halaman, panggil dari halaman masing-masing
        if (typeof loadPageData === 'function') loadPageData();
      }
    });
  }
});