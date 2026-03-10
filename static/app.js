const countrySearchInput = document.getElementById('countrySearchInput');
const countryDropdown = document.getElementById('countryDropdown');
const selectedCountriesEl = document.getElementById('selectedCountries');
const countryMultiSelect = document.getElementById('countryMultiSelect');
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
let latestMapFeatures = null;
let latestItineraryOverlay = null;
let selectedCountries = new Set();

const COUNTRY_OPTIONS = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
  'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan', 'Bolivia',
  'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon', 'Canada',
  'Cape Verde', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Costa Rica', 'Croatia', 'Cuba',
  'Cyprus', 'Czech Republic', 'Democratic Republic of the Congo', 'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador',
  'Equatorial Guinea', 'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Gambia',
  'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti',
  'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
  'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia',
  'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia',
  'Maldives', 'Mali', 'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia', 'Moldova', 'Monaco',
  'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar', 'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand',
  'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palau', 'Panama',
  'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Republic of the Congo', 'Romania', 'Russia',
  'Rwanda', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia',
  'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan',
  'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania',
  'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda',
  'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam',
  'Yemen', 'Zambia', 'Zimbabwe',
];

const MAP_NETWORK_SOURCE_IDS = {
  metro: 'trip-metro-source',
  road: 'trip-road-source',
  highway: 'trip-highway-source',
  labels: 'trip-network-labels-source',
};

const MAP_NETWORK_LAYER_IDS = {
  metro: 'trip-metro-layer',
  road: 'trip-road-layer',
  highway: 'trip-highway-layer',
  labels: 'trip-network-labels-layer',
};

const MAP_ITINERARY_SOURCE_IDS = {
  places: 'trip-itinerary-places-source',
  route: 'trip-itinerary-route-source',
};

const MAP_ITINERARY_LAYER_IDS = {
  places: 'trip-itinerary-places-layer',
  placeLabels: 'trip-itinerary-place-labels-layer',
  route: 'trip-itinerary-route-layer',
};

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
    renderMapNetwork(latestMapFeatures);
    restoreItineraryOverlayFromState();

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
      renderMapNetwork(latestMapFeatures);
      restoreItineraryOverlayFromState();
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

  removeItineraryLayers();
  markers.forEach((marker) => marker.remove());
  markers = [];
  const bounds = new maplibregl.LngLatBounds();

  const placeFeatures = [];
  const routeCoordinates = [];

  pois.forEach((poi, index) => {
    const markerEl = document.createElement('button');
    markerEl.type = 'button';
    markerEl.className = 'maplibre-marker';
    markerEl.textContent = String(index + 1);
    markerEl.title = poi.name;
    markerEl.setAttribute('aria-label', poi.name);
    markerEl.addEventListener('click', () => updateMapInfo(poi));

    const marker = new maplibregl.Marker({ element: markerEl, anchor: 'center' })
      .setLngLat([poi.lng, poi.lat])
      .addTo(map);

    markers.push(marker);
    bounds.extend([poi.lng, poi.lat]);
    routeCoordinates.push([poi.lng, poi.lat]);
    placeFeatures.push({
      type: 'Feature',
      properties: {
        name: poi.name,
        sequence: index + 1,
      },
      geometry: {
        type: 'Point',
        coordinates: [poi.lng, poi.lat],
      },
    });
  });

  latestItineraryOverlay = {
    placeFeatures,
    routeCoordinates,
  };

  renderItineraryOnMap(placeFeatures, routeCoordinates);

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 40, animate: true });
  }
}

function removeItineraryLayers() {
  if (!map) return;

  Object.values(MAP_ITINERARY_LAYER_IDS).forEach((layerId) => {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  });

  Object.values(MAP_ITINERARY_SOURCE_IDS).forEach((sourceId) => {
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  });
}

function renderItineraryOnMap(placeFeatures, routeCoordinates) {
  latestItineraryOverlay = {
    placeFeatures,
    routeCoordinates,
  };

  restoreItineraryOverlayFromState();
}

