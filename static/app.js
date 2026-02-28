const countryInput = document.getElementById('countryInput');
const generateTourBtn = document.getElementById('generateTourBtn');
const itinerary = document.getElementById('itinerary');
const mapInfo = document.getElementById('mapInfo');
const statusText = document.getElementById('statusText');
const mapStyleSelect = document.getElementById('mapStyleSelect');

const TILE_APIS = {
  terrain: [
    'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
    'https://b.tile.opentopomap.org/{z}/{x}/{y}.png',
    'https://c.tile.opentopomap.org/{z}/{x}/{y}.png',
  ],
  simple: [
    'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
    'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
    'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
  ],
  detailed: [
    'https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    'https://b.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
  ],
};
const MAP_TILE_ATTRIBUTION = '© OpenStreetMap contributors, OpenTopoMap';

let map;
let markers = [];
let mapInitialized = false;
let mapReady = false;
let queuedStyleMode = null;
let styleUpdateRequestId = 0;
let mapLoopTimer = null;
let mapContextRequestInFlight = false;

function showMapUnavailableMessage() {
  statusText.textContent = 'Map assets failed to load. You can still generate an itinerary without the map.';
  mapInfo.textContent = 'Map unavailable: map assets failed to load. Place details will appear here when map support is restored.';
}

function getStyleDefinition(styleMode) {
  const tiles = TILE_APIS[styleMode] || TILE_APIS.terrain;

  return {
    version: 8,
    name: `TripPilot ${styleMode}`,
    sources: {
      basemap: {
        type: 'raster',
        tiles,
        tileSize: 256,
        minzoom: 0,
        maxzoom: 19,
        attribution: MAP_TILE_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: 'basemap-raster',
        type: 'raster',
        source: 'basemap',
      },
    ],
  };
}

function ensureMapContextLayers() {
  if (!map.getSource('map-context')) {
    map.addSource('map-context', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }

  if (!map.getLayer('map-context-circles')) {
    map.addLayer({
      id: 'map-context-circles',
      type: 'circle',
      source: 'map-context',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 3, 10, 7, 15, 10],
        'circle-color': '#2f72ff',
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-opacity': 0.85,
      },
    });
  }
}

function updateMapContextFeatures(pois) {
  if (!mapInitialized || !map || !mapReady) return;

  ensureMapContextLayers();
  const source = map.getSource('map-context');
  if (!source) return;

  source.setData({
    type: 'FeatureCollection',
    features: pois.map((poi) => ({
      type: 'Feature',
      properties: {
        name: poi.name,
        description: poi.description,
        source: poi.source,
      },
      geometry: {
        type: 'Point',
        coordinates: [poi.lng, poi.lat],
      },
    })),
  });
}

