(() => {
  // Centralized energy + emission coefficients for alba. Adjust values here to tune methodology.
  const ALBA_CONFIG = {
    version: '2024-06-01',
    minChars: 15,  // Minimum characters before showing suggestions
    debounceMs: 300,
    responseDelayMs: 500,
    baselineComparisons: [
      { type: 'led', label: 'Equivalent to leaving an LED bulb on', factorWh: 0.008 },
      { type: 'car', label: 'mini EV meters', factorWh: 0.15 }
    ],
    modalKeywords: {
      image: ['generate an image', 'draw', 'photo of', 'illustration', 'picture of'],
      audio: ['audio', 'transcribe', 'podcast'],
      pdf: ['pdf', 'document', 'report']
    },
    heuristics: {
      defaultImageCount: 1,
      maxImageCount: 8,
      defaultPdfPages: 4,
      maxPdfPages: 60,
      pdfTokensPerPage: 350,
      defaultAudioMinutes: 1,
      maxAudioMinutes: 20
    },
    modelProfiles: {
      small: {
        label: 'Small',
        description: 'mobile-class models',
        modalities: {
          text: { Wh_per_1k_tokens: 0.35 },
          pdf: { Wh_per_1k_tokens: 0.35 },
          image: { Wh_per_image: 2.0 },
          audio: { Wh_per_min: 0.5 }
        }
      },
      balanced: {
        label: 'Balanced',
        description: 'default for ChatGPT-class models',
        modalities: {
          text: { Wh_per_1k_tokens: 0.5 },
          pdf: { Wh_per_1k_tokens: 0.5 },
          image: { Wh_per_image: 4.0 },
          audio: { Wh_per_min: 0.8 }
        }
      },
      large: {
        label: 'Large',
        description: 'multi-billion parameter models',
        modalities: {
          text: { Wh_per_1k_tokens: 0.8 },
          pdf: { Wh_per_1k_tokens: 0.8 },
          image: { Wh_per_image: 6.5 },
          audio: { Wh_per_min: 1.2 }
        }
      }
    },
    regions: {
      global: { grid_CO2_g_per_kWh: 400, water_L_per_kWh: 1.0 },
      us: { grid_CO2_g_per_kWh: 370, water_L_per_kWh: 0.8 },
      eu: { grid_CO2_g_per_kWh: 275, water_L_per_kWh: 0.6 },
      apac: { grid_CO2_g_per_kWh: 520, water_L_per_kWh: 1.2 }
    },
    defaultSettings: {
      enabled: true,
      optimizerEnabled: true,
      modelProfile: 'balanced',
      region: 'global',
      remoteOptimizer: true  // Enable remote optimizer by default (requires server running)
    }
  };

  const ALBA_STORAGE_KEYS = {
    totals: 'albaDailyTotals',
    history: 'albaHistory',
    settings: 'albaSettings'
  };

  if (typeof globalThis !== 'undefined') {
    globalThis.ALBA_CONFIG = ALBA_CONFIG;
    globalThis.ALBA_STORAGE_KEYS = ALBA_STORAGE_KEYS;
  }
})();
