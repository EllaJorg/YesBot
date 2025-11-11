# Alba

Alba is a Chrome extension plus lightweight Node server that gives AI power-users a live view of the energy, carbon, and water cost of every prompt. It wraps the most common chat surfaces (ChatGPT, Claude, Gemini, Perplexity) with inline impact estimates, a prompt optimizer, and a daily footprint recap so people can ship work while staying within a climate budget.

## Highlights
- **Real-time footprint labels** – as you type, Alba estimates watt-hours, grams CO₂, and water milliliters based on model size, region, and modality hints.
- **Inline prompt optimizer** – local heuristics trim filler immediately; optional remote optimization (OpenAI API) proposes a compressed rewrite that shows % savings before you accept it.
- **Floating dashboard + popup** – a pill-sized widget and the browser action popup show “Today” vs “This chat,” compare against yesterday, export CSV, and reset daily totals.
- **Spotify-style “Wrapped”** – on-demand recap cards celebrate the energy, carbon, and water you avoided, driven by the `/wrapped` endpoint if the server is running.
- **Configurable methodology** – edit `energyConfig.js` to adjust model profiles, modalities, baselines, or default settings without touching the logic elsewhere.

## Repository layout
| Path | Purpose |
| --- | --- |
| `content.js` | Main content script that injects impact labels, optimizer UI, widget, and wrapped summary overlay. |
| `energyConfig.js` | Central coefficients, model profiles, regional factors, and default settings shared by popup + content script. |
| `popup.html`, `popup.js`, `styles.css` | In-browser popup shell for toggles, summaries, CSV export, and theming. |
| `server.js` | Express server that exposes `/optimize` (prompt compression) and `/wrapped` (daily recap storytelling). |
| `manifest.json` | Chrome extension manifest (MV3) targeting major AI chat domains. |

## Prerequisites
- Node 20+ (for the helper server)
- Chrome/Chromium-based browser for loading the extension in developer mode
- OpenAI API key (only required if you want remote prompt optimization or AI-generated recaps)

## Quick start
1. **Install dependencies**
   ```bash
   npm install
   ```
2. **Configure secrets**  
   Create a `.env` file next to `server.js`:
   ```
   OPENAI_API_KEY=sk-your-key
   PORT=3000 # optional override
   ```
3. **Run the helper server (optional but recommended)**  
   ```bash
   npm start
   ```  
   This enables `/optimize` and `/wrapped`. If the server is down, Alba still runs locally; it just skips remote suggestions and climate stories.
4. **Load the extension**
   - Navigate to `chrome://extensions`
   - Enable **Developer mode**
   - Click **Load unpacked** and select this `Alba/` directory

## Using Alba
- Open ChatGPT, Claude, Gemini, or Perplexity. Alba auto-detects which site you are on and attaches to any detected prompt input.
- Type as usual. The inline bar beneath the composer updates with estimates pulled from `energyConfig.js`. When the optimizer is enabled, suggestions appear after a short pause; accept to replace your draft and log projected savings.
- Click the floating Alba widget to toggle between “Today” and “This chat,” open the Wrapped recap, or reset/export from the popup.
- The popup (toolbar icon) mirrors the same totals, exposes settings (enable flag, optimizer toggle, model profile, region, theme), and lets you export a CSV of every logged interaction (`timestamp, site, modality, Wh, gCO₂, water mL`).

## Configuration tips
- **Model profiles & regions**: tweak the watt-hour per 1k tokens and grid factors inside `energyConfig.js` if you have better telemetry for your workloads.
- **Optimizer behavior**: toggle `remoteOptimizer` in the popup or default settings to decide whether to hit the Node server for OpenAI-backed rewrites.
- **New sites or selectors**: extend the `SITE_CONFIGS` array in `content.js` with new host patterns, prompt selectors, and assistant selectors.
- **Wrapped tone**: edit the prompt template in `server.js` (`WRAPPED_SYSTEM`) to change the storytelling voice or schema.

## Troubleshooting
- **No UI appears**: confirm the active tab matches one of the `matches` entries in `manifest.json` and that “Extension enabled” is checked in the popup.
- **Optimizer stuck / failing**: make sure the helper server is running on the same origin as `REMOTE_API_BASE` in `content.js` (`http://localhost:3000` by default) and that your `.env` contains a valid OpenAI key.
- **Totals never change**: Alba waits until a prompt crosses `minChars` (default 15) before logging. Increase activity or lower the threshold inside `energyConfig.js`.

## License
ISC – see `package.json` for details.
