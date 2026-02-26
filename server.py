#!/usr/bin/env python3
from __future__ import annotations

import json
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HOST = "0.0.0.0"
PORT = 8000
STATIC_DIR = Path(__file__).parent / "static"
ALLOWED_COUNTRY_CODES = {"JP", "KR", "AU", "SG", "VN"}

CATEGORIES = [
    {"id": "all", "name": "All Services", "icon": "🌍"},
    {"id": "transport", "name": "Transport", "icon": "🚌"},
    {"id": "hotels", "name": "Hotels & Resorts", "icon": "🏨"},
    {"id": "food", "name": "Food & Dining", "icon": "🍜"},
    {"id": "tours", "name": "Guided Tours", "icon": "🧭"},
    {"id": "activities", "name": "Activities", "icon": "🎢"},
]

SERVICES = [
    {
        "id": 1,
        "category": "transport",
        "name": "Tokyo Metro Tourist Pass",
        "city": "Tokyo",
        "country": "Japan",
        "rating": 4.8,
        "price": "$8/day",
        "description": "Unlimited subway rides for top attractions across Tokyo districts.",
        "lat": 35.6762,
        "lng": 139.6503,
    },
    {
        "id": 2,
        "category": "hotels",
        "name": "Santorini Cliff Resort",
        "city": "Santorini",
        "country": "Greece",
        "rating": 4.9,
        "price": "$220/night",
        "description": "Caldera-view suites with breakfast and airport transfer included.",
        "lat": 36.3932,
        "lng": 25.4615,
    },
    {
        "id": 3,
        "category": "tours",
        "name": "Marrakech Medina Walking Tour",
        "city": "Marrakech",
        "country": "Morocco",
        "rating": 4.7,
        "price": "$32/person",
        "description": "Local guide tour through souks, palaces, and hidden riad courtyards.",
        "lat": 31.6295,
        "lng": -7.9811,
    },
    {
        "id": 4,
        "category": "activities",
        "name": "Queenstown Bungy Combo",
        "city": "Queenstown",
        "country": "New Zealand",
        "rating": 4.9,
        "price": "$145/person",
        "description": "Three-jump adventure package with photo and video add-ons.",
        "lat": -45.0312,
        "lng": 168.6626,
    },
    {
        "id": 5,
        "category": "food",
        "name": "Mexico City Taco Trail",
        "city": "Mexico City",
        "country": "Mexico",
        "rating": 4.6,
        "price": "$40/person",
        "description": "Evening street food crawl with expert local chef recommendations.",
        "lat": 19.4326,
        "lng": -99.1332,
    },
    {
        "id": 6,
        "category": "transport",
        "name": "Paris Museum + River Shuttle",
        "city": "Paris",
        "country": "France",
        "rating": 4.5,
        "price": "$29/day",
        "description": "Hop-on hop-off river shuttle bundled with museum district transit.",
        "lat": 48.8566,
        "lng": 2.3522,
    },
]


class TripPilotHandler(BaseHTTPRequestHandler):
    def _request_country_code(self) -> str | None:
        for header_name in ("CF-IPCountry", "X-Country-Code", "X-Geo-Country"):
            value = self.headers.get(header_name)
            if value:
                return value.strip().upper()
        return None

    def _is_request_allowed(self) -> bool:
        country_code = self._request_country_code()
        if not country_code:
            return False

        return country_code in ALLOWED_COUNTRY_CODES

    def _send_region_blocked(self) -> None:
        message = (
            "<html><body><h1>403 Forbidden</h1>"
            "<p>TripPilot is currently available only in Japan, South Korea, Australia, Singapore, and Vietnam.</p>"
            "</body></html>"
        ).encode("utf-8")

        self.send_response(HTTPStatus.FORBIDDEN)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(message)))
        self.end_headers()
        self.wfile.write(message)

    def _send_json(self, payload: dict | list, status: HTTPStatus = HTTPStatus.OK) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _serve_file(self, path: Path) -> None:
        if not path.exists() or not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return

        content = path.read_bytes()
        suffix = path.suffix
        content_type = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
        }.get(suffix, "application/octet-stream")

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_GET(self) -> None:  # noqa: N802
        if not self._is_request_allowed():
            self._send_region_blocked()
            return

        parsed = urlparse(self.path)

        if parsed.path == "/api/categories":
            self._send_json(CATEGORIES)
            return

        if parsed.path == "/api/services":
            query = parse_qs(parsed.query)
            selected_category = query.get("category", ["all"])[0]
            search = query.get("q", [""])[0].strip().lower()

            filtered = [
                service
                for service in SERVICES
                if (selected_category == "all" or service["category"] == selected_category)
                and (
                    not search
                    or search in service["name"].lower()
                    or search in service["city"].lower()
                    or search in service["country"].lower()
                    or search in service["description"].lower()
                )
            ]
            self._send_json(filtered)
            return

        if parsed.path == "/":
            self._serve_file(STATIC_DIR / "index.html")
            return

        safe_relative = parsed.path.lstrip("/")
        self._serve_file(STATIC_DIR / safe_relative)


def run() -> None:
    server = ThreadingHTTPServer((HOST, PORT), TripPilotHandler)
    print(f"TripPilot running at http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    run()
