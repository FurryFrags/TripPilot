const categoryNav = document.getElementById('categoryNav');
const serviceGrid = document.getElementById('serviceGrid');
const searchInput = document.getElementById('searchInput');
const mapInfo = document.getElementById('mapInfo');

let activeCategory = 'all';
let allCategories = [];
let allServices = [];

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load data: ${path}`);
  return res.json();
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
      mapInfo.innerHTML = `
        <strong>${selected.name}</strong><br/>
        📍 ${selected.city}, ${selected.country}<br/>
        Category: ${selected.category}<br/>
        Coordinates: ${selected.lat.toFixed(4)}, ${selected.lng.toFixed(4)}
      `;
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

  renderServices(filtered);
}

async function init() {
  [allCategories, allServices] = await Promise.all([
    fetchJson('data/categories.json'),
    fetchJson('data/services.json'),
  ]);
  renderCategories(allCategories);
  loadServices();
}

searchInput.addEventListener('input', loadServices);

init().catch((err) => {
  serviceGrid.innerHTML = `<div class="empty">Error loading TripPilot: ${err.message}</div>`;
});
