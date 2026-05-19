(() => {
  const SYC_CONFIG = {
    minChars: 15,
    responseDelayMs: 500,
    themes: {
      light: { label: 'Light' },
      dark: { label: 'Dark' },
      contrast: { label: 'High Contrast' }
    },
    defaultSettings: {
      enabled: true,
      theme: 'light'
    }
  };

  const SYC_STORAGE_KEYS = {
    settings: 'sycSettings'
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.SYC_CONFIG = SYC_CONFIG;
    globalThis.SYC_STORAGE_KEYS = SYC_STORAGE_KEYS;
  }
})();