function restoreItineraryOverlayFromState() {
  if (!mapReady || !map) {
    return;
  }

  removeItineraryLayers();

  if (!latestItineraryOverlay) {
    return;
  }

  const placeFeatures = Array.isArray(latestItineraryOverlay.placeFeatures)
    ? latestItineraryOverlay.placeFeatures
    : [];
  const routeCoordinates = Array.isArray(latestItineraryOverlay.routeCoordinates)
    ? latestItineraryOverlay.routeCoordinates
    : [];

  const places = {
    type: 'FeatureCollection',
    features: placeFeatures,
  };

  map.addSource(MAP_ITINERARY_SOURCE_IDS.places, {
    type: 'geojson',
    data: places,
  });

  map.addLayer({
    id: MAP_ITINERARY_LAYER_IDS.places,
    type: 'circle',
    source: MAP_ITINERARY_SOURCE_IDS.places,
    paint: {
      'circle-radius': 7,
      'circle-color': '#2563eb',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  });

  map.addLayer({
    id: MAP_ITINERARY_LAYER_IDS.placeLabels,
    type: 'symbol',
    source: MAP_ITINERARY_SOURCE_IDS.places,
    layout: {
      'text-field': ['concat', ['to-string', ['get', 'sequence']], '. ', ['get', 'name']],
      'text-size': 11,
      'text-anchor': 'top',
      'text-offset': [0, 1.1],
    },
    paint: {
      'text-color': '#0f172a',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.2,
    },
  });

  if (routeCoordinates.length > 1) {
    map.addSource(MAP_ITINERARY_SOURCE_IDS.route, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: { kind: 'itinerary-route' },
          geometry: {
            type: 'LineString',
            coordinates: routeCoordinates,
          },
        }],
      },
    });

    map.addLayer({
      id: MAP_ITINERARY_LAYER_IDS.route,
      type: 'line',
      source: MAP_ITINERARY_SOURCE_IDS.route,
      paint: {
        'line-color': '#22d3ee',
        'line-width': 4,
        'line-opacity': 0.9,
      },
    });
  }
}

function removeNetworkLayers() {
  if (!map) return;

  Object.values(MAP_NETWORK_LAYER_IDS).forEach((layerId) => {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  });

  Object.values(MAP_NETWORK_SOURCE_IDS).forEach((sourceId) => {
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  });
}

function renderMapNetwork(mapFeatures) {
  if (!mapInitialized || !map || !window.maplibregl || !mapReady) {
    latestMapFeatures = mapFeatures;
    return;
  }

  latestMapFeatures = mapFeatures;
  removeNetworkLayers();

  if (!mapFeatures) return;

  const metroLines = mapFeatures.metroLines || { type: 'FeatureCollection', features: [] };
  const roads = mapFeatures.roads || { type: 'FeatureCollection', features: [] };
  const highways = mapFeatures.highways || { type: 'FeatureCollection', features: [] };
  const labels = mapFeatures.labels || { type: 'FeatureCollection', features: [] };

  map.addSource(MAP_NETWORK_SOURCE_IDS.metro, { type: 'geojson', data: metroLines });
  map.addLayer({
    id: MAP_NETWORK_LAYER_IDS.metro,
    type: 'line',
    source: MAP_NETWORK_SOURCE_IDS.metro,
    paint: {
      'line-color': '#8b5cf6',
      'line-width': 3,
      'line-opacity': 0.9,
    },
  });

  map.addSource(MAP_NETWORK_SOURCE_IDS.road, { type: 'geojson', data: roads });
  map.addLayer({
    id: MAP_NETWORK_LAYER_IDS.road,
    type: 'line',
    source: MAP_NETWORK_SOURCE_IDS.road,
    paint: {
      'line-color': '#f59e0b',
      'line-width': 2.5,
      'line-opacity': 0.85,
      'line-dasharray': [2, 1],
    },
  });

  map.addSource(MAP_NETWORK_SOURCE_IDS.highway, { type: 'geojson', data: highways });
  map.addLayer({
    id: MAP_NETWORK_LAYER_IDS.highway,
    type: 'line',
    source: MAP_NETWORK_SOURCE_IDS.highway,
    paint: {
      'line-color': '#ef4444',
      'line-width': 3.5,
      'line-opacity': 0.85,
    },
  });

  map.addSource(MAP_NETWORK_SOURCE_IDS.labels, { type: 'geojson', data: labels });
  map.addLayer({
    id: MAP_NETWORK_LAYER_IDS.labels,
    type: 'symbol',
    source: MAP_NETWORK_SOURCE_IDS.labels,
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 11,
      'text-offset': [0, 0.75],
      'text-anchor': 'top',
    },
    paint: {
      'text-color': '#0f172a',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1,
    },
  });
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
  const selected = [...selectedCountries];
  const country = selected.join(', ').trim();
  if (!country) {
    statusText.textContent = 'Please select at least one country.';
    return;
  }

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

    const mappablePois = await ensureMappablePois(data.country, data.days || [], data.pois || []);
    renderMapPois(mappablePois);
    renderMapNetwork(data.mapFeatures || null);
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

