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
let locationImageLookup = {};
let countryImageUrl = "";

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

  const imageUrl = poi.image || locationImageLookup[poi.name] || '';
  const imageMarkup = imageUrl
    ? `<img src="${imageUrl}" alt="${poi.name}" class="map-info-image" loading="lazy"/>`
    : '';

  mapInfo.innerHTML = `<strong>${poi.name}</strong><br/>📍 ${poi.country}<br/>${poi.description}<br/><a href="${poi.source}" target="_blank" rel="noreferrer">Source</a>${imageMarkup}`;
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

function normalizeLocation(location) {
  if (typeof location === 'string') {
    return {
      name: location,
      summary: 'No summary provided.',
      history: 'No history provided.',
      precautions: 'No precautions provided.',
      bring: 'No packing notes provided.',
      lookOutFor: 'No watchouts provided.',
    };
  }

  return {
    name: location?.name || 'Unnamed location',
    summary: location?.summary || 'No summary provided.',
    history: location?.history || 'No history provided.',
    precautions: location?.precautions || 'No precautions provided.',
    bring: location?.bring || 'No packing notes provided.',
    lookOutFor: location?.lookOutFor || 'No watchouts provided.',
    transportationMethod: location?.transportationMethod || 'Local bus + walking',
  };
}

function normalizeDay(day) {
  const locations = Array.isArray(day?.locations)
    ? day.locations.map(normalizeLocation)
    : (Array.isArray(day?.stops) ? day.stops.map(normalizeLocation) : []);

  const route = day?.route || (Array.isArray(day?.stops) ? day.stops.join(' → ') : 'Route not provided.');

  return {
    day: day?.day || '?',
    theme: day?.theme || 'Explore the area',
    route,
    locations,
  };
}

function renderItinerary(country, days, sourceLabel) {
  if (!days.length) {
    itinerary.innerHTML = '<div class="empty">No itinerary generated from live data yet. Try another country.</div>';
    return;
  }

  const countryImageMarkup = countryImageUrl
    ? `<img src="${countryImageUrl}" alt="${country}" class="country-image" loading="lazy"/>`
    : '';

  itinerary.innerHTML = `${countryImageMarkup}` + days.map((rawDay) => {
    const day = normalizeDay(rawDay);
    const locationToggles = day.locations.map((location) => `
      <details class="location-toggle">
        <summary>${location.name}</summary>
        <p><strong>Summary:</strong> ${location.summary}</p>
        <p><strong>History:</strong> ${location.history}</p>
        <p><strong>Precautions:</strong> ${location.precautions}</p>
        <p><strong>Bring:</strong> ${location.bring}</p>
        <p><strong>Look out for:</strong> ${location.lookOutFor}</p>
        <p><strong>Transportation Method:</strong> ${location.transportationMethod}</p>
        ${locationImageLookup[location.name] ? `<img src="${locationImageLookup[location.name]}" alt="${location.name}" class="location-image" loading="lazy"/>` : ""}
      </details>
    `).join('');

    return `
    <article class="service-card">
      <details class="day-dropdown">
        <summary>Day ${day.day}: ${day.theme}</summary>
        <p><strong>Route:</strong> ${day.route}</p>
        <div class="location-toggles">${locationToggles || '<p>No locations listed.</p>'}</div>
      </details>
      <p>Source engine: ${sourceLabel}</p>
    </article>
  `;
  }).join('');

  statusText.textContent = `Generated ${days.length}-day ${country} tour.`;
}

async function generateTour() {
  const country = countryInput.value.trim();
  if (!country) return;

  statusText.textContent = mapInitialized
    ? `Generating live AI tour for ${country}...`
    : `Generating live AI tour for ${country}... (map unavailable: assets failed to load)`;
  itinerary.innerHTML = '<div class="empty">Thinking...</div>';
  locationImageLookup = {};
  countryImageUrl = '';
  if (mapInitialized) {
    updateMapInfo(null);
  }

  try {
    const data = await requestAiTour(country);
    const locationNames = collectLocationNames(data.days || [], data.pois || []);
    const imageData = await requestLocationImages(data.country, locationNames);
    locationImageLookup = imageData.locationImages || {};
    countryImageUrl = imageData.countryImage || "";

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


function collectLocationNames(days, pois) {
  const locationNames = new Set();

  days.forEach((day) => {
    const normalizedDay = normalizeDay(day);
    normalizedDay.locations.forEach((location) => {
      if (location.name) locationNames.add(location.name);
    });
  });

  (pois || []).forEach((poi) => {
    if (poi?.name) locationNames.add(poi.name);
  });

  return [...locationNames];
}

function getLocationImageEndpoints(country, locationNames) {
  const params = new URLSearchParams();
  params.set('country', country);
  locationNames.forEach((name) => params.append('location', name));

  const endpoints = [`/api/location-images?${params.toString()}`];

  if (window.location.protocol.startsWith('http')) {
    const localApi = `${window.location.protocol}//${window.location.hostname}:8000/api/location-images?${params.toString()}`;
    if (!endpoints.includes(localApi)) endpoints.push(localApi);
  }

  return endpoints;
}

async function requestLocationImages(country, locationNames) {
  if (!country) return { countryImage: '', locationImages: {} };

  for (const url of getLocationImageEndpoints(country, locationNames)) {
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
        throw new Error(data.error || 'Failed to fetch images');
      }

      return {
        countryImage: data.countryImage || '',
        locationImages: data.locationImages || {},
      };
    } catch {
      // Try the next endpoint.
    }
  }

  return { countryImage: '', locationImages: {} };
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
    'Output JSON only. No markdown, no commentary, no extra keys.',
    'Schema: {"days":[{"day":1,"theme":"...","route":"Location A → Location B","locations":[{"name":"...","summary":"...","history":"...","precautions":"...","bring":"...","lookOutFor":"...","transportationMethod":"..."}]}]}.',
    `Country: ${country}. Keep each field brief, practical, and standardized.`,
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
