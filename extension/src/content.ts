declare const chrome: any;

chrome.runtime.onMessage.addListener((message: any, _sender: any, sendResponse: any) => {
  if (message.action === 'UPDATE_THEME') {
    applyTheme(message.config);
  }
  sendResponse({ status: 'ok' });
});

function applyTheme(config: Record<string, string>) {
  if (!config) return;

  const root = document.documentElement;
  if (config.accentColor) {
    root.style.setProperty('--theme-accent', config.accentColor);
  }
  if (config.themeMode === 'dark') {
    root.classList.add('theme-engine-dark');
  } else {
    root.classList.remove('theme-engine-dark');
  }
}
