const countryInput = document.getElementById('countryInput');
const generateTourBtn = document.getElementById('generateTourBtn');
const itinerary = document.getElementById('itinerary');
const mapInfo = document.getElementById('mapInfo');
const statusText = document.getElementById('statusText');

let map;
let markerLayer;

function createMap() {
  map = new maplibregl.Map({
    container: 'worldMap',
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    center: [0, 20],
    zoom: 1.4,
    minZoom: 1,
    maxZoom: 18,
    renderWorldCopies: true,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  markerLayer = [];
}

function updateMapInfo(poi) {
  if (!poi) {
    mapInfo.textContent = 'No place selected.';
    return;
  }

  mapInfo.innerHTML = `<strong>${poi.name}</strong><br/>📍 ${poi.country}<br/>${poi.description}<br/><a href="${poi.source}" target="_blank" rel="noreferrer">Source</a>`;
}

function clearMarkers() {
  markerLayer.forEach((marker) => marker.remove());
  markerLayer = [];
}

function renderMapPois(pois) {
  clearMarkers();
  const bounds = new maplibregl.LngLatBounds();

  pois.forEach((poi) => {
    const marker = new maplibregl.Marker({ color: '#4c82ff' })
      .setLngLat([poi.lng, poi.lat])
      .setPopup(new maplibregl.Popup({ offset: 18 }).setHTML(`<strong>${poi.name}</strong><br/>${poi.country}`))
      .addTo(map);

    marker.getElement().addEventListener('click', () => updateMapInfo(poi));
    markerLayer.push(marker);
    bounds.extend([poi.lng, poi.lat]);
  });

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, { padding: 60, animate: true, maxZoom: 8 });
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

  statusText.textContent = `Generating live AI tour for ${country}...`;
  itinerary.innerHTML = '<div class="empty">Thinking...</div>';
  updateMapInfo(null);

  try {
    const data = await requestAiTour(country);

    renderMapPois(data.pois || []);
    renderItinerary(data.country, data.days || [], data.source || 'live web data');
    statusText.textContent = `Done: ${data.country} plan created from live internet sources.`;
  } catch (err) {
    itinerary.innerHTML = `<div class="empty">${err.message}</div>`;
    statusText.textContent = 'Unable to generate a live AI tour right now.';
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

createMap();
map.on('load', () => {
  generateTourBtn.addEventListener('click', generateTour);
  generateTour();
});