function toggleCountry(country) {
  if (selectedCountries.has(country)) {
    selectedCountries.delete(country);
  } else {
    selectedCountries.add(country);
  }

  renderSelectedCountries();
  renderCountryDropdown(countrySearchInput.value.trim());
}

function renderSelectedCountries() {
  const selected = [...selectedCountries];

  if (!selected.length) {
    selectedCountriesEl.innerHTML = '<span class="hint">No countries selected.</span>';
    return;
  }

  selectedCountriesEl.innerHTML = selected
    .map((country) => (
      `<span class="country-chip">${country}<button type="button" data-country-remove="${country}" aria-label="Remove ${country}">×</button></span>`
    ))
    .join('');

  selectedCountriesEl.querySelectorAll('button[data-country-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedCountries.delete(button.dataset.countryRemove);
      renderSelectedCountries();
      renderCountryDropdown(countrySearchInput.value.trim());
    });
  });
}

function renderCountryDropdown(query = '') {
  const normalizedQuery = query.toLowerCase();
  const options = COUNTRY_OPTIONS
    .filter((country) => country.toLowerCase().includes(normalizedQuery))
    .slice(0, 80);

  countryDropdown.innerHTML = options.length
    ? options.map((country) => {
      const activeClass = selectedCountries.has(country) ? 'active' : '';
      const prefix = selectedCountries.has(country) ? '✓ ' : '';
      return `<button type="button" class="country-option ${activeClass}" data-country="${country}">${prefix}${country}</button>`;
    }).join('')
    : '<div class="country-option">No matches found.</div>';

  countryDropdown.querySelectorAll('button[data-country]').forEach((button) => {
    button.addEventListener('click', () => toggleCountry(button.dataset.country));
  });
}

function openCountryDropdown() {
  countryDropdown.style.display = 'block';
  renderCountryDropdown(countrySearchInput.value.trim());
}

