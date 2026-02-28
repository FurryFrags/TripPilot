const countryInput = document.getElementById('countryInput');
const generateTourBtn = document.getElementById('generateTourBtn');
const itinerary = document.getElementById('itinerary');
const mapInfo = document.getElementById('mapInfo');
const statusText = document.getElementById('statusText');
const mapStyleSelect = document.getElementById('mapStyleSelect');

const BASE_VECTOR_STYLE_URL = 'https://demotiles.maplibre.org/style.json';
const SATELLITE_TILE_URL = 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

let map;
let markers = [];
let mapInitialized = false;
let baseVectorStyleCache;
let mapReady = false;
let queuedStyleMode = null;
let styleUpdateRequestId = 0;

function showMapUnavailableMessage() {
  statusText.textContent = 'Map assets failed to load. You can still generate an itinerary without the map.';
  mapInfo.textContent = 'Map unavailable: map assets failed to load. Place details will appear here when map support is restored.';
}

function cloneStyle(style) {
  if (typeof structuredClone === 'function') {
    return structuredClone(style);
  }

  return JSON.parse(JSON.stringify(style));
}

async function getBaseVectorStyle() {
  if (baseVectorStyleCache) {
    return cloneStyle(baseVectorStyleCache);
  }

  const response = await fetch(BASE_VECTOR_STYLE_URL);
  if (!response.ok) {
    throw new Error('Unable to fetch MapLibre base style');
  }

  baseVectorStyleCache = await response.json();
  return cloneStyle(baseVectorStyleCache);
}

function buildTerrainStyle(baseStyle) {
  const overlays = (baseStyle.layers || []).filter((layer) => {
    const sourceLayer = layer['source-layer'] || '';

    if (layer.type === 'symbol') {
      return ['place', 'housenumber', 'poi', 'transportation_name', 'water_name', 'aeroway'].includes(sourceLayer);
    }

    if (layer.type === 'line') {
      return ['boundary', 'transportation', 'waterway', 'aeroway'].includes(sourceLayer);
    }

    return false;
  }).map((layer) => {
    const styledLayer = cloneStyle(layer);

    if (styledLayer.type === 'line') {
      styledLayer.paint = {
        ...(styledLayer.paint || {}),
        'line-color': styledLayer['source-layer'] === 'boundary' ? '#c6d0de' : '#ffe680',
        'line-opacity': 0.75,
      };
    }

    if (styledLayer.type === 'symbol') {
      styledLayer.paint = {
        ...(styledLayer.paint || {}),
        'text-color': '#f4f7ff',
        'text-halo-color': '#102342',
        'text-halo-width': 1.4,
      };
    }

    return styledLayer;
  });

  return {
    version: 8,
    name: 'TripPilot Terrain',
    glyphs: baseStyle.glyphs,
    sprite: baseStyle.sprite,
    sources: {
      ...baseStyle.sources,
      satellite: {
        type: 'raster',
        tiles: [SATELLITE_TILE_URL],
        tileSize: 256,
        attribution: 'Esri World Imagery',
      },
    },
    layers: [
      {
        id: 'satellite-base',
        type: 'raster',
        source: 'satellite',
      },
      ...overlays,
    ],
  };
}

function buildDetailedStyle(baseStyle) {
  const detailedStyle = cloneStyle(baseStyle);
  const layers = detailedStyle.layers || [];

  layers.forEach((layer) => {
    if (layer.type === 'symbol') {
      layer.paint = {
        ...(layer.paint || {}),
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.4,
      };
    }

    if (layer.type === 'line' && layer['source-layer'] === 'transportation') {
      layer.paint = {
        ...(layer.paint || {}),
        'line-opacity': 0.95,
      };
    }
  });

  layers.push(
    {
      id: 'trip-pilot-admin-province-outline',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['>=', ['to-number', ['get', 'admin_level'], 0], 4],
      minzoom: 2,
      paint: {
        'line-color': '#6b7f99',
        'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.45, 8, 1.1, 12, 1.8],
        'line-opacity': 0.85,
      },
    },
    {
      id: 'trip-pilot-major-road-emphasis',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary']]],
      minzoom: 4,
      paint: {
        'line-color': '#f59f00',
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.7, 8, 2.4, 12, 5],
        'line-opacity': 0.88,
      },
    },
    {
      id: 'trip-pilot-minor-road-emphasis',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['tertiary', 'street', 'minor', 'service']]],
      minzoom: 8,
      paint: {
        'line-color': '#e4edf7',
        'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.45, 11, 1.5, 14, 3],
        'line-opacity': 0.92,
      },
    },
    {
      id: 'trip-pilot-trail-emphasis',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      filter: ['in', ['get', 'class'], ['literal', ['path', 'track']]],
      minzoom: 10,
      paint: {
        'line-color': '#5c6f82',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 14, 1.6],
        'line-dasharray': [1.2, 1.1],
        'line-opacity': 0.95,
      },
    }
  );

  detailedStyle.layers = layers;
  return detailedStyle;
}

async function getStyleDefinition(styleMode) {
  const baseStyle = await getBaseVectorStyle();

  if (styleMode === 'terrain') {
    return buildTerrainStyle(baseStyle);
  }

  if (styleMode === 'detailed') {
    return buildDetailedStyle(baseStyle);
  }

  return baseStyle;
}

async function createMap() {
  if (!window.maplibregl) {
    showMapUnavailableMessage();
    return false;
  }

  const style = await getStyleDefinition(mapStyleSelect?.value || 'simple');
  map = new maplibregl.Map({
    container: 'worldMap',
    style,
    center: [0, 20],
    zoom: 2,
    minZoom: 2,
    renderWorldCopies: true,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  mapReady = false;

  map.on('load', () => {
    mapReady = true;
    mapStyleSelect.disabled = false;

    if (queuedStyleMode) {
      const styleMode = queuedStyleMode;
      queuedStyleMode = null;
      setMapStyle(styleMode);
    }
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
    const style = await getStyleDefinition(styleMode);

    if (requestId !== styleUpdateRequestId) {
      return;
    }

    map.setStyle(style);
    mapReady = false;
    mapStyleSelect.disabled = true;
    map.once('idle', () => {
      mapReady = true;
      mapStyleSelect.disabled = false;
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
    map.fitBounds(bounds, { padding: 40, animate: true });
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
