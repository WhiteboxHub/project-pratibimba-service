// The server URL — update this to your GCP VM domain before deploying
const SERVER_BASE_URL = 'https://WBL-Screenshots.com';

// ---- DOM refs ----
const loginPanel = document.getElementById('loginPanel');
const mainPanel = document.getElementById('mainPanel');
const loginUname = document.getElementById('loginUname');
const loginPass = document.getElementById('loginPass');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const unameDisplay = document.getElementById('unameDisplay');
const signOutBtn = document.getElementById('signOutBtn');
const dot = document.getElementById('statusDot');
const text = document.getElementById('statusText');
const btn = document.getElementById('toggleBtn');
const timeoutSelect = document.getElementById('timeoutSelect');
const deviceNameInput = document.getElementById('deviceName');
const startKeyEl = document.getElementById('startKey');
const stopKeyEl = document.getElementById('stopKey');
const permWarning = document.getElementById('permWarning');

let isRunning = false;
let hasHostPermission = false;

// ---- Mac keyboard shortcuts ----
if (navigator.platform.indexOf('Mac') !== -1) {
  startKeyEl.textContent = '⌘+Shift+6';
  stopKeyEl.textContent = '⌘+Shift+7';
}

// ---- Panel logic ----
function showLoginPanel() {
  loginPanel.style.display = 'block';
  mainPanel.style.display = 'none';
}

function showMainPanel(uname) {
  loginPanel.style.display = 'none';
  mainPanel.style.display = 'block';
  unameDisplay.textContent = uname;
}

// ---- Capture UI ----
function updateUI(running) {
  isRunning = running;
  dot.className = running ? 'dot active' : 'dot idle';
  text.textContent = running ? 'Capture running' : 'Capture idle';
  btn.textContent = running ? 'Stop' : 'Start';
  btn.className = running ? 'btn btn-stop' : 'btn btn-start';
}

function updatePermUI(granted) {
  hasHostPermission = granted;
  if (permWarning) permWarning.style.display = granted ? 'none' : 'block';
}

async function checkHostPermission() {
  return new Promise(resolve => {
    chrome.permissions.contains({ origins: ['<all_urls>'] }, result => {
      updatePermUI(result);
      resolve(result);
    });
  });
}

async function requestHostPermission() {
  return new Promise(resolve => {
    chrome.permissions.request({ origins: ['<all_urls>'] }, granted => {
      updatePermUI(granted);
      resolve(granted);
    });
  });
}

// ---- On load: check if already signed in ----
chrome.storage.local.get(['apiKey', 'uname', 'deviceName', 'captureTimeoutMinutes'], result => {
  if (result.apiKey && result.uname) {
    showMainPanel(result.uname);
    checkHostPermission();
    chrome.runtime.sendMessage({ action: 'GET_CAPTURE_STATUS' }, response => {
      if (response) updateUI(response.running);
    });
    if (result.deviceName) deviceNameInput.value = result.deviceName;
    if (result.captureTimeoutMinutes) timeoutSelect.value = String(result.captureTimeoutMinutes);
  } else {
    showLoginPanel();
  }
});

// ---- Login ----
loginBtn.addEventListener('click', async () => {
  const uname = loginUname.value.trim();
  const password = loginPass.value;
  const deviceName = deviceNameInput ? deviceNameInput.value.trim() : '';

  if (!uname || !password) {
    loginError.textContent = 'Username and password required.';
    loginError.style.display = 'block';
    return;
  }

  loginBtn.textContent = 'Signing in...';
  loginBtn.disabled = true;
  loginError.style.display = 'none';

  try {
    const res = await fetch(`${SERVER_BASE_URL}/auth/extension-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uname, password, device_name: deviceName || uname }),
    });

    const data = await res.json();

    if (!res.ok) {
      loginError.textContent = data.error || 'Login failed.';
      loginError.style.display = 'block';
      return;
    }

    // Store credentials securely in chrome.storage.local
    chrome.storage.local.set({ apiKey: data.api_key, uname: data.uname }, () => {
      showMainPanel(data.uname);
      checkHostPermission();
      // Fetch the real-time status as soon as we log in
      chrome.runtime.sendMessage({ action: 'GET_CAPTURE_STATUS' }, response => {
        if (response) updateUI(response.running);
      });
    });
  } catch (err) {
    loginError.textContent = 'Could not reach server. Check your connection.';
    loginError.style.display = 'block';
  } finally {
    loginBtn.textContent = 'Sign In';
    loginBtn.disabled = false;
  }
});

// ---- Sign out ----
signOutBtn.addEventListener('click', () => {
  chrome.storage.local.get(['apiKey'], (res) => {
    if (res.apiKey) {
      fetch(`${SERVER_BASE_URL}/auth/extension-logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: res.apiKey })
      }).catch(e => console.error(e));
    }
    chrome.storage.local.remove(['apiKey', 'uname'], () => {
      // Background script disconnected automatically via storage listener, but we tell it to stop capture just in case
      chrome.runtime.sendMessage({ action: 'STOP_CAPTURE' });
      showLoginPanel();
    });
  });
});

// ---- Capture start/stop ----
btn.addEventListener('click', async () => {
  if (isRunning) {
    chrome.runtime.sendMessage({ action: 'STOP_CAPTURE' }, response => {
      if (response) updateUI(response.running);
    });
    return;
  }

  if (!hasHostPermission) {
    const granted = await requestHostPermission();
    if (!granted) return;
  }

  chrome.runtime.sendMessage({ action: 'START_CAPTURE' }, response => {
    if (response) updateUI(response.running);
  });
});

// ---- Settings persistence ----
deviceNameInput.addEventListener('change', () => {
  const val = deviceNameInput.value.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  chrome.storage.local.set({ deviceName: val });
});

timeoutSelect.addEventListener('change', () => {
  chrome.storage.local.set({ captureTimeoutMinutes: parseInt(timeoutSelect.value, 10) });
});

// ---- Real-time State Updates ----
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'CAPTURE_STATUS_CHANGED') {
    updateUI(message.running);
  }
});
