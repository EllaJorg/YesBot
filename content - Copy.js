(() => {
  if (!globalThis.ALBA_CONFIG || !globalThis.ALBA_STORAGE_KEYS) {
    console.warn('alba: missing configuration');
    return;
  }

  const SITE_CONFIGS = [
    {
      id: 'chatgpt',
      hostPattern: /chat(?:\.openai|gpt)\.com$/,
      promptSelectors: [
        'textarea[data-id="prompt-textarea"]',
        'textarea[data-testid="composer-textarea"]',
        'textarea[placeholder*="message"]',
        'div[contenteditable="true"][data-testid="composer-textarea"]',
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][data-placeholder]',
        'form textarea'
      ],
      sendButtonSelectors: [
        'button[data-testid="send-button"]',
        'button[aria-label*="Send"]'
      ],
      assistantSelectors: [
        '[data-testid="conversation-turn"] [data-message-author-role="assistant"]',
        '[data-testid="assistant-turn"]',
        'div[data-message-author-role="assistant"]',
        'div[data-message-author-role="model"]',
        'article div[class*="assistant"]',
        'main div[data-message-author-role="assistant"]'
      ]
    },
    {
      id: 'claude',
      hostPattern: /claude\.ai$/,
      promptSelectors: ['textarea', 'div[contenteditable="true"][data-tracker="chat-input"]'],
      sendButtonSelectors: ['button[type="submit"]', 'button[aria-label*="Send"]'],
      assistantSelectors: [
        'main div[class*="assistant"]',
        'section div[data-testid="assistant-response"]'
      ]
    },
    {
      id: 'gemini',
      hostPattern: /gemini\.google\.com$/,
      promptSelectors: [
        'div[contenteditable="true"][role="textbox"]',
        'div[contenteditable="true"][aria-label*="prompt"]',
        'textarea[aria-label*="prompt"]',
        'rich-textarea div[contenteditable="true"]',
        'textarea'
      ],
      sendButtonSelectors: ['button[aria-label*="Send"]'],
      assistantSelectors: [
        'chat-message[message-type="model"]',
        'div[data-message-author-role="model"]',
        'message-content[data-message-type="model"]'
      ]
    },
    {
      id: 'perplexity',
      hostPattern: /(?:www\.)?perplexity\.ai$/,
      promptSelectors: [
        'textarea[placeholder*="Ask"]',
        'textarea[placeholder*="follow"]',
        'textarea[placeholder*="search"]',
        'div[contenteditable="true"][role="textbox"]',
        'textarea'
      ],
      sendButtonSelectors: ['button[aria-label*="Submit"]', 'button[aria-label*="Send"]'],
      assistantSelectors: [
        'div[class*="answer"]',
        'div[data-testid="assistant-response"]'
      ]
    }
  ];

  const state = {
    settings: { ...ALBA_CONFIG.defaultSettings },
    assistantObserver: null,
    site: SITE_CONFIGS.find((config) => config.hostPattern.test(window.location.hostname)),
    featuresActive: false,
    conversationId: null,
    locationTrackerInitialized: false,
  };

  const checkedMessages = new Set();

  if (!state.site) {
    return;
  }

  init();

  function getLastUserMessage() {
    const msgs = document.querySelectorAll('[data-message-author-role="user"]');
    return msgs.length ? msgs[msgs.length - 1].innerText : null;
  }

  function init() {
    state.conversationId = getConversationId();
    startConversationTracking();
    loadPersistedState().then(() => {
      chrome.storage.onChanged.addListener(handleStorageChange);
      if (state.settings.enabled) {
        startFeatures();
      }
    });
  }

  async function runSycophancyCheck(assistantEl) {
    const userMsg = getLastUserMessage();
    const aiMsg = assistantEl.innerText;
    if (!userMsg || !aiMsg) return;

    const pill = document.createElement('div');
    pill.className = 'alba-impact-label alba-tooltip-host';
    pill.textContent = '🔍 Checking...';
    assistantEl.appendChild(pill);

    const result = await ALBA_AI_CLIENT.judgeSycophancy(userMsg, aiMsg);
    if (!result) {
      pill.textContent = '⚠️ Score unavailable';
      return;
    }

    const emoji = result.label === 'low' ? '🟢' : result.label === 'medium' ? '🟡' : '🔴';
    pill.textContent = `${emoji} ${result.label} sycophancy`;

    pill.style.cursor = 'pointer';
    pill.addEventListener('click', () => {
      const existing = pill.querySelector('.alba-tooltip');
      if (existing) {
        existing.remove();
      } else {
        const tooltip = document.createElement('div');
        tooltip.className = 'alba-tooltip';
        tooltip.style.whiteSpace = 'normal';
        tooltip.style.maxWidth = '300px';
        tooltip.style.background = '#1a1a1a';
        tooltip.style.color = '#ffffff';
        tooltip.style.padding = '8px 12px';
        tooltip.style.borderRadius = '8px';
        tooltip.style.zIndex = '99999';
        tooltip.textContent = `Score: ${result.score} — ${result.reason}`;
        pill.appendChild(tooltip);
      }
    });

    console.log("SYCOPHANCY SCORE:", result);
  }

  function startFeatures() {
    if (state.featuresActive) return;
    state.featuresActive = true;
    setupAssistantObserver();
  }

  function teardownFeatures() {
    if (!state.featuresActive) return;
    state.featuresActive = false;
    state.assistantObserver?.disconnect();
    state.assistantObserver = null;
    document.querySelectorAll('.alba-impact-label').forEach((node) => node.remove());
  }

  function loadPersistedState() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        [ALBA_STORAGE_KEYS.settings],
        (data) => {
          if (data[ALBA_STORAGE_KEYS.settings]) {
            state.settings = { ...ALBA_CONFIG.defaultSettings, ...data[ALBA_STORAGE_KEYS.settings] };
          }
          refreshThemeTokens();
          resolve();
        }
      );
    });
  }

  function handleStorageChange(changes, area) {
    if (area !== 'sync') return;
    if (changes[ALBA_STORAGE_KEYS.settings]) {
      const prevEnabled = state.settings.enabled;
      const prevTheme = state.settings.theme;
      state.settings = {
        ...ALBA_CONFIG.defaultSettings,
        ...changes[ALBA_STORAGE_KEYS.settings].newValue
      };
      if (state.settings.theme !== prevTheme) {
        refreshThemeTokens();
      }
      if (!state.settings.enabled && prevEnabled) {
        teardownFeatures();
      } else if (state.settings.enabled && !prevEnabled) {
        startFeatures();
      }
    }
  }

  function setupAssistantObserver() {
    labelExistingAssistantMessages();
    state.assistantObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          processPotentialAssistantNode(node);
          node.querySelectorAll?.('*').forEach((child) => {
            if (child instanceof HTMLElement) {
              processPotentialAssistantNode(child);
            }
          });
        });
      });
    });
    state.assistantObserver.observe(document.body, { childList: true, subtree: true });
  }

  function labelExistingAssistantMessages() {
    state.site.assistantSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        checkedMessages.add(el); // mark old messages as seen but don't score them
        processAssistantMessage(el);
      });
    });
  }

  function processPotentialAssistantNode(node) {
    if (!state.site.assistantSelectors.some((selector) => node.matches(selector))) {
      return;
    }
    setTimeout(() => processAssistantMessage(node), ALBA_CONFIG.responseDelayMs);
  }

  function processAssistantMessage(element) {
    if (!element || element.dataset.albaLabeled) return;
    const text = element.innerText || '';
    if (text.trim().length < ALBA_CONFIG.minChars) {
      element.dataset.albaLabeled = 'skip';
      return;
    }
    if (!checkedMessages.has(element)) {
      checkedMessages.add(element);
      runSycophancyCheck(element);
    }
    element.dataset.albaLabeled = 'true';
  }

  function startConversationTracking() {
    if (state.locationTrackerInitialized) return;
    state.locationTrackerInitialized = true;

    const handleChange = () => {
      const nextId = getConversationId();
      if (!nextId || nextId === state.conversationId) return;
      state.conversationId = nextId;
    };

    const patchHistoryMethod = (method) => {
      const original = history[method];
      if (typeof original !== 'function' || original.__albaWrapped) return;
      const wrapped = function (...args) {
        const result = original.apply(this, args);
        setTimeout(handleChange, 0);
        return result;
      };
      wrapped.__albaWrapped = true;
      history[method] = wrapped;
    };

    ['pushState', 'replaceState'].forEach(patchHistoryMethod);
    window.addEventListener('popstate', handleChange);
    setInterval(handleChange, 1500);
    setTimeout(handleChange, 0);
  }

  function getConversationId() {
    const siteId = state.site?.id || window.location.hostname || 'site';
    const domConversation =
      document.querySelector('[data-conversation-id]')?.getAttribute('data-conversation-id') ||
      document.querySelector('[data-thread-id]')?.getAttribute('data-thread-id');
    if (domConversation) {
      return `${siteId}:thread:${domConversation}`;
    }
    const path = window.location.pathname || '/';
    const chatMatch = path.match(/\/c\/([^/]+)/);
    const identifier = chatMatch ? chatMatch[1] : path || 'root';
    const search = window.location.search || '';
    return `${siteId}:${identifier}${search}`;
  }

  function getActiveThemeKey() {
    const theme = state.settings?.theme;
    if (ALBA_CONFIG.themes && theme && ALBA_CONFIG.themes[theme]) {
      return theme;
    }
    return 'light';
  }

  function refreshThemeTokens() {
    const themeKey = getActiveThemeKey();
    document.querySelectorAll('.alba-theme').forEach((node) => {
      node.dataset.albaTheme = themeKey;
    });
  }

  function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function resolveEditableTarget(element) {
    if (!element) return null;
    if (isUsableEditable(element)) return element;
    const scopes = [element, element.closest?.('[contenteditable="true"], [role="textbox"], textarea'), element.parentElement].filter(Boolean);
    const selectorOrder = [
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"][data-placeholder]',
      '[contenteditable="true"]',
      '[role="textbox"]',
      'textarea'
    ];
    for (const scope of scopes) {
      for (const selector of selectorOrder) {
        const candidate =
          scope.matches?.(selector) ? scope : scope.querySelector?.(selector) || scope.parentElement?.querySelector?.(selector);
        if (candidate && isUsableEditable(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  }

  function isUsableEditable(element) {
    if (!element || !element.matches) return false;
    if (!element.matches('textarea, [contenteditable="true"], [role="textbox"]')) return false;
    if (element.getAttribute('aria-hidden') === 'true') return false;
    if (element.closest('[aria-hidden="true"]')) return false;
    const style = window.getComputedStyle(element);
    if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

})();
