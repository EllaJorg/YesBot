(() => {
  if (!globalThis.SYC_CONFIG || !globalThis.SYC_STORAGE_KEYS) {
    console.warn('yesbot popup: missing config');
    return;
  }

  const els = {
    enabled: document.getElementById('syc-enabled'),
    theme: document.getElementById('syc-theme'),
    status: document.getElementById('syc-status')
  };

  initPopup();

  function initPopup() {
    populateThemes();
    loadState();
    bindEvents();
  }

  function populateThemes() {
    Object.entries(SYC_CONFIG.themes).forEach(([value, meta]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = meta.label || value;
      els.theme.appendChild(option);
    });
  }

  function loadState() {
    chrome.storage.sync.get([SYC_STORAGE_KEYS.settings], (data) => {
      const settings = { ...SYC_CONFIG.defaultSettings, ...(data[SYC_STORAGE_KEYS.settings] || {}) };
      els.enabled.checked = settings.enabled;
      els.theme.value = getValidTheme(settings.theme);
      applyTheme(els.theme.value);
      updateStatus(settings.enabled);
    });
  }

  function bindEvents() {
    els.enabled.addEventListener('change', () => {
      saveSettings();
      updateStatus(els.enabled.checked);
    });
    els.theme.addEventListener('change', () => {
      applyTheme(els.theme.value);
      saveSettings();
    });
  }

  function saveSettings() {
    const payload = {
      enabled: els.enabled.checked,
      theme: getValidTheme(els.theme.value)
    };
    chrome.storage.sync.set({ [SYC_STORAGE_KEYS.settings]: payload });
  }

  function getValidTheme(themeKey) {
    return SYC_CONFIG.themes[themeKey] ? themeKey : 'light';
  }

  function applyTheme(themeKey) {
    document.body.dataset.sycTheme = getValidTheme(themeKey);
  }

  function updateStatus(enabled) {
    els.status.textContent = enabled
      ? 'Active — scoring AI responses on supported sites.'
      : 'Disabled — no scores will appear.';
  }
})();
