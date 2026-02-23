# TripPilot

TripPilot is a tourism-focused discovery service inspired by Klook/Google Maps patterns.
It provides a sidebar of recommended categories (transport, hotels/resorts, food, tours, activities)
and API-backed service listings across global destinations.

## Features

- Sidebar category navigation with instant filtering.
- Search across service name, city, country, and description.
- API endpoints for categories and service recommendations.
- "World Explorer" panel showing location coordinates for selected services.

## Run locally

```bash
python3 server.py
```

Then open `http://localhost:8000`.

## API endpoints

- `GET /api/categories`
- `GET /api/services?category=<id>&q=<search>`
