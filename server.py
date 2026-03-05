#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import ssl
from ipaddress import ip_address
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse
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

TRANSPORT_KEYWORDS = {
    "Metro/Subway": ("metro", "subway", "underground", "tube"),
    "Rail/Train": ("rail", "train", "tram", "light rail"),
    "Bus": ("bus", "bus rapid transit", "brt", "coach"),
    "Ferry/Boat": ("ferry", "boat", "waterbus", "water taxi"),
    "Cable Car/Funicular": ("cable car", "funicular", "gondola lift"),
    "Walking": ("walk", "pedestrian", "on foot"),
    "Cycling": ("bike", "bicycle", "cycling"),
    "Taxi/Rideshare": ("taxi", "rideshare", "uber", "grab"),
}


def wikipedia_summary(title: str) -> dict:
    summary_url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{quote(title)}"
    data = fetch_json(summary_url)
    return data if isinstance(data, dict) else {}


def extract_image_url(summary: dict) -> str:
    thumbnail = summary.get("thumbnail") or {}
    if thumbnail.get("source"):
        return thumbnail["source"]

    original = summary.get("originalimage") or {}
    return original.get("source", "")


def fetch_location_images(country: str, locations: list[str]) -> dict:
    normalized_locations = [name.strip() for name in locations if name and name.strip()]
    unique_locations = list(dict.fromkeys(normalized_locations))[:20]

    country_image = ""
    try:
        country_summary = wikipedia_summary(country)
        country_image = extract_image_url(country_summary)
    except Exception:
        country_image = ""

    location_images: dict[str, str] = {}
    for location in unique_locations:
        try:
            summary = wikipedia_summary(location)
            location_images[location] = extract_image_url(summary)
        except Exception:
            location_images[location] = ""

    return {"country": country, "countryImage": country_image, "locationImages": location_images}


def fetch_json(url: str, *, expect_json: bool = True) -> dict | list | str:
    request = Request(url, headers={"User-Agent": USER_AGENT})
    context = ssl.create_default_context()
    with urlopen(request, context=context, timeout=12) as response:  # noqa: S310
        text = response.read().decode("utf-8")
    if expect_json:
        return json.loads(text)
    return text


def fetch_wikivoyage_extract(title: str) -> str:
    api_url = (
        "https://en.wikivoyage.org/w/api.php?action=query&prop=extracts"
        f"&explaintext=1&format=json&titles={quote(title)}"
    )
    payload = fetch_json(api_url)
    pages = payload.get("query", {}).get("pages", {})
    for page in pages.values():
        if isinstance(page, dict) and page.get("extract"):
            return page["extract"]
    return ""


def summarize_transport_method(location_name: str, country: str) -> str:
    titles_to_try = [
        f"Transport in {location_name}",
        f"Transportation in {location_name}",
        location_name,
        f"Transport in {country}",
    ]
    corpus_parts: list[str] = []

    for title in titles_to_try:
        try:
            summary = wikipedia_summary(title)
        except Exception:
            continue

        extract = summary.get("extract")
        if extract:
            corpus_parts.append(extract)

    try:
        wikivoyage_text = fetch_wikivoyage_extract(location_name)
        if wikivoyage_text:
            corpus_parts.append(wikivoyage_text[:2400])
    except Exception:
        pass

    corpus = " ".join(corpus_parts).lower()
    if not corpus:
        return "Local bus + walking"

    scores: dict[str, int] = {}
    for label, keywords in TRANSPORT_KEYWORDS.items():
        score = sum(corpus.count(keyword) for keyword in keywords)
        if score:
            scores[label] = score

    if not scores:
        return "Local bus + walking"

    ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    top_labels = [name for name, _ in ranked[:2]]
    return " + ".join(top_labels)


def build_transportation_lookup(pois: list[dict], country: str) -> dict[str, str]:
    methods: dict[str, str] = {}
    for poi in pois:
        name = poi.get("name")
        if not name or name in methods:
            continue
        methods[name] = summarize_transport_method(name, country)
    return methods


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_km * c


