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
    featuresActive: false
  };

  if (!state.site) {
    return;
  }

  init();

  function init() {
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
      controller.input.removeEventListener('input', controller.listener);
      controller.input.removeEventListener('blur', controller.listener);
      controller.container.remove();
      delete controller.input.dataset.albaAttached;
    });
    state.promptControllers.clear();
    state.debounceTimers = new WeakMap();
    if (state.widget?.root) {
      state.widget.root.remove();
    }
    state.widget = null;
    document.querySelectorAll('.alba-impact-label, .alba-optimizer-panel').forEach((node) => node.remove());
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
      state.settings = {
        ...ALBA_CONFIG.defaultSettings,
        ...changes[ALBA_STORAGE_KEYS.settings].newValue
      };
      state.promptControllers.forEach((controller) => {
        controller.optimizeButton.disabled = !state.settings.optimizerEnabled;
      });
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
      attachAnalyzerToExistingPrompts();
    });
    state.analyzerObserver.observe(document.body, { childList: true, subtree: true });
  }

  function attachAnalyzerToExistingPrompts() {
    state.site.promptSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((input) => {
        if (input.dataset.albaAttached) return;
        input.dataset.albaAttached = 'true';
        createPromptController(input);
      });
    });
  }

  function createPromptController(inputEl) {
    const controller = {
      input: inputEl,
      container: document.createElement('div'),
      optimizeButton: document.createElement('button'),
      previewText: document.createElement('span'),
      lastEstimate: null
    };

    controller.container.className = 'alba-optimizer-bar';
    applyTheme(controller.container);
    controller.previewText.className = 'alba-optimizer-preview';
    controller.previewText.textContent = 'alba | Impact unknown';

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

    const parent = inputEl.closest('form') || inputEl.parentElement;
    (parent || inputEl).appendChild(controller.container);

    const listener = () => schedulePreviewUpdate(controller);
    controller.listener = listener;
    inputEl.addEventListener('input', listener);
    inputEl.addEventListener('blur', listener);

    state.promptControllers.set(inputEl, controller);
    schedulePreviewUpdate(controller);
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

  function updatePromptEstimate(controller) {
    const text = getInputText(controller.input);
    if (!text || text.length < ALBA_CONFIG.minChars) {
      controller.previewText.textContent = 'alba | Impact unknown';
      controller.lastEstimate = null;
      return;
    }
    const modality = detectModality(text);
    const assumedImages = modality === 'image' ? 1 : 0;
    const estimate = estimateImpact({ text, modality, images: assumedImages });
    controller.lastEstimate = estimate;
    controller.previewText.textContent = formatImpactLine(estimate);
    controller.optimizeButton.disabled = !state.settings.optimizerEnabled;
  }

  function handleOptimizeClick(controller) {
    const original = getInputText(controller.input) || '';
    if (!original.trim()) return;
    showOptimizerPanel(controller, original);
  }

  async function showOptimizerPanel(controller, originalText) {
    const overlay = document.createElement('div');
    overlay.className = 'alba-optimizer-panel';
    applyTheme(overlay);

    const header = document.createElement('div');
    header.className = 'alba-panel-header';
    header.textContent = 'Prompt impact preview';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'alba-panel-close';
    closeBtn.textContent = 'x';
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'alba-panel-body';

    const originalBlock = createPromptBlock('Original', originalText);
    body.appendChild(originalBlock.element);

    const optimizedText = applyLocalOptimizer(originalText);
    const optimizedBlock = createPromptBlock('Optimized suggestion', optimizedText);
    body.appendChild(optimizedBlock.element);

    const stats = document.createElement('div');
    stats.className = 'alba-panel-stats';

    const originalModality = detectModality(originalText);
    const originalImpact = estimateImpact({
      text: originalText,
      modality: originalModality,
      images: originalModality === 'image' ? 1 : 0
    });
    let candidateText = optimizedText;
    let candidateModality = detectModality(optimizedText);
    let candidateImpact = estimateImpact({
      text: optimizedText,
      modality: candidateModality,
      images: candidateModality === 'image' ? 1 : 0
    });

    const updateStats = () => {
      const delta = originalImpact.Wh > 0 ? ((originalImpact.Wh - candidateImpact.Wh) / originalImpact.Wh) : 0;
      const deltaText = delta > 0 ? `-${(delta * 100).toFixed(0)}% energy` : 'No savings';
      stats.textContent = `${formatImpactLine(originalImpact)} -> ${formatImpactLine(candidateImpact)} (${deltaText})`;
    };
    updateStats();

    const actions = document.createElement('div');
    actions.className = 'alba-panel-actions';
    const useOriginal = document.createElement('button');
    useOriginal.type = 'button';
    useOriginal.textContent = 'Use original';
    const useOptimized = document.createElement('button');
    useOptimized.type = 'button';
    useOptimized.className = 'alba-primary';
    useOptimized.textContent = 'Use optimized';

    useOriginal.addEventListener('click', () => {
      setInputText(controller.input, originalText);
      controller.input.dispatchEvent(new Event('input', { bubbles: true }));
      overlay.remove();
    });

    useOptimized.addEventListener('click', () => {
      setInputText(controller.input, candidateText);
      controller.input.dispatchEvent(new Event('input', { bubbles: true }));
      overlay.remove();
    });

    actions.appendChild(useOriginal);
    actions.appendChild(useOptimized);

    overlay.appendChild(header);
    overlay.appendChild(body);
    overlay.appendChild(stats);
    overlay.appendChild(actions);

    document.body.appendChild(overlay);

    if (state.settings.remoteOptimizer) {
      optimizedBlock.element.classList.add('alba-loading');
      fetchRemoteOptimization(originalText)
        .then((remoteText) => {
          if (remoteText && remoteText.trim().length >= ALBA_CONFIG.minChars) {
            candidateText = remoteText.trim();
            candidateModality = detectModality(candidateText);
            candidateImpact =
              estimateImpact({
                text: candidateText,
                modality: candidateModality,
                images: candidateModality === 'image' ? 1 : 0
              }) || candidateImpact;
            optimizedBlock.contentEl.textContent = candidateText;
            updateStats();
          }
        })
        .finally(() => optimizedBlock.element.classList.remove('alba-loading'));
    }
  }

  function createPromptBlock(label, text) {
    const wrap = document.createElement('div');
    wrap.className = 'alba-prompt-block';
    const heading = document.createElement('div');
    heading.className = 'alba-block-label';
    heading.textContent = label;
    const content = document.createElement('div');
    content.className = 'alba-block-content';
    content.textContent = text.trim();
    wrap.appendChild(heading);
    wrap.appendChild(content);
    return { element: wrap, contentEl: content };
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
    if (text.trim().length < ALBA_CONFIG.minChars) {
      element.dataset.albaLabeled = 'skip';
      return;
    }
    const images = element.querySelectorAll('img').length;
    const modality = images > 0 ? 'image' : detectModality(text);
    const estimate = estimateImpact({ text, modality, images });
    if (!estimate || !estimate.Wh) {
      element.dataset.albaLabeled = 'skip';
      return;
    }
    element.dataset.albaLabeled = 'true';
    renderImpactLabel(element, estimate);
    persistImpact('assistant_response', estimate, text, modality);
  }

  function renderImpactLabel(element, estimate) {
    const pill = document.createElement('div');
    pill.className = 'alba-impact-label';
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
    toggle.textContent = 'alba';

    const card = document.createElement('div');
    card.className = 'alba-widget-card';

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
    state.widget = { root: widget, totalsEl: totals, comparisonEl: comparison, deltaEl: delta };
    renderWidgetTotals();
  }

  function renderWidgetTotals() {
    if (!state.widget) return;
    const key = getTodayKey();
    ensureDailyTotalsKey(key);
    const totals = state.dailyTotals[key];
    const previous = state.dailyTotals[getPreviousDayKey(key)] || { Wh: 0, gCO2: 0, waterMl: 0 };
    state.widget.totalsEl.innerHTML =
      `<strong>Today</strong><div>${totals.Wh.toFixed(2)} Wh | ${totals.gCO2.toFixed(2)} g CO2 | ${totals.waterMl.toFixed(0)} mL</div>`;
    state.widget.comparisonEl.textContent = formatComparison(totals.Wh);
    const deltaWh = totals.Wh - previous.Wh;
    const arrow = deltaWh >= 0 ? '+' : '-';
    const deltaText = `${arrow}${Math.abs(deltaWh).toFixed(2)} Wh vs yesterday`;
    state.widget.deltaEl.textContent = deltaText;
    const budgetWh = 10; // Adjustable daily reference for ring progress.
    const progress = Math.min(1, totals.Wh / budgetWh);
    state.widget.root.style.setProperty('--alba-progress', progress.toString());
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

  function estimateImpact({ text = '', modality = 'text', images = 0, minutes = 0 }) {
    // All calculations are approximate and rely solely on ALBA_CONFIG coefficients.
    // Document methodology externally (e.g., README) so the UI stays minimal.
    const profile = ALBA_CONFIG.modelProfiles[state.settings.modelProfile] || ALBA_CONFIG.modelProfiles.balanced;
    const modalCoefficients = profile.modalities[modality] || profile.modalities.text;
    const region = ALBA_CONFIG.regions[state.settings.region] || ALBA_CONFIG.regions.global;

    const tokens = Math.max(1, Math.round((text.length || 0) / 4));
    let Wh = 0;
    if (modality === 'image' && modalCoefficients.Wh_per_image) {
      const imageCount = images && images > 0 ? images : 1;
      Wh = imageCount * modalCoefficients.Wh_per_image;
    } else if (modality === 'audio' && minutes > 0 && modalCoefficients.Wh_per_min) {
      Wh = minutes * modalCoefficients.Wh_per_min;
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
    if (!estimate) return 'alba | Impact unknown';
    return `alba | est. ${estimate.Wh.toFixed(2)} Wh | ${estimate.gCO2.toFixed(2)} g CO2 | ${estimate.waterMl.toFixed(0)} mL`;
  }

  function formatComparison(Wh) {
    if (!Wh || Wh <= 0) return 'Comparable impact unavailable';
    const baseline = ALBA_CONFIG.baselineComparisons[0];
    const value = baseline && baseline.factorWh ? Wh / baseline.factorWh : 0;
    if (!value) return 'Comparable impact unavailable';
    return `${value.toFixed(1)} ${baseline.label}`;
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

  function applyTheme(element) {
    if (element && element.classList && !element.classList.contains('alba-theme')) {
      element.classList.add('alba-theme');
    }
  }

  // Placeholder for optional remote optimizer (disabled by default).
  async function fetchRemoteOptimization(prompt) {
    if (!state.settings.remoteOptimizer) {
      return null;
    }
    // Intentionally left blank: configure your endpoint + API key, then return optimized text.
    // Example skeleton:
    // const response = await fetch(state.settings.remoteEndpoint, { method: 'POST', body: JSON.stringify({ prompt }) });
    // const data = await response.json();
    // return data.optimizedPrompt;
    return null;
  }
})();
