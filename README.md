# YesBot

YesBot is a Chrome extension that gives AI users a live rating of the occurance of sycophancy in their chats.

## Repository Layout
| Path | Purpose |
| --- | --- |
| `content.js` | Main content script that injects impact labels, widget, and wrapped summary. |
| `aiClient.js` | Direct GitHub Models API client for optimization and wrapped features. |
| `energyConfig.js` | Central coefficients, model profiles, regional factors, and default settings. |
| `popup.html`, `popup.js`, `styles.css` | Browser popup for toggles, summaries, CSV export, and theming. |
| `manifest.json` | Chrome extension manifest (MV3) targeting major AI chat domains. |
| `scripts/build.cjs` | Build script that injects GitHub PAT and creates distribution ZIP. |
| `.github/workflows/` | GitHub Actions workflow for automated builds. |

## Using YesBot
- Open ChatGPT, Claude, Gemini, or Perplexity
- Type as usual – the widget below will show low, medium, or high sycophancy
- Click the widget to see a more in-depth analysis of the sycophancy and why it was rated that way