def line_midpoint(start: tuple[float, float], end: tuple[float, float]) -> tuple[float, float]:
    return ((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)


def curved_path(start: tuple[float, float], end: tuple[float, float], arc_strength: float = 0.18) -> list[list[float]]:
    sx, sy = start
    ex, ey = end
    mx, my = line_midpoint(start, end)
    dx = ex - sx
    dy = ey - sy
    length = math.hypot(dx, dy)
    if not length:
        return [[sx, sy], [ex, ey]]

    nx = -dy / length
    ny = dx / length
    control = (mx + nx * length * arc_strength, my + ny * length * arc_strength)

    points: list[list[float]] = []
    for step in range(0, 13):
        t = step / 12
        # Quadratic Bezier between start -> control -> end.
        x = (1 - t) ** 2 * sx + 2 * (1 - t) * t * control[0] + t**2 * ex
        y = (1 - t) ** 2 * sy + 2 * (1 - t) * t * control[1] + t**2 * ey
        points.append([x, y])
    return points


def build_map_features(country: str, pois: list[dict]) -> dict:
    metro_features: list[dict] = []
    road_features: list[dict] = []
    highway_features: list[dict] = []
    label_features: list[dict] = []

    if len(pois) < 2:
        return {
            "metroLines": {"type": "FeatureCollection", "features": metro_features},
            "roads": {"type": "FeatureCollection", "features": road_features},
            "highways": {"type": "FeatureCollection", "features": highway_features},
            "labels": {"type": "FeatureCollection", "features": label_features},
        }

    core_pois = pois[: min(5, len(pois))]
    for index in range(len(core_pois) - 1):
        start = core_pois[index]
        end = core_pois[index + 1]
        line_name = f"{country} Metro M{index + 1}"
        coordinates = curved_path((start["lng"], start["lat"]), (end["lng"], end["lat"]), 0.26)
        metro_features.append(
            {
                "type": "Feature",
                "properties": {
                    "label": line_name,
                    "from": start["name"],
                    "to": end["name"],
                    "network": "metro",
                },
                "geometry": {"type": "LineString", "coordinates": coordinates},
            }
        )

        mid = line_midpoint((start["lng"], start["lat"]), (end["lng"], end["lat"]))
        label_features.append(
            {
                "type": "Feature",
                "properties": {"label": line_name, "network": "metro"},
                "geometry": {"type": "Point", "coordinates": [mid[0], mid[1]]},
            }
        )

    for index in range(len(pois) - 1):
        start = pois[index]
        end = pois[index + 1]
        distance = haversine_km(start["lat"], start["lng"], end["lat"], end["lng"])

        feature_target = road_features if distance <= 120 else highway_features
        network = "road" if distance <= 120 else "highway"
        label = f"{network.title()} {index + 1}: {start['name']} → {end['name']}"
        feature_target.append(
            {
                "type": "Feature",
                "properties": {
                    "label": label,
                    "distanceKm": round(distance, 1),
                    "from": start["name"],
                    "to": end["name"],
                    "network": network,
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[start["lng"], start["lat"]], [end["lng"], end["lat"]],
                    ],
                },
            }
        )

        mid = line_midpoint((start["lng"], start["lat"]), (end["lng"], end["lat"]))
        label_features.append(
            {
                "type": "Feature",
                "properties": {
                    "label": f"{network.title()} {index + 1}",
                    "network": network,
                    "distanceKm": round(distance, 1),
                },
                "geometry": {"type": "Point", "coordinates": [mid[0], mid[1]]},
            }
        )

    return {
        "metroLines": {"type": "FeatureCollection", "features": metro_features},
        "roads": {"type": "FeatureCollection", "features": road_features},
        "highways": {"type": "FeatureCollection", "features": highway_features},
        "labels": {"type": "FeatureCollection", "features": label_features},
    }


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
        try:
            summary = wikipedia_summary(title)
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
                "image": extract_image_url(summary),
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


def geocode_location(name: str, country: str) -> dict | None:
    if not name:
        return None

    query = quote(f"{name}, {country}")
    geocode_url = f"https://nominatim.openstreetmap.org/search?q={query}&format=jsonv2&limit=1"

    try:
        results = fetch_json(geocode_url)
    except Exception:
        return None

    if not isinstance(results, list) or not results:
        return None

    result = results[0]
    try:
        lat = float(result.get("lat"))
        lng = float(result.get("lon"))
    except (TypeError, ValueError):
        return None

    return {
        "name": name,
        "image": "",
        "city": country,
        "country": country,
        "description": "Location added from itinerary route fallback geocoding.",
        "source": result.get("osm_url")
        or result.get("display_name")
        or "https://www.openstreetmap.org",
        "lat": lat,
        "lng": lng,
    }