function closeCountryDropdown() {
  countryDropdown.style.display = 'none';
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

function logAiDiary(country, diaryEntries = [], sourceLabel = '') {
  if (!Array.isArray(diaryEntries) || !diaryEntries.length) return;

  console.groupCollapsed(`🧾 AI diary for ${country} (${sourceLabel || 'unknown source'})`);
  diaryEntries.forEach((entry, index) => {
    const provider = entry?.provider || 'unknown-provider';
    const model = entry?.model || 'unknown-model';
    const status = entry?.status || 'unknown-status';
    const error = entry?.error || '';
    const message = `[${index + 1}] ${provider} :: ${model} :: ${status}`;

    if (status === 'failed') {
      console.error(message, error);
      return;
    }

    console.log(message);
  });
  console.groupEnd();
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
        console.error('AI tour endpoint returned non-JSON payload', { url, status: res.status, bodyPreview: bodyText.slice(0, 300) });
        continue;
      }

      if (!res.ok) {
        if (res.status === 404) {
          console.warn('AI tour endpoint not found, trying next endpoint', { url });
          continue;
        }
        console.error('AI tour endpoint failed', { url, status: res.status, error: data.error || 'Unknown API error' });
        throw new Error(data.error || 'Failed to generate tour');
      }

      logAiDiary(country, data.aiDiary, data.aiModel || data.source || 'server');

      return data;
    } catch (error) {
      console.error('AI tour request attempt failed', { url, error: error?.message || String(error) });
    }
  }

  return buildClientSideTour(country);
}

function collectDayLocationNames(days) {
  const names = [];
  const seen = new Set();

  (days || []).forEach((day) => {
    const normalizedDay = normalizeDay(day);
    normalizedDay.locations.forEach((location) => {
      const name = (location?.name || '').trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    });
  });

  return names;
}

function normalizeCoordinatePair(latCandidate, lngCandidate) {
  if (
    latCandidate === null
    || latCandidate === undefined
    || lngCandidate === null
    || lngCandidate === undefined
    || String(latCandidate).trim() === ''
    || String(lngCandidate).trim() === ''
  ) {
    return null;
  }

  const parsedLat = Number(latCandidate);
  const parsedLng = Number(lngCandidate);

  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
    return null;
  }

  if (Math.abs(parsedLat) <= 90 && Math.abs(parsedLng) <= 180) {
    return { lat: parsedLat, lng: parsedLng };
  }

  if (Math.abs(parsedLng) <= 90 && Math.abs(parsedLat) <= 180) {
    return { lat: parsedLng, lng: parsedLat };
  }

  return null;
}

function isNearNullIsland(coords) {
  return Boolean(coords)
    && Math.abs(coords.lat) < 0.1
    && Math.abs(coords.lng) < 0.1;
}

function haversineDistanceKm(a, b) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;

  const deltaLat = toRad(b.lat - a.lat);
  const deltaLng = toRad(b.lng - a.lng);
  const aTerm = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(aTerm), Math.sqrt(1 - aTerm));
}

function chooseBestGeocodeResult(results, country) {
  if (!Array.isArray(results) || !results.length) return null;

  const normalizedCountry = (country || '').trim().toLowerCase();
  const ranked = [...results].sort((a, b) => Number(b.importance || 0) - Number(a.importance || 0));

  if (!normalizedCountry) return ranked[0];

  const countryMatched = ranked.find((candidate) => {
    const display = String(candidate?.display_name || '').toLowerCase();
    const addressCountry = String(candidate?.address?.country || '').toLowerCase();
    return display.includes(normalizedCountry) || addressCountry.includes(normalizedCountry);
  });

  return countryMatched || ranked[0];
}

