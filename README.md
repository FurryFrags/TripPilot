# TripPilot

TripPilot is a tourism-focused planner that generates country tours from live web data.
It can pull attractions from public internet sources and generate day-by-day itineraries with map pins using OpenRouter (fast model) when `OPENROUTER_API_KEY` is available.

## Features

- Country-based tour generation using OpenRouter (`OPENROUTER_API_KEY`) with automatic no-key fallback.
- Live POI discovery from public web endpoints.
- AI-generated day-by-day itinerary suggestions.
- MapLibre GL JS map pins for discovered places.

## Run on GitHub Pages

This project is fully static and can run directly on GitHub Pages.

1. Push the repository to GitHub.
2. In repository settings, enable **Pages** and set source to the branch/folder containing `static/` files (or publish from root if you serve `static/index.html` as your entry).
3. Open your Pages URL — no backend server or install commands are required.

## Run locally (optional)

You can open `index.html` from the repository root (it redirects automatically), open `static/index.html` directly, or serve files with any static file server.

## Release checklist

- Open deployed `app.js` in browser DevTools **Sources** and verify `createMap` instantiates `maplibregl.Map` (and does not use `L.map`).
- Confirm static asset cache-busting query params are present in `static/index.html` (for example `app.js?v=<commit-sha>` and `styles.css?v=<commit-sha>`).
- Purge CDN cache (if your hosting stack uses one), then hard-refresh the page (`Ctrl/Cmd+Shift+R`).
- Compare production `app.js` checksum with repository `static/app.js` checksum before sign-off.
- Verify the shipped JS bundle text contains `maplibregl.Map` and does not contain `L.map`.

## AI provider setup

TripPilot uses OpenRouter by default in `server.py` when the secret `OPENROUTER_API_KEY` is set.

- Model: `openai/gpt-4.1-nano` (very fast).
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`.
- Fallback: Pollinations text endpoint if `OPENROUTER_API_KEY` is missing.

### Configure GitHub secret

1. Go to your repository **Settings → Secrets and variables → Actions**.
2. Create (or update) a repository secret named exactly `OPENROUTER_API_KEY`.
3. Ensure your runtime exposes this secret as an environment variable.

## PollinationsClient – Free AI fallback client

### Why this client

- Pollinations offers zero-cost, no-key endpoints that fit TripPilot's workflow for both itinerary/description text generation and visual destination imagery.

### Throttling

- Anonymous usage is rate-limited (roughly 1 request every 15 seconds), so the global queue defaults to 16 seconds to reduce collisions, retries, and intermittent failures.

### Tour AI workflow

1. Generate structured itinerary and tour description text.
2. Generate matching landmark/destination images from the produced context.

### Future upgrade

- For better limits and stability, pass an `apiKey` and point requests to the unified endpoint: `https://gen.pollinations.ai`.

### Minimal usage snippet

```js
import { PollinationsClient } from "./static/js/pollinations.js";

const client = new PollinationsClient({
  // Optional upgrade path:
  // apiKey: process.env.POLLINATIONS_API_KEY,
  // baseURL: "https://gen.pollinations.ai",
});

const itinerary = await client.chatCompletions({
  model: "openai",
  messages: [
    { role: "system", content: "You are a tour planner." },
    { role: "user", content: "Create a 3-day itinerary for Rome." },
  ],
});

const imageUrl = await client.imageURL({
  prompt: "Sunset view of the Colosseum, cinematic travel photo",
  width: 1024,
  height: 768,
});

const textModels = await client.listTextModels();
const imageModels = await client.listImageModels();

console.log({ itinerary, imageUrl, textModels, imageModels });
```