async function runMapDataLoop() {
  if (!mapInitialized || !map || !mapReady || mapContextRequestInFlight) {
    return;
  }

  const bounds = map.getBounds();
  if (!bounds) return;

  mapContextRequestInFlight = true;

  const bbox = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
    .map((value) => value.toFixed(5))
    .join(',');

  const zoom = map.getZoom().toFixed(2);

  try {
    const response = await fetch(`/api/map-context?bbox=${bbox}&zoom=${zoom}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    updateMapContextFeatures(payload.pois || []);
  } catch (error) {
    console.error('Map context loop failed', error);
  } finally {
    mapContextRequestInFlight = false;
  }
}

function startMapLoop() {
  if (mapLoopTimer) {
    clearInterval(mapLoopTimer);
  }

  mapLoopTimer = setInterval(runMapDataLoop, 3000);
  runMapDataLoop();
}

async function createMap() {
  if (!window.maplibregl) {
    showMapUnavailableMessage();
    return false;
  }

  const style = getStyleDefinition(mapStyleSelect?.value || 'terrain');
  map = new maplibregl.Map({
    container: 'worldMap',
    style,
    center: [0, 20],
    zoom: 2,
    minZoom: 2,
    maxZoom: 19,
    renderWorldCopies: true,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  mapReady = false;

  map.on('load', () => {
    mapReady = true;
    mapStyleSelect.disabled = false;
    ensureMapContextLayers();
    startMapLoop();

    if (queuedStyleMode) {
      const styleMode = queuedStyleMode;
      queuedStyleMode = null;
      setMapStyle(styleMode);
    }
  });

  map.on('click', 'map-context-circles', (event) => {
    const clicked = event.features?.[0]?.properties;
    if (!clicked) return;

    updateMapInfo({
      name: clicked.name,
      country: 'Map context feed',
      description: clicked.description,
      source: clicked.source,
    });
  });

  map.on('error', (errorEvent) => {
    console.error('Map runtime error', errorEvent?.error || errorEvent);
  });

  mapInitialized = true;
  return true;
}

async function setMapStyle(styleMode) {
  if (!mapInitialized || !map) {
    return;
  }

  if (!mapReady) {
    queuedStyleMode = styleMode;
    return;
  }

  const requestId = ++styleUpdateRequestId;

  try {
    const style = getStyleDefinition(styleMode);

    if (requestId !== styleUpdateRequestId) {
      return;
    }

    map.setStyle(style);
    mapReady = false;
    mapStyleSelect.disabled = true;
    map.once('idle', () => {
      mapReady = true;
      mapStyleSelect.disabled = false;
      ensureMapContextLayers();
      runMapDataLoop();
    });

    statusText.textContent = `Map style updated to ${styleMode}.`;
  } catch (error) {
    console.error('Failed to set style', error);
    mapReady = true;
    mapStyleSelect.disabled = false;
    statusText.textContent = 'Could not switch map style right now.';
  }
}

function updateMapInfo(poi) {
  if (!poi) {
    mapInfo.textContent = 'No place selected.';
    return;
  }

  mapInfo.innerHTML = `<strong>${poi.name}</strong><br/>📍 ${poi.country}<br/>${poi.description}<br/><a href="${poi.source}" target="_blank" rel="noreferrer">Source</a>`;
}

function renderMapPois(pois) {
  if (!mapInitialized || !map || !window.maplibregl) {
    return;
  }

  markers.forEach((marker) => marker.remove());
  markers = [];
  const bounds = new maplibregl.LngLatBounds();

  pois.forEach((poi) => {
    const markerEl = document.createElement('button');
    markerEl.type = 'button';
    markerEl.className = 'maplibre-marker';
    markerEl.title = poi.name;
    markerEl.setAttribute('aria-label', poi.name);
    markerEl.addEventListener('click', () => updateMapInfo(poi));

    const marker = new maplibregl.Marker({ element: markerEl, anchor: 'center' })
      .setLngLat([poi.lng, poi.lat])
      .addTo(map);

    markers.push(marker);
    bounds.extend([poi.lng, poi.lat]);
  });

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 40, animate: true, maxZoom: 12 });
  }
}

function renderItinerary(country, days, sourceLabel) {
  if (!days.length) {
    itinerary.innerHTML = '<div class="empty">No itinerary generated from live data yet. Try another country.</div>';
    return;
  }

  itinerary.innerHTML = days.map((day) => `
    <article class="service-card">
      <h3>Day ${day.day}: ${day.theme}</h3>
      <p><strong>Stops:</strong> ${day.stops.join(' → ')}</p>
      <p>${day.notes}</p>
      <p>Source engine: ${sourceLabel}</p>
    </article>
  `).join('');

  statusText.textContent = `Generated ${days.length}-day ${country} tour.`;
}

async function generateTour() {
  const country = countryInput.value.trim();
  if (!country) return;

  statusText.textContent = mapInitialized
    ? `Generating live AI tour for ${country}...`
    : `Generating live AI tour for ${country}... (map unavailable: assets failed to load)`;
  itinerary.innerHTML = '<div class="empty">Thinking...</div>';
  if (mapInitialized) {
    updateMapInfo(null);
  }

  try {
    const data = await requestAiTour(country);

    renderMapPois(data.pois || []);
    renderItinerary(data.country, data.days || [], data.source || 'live web data');
    statusText.textContent = mapInitialized
      ? `Done: ${data.country} plan created from live internet sources.`
      : `Done: ${data.country} plan created from live internet sources. (Map unavailable: assets failed to load)`;
  } catch (err) {
    itinerary.innerHTML = `<div class="empty">${err.message}</div>`;
    statusText.textContent = mapInitialized
      ? 'Unable to generate a live AI tour right now.'
      : 'Unable to generate a live AI tour right now. (Map unavailable: assets failed to load)';
  }
}

function getAiTourEndpoints(country) {
  const query = `country=${encodeURIComponent(country)}`;
  const endpoints = [`/api/ai-tour?${query}`];

  if (window.location.protocol.startsWith('http')) {
    const localApi = `${window.location.protocol}//${window.location.hostname}:8000/api/ai-tour?${query}`;
    if (!endpoints.includes(localApi)) endpoints.push(localApi);
  }

  return endpoints;
}

async function requestAiTour(country) {
  for (const url of getAiTourEndpoints(country)) {
    try {
      const res = await fetch(url);
      const bodyText = await res.text();
      let data;

      try {
        data = JSON.parse(bodyText);
      } catch {
        continue;
      }

      if (!res.ok) {
        if (res.status === 404) continue;
        throw new Error(data.error || 'Failed to generate tour');
      }

      return data;
    } catch {
      // Try the next endpoint.
    }
  }

  return buildClientSideTour(country);
}

async function buildClientSideTour(country) {
  const prompt = [
    'Generate travel itinerary JSON only.',
    'Schema: {"days":[{"day":1,"theme":"...","stops":["..."],"notes":"..."}]}.',
    `Country: ${country}. Keep it concise and practical for tourists.`,
  ].join(' ');

  const res = await fetch(`https://text.pollinations.ai/${encodeURIComponent(prompt)}`);
  const raw = await res.text();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const extracted = raw.match(/\{[\s\S]*\}/);
    parsed = extracted ? JSON.parse(extracted[0]) : null;
  }

  if (!parsed || !Array.isArray(parsed.days)) {
    throw new Error('AI responded with an unexpected format. Please try again.');
  }

  return {
    country,
    days: parsed.days,
    pois: [],
    source: 'Pollinations AI (browser fallback)',
  };
}

async function initApp() {
  mapStyleSelect.disabled = true;

  try {
    await createMap();
  } catch (err) {
    console.error('MapLibre initialization failed', err);
    showMapUnavailableMessage();
    mapStyleSelect.disabled = false;
  }

  generateTour();
}

mapStyleSelect?.addEventListener('change', (event) => {
  setMapStyle(event.target.value);
});

generateTourBtn.addEventListener('click', generateTour);
initApp();
