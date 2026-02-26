const countryInput = document.getElementById('countryInput');
const generateTourBtn = document.getElementById('generateTourBtn');
const itinerary = document.getElementById('itinerary');
const mapInfo = document.getElementById('mapInfo');
const statusText = document.getElementById('statusText');

let map;
let markerLayer;

function createMap() {
  map = L.map('worldMap', {
    worldCopyJump: true,
    minZoom: 2,
  }).setView([20, 0], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);
}

function updateMapInfo(poi) {
  if (!poi) {
    mapInfo.textContent = 'No place selected.';
    return;
  }

  mapInfo.innerHTML = `<strong>${poi.name}</strong><br/>📍 ${poi.country}<br/>${poi.description}<br/><a href="${poi.source}" target="_blank" rel="noreferrer">Source</a>`;
}

function renderMapPois(pois) {
  markerLayer.clearLayers();
  const bounds = [];

  pois.forEach((poi) => {
    const marker = L.marker([poi.lat, poi.lng], { title: poi.name });
    marker.on('click', () => updateMapInfo(poi));
    markerLayer.addLayer(marker);
    bounds.push([poi.lat, poi.lng]);
  });

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [40, 40], animate: true });
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
    const res = await fetch(`/api/ai-tour?country=${encodeURIComponent(country)}`);
    const bodyText = await res.text();
    let data;

    try {
      data = JSON.parse(bodyText);
    } catch {
      throw new Error('Server returned a non-JSON response. Please try again in a moment.');
    }

    if (!res.ok) throw new Error(data.error || 'Failed to generate tour');

    renderMapPois(data.pois || []);
    renderItinerary(data.country, data.days || [], data.source || 'live web data');
    statusText.textContent = `Done: ${data.country} plan created from live internet sources.`;
  } catch (err) {
    itinerary.innerHTML = `<div class="empty">${err.message}</div>`;
    statusText.textContent = 'Unable to generate a live AI tour right now.';
  }
}

createMap();
generateTourBtn.addEventListener('click', generateTour);
generateTour();
