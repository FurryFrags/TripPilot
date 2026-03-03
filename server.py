#!/usr/bin/env python3
from __future__ import annotations

import json
import ssl
from ipaddress import ip_address
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen

HOST = "0.0.0.0"
PORT = 8000
STATIC_DIR = Path(__file__).parent / "static"
ASSETS_DIR = Path(__file__).parent / "assets"
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

USER_AGENT = "TripPilot/1.0 (+https://example.local)"


def fetch_json(url: str, *, expect_json: bool = True) -> dict | list | str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    context = ssl.create_default_context()
    with urlopen(request, context=context, timeout=12) as response:  # noqa: S310
        text = response.read().decode("utf-8")
    if expect_json:
        return json.loads(text)
    return text


def collect_live_pois(country: str, limit: int = 8) -> list[dict]:
    search_url = (
        "https://en.wikipedia.org/w/api.php?action=query&list=search"
        f"&srsearch={quote(country + ' tourist attractions')}&format=json&utf8=1&srlimit=16"
    )
    payload = fetch_json(search_url)
    results = payload.get("query", {}).get("search", [])
    pois: list[dict] = []

    for item in results:
        title = item.get("title")
        if not title:
            continue
        summary_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(title)}"
        try:
            summary = fetch_json(summary_url)
        except Exception:
            continue

        coordinates = summary.get("coordinates") or {}
        lat = coordinates.get("lat")
        lng = coordinates.get("lon")
        if lat is None or lng is None:
            continue

        pois.append(
            {
                "name": summary.get("title", title),
                "city": country,
                "country": country,
                "description": summary.get("extract", "")[:320],
                "source": summary.get("content_urls", {}).get("desktop", {}).get("page", ""),
                "lat": lat,
                "lng": lng,
            }
        )
        if len(pois) >= limit:
            break

    return pois


def generate_tour_plan(country: str, pois: list[dict]) -> list[dict]:
    if not pois:
        return []

    places_payload = [
        {
            "name": poi["name"],
            "description": poi["description"],
        }
        for poi in pois
    ]
    prompt = (
        "Output JSON only. No markdown, no commentary, and no keys outside this schema: "
        "{\"days\":[{\"day\":1,\"theme\":\"...\",\"route\":\"Location A → Location B\","
        "\"locations\":[{\"name\":\"...\",\"summary\":\"...\",\"history\":\"...\","
        "\"precautions\":\"...\",\"bring\":\"...\",\"lookOutFor\":\"...\"}]}]}. "
        "Each field must be brief and practical. Build a day-by-day itinerary for "
        f"{country} using this POI list: {json.dumps(places_payload)}"
    )

    try:
        ai_text = fetch_json(f"https://text.pollinations.ai/{quote(prompt)}", expect_json=False)
        if isinstance(ai_text, dict):
            days = ai_text.get("days", [])
        else:
            days = json.loads(ai_text).get("days", [])
        if isinstance(days, list) and days:
            return days
    except Exception:
        pass

    days: list[dict] = []
    for index in range(0, len(pois), 2):
        chunk = pois[index : index + 2]
        location_names = [place["name"] for place in chunk]
        days.append(
            {
                "day": len(days) + 1,
                "theme": f"Discover {country}",
                "route": " → ".join(location_names),
                "locations": [
                    {
                        "name": place["name"],
                        "summary": place.get("description", "")[:120] or "Local highlight.",
                        "history": "Known local destination with cultural value.",
                        "precautions": "Check weather and keep personal belongings secure.",
                        "bring": "Water, comfortable shoes, and a charged phone.",
                        "lookOutFor": "Busy periods, local rules, and transport timing.",
                    }
                    for place in chunk
                ],
            }
        )
    return days


class TripPilotHandler(BaseHTTPRequestHandler):
    def _request_country_code(self) -> str | None:
        for header_name in ("CF-IPCountry", "X-Country-Code", "X-Geo-Country"):
            value = self.headers.get(header_name)
            if value:
                return value.strip().upper()
        return None

    def _is_request_allowed(self) -> bool:
        client_host = self.client_address[0]
        try:
            client_ip = ip_address(client_host)
            if client_ip.is_loopback or client_ip.is_private:
                return True
        except ValueError:
            if client_host in {"localhost"}:
                return True

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
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".svg": "image/svg+xml",
            ".ico": "image/x-icon",
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

        if parsed.path == "/api/ai-tour":
            query = parse_qs(parsed.query)
            country = query.get("country", [""])[0].strip()
            if not country:
                self._send_json({"error": "country is required"}, status=HTTPStatus.BAD_REQUEST)
                return

            try:
                pois = collect_live_pois(country)
                days = generate_tour_plan(country, pois)
                self._send_json(
                    {
                        "country": country,
                        "pois": pois,
                        "days": days,
                        "source": "Wikipedia live search + Pollinations AI (no API key)",
                    }
                )
            except Exception as exc:
                self._send_json(
                    {"error": f"Unable to build AI tour right now: {exc}"},
                    status=HTTPStatus.BAD_GATEWAY,
                )
            return

        if parsed.path == "/":
            self._serve_file(STATIC_DIR / "index.html")
            return

        if parsed.path.startswith("/assets/"):
            safe_relative = parsed.path.removeprefix("/assets/")
            self._serve_file(ASSETS_DIR / safe_relative)
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
