const dot = document.getElementById('statusDot');
const text = document.getElementById('statusText');
const btn = document.getElementById('toggleBtn');
const timeoutSelect = document.getElementById('timeoutSelect');
const startKeyEl = document.getElementById('startKey');
const stopKeyEl = document.getElementById('stopKey');
const permWarning = document.getElementById('permWarning');

let isRunning = false;
let hasHostPermission = false;

function updateUI(running) {
  isRunning = running;
  dot.className = running ? 'dot active' : 'dot idle';
  text.textContent = running ? 'Capture running' : 'Capture idle';
  btn.textContent = running ? 'Stop' : 'Start';
  btn.className = running ? 'btn btn-stop' : 'btn btn-start';
}

function updatePermUI(granted) {
  hasHostPermission = granted;
  if (permWarning) {
    permWarning.style.display = granted ? 'none' : 'block';
  }
}

async function checkHostPermission() {
  return new Promise((resolve) => {
    chrome.permissions.contains({ origins: ['<all_urls>'] }, (result) => {
      updatePermUI(result);
      resolve(result);
    });
  });
}

async function requestHostPermission() {
  return new Promise((resolve) => {
    chrome.permissions.request({ origins: ['<all_urls>'] }, (granted) => {
      updatePermUI(granted);
      resolve(granted);
    });
  });
}

if (navigator.platform.indexOf('Mac') !== -1) {
  startKeyEl.textContent = '\u2318+Shift+6';
  stopKeyEl.textContent = '\u2318+Shift+7';
}

checkHostPermission();

chrome.runtime.sendMessage({ action: 'GET_CAPTURE_STATUS' }, (response) => {
  if (response) updateUI(response.running);
});

chrome.storage.local.get('captureTimeoutMinutes', (result) => {
  if (result.captureTimeoutMinutes) {
    timeoutSelect.value = String(result.captureTimeoutMinutes);
  }
});

btn.addEventListener('click', async () => {
  if (isRunning) {
    chrome.runtime.sendMessage({ action: 'STOP_CAPTURE' }, (response) => {
      if (response) updateUI(response.running);
    });
    return;
  }

  if (!hasHostPermission) {
    const granted = await requestHostPermission();
    if (!granted) {
      console.warn('[Popup] User denied host permission.');
      return;
    }
  }

  chrome.runtime.sendMessage({ action: 'START_CAPTURE' }, (response) => {
    if (response) updateUI(response.running);
  });
});

timeoutSelect.addEventListener('change', () => {
  const minutes = parseInt(timeoutSelect.value, 10);
  chrome.storage.local.set({ captureTimeoutMinutes: minutes });
});
