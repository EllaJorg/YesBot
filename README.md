# YesBot

YesBot is a Chrome extension that gives AI users a live rating of the occurance of sycophancy in their chats.

Download to your chrome extensions here: 


Demo video: https://youtu.be/JcKfJTfR9LI?si=hg45tdKO5fcamjoS.

## Citation

If you use YesBot in your research or work, please cite it using the following DOI:

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.18675123.svg)](https://doi.org/10.5281/zenodo.18675123)

You can cite all versions by using the DOI [10.5281/zenodo.18675123](https://doi.org/10.5281/zenodo.18675123). This DOI represents all versions and will always resolve to the latest one.

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

# Build (without AI features)
npm run build

# Or build with AI features enabled
GITHUB_TOKEN=your_github_pat npm run build
```

### Load the Extension
1. Navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist/` folder

## Using YesBot
- Open ChatGPT, Claude, Gemini, or Perplexity
- Type as usual – the widget below will show low, medium, or high sycophancy
- Click the widget to see a more in-depth analysis of the sycophancy and why it was rated that way

## License
ISC – see `package.json` for details.