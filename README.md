# Alba

Alba is a privacy-first Chrome extension that gives AI users a live view of the energy, carbon, and water cost of every prompt. It wraps popular AI chat surfaces (ChatGPT, Claude, Gemini, Perplexity) with inline impact estimates, a prompt optimizer, and a daily footprint recap.

## Highlights
- **Real-time footprint labels** – as you type, Alba estimates watt-hours, grams CO₂, and water milliliters based on model size, region, and modality.
- **Inline prompt optimizer** – local heuristics trim filler immediately; optional AI optimization (via GitHub Models) proposes a compressed rewrite showing % savings before you accept.
- **Floating dashboard + popup** – a widget and browser popup show "Today" vs "This chat," compare against yesterday, export CSV, and reset totals.
- **Spotify-style "Wrapped"** – on-demand recap cards celebrate the energy, carbon, and water you avoided.
- **Configurable methodology** – edit `energyConfig.js` to adjust model profiles, modalities, baselines, or default settings.
- **No backend required** – the extension calls GitHub Models API directly (token injected at build time).

## Repository Layout
| Path | Purpose |
| --- | --- |
| `content.js` | Main content script that injects impact labels, optimizer UI, widget, and wrapped summary. |
| `aiClient.js` | Direct GitHub Models API client for optimization and wrapped features. |
| `energyConfig.js` | Central coefficients, model profiles, regional factors, and default settings. |
| `popup.html`, `popup.js`, `styles.css` | Browser popup for toggles, summaries, CSV export, and theming. |
| `manifest.json` | Chrome extension manifest (MV3) targeting major AI chat domains. |
| `scripts/build.cjs` | Build script that injects GitHub PAT and creates distribution ZIP. |
| `.github/workflows/` | GitHub Actions workflow for automated builds. |

## Quick Start

### Option 1: Download from GitHub Actions (Recommended)
1. Go to the [Actions tab](https://github.com/lindsaygross/Alba/actions)
2. Click on the latest successful workflow run
3. Download the `alba-extension` artifact
4. Unzip and load in Chrome (see below)

### Option 2: Build Locally
```bash
# Clone the repo
git clone https://github.com/lindsaygross/Alba.git
cd Alba

# Build (without AI features)
npm run build

# Or build with AI features enabled
GITHUB_TOKEN=your_github_pat npm run build
```

### Load the Extension
1. Navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

## Using Alba
- Open ChatGPT, Claude, Gemini, or Perplexity
- Type as usual – the inline bar updates with energy/carbon/water estimates
- When the optimizer is enabled, suggestions appear after a short pause
- Click the floating Alba widget to toggle views, open Wrapped recap, or reset/export
- Use the popup (toolbar icon) for settings: enable/disable, model profile, region, theme

## Configuration

### Model Profiles & Regions
Edit `energyConfig.js` to adjust:
- Watt-hours per 1k tokens by model size (small, balanced, large)
- Regional grid CO₂ factors (global, US, EU, APAC)
- Water intensity factors

### Optimizer Behavior
Toggle `remoteOptimizer` in the popup settings to enable/disable AI-powered optimization.

### Adding New Sites
Extend the `SITE_CONFIGS` array in `content.js` with new host patterns and selectors.

## Development

### GitHub Actions Build
The workflow automatically builds the extension on push to `main`:
1. Checks out code
2. Installs dependencies
3. Injects GitHub PAT from `BUILD_CACHE` environment secret
4. Creates `dist/` folder and ZIP artifact

### Setting Up Secrets
1. Create a GitHub PAT with Models access
2. Go to repo Settings → Environments → Production
3. Add secret: `BUILD_CACHE` = your PAT

## Troubleshooting
- **No UI appears**: Confirm the tab matches `manifest.json` domains and extension is enabled in popup.
- **Optimizer not working**: Check that AI features were enabled at build time (PAT injected).
- **"AI client not configured"**: The build didn't have a GitHub PAT – AI features use local fallback.

## License
ISC – see `package.json` for details.

## References

### Grid CO₂ Emissions & Regional Data
- [Ember Global Electricity Review 2025](https://ember-energy.org/latest-insights/global-electricity-review-2025/)
- [Our World in Data - Carbon Intensity of Electricity](https://ourworldindata.org/grapher/carbon-intensity-electricity)
- [IEA Emissions Factors 2024](https://www.iea.org/data-and-statistics/data-product/emissions-factors-2024)
- [Electricity Maps](https://app.electricitymaps.com/)

### Water Consumption in Electricity Generation
- [NREL - Consumptive Water Use for U.S. Power Production](https://docs.nrel.gov/docs/fy04osti/33905.pdf)
- [U.S. EIA - Water Use in U.S. Electricity Generation](https://www.eia.gov/todayinenergy/detail.php?id=56820)
- [Thunder Said Energy - Water Intensity of Power Generation](https://thundersaidenergy.com/downloads/water-intensity-of-power-generation/)

### AI Model Energy Consumption
- [arxiv.org - How Hungry is AI? (2025)](https://arxiv.org/html/2505.09598v1)
- [arxiv.org - Benchmarking Energy Costs of LLM Inference](https://arxiv.org/pdf/2310.03003)
- [Epoch AI - How Much Energy Does ChatGPT Use?](https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use)
