const countryInput = document.getElementById('countryInput');
const generateTourBtn = document.getElementById('generateTourBtn');
const itinerary = document.getElementById('itinerary');
const mapInfo = document.getElementById('mapInfo');
const statusText = document.getElementById('statusText');
const mapStyleSelect = document.getElementById('mapStyleSelect');

const MAP_STYLE_DEFINITIONS = {
  terrain: {
    label: 'Terrain',
    sources: {
      terrainBase: {
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Terrain_Base/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 19,
      },
      terrainLabels: {
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Reference_Overlay/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 19,
      },
    },
    layers: [
      { id: 'terrain-base', type: 'raster', source: 'terrainBase' },
      { id: 'terrain-labels', type: 'raster', source: 'terrainLabels' },
    ],
    attribution: 'Esri World Terrain Base, Esri World Reference Overlay',
  },
  simple: {
    label: 'Simple',
    sources: {
      topoBase: {
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 19,
      },
    },
    layers: [{ id: 'topo-base', type: 'raster', source: 'topoBase' }],
    attribution: 'Esri World Topographic Map',
  },
  detailed: {
    label: 'Detailed',
    sources: {
      imageryBase: {
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 19,
      },
      transportationRef: {
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 19,
      },
      boundariesRef: {
        type: 'raster',
        tiles: ['https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 19,
      },
    },
    layers: [
      { id: 'imagery-base', type: 'raster', source: 'imageryBase' },
      { id: 'transportation-ref', type: 'raster', source: 'transportationRef' },
      { id: 'boundaries-ref', type: 'raster', source: 'boundariesRef' },
    ],
    attribution: 'Esri World Imagery, Esri World Transportation, Esri World Boundaries and Places',
  },
};

let map;
let markers = [];
let mapInitialized = false;
let mapReady = false;
let queuedStyleMode = null;
let styleUpdateRequestId = 0;

function showMapUnavailableMessage() {
  statusText.textContent = 'Map assets failed to load. You can still generate an itinerary without the map.';
  mapInfo.textContent = 'Map unavailable: map assets failed to load. Place details will appear here when map support is restored.';
}

function cloneStyle(style) {
  if (typeof structuredClone === 'function') return structuredClone(style);
  return JSON.parse(JSON.stringify(style));
}

function getStyleDefinition(styleMode) {
  const requestedStyle = MAP_STYLE_DEFINITIONS[styleMode] || MAP_STYLE_DEFINITIONS.simple;
  return {
    version: 8,
    name: `TripPilot ${requestedStyle.label}`,
    sources: requestedStyle.sources,
    layers: requestedStyle.layers,
    attribution: requestedStyle.attribution,
  };
}

async function createMap() {
  if (!window.maplibregl) {
    showMapUnavailableMessage();
    return false;
  }

  const style = cloneStyle(getStyleDefinition(mapStyleSelect?.value || 'simple'));
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
    const style = cloneStyle(getStyleDefinition(styleMode));

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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function firstSentence(text, fallback) {
  if (!text) return fallback;
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(.+?[.!?])\s/);
  return (match?.[1] || normalized).slice(0, 170);
}

function buildLocationCard(location, index) {
  const connectionText = location.connection || 'Use local public transport or a short taxi ride to reach the next stop.';
  return `
    <details class="location-toggle">
      <summary>${index + 1}. ${escapeHtml(location.name)}</summary>
      <div class="location-body">
        <p><strong>Area snapshot:</strong> ${escapeHtml(location.summary)}</p>
        <p><strong>History:</strong> ${escapeHtml(location.history)}</p>
        <p><strong>Precautions:</strong> ${escapeHtml(location.precautions)}</p>
        <p><strong>Bring / watch out:</strong> ${escapeHtml(location.bring)}</p>
        <p><strong>Connection to next stop:</strong> ${escapeHtml(connectionText)}</p>
      </div>
    </details>
  `;
}

function normalizeDayPlan(day, poisByName) {
  const stops = toArray(day.stops).map((stop) => String(stop).trim()).filter(Boolean);
  const locations = (Array.isArray(day.locations) && day.locations.length ? day.locations : stops.map((stop) => ({ name: stop }))).map((location, index, arr) => {
    const name = String(location.name || location.stop || stops[index] || `Stop ${index + 1}`);
    const poi = poisByName.get(name.toLowerCase());
    const summary = location.summary || location.description || firstSentence(poi?.description, `${name} is a key highlight for this day.`);
    const history = location.history || `Known for local culture and landmarks around ${name}.`;
    const precautions = location.precautions || day.precautions || 'Keep valuables secure in busy areas and verify local opening hours.';
    const bring = location.bring || day.bring || 'Bring water, comfortable shoes, and a charged phone for navigation.';
    const connection = location.connection || day.route?.[index] || day.connections?.[index] || (arr[index + 1] ? `From ${name} continue toward ${arr[index + 1].name || arr[index + 1]} by train/bus.` : 'End of day route.');

    return { name, summary, history, precautions, bring, connection };
  });

  return {
    day: day.day || 1,
    theme: day.theme || `Day ${day.day || 1} Highlights`,
    overview: day.notes || day.overview || 'Balanced day with culture, food, and sightseeing.',
    locations,
  };
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

  const poisByName = new Map((window.__tripPois || []).map((poi) => [String(poi.name).toLowerCase(), poi]));
  const normalizedDays = days.map((day) => normalizeDayPlan(day, poisByName));

  itinerary.innerHTML = normalizedDays.map((day) => `
    <article class="service-card itinerary-day-card">
      <details class="day-dropdown">
        <summary>Day ${escapeHtml(day.day)} • ${escapeHtml(day.theme)}</summary>
        <div class="day-body">
          <p class="day-overview">${escapeHtml(day.overview)}</p>
          <div class="location-list">
            ${day.locations.map((location, index) => buildLocationCard(location, index)).join('')}
          </div>
          <p class="itinerary-source">Source engine: ${escapeHtml(sourceLabel)}</p>
        </div>
      </details>
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
    window.__tripPois = data.pois || [];

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
    'Schema: {"days":[{"day":1,"theme":"...","overview":"...","precautions":"...","bring":"...","locations":[{"name":"...","summary":"...","history":"...","precautions":"...","bring":"...","connection":"..."}]}]}.',
    `Country: ${country}. Keep each location summary very brief and practical for tourists.`,
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

  itinerary.innerHTML = '<div class="empty">Choose a country and click “Generate Live AI Tour” to build your itinerary.</div>';
}

mapStyleSelect?.addEventListener('change', (event) => {
  setMapStyle(event.target.value);
});

generateTourBtn.addEventListener('click', generateTour);
initApp();
