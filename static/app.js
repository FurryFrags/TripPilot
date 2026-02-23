const categoryNav = document.getElementById('categoryNav');
const serviceGrid = document.getElementById('serviceGrid');
const searchInput = document.getElementById('searchInput');
const mapInfo = document.getElementById('mapInfo');
const mapLegend = document.getElementById('mapLegend');

const CATEGORY_VISUALS = {
  transport: { color: '#4dabff', shape: 'circle' },
  hotels: { color: '#c792ff', shape: 'square' },
  food: { color: '#ff9f43', shape: 'diamond' },
  tours: { color: '#4dd4ac', shape: 'triangle' },
  activities: { color: '#ff6b8a', shape: 'star' },
};

let activeCategory = 'all';
let allCategories = [];
let allServices = [];
let selectedServiceId = null;
let map = null;
let markerLayer = null;

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load data: ${path}`);
  return res.json();
}

function getVisual(categoryId) {
  return CATEGORY_VISUALS[categoryId] || { color: '#9eb6eb', shape: 'circle' };
}

function updateMapInfo(service) {
  if (!service) {
    mapInfo.textContent = 'No service selected.';
    return;
  }

  mapInfo.innerHTML = `
    <strong>${service.name}</strong><br/>
    📍 ${service.city}, ${service.country}<br/>
    Category: ${service.category}<br/>
    Coordinates: ${service.lat.toFixed(4)}, ${service.lng.toFixed(4)}
  `;
}

function renderLegend(categories) {
  const visibleCategories = categories.filter((category) => category.id !== 'all');
  mapLegend.innerHTML = visibleCategories.map((category) => {
    const visual = getVisual(category.id);
    const markerStyles = visual.shape === 'triangle'
      ? `border-bottom-color:${visual.color};`
      : `background:${visual.color}; border-color:${visual.color};`;

    return `
      <div class="legend-item">
        <span class="legend-pin shape-${visual.shape}" style="${markerStyles}"></span>
        <span>${category.icon} ${category.name}</span>
      </div>
    `;
  }).join('');
}

function createMap() {
  map = L.map('worldMap', {
    worldCopyJump: true,
    minZoom: 2,
  }).setView([22, 10], 2);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);
}

function createServiceIcon(service, isActive) {
  const visual = getVisual(service.category);
  const classes = `map-pin-marker shape-${visual.shape}${isActive ? ' active' : ''}`;
  const styles = visual.shape === 'triangle'
    ? `border-bottom-color:${visual.color};`
    : `background:${visual.color}; border-color:#ffffff;`;

  return L.divIcon({
    className: '',
    html: `<span class="${classes}" style="${styles}"></span>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

function renderMapPins(services) {
  markerLayer.clearLayers();

  services.forEach((service) => {
    const marker = L.marker([service.lat, service.lng], {
      icon: createServiceIcon(service, selectedServiceId === service.id),
      title: `${service.name} (${service.city}, ${service.country})`,
    });

    marker.on('click', () => {
      selectedServiceId = service.id;
      updateMapInfo(service);
      renderMapPins(services);
    });

    markerLayer.addLayer(marker);
  });
}

function focusServiceOnMap(service) {
  if (!service || !map) return;
  map.flyTo([service.lat, service.lng], Math.max(map.getZoom(), 5), {
    duration: 0.8,
  });
}

function renderCategories(categories) {
  categoryNav.innerHTML = '';
  categories.forEach((category) => {
    const button = document.createElement('button');
    button.className = `category-btn ${activeCategory === category.id ? 'active' : ''}`;
    button.textContent = `${category.icon} ${category.name}`;
    button.onclick = () => {
      activeCategory = category.id;
      renderCategories(allCategories);
      loadServices();
    };
    categoryNav.appendChild(button);
  });
}

function renderServices(services) {
  renderMapPins(services);

  const selectedServiceInView = services.find((service) => service.id === selectedServiceId);
  updateMapInfo(selectedServiceInView || null);

  if (!services.length) {
    serviceGrid.innerHTML = '<div class="empty">No services found. Try another category or search term.</div>';
    return;
  }

  serviceGrid.innerHTML = services.map((service) => `
    <article class="service-card">
      <h3>${service.name}</h3>
      <p><strong>${service.city}, ${service.country}</strong></p>
      <p>${service.description}</p>
      <p>⭐ ${service.rating} • ${service.price}</p>
      <button data-id="${service.id}">View on map</button>
    </article>
  `).join('');

  serviceGrid.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      const selected = services.find((item) => String(item.id) === button.dataset.id);
      selectedServiceId = selected.id;
      updateMapInfo(selected);
      focusServiceOnMap(selected);
      renderMapPins(services);
    });
  });
}

function loadServices() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = allServices.filter((service) => {
    const categoryMatch = activeCategory === 'all' || service.category === activeCategory;
    const searchMatch = !query
      || service.name.toLowerCase().includes(query)
      || service.city.toLowerCase().includes(query)
      || service.country.toLowerCase().includes(query)
      || service.description.toLowerCase().includes(query);
    return categoryMatch && searchMatch;
  });

  if (selectedServiceId && !filtered.some((service) => service.id === selectedServiceId)) {
    selectedServiceId = null;
  }

  renderServices(filtered);
}

async function init() {
  createMap();
  [allCategories, allServices] = await Promise.all([
    fetchJson('data/categories.json'),
    fetchJson('data/services.json'),
  ]);
  renderCategories(allCategories);
  renderLegend(allCategories);
  loadServices();
}

searchInput.addEventListener('input', loadServices);

init().catch((err) => {
  serviceGrid.innerHTML = `<div class="empty">Error loading TripPilot: ${err.message}</div>`;
});