async function geocodeLocationName(name, country) {
  const q = encodeURIComponent(`${name}, ${country}`);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=jsonv2&limit=5&addressdetails=1`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) return null;
    const data = await res.json();
    const best = chooseBestGeocodeResult(data, country);
    if (!best) return null;

    const parsedCoords = normalizeCoordinatePair(best.lat, best.lon);
    if (!parsedCoords) return null;

    return {
      ...parsedCoords,
      source: best.osm_url || 'https://www.openstreetmap.org',
    };
  } catch {
    return null;
  }
}

async function ensureMappablePois(country, days, pois = []) {
  const normalizedProvidedPois = (pois || [])
    .map((poi) => {
      const normalizedCoords = normalizeCoordinatePair(poi?.lat, poi?.lng);
      if (!normalizedCoords || !poi?.name) return null;

      return {
        ...poi,
        lat: normalizedCoords.lat,
        lng: normalizedCoords.lng,
      };
    })
    .filter(Boolean);

  const normalizedPoiByName = new Map(
    normalizedProvidedPois.map((poi) => [String(poi.name || '').trim().toLowerCase(), poi]),
  );

  const names = [];
  const seen = new Set();

  (pois || []).forEach((poi) => {
    const name = (poi?.name || '').trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  });

  collectDayLocationNames(days).forEach((name) => {
    if (!seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  });

  const builtPois = [];

  for (let index = 0; index < names.length && builtPois.length < 8; index += 1) {
    const name = names[index];
    const matchingPoi = normalizedPoiByName.get(String(name).trim().toLowerCase()) || {};
    const aiCoords = normalizeCoordinatePair(matchingPoi?.lat, matchingPoi?.lng);
    const geocoded = await geocodeLocationName(name, country);

    const safeAiCoords = isNearNullIsland(aiCoords) ? null : aiCoords;
    const safeGeocoded = isNearNullIsland(geocoded) ? null : geocoded;

    let resolvedCoords = safeGeocoded || safeAiCoords;
    if (safeGeocoded && safeAiCoords) {
      const distanceKm = haversineDistanceKm(safeGeocoded, safeAiCoords);
      resolvedCoords = distanceKm > 25 ? safeGeocoded : safeAiCoords;
    }

    if (!resolvedCoords) {
      continue;
    }

    builtPois.push({
      name,
      country,
      city: matchingPoi?.city || country,
      description: matchingPoi?.description || 'Mapped from itinerary locations.',
      source: geocoded?.source || matchingPoi?.source || 'https://www.openstreetmap.org',
      image: locationImageLookup[name] || '',
      lat: resolvedCoords.lat,
      lng: resolvedCoords.lng,
    });
  }

  return builtPois.length ? builtPois : normalizedProvidedPois;
}

async function buildClientSideTour(country) {
  const prompt = [
    'Output JSON only. No markdown, no commentary, no extra keys.',
    'Schema: {"days":[{"day":1,"theme":"...","route":"Location A → Location B","locations":[{"name":"...","summary":"...","history":"...","precautions":"...","bring":"...","lookOutFor":"...","transportationMethod":"..."}]}]}.',
    `Country: ${country}. Keep each field brief, practical, and standardized.`,
  ].join(' ');

  const fallbackModel = 'pollinations/text-default';
  const fallbackUrl = `https://text.pollinations.ai/${encodeURIComponent(prompt)}`;
  const res = await fetch(fallbackUrl);
  const raw = await res.text();

  if (!res.ok) {
    console.error('Client-side Pollinations fallback failed', { model: fallbackModel, status: res.status, bodyPreview: raw.slice(0, 300) });
    throw new Error('Fallback AI request failed. Please try again.');
  }

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
    mapFeatures: null,
    aiModel: fallbackModel,
    aiDiary: [{ provider: 'pollinations', model: fallbackModel, status: 'success' }],
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

}

mapStyleSelect?.addEventListener('change', (event) => {
  setMapStyle(event.target.value);
});

countrySearchInput.addEventListener('focus', openCountryDropdown);
countrySearchInput.addEventListener('input', (event) => {
  openCountryDropdown();
  renderCountryDropdown(event.target.value.trim());
});

countrySearchInput.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;

  event.preventDefault();
  const query = countrySearchInput.value.trim().toLowerCase();
  const match = COUNTRY_OPTIONS.find((country) => country.toLowerCase() === query)
    || COUNTRY_OPTIONS.find((country) => country.toLowerCase().includes(query));

  if (match) {
    selectedCountries.add(match);
    countrySearchInput.value = '';
    renderSelectedCountries();
    renderCountryDropdown('');
  }
});

document.addEventListener('click', (event) => {
  if (!countryMultiSelect.contains(event.target)) {
    closeCountryDropdown();
  }
});

generateTourBtn.addEventListener('click', generateTour);
renderSelectedCountries();
renderCountryDropdown('');
closeCountryDropdown();
initApp();