def extract_location_names(days: list[dict]) -> list[str]:
    location_names: list[str] = []
    seen: set[str] = set()

    for day in days:
        for location in day.get("locations", []):
            name = (location.get("name") or "").strip()
            if name and name not in seen:
                seen.add(name)
                location_names.append(name)

    return location_names


def ensure_mappable_pois(country: str, pois: list[dict], days: list[dict]) -> list[dict]:
    valid_pois = [poi for poi in pois if poi.get("lat") is not None and poi.get("lng") is not None]
    if len(valid_pois) >= 2:
        return valid_pois

    fallback_pois: list[dict] = []
    for location_name in extract_location_names(days):
        geocoded = geocode_location(location_name, country)
        if geocoded:
            fallback_pois.append(geocoded)
        if len(fallback_pois) >= 8:
            break

    return fallback_pois or valid_pois


def generate_tour_plan(country: str, pois: list[dict]) -> list[dict]:
    if not pois:
        prompt = (
            "Output JSON only. No markdown, no commentary, and no keys outside this schema: "
            "{\"days\":[{\"day\":1,\"theme\":\"...\",\"route\":\"Location A -> Location B\","
            "\"locations\":[{\"name\":\"...\",\"summary\":\"...\",\"history\":\"...\","
            "\"precautions\":\"...\",\"bring\":\"...\",\"lookOutFor\":\"...\","
            "\"transportationMethod\":\"...\"}]}]}. "
            f"Build a practical itinerary for {country} with real, famous destinations and include 2-3 locations per day."
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
            return []

        return []

    places_payload = [
        {
            "name": poi["name"],
            "description": poi["description"],
        }
        for poi in pois
    ]
    transportation_lookup = build_transportation_lookup(pois, country)
    prompt = (
        "Output JSON only. No markdown, no commentary, and no keys outside this schema: "
        "{\"days\":[{\"day\":1,\"theme\":\"...\",\"route\":\"Location A -> Location B\","
        "\"locations\":[{\"name\":\"...\",\"summary\":\"...\",\"history\":\"...\","
        "\"precautions\":\"...\",\"bring\":\"...\",\"lookOutFor\":\"...\","
        "\"transportationMethod\":\"...\"}]}]}. "
        "Each field must be brief and practical. Build a day-by-day itinerary for "
        f"{country} using this POI list: {json.dumps(places_payload)}. "
        "Transportation method must align with evidence from Wikipedia and other public travel references."
    )

    try:
        ai_text = fetch_json(f"https://text.pollinations.ai/{quote(prompt)}", expect_json=False)
        if isinstance(ai_text, dict):
            days = ai_text.get("days", [])
        else:
            days = json.loads(ai_text).get("days", [])
        if isinstance(days, list) and days:
            for day in days:
                for location in day.get("locations", []):
                    name = location.get("name")
                    if name and not location.get("transportationMethod"):
                        location["transportationMethod"] = transportation_lookup.get(name, "Local bus + walking")
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
                "route": " -> ".join(location_names),
                "locations": [
                    {
                        "name": place["name"],
                        "summary": place.get("description", "")[:120] or "Local highlight.",
                        "history": "Known local destination with cultural value.",
                        "precautions": "Check weather and keep personal belongings secure.",
                        "bring": "Water, comfortable shoes, and a charged phone.",
                        "lookOutFor": "Busy periods, local rules, and transport timing.",
                        "transportationMethod": transportation_lookup.get(place["name"], "Local bus + walking"),
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

        if parsed.path == "/api/location-images":
            query = parse_qs(parsed.query)
            country = query.get("country", [""])[0].strip()
            if not country:
                self._send_json({"error": "country is required"}, status=HTTPStatus.BAD_REQUEST)
                return

            raw_locations = query.get("location", [])
            locations = [unquote(name).strip() for name in raw_locations if name.strip()]
            images = fetch_location_images(country, locations)
            self._send_json(images)
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
                mappable_pois = ensure_mappable_pois(country, pois, days)
                map_features = build_map_features(country, mappable_pois)
                self._send_json(
                    {
                        "country": country,
                        "pois": mappable_pois,
                        "days": days,
                        "mapFeatures": map_features,
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
