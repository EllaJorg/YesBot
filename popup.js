(() => {
  if (!globalThis.ALBA_CONFIG || !globalThis.ALBA_STORAGE_KEYS) {
    console.warn('alba popup: missing config');
    return;
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const settingsEls = {
    enabled: document.getElementById('alba-enabled'),
    optimizer: document.getElementById('alba-optimizer'),
    profile: document.getElementById('alba-profile'),
    region: document.getElementById('alba-region'),
    totals: document.getElementById('alba-today-totals'),
    comparison: document.getElementById('alba-comparison'),
    exportBtn: document.getElementById('alba-export'),
    resetBtn: document.getElementById('alba-reset')
  };

  initPopup();

  function initPopup() {
    populateSelect(settingsEls.profile, ALBA_CONFIG.modelProfiles, 'label');
    populateSelect(settingsEls.region, ALBA_CONFIG.regions);
    loadState();
    bindEvents();
  }

  function populateSelect(selectEl, data, labelKey) {
    Object.entries(data).forEach(([value, meta]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = meta[labelKey || 'label'] || value;
      selectEl.appendChild(option);
    });
  }

  function loadState() {
    chrome.storage.sync.get(
      [ALBA_STORAGE_KEYS.settings, ALBA_STORAGE_KEYS.totals, ALBA_STORAGE_KEYS.history],
      (data) => {
        const settings = { ...ALBA_CONFIG.defaultSettings, ...(data[ALBA_STORAGE_KEYS.settings] || {}) };
        settingsEls.enabled.checked = settings.enabled;
        settingsEls.optimizer.checked = settings.optimizerEnabled;
        settingsEls.profile.value = settings.modelProfile;
        settingsEls.region.value = settings.region;
        renderTotals(data[ALBA_STORAGE_KEYS.totals] || {});
      }
    );
  }

  function bindEvents() {
    settingsEls.enabled.addEventListener('change', saveSettings);
    settingsEls.optimizer.addEventListener('change', saveSettings);
    settingsEls.profile.addEventListener('change', saveSettings);
    settingsEls.region.addEventListener('change', saveSettings);
    settingsEls.exportBtn.addEventListener('click', exportHistoryFromPopup);
    settingsEls.resetBtn.addEventListener('click', resetTodayFromPopup);
  }

  function saveSettings() {
    const payload = {
      enabled: settingsEls.enabled.checked,
      optimizerEnabled: settingsEls.optimizer.checked,
      modelProfile: settingsEls.profile.value,
      region: settingsEls.region.value,
      remoteOptimizer: true  // Enable remote optimizer for API calls
    };
    chrome.storage.sync.set({ [ALBA_STORAGE_KEYS.settings]: payload });
  }

  function renderTotals(totalsMap) {
    const totals = totalsMap[todayKey] || { Wh: 0, gCO2: 0, waterMl: 0 };
    const tooltipCopy = formatTotalsTooltip(totals);
    settingsEls.totals.innerHTML = `
      <span class="alba-tooltip-host">
        ${totals.Wh.toFixed(2)} Wh | ${totals.gCO2.toFixed(2)} g CO2 | ${totals.waterMl.toFixed(0)} mL
        <span class="alba-tooltip">${tooltipCopy}</span>
      </span>`;
    settingsEls.comparison.textContent = formatComparison(totals.Wh);
  }

  function formatComparison(Wh) {
    if (!Wh || Wh <= 0) return 'No impact recorded yet today.';
    const baseline = ALBA_CONFIG.baselineComparisons && ALBA_CONFIG.baselineComparisons[0];
    if (!baseline || !baseline.factorWh) return 'Comparable impact unavailable.';
    const value = Wh / baseline.factorWh;
    return `${value.toFixed(1)} ${baseline.label}`;
  }

  function formatTotalsTooltip(totals) {
    const pieces = [];
    const kWh = totals.Wh / 1000;
    pieces.push(`Energy: ${totals.Wh.toFixed(3)} Wh (~${kWh.toFixed(6)} kWh).`);
    const baseline = ALBA_CONFIG.baselineComparisons && ALBA_CONFIG.baselineComparisons[0];
    if (baseline && baseline.factorWh) {
      const eq = totals.Wh / baseline.factorWh;
      if (eq >= 0.01) {
        pieces.push(`≈ ${eq.toFixed(1)} ${baseline.label}.`);
      }
    }
    pieces.push(`Emissions: ${totals.gCO2.toFixed(3)} g CO2.`);
    pieces.push(`Water: ${totals.waterMl.toFixed(1)} mL.`);
    pieces.push('Estimates run locally using alba assumptions.');
    return pieces.join(' ');
  }

  function exportHistoryFromPopup() {
    chrome.storage.sync.get(ALBA_STORAGE_KEYS.history, (data) => {
      const entries = data[ALBA_STORAGE_KEYS.history] || [];
      if (!entries.length) return;
      const csv = buildCsv(entries);
      triggerDownload(csv, `alba-footprint-${todayKey}.csv`);
    });
  }

  function resetTodayFromPopup() {
    chrome.storage.sync.get(
      [ALBA_STORAGE_KEYS.totals, ALBA_STORAGE_KEYS.history],
      (data) => {
        const totals = data[ALBA_STORAGE_KEYS.totals] || {};
        totals[todayKey] = { Wh: 0, gCO2: 0, waterMl: 0 };
        const filteredHistory = (data[ALBA_STORAGE_KEYS.history] || []).filter(
          (entry) => new Date(entry.timestamp).toISOString().slice(0, 10) !== todayKey
        );
        chrome.storage.sync.set(
          {
            [ALBA_STORAGE_KEYS.totals]: totals,
            [ALBA_STORAGE_KEYS.history]: filteredHistory
          },
          loadState
        );
      }
    );
  }

  function buildCsv(entries) {
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
    return header + rows;
  }

  function triggerDownload(content, filename) {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }
})();
