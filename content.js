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
      promptSelectors: ['textarea', 'div[contenteditable="true"]'],
      sendButtonSelectors: ['button[aria-label*="Send"]'],
      assistantSelectors: [
        'chat-message[message-type="model"]',
        'div[data-message-author-role="model"]'
      ]
    },
    {
      id: 'perplexity',
      hostPattern: /(?:www\.)?perplexity\.ai$/,
      promptSelectors: ['textarea', 'div[contenteditable="true"]'],
      sendButtonSelectors: ['button[aria-label*="Submit"]', 'button[aria-label*="Send"]'],
      assistantSelectors: [
        'div[class*="answer"]',
        'div[data-testid="assistant-response"]'
      ]
    }
  ];

  const EMBEDDING_LABELS = ['text', 'image', 'audio'];
  const WORD_EMBEDDINGS = {
    summarize: [1, 0, 0],
    summary: [1, 0, 0],
    essay: [1, 0, 0],
    paragraph: [1, 0, 0],
    outline: [1, 0, 0],
    report: [1, 0, 0],
    brief: [1, 0, 0],
    explain: [1, 0, 0],
    draw: [0, 1, 0],
    image: [0, 1, 0],
    images: [0, 1, 0],
    illustration: [0, 1, 0],
    render: [0, 1, 0],
    picture: [0, 1, 0],
    dalle: [0, 1, 0],
    diffusion: [0, 1, 0],
    photo: [0, 1, 0],
    sketch: [0, 1, 0],
    concept: [0, 1, 0],
    mosaic: [0, 1, 0],
    storyboard: [0, 1, 0],
    audio: [0, 0, 1],
    speech: [0, 0, 1],
    podcast: [0, 0, 1],
    transcribe: [0, 0, 1],
    transcription: [0, 0, 1],
    voice: [0, 0, 1],
    minutes: [0, 0, 1],
    lyrics: [0, 0, 1]
  };

  const REMOTE_API_BASE = 'http://localhost:3000';
  const WRAPPED_GRADIENTS = [
    'linear-gradient(135deg, #f97794 0%, #623aa2 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
    'linear-gradient(135deg, #5ee7df 0%, #b490ca 100%)'
  ];

  const state = {
    settings: { ...ALBA_CONFIG.defaultSettings },
    dailyTotals: {},
    history: [],
    promptControllers: new Map(),
    widget: null,
    analyzerObserver: null,
    assistantObserver: null,
    site: SITE_CONFIGS.find((config) => config.hostPattern.test(window.location.hostname)),
    debounceTimers: new WeakMap(),
    featuresActive: false,
    conversationId: null,
    locationTrackerInitialized: false,
    wrappedPanel: null,
    wrappedAbortController: null,
    wrappedEscHandler: null
  };

  if (!state.site) {
    return;
  }

  init();

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

  function startFeatures() {
    if (state.featuresActive) return;
    state.featuresActive = true;
    ensureDailyTotalsKey(getTodayKey());
    setupPromptAnalyzer();
    setupAssistantObserver();
    createFloatingWidget();
  }

  function teardownFeatures() {
    if (!state.featuresActive) return;
    state.featuresActive = false;
    state.analyzerObserver?.disconnect();
    state.assistantObserver?.disconnect();
    state.analyzerObserver = null;
    state.assistantObserver = null;
    state.promptControllers.forEach((controller) => {
      if (controller.optimizationTimer) clearTimeout(controller.optimizationTimer);
      hideInlineSuggestion(controller);
      controller.input.removeEventListener('input', controller.listener);
      controller.input.removeEventListener('keyup', controller.listener);
      controller.input.removeEventListener('blur', controller.listener);
      controller.container.remove();
      delete controller.host.dataset.albaAttached;
    });
    state.promptControllers.clear();
    state.debounceTimers = new WeakMap();
    if (state.widget?.root) {
      state.widget.root.remove();
    }
    state.widget = null;
    document.querySelectorAll('.alba-impact-label, .alba-inline-suggestion').forEach((node) => node.remove());
  }

  function loadPersistedState() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        [
          ALBA_STORAGE_KEYS.settings,
          ALBA_STORAGE_KEYS.totals,
          ALBA_STORAGE_KEYS.history
        ],
        (data) => {
          if (data[ALBA_STORAGE_KEYS.settings]) {
            state.settings = { ...ALBA_CONFIG.defaultSettings, ...data[ALBA_STORAGE_KEYS.settings] };
          }
          state.dailyTotals = data[ALBA_STORAGE_KEYS.totals] || {};
          state.history = data[ALBA_STORAGE_KEYS.history] || [];
          refreshThemeTokens();
          resolve();
        }
      );
    });
  }

  function ensureDailyTotalsKey(key) {
    if (!state.dailyTotals[key]) {
      state.dailyTotals[key] = { Wh: 0, gCO2: 0, waterMl: 0 };
    }
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
      state.promptControllers.forEach((controller) => {
        controller.optimizeButton.disabled = !state.settings.optimizerEnabled;
      });
      if (state.settings.theme !== prevTheme) {
        refreshThemeTokens();
      }
      if (!state.settings.enabled && prevEnabled) {
        teardownFeatures();
      } else if (state.settings.enabled && !prevEnabled) {
        startFeatures();
      }
    }
    if (changes[ALBA_STORAGE_KEYS.totals]) {
      state.dailyTotals = changes[ALBA_STORAGE_KEYS.totals].newValue || {};
      ensureDailyTotalsKey(getTodayKey());
      renderWidgetTotals();
    }
    if (changes[ALBA_STORAGE_KEYS.history]) {
      state.history = changes[ALBA_STORAGE_KEYS.history].newValue || [];
    }
  }

  function setupPromptAnalyzer() {
    attachAnalyzerToExistingPrompts();
    state.analyzerObserver = new MutationObserver(() => {
      cleanupDetachedControllers();
      attachAnalyzerToExistingPrompts();
    });
    state.analyzerObserver.observe(document.body, { childList: true, subtree: true });
  }

  function attachAnalyzerToExistingPrompts() {
    cleanupDetachedControllers();
    state.site.promptSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((input) => {
        const resolved = resolveEditableTarget(input);
        if (!resolved || resolved.dataset.albaAttached) return;
        resolved.dataset.albaAttached = 'true';
        createPromptController(resolved);
      });
    });
  }

  function createPromptController(editableTarget) {
    const controller = {
      host: editableTarget,
      input: editableTarget,
      container: document.createElement('div'),
      optimizeButton: document.createElement('button'),
      previewText: document.createElement('span'),
      inlineSuggestion: null,
      lastEstimate: null,
      lastOptimizedText: null,
      optimizationTimer: null
    };

    controller.container.className = 'alba-optimizer-bar';
    applyTheme(controller.container);
    controller.previewText.className = 'alba-optimizer-preview';
    //controller.previewText.textContent = 'Alba';

    controller.optimizeButton.className = 'alba-optimizer-action';
    controller.optimizeButton.type = 'button';
    controller.optimizeButton.textContent = 'Optimize';
    controller.optimizeButton.disabled = !state.settings.optimizerEnabled;
    controller.optimizeButton.addEventListener('click', () => {
      if (!state.settings.optimizerEnabled) return;
      handleOptimizeClick(controller);
    });

    controller.container.appendChild(controller.previewText);
    controller.container.appendChild(controller.optimizeButton);

    const parent = editableTarget.closest('form') || editableTarget.parentElement;
    (parent || editableTarget).appendChild(controller.container);

    const listener = () => {
      schedulePreviewUpdate(controller);
      scheduleInlineOptimization(controller);
    };
    controller.listener = listener;
    editableTarget.addEventListener('input', listener);
    editableTarget.addEventListener('keyup', listener);
    editableTarget.addEventListener('blur', listener);

    state.promptControllers.set(editableTarget, controller);
    schedulePreviewUpdate(controller);
  }

  function cleanupDetachedControllers() {
    state.promptControllers.forEach((controller, host) => {
      if (!host.isConnected || !document.contains(host)) {
        host.removeEventListener('input', controller.listener);
        host.removeEventListener('keyup', controller.listener);
        host.removeEventListener('blur', controller.listener);
        controller.container.remove();
        delete host.dataset.albaAttached;
        state.promptControllers.delete(host);
      }
    });
  }

  function schedulePreviewUpdate(controller) {
    const input = controller.input;
    if (!input) return;
    const existing = state.debounceTimers.get(input);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      updatePromptEstimate(controller);
    }, ALBA_CONFIG.debounceMs);
    state.debounceTimers.set(input, timer);
  }

  function scheduleInlineOptimization(controller) {
    if (!state.settings.optimizerEnabled) return;
    if (controller.optimizationTimer) clearTimeout(controller.optimizationTimer);

    controller.optimizationTimer = setTimeout(() => {
      fetchAndShowInlineSuggestion(controller);
    }, 2000); // Wait 2 seconds after user stops typing
  }

  async function fetchAndShowInlineSuggestion(controller) {
    const text = getInputText(controller.input) || '';
    console.log('[Alba] Checking for optimization. Text length:', text.length, 'Min chars:', ALBA_CONFIG.minChars);

    if (!text.trim() || text.length < ALBA_CONFIG.minChars) {
      hideInlineSuggestion(controller);
      return;
    }

    // Don't refetch if text hasn't changed
    if (controller.lastOptimizedText === text) {
      console.log('[Alba] Text unchanged, skipping optimization');
      return;
    }

    controller.lastOptimizedText = text;
    console.log('[Alba] Optimizing text:', text.substring(0, 50) + '...');

    // Try local optimization first
    const localOptimized = applyLocalOptimizer(text);
    console.log('[Alba] Local optimization result:', localOptimized.substring(0, 50) + '...');

    // If local optimization made changes, show it immediately
    if (localOptimized !== text && localOptimized.length < text.length) {
      console.log('[Alba] Showing local optimization suggestion');
      showInlineSuggestion(controller, localOptimized, 'local');
    }

    // If remote optimizer is enabled, fetch remote suggestion
    if (state.settings.remoteOptimizer) {
      console.log('[Alba] Fetching remote optimization...');
      const remoteOptimized = await fetchRemoteOptimization(text);
      console.log('[Alba] Remote optimization result:', remoteOptimized);
      if (remoteOptimized && remoteOptimized.trim() && remoteOptimized !== text) {
        console.log('[Alba] Showing remote optimization suggestion');
        showInlineSuggestion(controller, remoteOptimized.trim(), 'remote');
      }
    } else {
      console.log('[Alba] Remote optimizer disabled in settings');
    }
  }

  function showInlineSuggestion(controller, optimizedText, source) {
    const originalText = getInputText(controller.input);

    // Calculate impact savings
    const originalImpact = estimateImpact({
      text: originalText,
      modality: detectModality(originalText),
      images: 0
    });
    const optimizedImpact = estimateImpact({
      text: optimizedText,
      modality: detectModality(optimizedText),
      images: 0
    });

    const gramsSavings = originalImpact && optimizedImpact ? (originalImpact.gCO2 - optimizedImpact.gCO2) : 0;
    const percentSavings =
      originalImpact && optimizedImpact && originalImpact.Wh > 0
        ? ((originalImpact.Wh - optimizedImpact.Wh) / originalImpact.Wh) * 100
        : 0;

    // Remove existing suggestion if any
    hideInlineSuggestion(controller);

    // Create inline suggestion card
    const suggestion = document.createElement('div');
    suggestion.className = 'alba-inline-suggestion';
    applyTheme(suggestion);

    const header = document.createElement('div');
    header.className = 'alba-suggestion-header';
    header.innerHTML = `
      <span class="alba-suggestion-badge">${source === 'remote' ? 'Optimized' : 'Quick Optimization'}</span>
      <span class="alba-suggestion-savings">
        ${
          percentSavings > 0
            ? `Reduced Footprint ${percentSavings.toFixed(0)}%`
            : 'Optimized'
        }
      </span>
    `;

    const content = document.createElement('div');
    content.className = 'alba-suggestion-content';
    content.textContent = optimizedText;

    const impacts = document.createElement('div');
    impacts.className = 'alba-suggestion-impact';
    impacts.innerHTML = `
      <div>${formatOriginal(originalImpact)}</div>
      <div>${formatOptimized(optimizedImpact)}</div>
    `;

    const actions = document.createElement('div');
    actions.className = 'alba-suggestion-actions';

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'alba-suggestion-btn alba-suggestion-dismiss';
    dismissBtn.textContent = 'Dismiss';
    dismissBtn.type = 'button';
    dismissBtn.addEventListener('click', () => hideInlineSuggestion(controller));

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'alba-suggestion-btn alba-suggestion-accept';
    acceptBtn.textContent = 'Accept';
    acceptBtn.type = 'button';
    acceptBtn.addEventListener('click', () => {
      setInputText(controller.input, optimizedText);
      controller.input.dispatchEvent(new Event('input', { bubbles: true }));
      hideInlineSuggestion(controller);
      updatePromptEstimate(controller);
    });

    actions.appendChild(dismissBtn);
    actions.appendChild(acceptBtn);

    suggestion.appendChild(header);
    suggestion.appendChild(content);
    suggestion.appendChild(impacts);
    suggestion.appendChild(actions);

    // Insert suggestion near the input
    const parent = controller.container.parentElement;
    if (parent) {
      parent.insertBefore(suggestion, controller.container);
      controller.inlineSuggestion = suggestion;
    }
  }

  function hideInlineSuggestion(controller) {
    if (controller.inlineSuggestion) {
      controller.inlineSuggestion.remove();
      controller.inlineSuggestion = null;
    }
  }

  function updatePromptEstimate(controller) {
    const text = (getInputText(controller.input) || '').trim();
    if (!text) {
      controller.previewText.textContent = 'Alba';
      controller.lastEstimate = null;
      return;
    }
    const intent = detectIntentWithEmbeddings(text);
    const keywordModality = detectModality(text);
    const modality = intent.modality || keywordModality;
    const units = estimatePromptUnits(modality, text);
    const estimateConfig = { text, modality };
    if (modality === 'image') {
      estimateConfig.images = units.units;
    } else if (modality === 'audio') {
      estimateConfig.minutes = units.units;
    } else {
      estimateConfig.tokensOverride = units.tokens || units.units;
    }
    const estimate = estimateImpact(estimateConfig);
    if (!estimate) {
      controller.lastEstimate = null;
      controller.previewText.textContent = 'Alba';
    } else {
      controller.lastEstimate = estimate;
      controller.previewText.textContent = formatImpactLine(estimate);
    }
    controller.optimizeButton.disabled = !state.settings.optimizerEnabled;
  }

  function handleOptimizeClick(controller) {
    const original = getInputText(controller.input) || '';
    if (!original.trim()) return;
    controller.lastOptimizedText = null;
    fetchAndShowInlineSuggestion(controller);
  }


  function applyLocalOptimizer(text) {
    const trimmed = text
      .replace(/\s+/g, ' ')
      .replace(/\b(please|kindly|just|maybe|perhaps)\b/gi, '')
      .replace(/\b(can you|could you|would you)\b/gi, '')
      .trim();
    return trimmed.length > 0 ? trimmed : text.trim();
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
      document.querySelectorAll(selector).forEach((el) => processAssistantMessage(el));
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
    console.log("Text trim length : ", text.trim().length);
    console.log("ALBA_CONFIG.minChars : ", ALBA_CONFIG.minChars);
    // if (text.trim().length < ALBA_CONFIG.minChars) {
    //   element.dataset.albaLabeled = 'skip';
    //   return;
    // }
    const images = countContentImages(element);
    console.log("Images : ", images);
    const modality = images > 0 ? 'image' : detectModality(text);
    const estimate = estimateImpact({ text, modality, images });
    if (!estimate || !estimate.Wh) {
      element.dataset.albaLabeled = 'skip';
      return;
    }
    element.dataset.albaLabeled = 'true';
    renderImpactLabel(element, estimate);
    console.log("Element wh:", element.Wh);
    persistImpact('assistant_response', estimate, text, modality);
  }

  function renderImpactLabel(element, estimate) {
    const pill = document.createElement('div');
    pill.className = 'alba-impact-label alba-tooltip-host';
    applyTheme(pill);
    pill.textContent = `${estimate.icon || 'eco'} ${estimate.Wh.toFixed(2)} Wh | ${estimate.gCO2.toFixed(2)} g CO2 | ${estimate.waterMl.toFixed(0)} mL`;

    const tooltip = document.createElement('div');
    tooltip.className = 'alba-tooltip';
    tooltip.textContent = 'Estimated locally from message size + public benchmarks. Actual values vary.';
    pill.appendChild(tooltip);

    element.appendChild(pill);
  }

  function persistImpact(source, estimate, text, modality) {
    const timestamp = Date.now();
    const key = getTodayKey();
    ensureDailyTotalsKey(key);
    state.dailyTotals[key].Wh += estimate.Wh;
    state.dailyTotals[key].gCO2 += estimate.gCO2;
    state.dailyTotals[key].waterMl += estimate.waterMl;

    const entry = {
      timestamp,
      site: state.site.id,
      source,
      modality,
      conversationId: state.conversationId,
      chars: text.length,
      tokens: estimate.tokens,
      Wh: estimate.Wh,
      gCO2: estimate.gCO2,
      waterMl: estimate.waterMl
    };
    state.history.push(entry);
    state.history = state.history.slice(-1000);

    chrome.storage.sync.set({
      [ALBA_STORAGE_KEYS.totals]: state.dailyTotals,
      [ALBA_STORAGE_KEYS.history]: state.history
    });
    renderWidgetTotals();
  }

  function createFloatingWidget() {
    const widget = document.createElement('div');
    widget.className = 'alba-widget';
    applyTheme(widget);

    const toggle = document.createElement('button');
    toggle.className = 'alba-widget-toggle';
    toggle.type = 'button';

    const logo = document.createElement('img');
    logo.src = chrome.runtime.getURL('icons/alba_logo.png');
    logo.alt = 'Company logo';
    logo.className = 'alba-widget-logo';

    toggle.appendChild(logo);

    const card = document.createElement('div');
    card.className = 'alba-widget-card';

    const tabs = document.createElement('div');
    tabs.className = 'alba-widget-tabs';

    const todayTab = document.createElement('button');
    todayTab.type = 'button';
    todayTab.className = 'alba-widget-tab';
    todayTab.dataset.tab = 'today';
    todayTab.textContent = "Today's Impact";

    const chatTab = document.createElement('button');
    chatTab.type = 'button';
    chatTab.className = 'alba-widget-tab';
    chatTab.dataset.tab = 'chat';
    chatTab.textContent = 'This Chat';

    tabs.appendChild(todayTab);
    tabs.appendChild(chatTab);

    const totals = document.createElement('div');
    totals.className = 'alba-widget-totals';

    const comparison = document.createElement('div');
    comparison.className = 'alba-widget-comparison';

    const delta = document.createElement('div');
    delta.className = 'alba-widget-delta';

    const buttons = document.createElement('div');
    buttons.className = 'alba-widget-actions';

    const exportBtn = document.createElement('button');
    exportBtn.textContent = 'Export';
    exportBtn.type = 'button';
    exportBtn.addEventListener('click', exportHistory);

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', resetTodayTotals);

    buttons.appendChild(exportBtn);
    buttons.appendChild(resetBtn);

    card.appendChild(tabs);
    card.appendChild(totals);
    card.appendChild(comparison);
    card.appendChild(delta);
    card.appendChild(buttons);

    widget.appendChild(toggle);
    widget.appendChild(card);

    toggle.addEventListener('click', () => {
      widget.classList.toggle('alba-open');
    });

    document.body.appendChild(widget);
    const previousTab = state.widget?.activeTab || 'today';
    state.widget = {
      root: widget,
      totalsEl: totals,
      comparisonEl: comparison,
      deltaEl: delta,
      tabs: { container: tabs, today: todayTab, chat: chatTab },
      activeTab: previousTab
    };

    todayTab.addEventListener('click', () => setWidgetTab('today'));
    chatTab.addEventListener('click', () => setWidgetTab('chat'));

    setWidgetTab(previousTab);
  }

  function setWidgetTab(tab) {
    if (!state.widget) return;
    const nextTab = tab === 'chat' ? 'chat' : 'today';
    state.widget.activeTab = nextTab;
    const tabs = state.widget.tabs || {};
    const todayBtn = tabs.today;
    const chatBtn = tabs.chat;
    if (todayBtn) {
      todayBtn.classList.toggle('alba-active', nextTab === 'today');
    }
    if (chatBtn) {
      chatBtn.classList.toggle('alba-active', nextTab === 'chat');
    }
    renderWidgetTotals();
  }

  function renderWidgetTotals() {
    if (!state.widget) return;
    const key = getTodayKey();
    ensureDailyTotalsKey(key);
    const todayTotals = state.dailyTotals[key];
    const activeTab = state.widget.activeTab || 'today';
    const chatStats = getChatStats();
    const displayTotals = activeTab === 'chat' ? chatStats.totals : todayTotals;
    const heading = activeTab === 'chat' ? 'This Chat' : "Today's Totals";
    const tooltipCopy = formatTotalsTooltip(displayTotals);
    const summaryToggle =
      activeTab === 'today'
        ? '<button type="button" class="alba-widget-summary-link" aria-label="Open Spotify-style summary">Summary</button>'
        : '';
    state.widget.totalsEl.innerHTML =
      `<div class="alba-widget-heading">
         <strong>${heading}</strong>
         ${summaryToggle}
       </div>
       <div class="alba-widget-totals-line alba-tooltip-host">
         ${displayTotals.Wh.toFixed(2)} Wh | ${displayTotals.gCO2.toFixed(2)} g CO2 | ${displayTotals.waterMl.toFixed(0)} mL
         <div class="alba-tooltip">${tooltipCopy}</div>
       </div>`;
    if (activeTab === 'today') {
      const summaryBtn = state.widget.totalsEl.querySelector('.alba-widget-summary-link');
      if (summaryBtn) {
        summaryBtn.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          showWrappedSummary();
        });
      }
    }
    if (activeTab === 'today') {
      const previous = state.dailyTotals[getPreviousDayKey(key)] || { Wh: 0, gCO2: 0, waterMl: 0 };
      state.widget.comparisonEl.textContent = formatComparison(todayTotals.Wh);
      const deltaWh = todayTotals.Wh - previous.Wh;
      const arrow = deltaWh >= 0 ? '+' : '-';
      const deltaText = `${arrow}${Math.abs(deltaWh).toFixed(2)} Wh vs yesterday`;
      state.widget.deltaEl.textContent = deltaText;
    } else {
      if (chatStats.entries > 0) {
        state.widget.comparisonEl.textContent = `${chatStats.entries} tracked message${chatStats.entries === 1 ? '' : 's'} in this chat`;
        state.widget.deltaEl.textContent = 'Totals reset when you switch chats.';
      } else {
        state.widget.comparisonEl.textContent = 'No impact recorded in this chat yet.';
        state.widget.deltaEl.textContent = '';
      }
    }
    const budgetWh = 10; // Adjustable daily reference for ring progress.
    const progress = Math.min(1, (displayTotals.Wh || 0) / budgetWh);
    state.widget.root.style.setProperty('--alba-progress', progress.toString());
  }

  function showWrappedSummary() {
    const panel = ensureWrappedPanel();
    applyTheme(panel.overlay);
    panel.overlay.classList.add('alba-wrapped-visible');
    const key = getTodayKey();
    ensureDailyTotalsKey(key);
    const todayTotals = state.dailyTotals[key] || { Wh: 0, gCO2: 0, waterMl: 0 };
    const totals = {
      Wh: Number(todayTotals.Wh || 0),
      gCO2: Number(todayTotals.gCO2 || 0),
      waterMl: Number(todayTotals.waterMl || 0)
    };
    const dateLabel = formatWrappedDate();
    renderWrappedLoading(totals, dateLabel);

    if (!state.wrappedEscHandler) {
      state.wrappedEscHandler = (event) => {
        if (event.key === 'Escape') {
          hideWrappedSummary();
        }
      };
    }
    document.removeEventListener('keydown', state.wrappedEscHandler);
    document.addEventListener('keydown', state.wrappedEscHandler);

    state.wrappedAbortController?.abort();
    const controller = new AbortController();
    state.wrappedAbortController = controller;

    if (!totals.Wh && !totals.gCO2 && !totals.waterMl) {
      state.wrappedAbortController = null;
      renderWrappedError('No impact recorded yet. Jam with an AI model to unlock your eco wrapped!', totals, dateLabel);
      return;
    }

    fetchWrappedSummary(totals, dateLabel, controller.signal)
      .then((payload) => {
        if (controller.signal.aborted) return;
        if (payload && Array.isArray(payload.cards)) {
          renderWrappedPayload(payload, totals, dateLabel);
        } else if (payload) {
          renderWrappedPayload(payload, totals, dateLabel);
        } else {
          renderWrappedError('The storyteller came back empty. Try again in a moment.', totals, dateLabel);
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.warn('wrapped summary unavailable', err);
        renderWrappedError(
          `Could not reach ${REMOTE_API_BASE}/wrapped. Start the Alba API helper (npm start) and try again.`,
          totals,
          dateLabel
        );
      })
      .finally(() => {
        if (state.wrappedAbortController === controller) {
          state.wrappedAbortController = null;
        }
      });
  }

  function hideWrappedSummary() {
    state.wrappedAbortController?.abort();
    state.wrappedAbortController = null;
    if (state.wrappedPanel?.overlay) {
      state.wrappedPanel.overlay.classList.remove('alba-wrapped-visible');
    }
    if (state.wrappedEscHandler) {
      document.removeEventListener('keydown', state.wrappedEscHandler);
    }
  }

  function ensureWrappedPanel() {
    if (state.wrappedPanel) {
      return state.wrappedPanel;
    }
    const overlay = document.createElement('div');
    overlay.className = 'alba-wrapped-overlay alba-theme';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const shell = document.createElement('div');
    shell.className = 'alba-wrapped-shell';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'alba-wrapped-close';
    closeBtn.setAttribute('aria-label', 'Close Spotify-style summary');
    closeBtn.textContent = '×';

    const content = document.createElement('div');
    content.className = 'alba-wrapped-body';

    shell.appendChild(closeBtn);
    shell.appendChild(content);
    overlay.appendChild(shell);
    document.body.appendChild(overlay);

    closeBtn.addEventListener('click', hideWrappedSummary);
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        hideWrappedSummary();
      }
    });

    state.wrappedPanel = { overlay, shell, content };
    return state.wrappedPanel;
  }

  function renderWrappedLoading(totals, dateLabel) {
    const panel = ensureWrappedPanel();
    panel.content.innerHTML = `
      <header class="alba-wrapped-head">
        <p class="alba-wrapped-title">Alba Eco Wrapped</p>
        <p class="alba-wrapped-subhead">${dateLabel}</p>
        <p class="alba-wrapped-tagline">${formatWrappedMetrics(totals)}</p>
      </header>
      <div class="alba-wrapped-loading">
        <div class="alba-wrapped-spinner"></div>
        <p>Spinning up your eco analogies...</p>
      </div>`;
  }

  function renderWrappedError(message, totals, dateLabel) {
    const panel = ensureWrappedPanel();
    panel.content.innerHTML = `
      <header class="alba-wrapped-head">
        <p class="alba-wrapped-title">Alba Eco Wrapped</p>
        <p class="alba-wrapped-subhead">${dateLabel}</p>
        <p class="alba-wrapped-tagline">${formatWrappedMetrics(totals)}</p>
      </header>
      <div class="alba-wrapped-error">
        <p>${message}</p>
        <button type="button" class="alba-wrapped-retry">Retry</button>
      </div>`;
    const retryBtn = panel.content.querySelector('.alba-wrapped-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', (event) => {
        event.preventDefault();
        showWrappedSummary();
      });
    }
  }

  function renderWrappedPayload(payload, totals, dateLabel) {
    const panel = ensureWrappedPanel();
    const sourceCards =
      Array.isArray(payload.cards) && payload.cards.length ? payload.cards : buildLocalWrappedCards(totals);
    const cards = sourceCards.slice(0, 3).map((card, idx) => {
      return `
        <article class="alba-wrapped-card" style="--alba-wrapped-gradient:${getWrappedGradient(idx)}">
          <p class="alba-wrapped-card-title">${card.title || 'Highlight'}</p>
          <p class="alba-wrapped-card-stat">
            <span class="alba-wrapped-card-value">${card.statValue || ''}</span>
            <span class="alba-wrapped-card-label">${card.statLabel || ''}</span>
          </p>
          <p class="alba-wrapped-card-analogy">${card.analogy || ''}</p>
          <p class="alba-wrapped-card-tip">${card.tip || ''}</p>
        </article>`;
    }).join('');

    panel.content.innerHTML = `
      <header class="alba-wrapped-head">
        <p class="alba-wrapped-title">${payload.headline || 'Alba Eco Wrapped'}</p>
        <p class="alba-wrapped-subhead">${payload.subhead || dateLabel}</p>
        <p class="alba-wrapped-tagline">${formatWrappedMetrics(totals)}</p>
      </header>
      <section class="alba-wrapped-grid">
        ${cards}
      </section>
      <footer class="alba-wrapped-footer">
        <p>${payload.cta || ''}</p>
        <span>${payload.footnote || 'Estimates rely on Alba defaults only.'}</span>
      </footer>`;
  }

  function getWrappedGradient(index) {
    return WRAPPED_GRADIENTS[index % WRAPPED_GRADIENTS.length];
  }

  function formatWrappedDate(date = new Date()) {
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function formatWrappedMetrics(totals) {
    return `${totals.Wh.toFixed(2)} Wh • ${totals.gCO2.toFixed(2)} g CO₂ • ${totals.waterMl.toFixed(0)} mL`;
  }

  function buildLocalWrappedCards(totals) {
    const ledMinutes = totals.Wh ? (totals.Wh / 0.008).toFixed(1) : '0';
    const scooterKm = totals.gCO2 ? (totals.gCO2 / 12).toFixed(1) : '0';
    const waterPerc = totals.waterMl ? ((totals.waterMl / 9500) * 100).toFixed(1) : '0';
    return [
      {
        title: 'Energy Mood',
        statLabel: 'Wh burned',
        statValue: `${totals.Wh.toFixed(2)} Wh`,
        analogy: totals.Wh
          ? `Roughly the juice of a smart speaker vibing for ${ledMinutes} minutes.`
          : 'No watts logged yet — spotless record!',
        tip: 'Batch requests instead of sending every micro-thought.'
      },
      {
        title: 'Carbon Chorus',
        statLabel: 'CO₂',
        statValue: `${totals.gCO2.toFixed(2)} g`,
        analogy: totals.gCO2
          ? `Similar to a ${scooterKm} km e-scooter ride worth of CO₂.`
          : 'Ask something new to reveal your carbon chorus.',
        tip: 'Reuse earlier answers before generating fresh ones.'
      },
      {
        title: 'Water Remix',
        statLabel: 'Water',
        statValue: `${totals.waterMl.toFixed(0)} mL`,
        analogy: totals.waterMl
          ? `About ${waterPerc}% of a short shower — still a small splash.`
          : 'Keep riffing to see the ripple effect.',
        tip: 'Stay text-only to minimize the water sample rate.'
      }
    ];
  }

  function exportHistory() {
    chrome.storage.sync.get(ALBA_STORAGE_KEYS.history, (data) => {
      const entries = data[ALBA_STORAGE_KEYS.history] || [];
      if (!entries.length) return;
      const header = 'timestamp,site,source,modality,chars,tokens,Wh,gCO2,waterMl\n';
      const rows = entries
        .map((entry) =>
          [
            new Date(entry.timestamp).toISOString(),
            entry.site,
            entry.source,
            entry.modality,
            entry.chars,
            entry.tokens,
            entry.Wh.toFixed(4),
            entry.gCO2.toFixed(4),
            entry.waterMl.toFixed(2)
          ].join(',')
        )
        .join('\n');
      const blob = new Blob([header + rows], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `alba-footprint-${getTodayKey()}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
      }, 0);
    });
  }

  function resetTodayTotals() {
    const key = getTodayKey();
    ensureDailyTotalsKey(key);
    state.dailyTotals[key] = { Wh: 0, gCO2: 0, waterMl: 0 };
    state.history = state.history.filter((entry) => getDateKey(entry.timestamp) !== key);
    chrome.storage.sync.set({
      [ALBA_STORAGE_KEYS.totals]: state.dailyTotals,
      [ALBA_STORAGE_KEYS.history]: state.history
    });
    renderWidgetTotals();
  }

  function getChatStats() {
    const totals = { Wh: 0, gCO2: 0, waterMl: 0 };
    const conversationId = state.conversationId;
    if (!conversationId) {
      return { totals, entries: 0 };
    }
    let entries = 0;
    state.history.forEach((entry) => {
      if (entry.conversationId !== conversationId) return;
      entries += 1;
      totals.Wh += entry.Wh || 0;
      totals.gCO2 += entry.gCO2 || 0;
      totals.waterMl += entry.waterMl || 0;
    });
    return { totals, entries };
  }

  function getInputText(input) {
    if (!input) return '';
    if (typeof input.value === 'string') {
      return input.value;
    }
    if (input.innerText !== undefined || input.textContent !== undefined) {
      const text = (input.innerText || input.textContent || '').trim();
      const placeholder = input.getAttribute('data-placeholder') || input.getAttribute('placeholder');
      if (placeholder && text === placeholder.trim()) {
        return '';
      }
      return text;
    }
    return '';
  }

  function setInputText(input, text) {
    if (!input) return;
    if (input.value !== undefined) {
      input.value = text;
    } else {
      input.textContent = text;
    }
  }

  function startConversationTracking() {
    if (state.locationTrackerInitialized) return;
    state.locationTrackerInitialized = true;

    const handleChange = () => {
      const nextId = getConversationId();
      if (!nextId || nextId === state.conversationId) return;
      state.conversationId = nextId;
      renderWidgetTotals();
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

  function detectModality(text) {
    const lower = (text || '').toLowerCase();
    if (ALBA_CONFIG.modalKeywords.image.some((kw) => lower.includes(kw))) {
      return 'image';
    }
    if (ALBA_CONFIG.modalKeywords.audio.some((kw) => lower.includes(kw))) {
      return 'audio';
    }
    if (ALBA_CONFIG.modalKeywords.pdf.some((kw) => lower.includes(kw))) {
      return 'pdf';
    }
    return 'text';
  }

  function estimateImpact({ text = '', modality = 'text', images = 0, minutes = 0, tokensOverride }) {
    // All calculations are approximate and rely solely on ALBA_CONFIG coefficients.
    // Document methodology externally (e.g., README) so the UI stays minimal.
    const profile = ALBA_CONFIG.modelProfiles[state.settings.modelProfile] || ALBA_CONFIG.modelProfiles.balanced;
    const modalCoefficients = profile.modalities[modality] || profile.modalities.text;
    const region = ALBA_CONFIG.regions[state.settings.region] || ALBA_CONFIG.regions.global;
    const heuristics = ALBA_CONFIG.heuristics || {};

    let tokens = Math.max(1, Math.round((text.length || 0) / 4));
    if (typeof tokensOverride === 'number' && tokensOverride > 0) {
      tokens = tokensOverride;
    }
    if (modality === 'pdf') {
      const pdfPages = estimatePdfPages(text, heuristics);
      tokens = Math.max(tokens, pdfPages * (heuristics.pdfTokensPerPage || 350));
    }

    let Wh = 0;
    if (modality === 'image' && modalCoefficients.Wh_per_image) {
      const imageCount = images && images > 0 ? images : estimateRequestedImages(text, heuristics);
      Wh = imageCount * modalCoefficients.Wh_per_image;
    } else if (modality === 'audio' && modalCoefficients.Wh_per_min) {
      const minutesCount = minutes && minutes > 0 ? minutes : estimateAudioMinutes(text, heuristics);
      Wh = minutesCount * modalCoefficients.Wh_per_min;
    } else if (modalCoefficients.Wh_per_1k_tokens) {
      Wh = (tokens / 1000) * modalCoefficients.Wh_per_1k_tokens;
    } else {
      return null;
    }

    const kWh = Wh / 1000;
    const gCO2 = kWh * region.grid_CO2_g_per_kWh;
    const waterMl = kWh * region.water_L_per_kWh * 1000;

    return {
      tokens,
      Wh,
      kWh,
      gCO2,
      waterMl,
      modality,
      icon: 'eco'
    };
  }

  function formatImpactLine(estimate) {
    if (!estimate) return 'Alba';
    return `Estimated Impact: ⚡${estimate.Wh.toFixed(3)} Wh | 🌎 ${estimate.gCO2.toFixed(3)} g CO2 | 💧 ${estimate.waterMl.toFixed(3)} mL H2O`;
  }

  function formatOriginal(estimate) {
    if (!estimate) return 'Alba';
    return `Original Impact: ⚡${estimate.Wh.toFixed(3)} Wh | 🌎 ${estimate.gCO2.toFixed(3)} g CO2 | 💧 ${estimate.waterMl.toFixed(3)} mL H2O`;
  }

  function formatOptimized(estimate) {
    if (!estimate) return 'Alba';
    return `Optimized Impact: ⚡${estimate.Wh.toFixed(3)} Wh | 🌎 ${estimate.gCO2.toFixed(3)} g CO2 | 💧 ${estimate.waterMl.toFixed(3)} mL H2O`;
  }
  

  function formatComparison(Wh) {
  if (!Wh || Wh <= 0) return 'No impact recorded yet today.';
  const baseline = ALBA_CONFIG.baselineComparisons && ALBA_CONFIG.baselineComparisons[0];
  if (!baseline || !baseline.factorWh) return 'Comparable impact unavailable.';
  const value = (Wh / baseline.factorWh).toFixed(1);
  return `${baseline.label} for ${value} minutes`;
  }

  function formatTotalsTooltip(totals) {
    const parts = [];
    const kWh = totals.Wh / 1000;
    parts.push(`Energy so far today: ${totals.Wh.toFixed(3)} Wh (~${kWh.toFixed(6)} kWh).`);
    const comparison = ALBA_CONFIG.baselineComparisons[0];
    if (comparison && comparison.factorWh) {
      const eq = totals.Wh / comparison.factorWh;
      if (eq >= 0.01) {
        parts.push(`About ${eq.toFixed(1)} ${comparison.label}.`);
      }
    }
    parts.push(`Emissions: ${totals.gCO2.toFixed(3)} g CO2.`);
    parts.push(`Water: ${totals.waterMl.toFixed(1)} mL (local grid factors).`);
    parts.push('All estimates are calculated locally and approximate.');
    return parts.join(' ');
  }

  function getTodayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function getPreviousDayKey(baseKey) {
    const date = baseKey ? new Date(baseKey) : new Date();
    date.setDate(date.getDate() - 1);
    return date.toISOString().slice(0, 10);
  }

  function getDateKey(timestamp) {
    return new Date(timestamp).toISOString().slice(0, 10);
  }

  function getActiveThemeKey() {
    const theme = state.settings?.theme;
    if (ALBA_CONFIG.themes && theme && ALBA_CONFIG.themes[theme]) {
      return theme;
    }
    return 'light';
  }

  function applyTheme(element) {
    if (!element || !element.classList) return;
    if (!element.classList.contains('alba-theme')) {
      element.classList.add('alba-theme');
    }
    element.dataset.albaTheme = getActiveThemeKey();
  }

  function refreshThemeTokens() {
    const themeKey = getActiveThemeKey();
    document.querySelectorAll('.alba-theme').forEach((node) => {
      node.dataset.albaTheme = themeKey;
    });
  }

  function countContentImages(container) {
    if (!container) return 0;
    return Array.from(container.querySelectorAll('img')).filter((img) => {
      if (img.closest('button, svg, nav')) return false;
      if (img.getAttribute('aria-hidden') === 'true') return false;
      const alt = (img.getAttribute('alt') || '').trim();
      const role = (img.getAttribute('role') || '').toLowerCase();
      if (!alt && (role === 'presentation' || role === 'img')) {
        return (img.naturalWidth || img.width || 0) > 64 || (img.naturalHeight || img.height || 0) > 64;
      }
      return true;
    }).length;
  }

  function estimateRequestedImages(text, heuristics = {}) {
    const lower = (text || '').toLowerCase();
    const maxImages = heuristics.maxImageCount || 8;
    const defaultImages = heuristics.defaultImageCount || 1;
    const numericMatch = lower.match(/(\d+)\s+(?:image|images|picture|pictures|photo|photos|illustration)/i);
    if (numericMatch) {
      return clamp(parseInt(numericMatch[1], 10), 1, maxImages);
    }
    const wordMatch = lower.match(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|couple|pair|several)\s+(?:image|images|picture|photo)/i
    );
    if (wordMatch) {
      const mapped = wordToNumber(wordMatch[1]);
      if (mapped) {
        return clamp(mapped, 1, maxImages);
      }
    }
    if (lower.includes('grid of') || lower.includes('collage')) {
      return clamp(4, 1, maxImages);
    }
    return defaultImages;
  }

  function estimatePdfPages(text, heuristics = {}) {
    const lower = (text || '').toLowerCase();
    const maxPages = heuristics.maxPdfPages || 60;
    const defaultPages = heuristics.defaultPdfPages || 4;
    const match = lower.match(/(\d+)\s*(?:page|pages|pg)/i);
    if (match) {
      return clamp(parseInt(match[1], 10), 1, maxPages);
    }
    if (lower.includes('long') || lower.includes('full report') || lower.includes('whitepaper')) {
      return clamp(defaultPages * 2, 1, maxPages);
    }
    return defaultPages;
  }

  function estimateAudioMinutes(text, heuristics = {}) {
    const lower = (text || '').toLowerCase();
    const maxMinutes = heuristics.maxAudioMinutes || 20;
    const defaultMinutes = heuristics.defaultAudioMinutes || 1;
    const minuteMatch = lower.match(/(\d+)\s*(?:minute|min)/i);
    if (minuteMatch) {
      return clamp(parseInt(minuteMatch[1], 10), 1, maxMinutes);
    }
    const secondMatch = lower.match(/(\d+)\s*(?:second|sec)/i);
    if (secondMatch) {
      const minutes = Math.max(1, Math.round(parseInt(secondMatch[1], 10) / 60));
      return clamp(minutes, 1, maxMinutes);
    }
    if (lower.includes('short clip')) {
      return clamp(2, 1, maxMinutes);
    }
    return defaultMinutes;
  }

  function wordToNumber(word) {
    const map = {
      one: 1,
      two: 2,
      pair: 2,
      couple: 2,
      three: 3,
      several: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10
    };
    return map[word.toLowerCase()] || null;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
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

  function estimateTokensFromText(text) {
    if (!text || !text.trim()) return 0;
    const tokenLike = (text.match(/\b[\w\d'-]+\b/g) || []).length;
    const charEstimate = text.replace(/\s+/g, '').length / 4;
    const average = (tokenLike * 1.3 + charEstimate) / 2;
    return Math.max(1, Math.round(average));
  }

  function detectIntentWithEmbeddings(text) {
    const lower = (text || '').toLowerCase();
    const words = lower.match(/\b[\w'-]+\b/g) || [];
    const vector = [0, 0, 0];
    words.forEach((word) => {
      const embedding = WORD_EMBEDDINGS[word];
      if (!embedding) return;
      embedding.forEach((value, idx) => {
        vector[idx] += value;
      });
    });
    let modality = 'text';
    let max = 0;
    vector.forEach((value, idx) => {
      if (value > max) {
        max = value;
        modality = EMBEDDING_LABELS[idx];
      }
    });
    if (/\b(image|images|photo|render|picture|sketch|dalle|diffusion)\b/.test(lower)) {
      modality = 'image';
    }
    if (/\b(transcribe|audio|recording|speech|podcast|voice)\b/.test(lower)) {
      modality = 'audio';
    }
    return { modality };
  }

  function estimatePromptUnits(modality, text) {
    const lower = (text || '').toLowerCase();
    switch (modality) {
      case 'image': {
        const match = lower.match(/(\d+)\s?(?:image|images|picture|pictures|render|renders|variation|variations)/);
        const count = match ? parseInt(match[1], 10) : estimateRequestedImages(text);
        return { units: Math.max(1, count) };
      }
      case 'audio': {
        const minuteMatch = lower.match(/(\d+(?:\.\d+)?)\s?(?:min|minute|minutes)/);
        const minutes = minuteMatch ? parseFloat(minuteMatch[1]) : estimateAudioMinutes(text);
        return { units: Math.max(1, minutes) };
      }
      default: {
        const tokens = estimateTokensFromText(text);
        return { units: tokens, tokens };
      }
    }
  }

  async function fetchWrappedSummary(totals, dateLabel, signal) {
    try {
      const resp = await fetch(`${REMOTE_API_BASE}/wrapped`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totals, dateLabel }),
        signal
      });
      const text = await resp.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch (err) {
          console.warn('Unable to parse wrapped response payload', err);
        }
      }
      if (!resp.ok && !data) {
        throw new Error(`wrapped request failed (${resp.status})`);
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') {
        return null;
      }
      throw err;
    }
  }

  // Remote optimizer implementation
  async function fetchRemoteOptimization(prompt) {
    // Do nothing if remote optimizer disabled in settings
    if (!state.settings.remoteOptimizer) return null;

    try {
      // Adjust URL to your backend. For local dev use http://localhost:3000/optimize
      const resp = await fetch(`${REMOTE_API_BASE}/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });

      if (!resp.ok) {
        console.warn("Remote optimizer error", resp.status, await resp.text());
        return null;
      }

      const data = await resp.json();
      // Expect { optimized: "..." } (server's response shape)
      return (data && data.optimized) ? data.optimized.trim() : null;
    } catch (err) {
      console.error("fetchRemoteOptimization failed:", err);
      return null;
    }
  }
})();
