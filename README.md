# TripPilot

TripPilot is a tourism-focused planner that generates country tours from live web data.
It can pull attractions from public internet sources and use a free no-key AI model to produce a day-by-day itinerary with map pins.

## Features

- Country-based tour generation without API keys.
- Live POI discovery from public web endpoints.
- AI-generated day-by-day itinerary suggestions.
- Leaflet map pins for discovered places.

## Run on GitHub Pages

This project is fully static and can run directly on GitHub Pages.

1. Push the repository to GitHub.
2. In repository settings, enable **Pages** and set source to the branch/folder containing `static/` files (or publish from root if you serve `static/index.html` as your entry).
3. Open your Pages URL — no backend server or install commands are required.

## Run locally (optional)

You can open `index.html` from the repository root (it redirects automatically), open `static/index.html` directly, or serve files with any static file server.

## PollinationsClient – Free AI for Tour Recommendations

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
