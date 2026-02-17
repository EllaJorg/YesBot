# Alba

Alba is a privacy-first Chrome extension that gives AI users a live view of the energy, carbon, and water cost of every prompt. It wraps popular AI chat surfaces (ChatGPT, Claude, Gemini, Perplexity) with inline impact estimates, a prompt optimizer, and a daily footprint recap. Here is a demo video: https://youtu.be/JcKfJTfR9LI?si=hg45tdKO5fcamjoS.

## Citation

If you use ALBA in your research or work, please cite it using the following DOI:

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.18675123.svg)](https://doi.org/10.5281/zenodo.18675123)

You can cite all versions by using the DOI [10.5281/zenodo.18675123](https://doi.org/10.5281/zenodo.18675123). This DOI represents all versions and will always resolve to the latest one.
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
The following are sources where we obtained our statistics for the energy emission calculations.

### Grid CO₂ Emissions & Regional Data
- [Ember Global Electricity Review 2025](https://ember-energy.org/latest-insights/global-electricity-review-2025/) – 2024 grid carbon intensity by region
- [Our World in Data - Carbon Intensity of Electricity](https://ourworldindata.org/grapher/carbon-intensity-electricity) – historical and current CO₂ emissions factors
- [IEA Emissions Factors 2024](https://www.iea.org/data-and-statistics/data-product/emissions-factors-2024) – official international energy agency data
- [Electricity Maps](https://app.electricitymaps.com/) – live 24/7 CO₂ emissions by region

### Water Consumption in Electricity Generation

**United States**
- [NREL - Consumptive Water Use for U.S. Power Production](https://docs.nrel.gov/docs/fy04osti/33905.pdf) – consumptive and withdrawal water data by fuel type and technology
- [U.S. EIA - Water Use in U.S. Electricity Generation](https://www.eia.gov/todayinenergy/detail.php?id=56820) – recent trends and water efficiency gains (2.0 L/kWh average withdrawal intensity)
- [USGS - Thermoelectric Power Water Use](https://www.usgs.gov/mission-areas/water-resources/science/thermoelectric-power-water-use) – regional thermoelectric water consumption by fuel type

**Europe (EU)**
- [Thunder Said Energy - Water Intensity of Power Generation](https://thundersaidenergy.com/downloads/water-intensity-of-power-generation/) – water intensity by fuel type (nuclear, coal, natural gas)
- [European Electricity Review 2024](https://ember-energy.org/latest-insights/european-electricity-review-2024/eu-electricity-trends/) – EU electricity generation mix and renewable penetration

**Asia-Pacific (APAC)**
- [IEA - Global Water Consumption in the Energy Sector](https://www.iea.org/data-and-statistics/charts/global-water-consumption-in-the-energy-sector-by-fuel-and-power-generation-type-in-the-stated-policies-scenario-2021-and-2030) – regional water consumption by fuel type
- [World Water Footprint Network - Consumptive Water Footprint of Electricity](https://waterfootprint.org/resources/Mekonnen-et-al-2015.pdf) – global and regional water footprint analysis by country

**General**
- [IEEE Spectrum - How Much Water Does It Take to Make Electricity?](https://spectrum.ieee.org/how-much-water-does-it-take-to-make-electricity) – comparative water usage across generation technologies

### AI Model Energy Consumption
- [arxiv.org - How Hungry is AI? Benchmarking Energy, Water, and Carbon Footprint of LLM Inference (2025)](https://arxiv.org/html/2505.09598v1) – recent LLM energy and water consumption benchmarks
- [arxiv.org - Benchmarking the Energy Costs of Large Language Model Inference](https://arxiv.org/pdf/2310.03003) – detailed energy cost analysis across model sizes
- [Epoch AI - How Much Energy Does ChatGPT Use?](https://epoch.ai/gradient-updates/how-much-energy-does-chatgpt-use) – energy consumption estimates for popular models
