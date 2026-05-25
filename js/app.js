const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const topbarTitle = document.getElementById('topbarTitle');
const modalOverlay = document.getElementById('modalOverlay');
const modalInput = document.getElementById('areaNameInput');
const areasGrid = document.getElementById('areasGrid');
const customAreasGrid = document.getElementById('customAreasGrid');
const customAreasSection = document.getElementById('customAreasSection');
const emptyState = document.getElementById('emptyState');
const areaDetail = document.getElementById('areaDetail');
const areaDetailTitle = document.getElementById('areaDetailTitle');
const addAreaCard = document.getElementById('addAreaCard');

const sectionTitles = {
  dipendenti: 'Gestione dipendenti',
  prenotazioni: 'Prenotazioni'
};

let customAreas = JSON.parse(localStorage.getItem('ristorg_areas') || '[]');

function saveAreas() {
  localStorage.setItem('ristorg_areas', JSON.stringify(customAreas));
}

// ── Sidebar toggle (mobile)
sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

document.addEventListener('click', (e) => {
  if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== sidebarToggle) {
    sidebar.classList.remove('open');
  }
});

// ── Navigation
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.dataset.section;

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');

    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    document.getElementById(`section-${section}`).style.display = '';

    topbarTitle.textContent = sectionTitles[section];

    showAreasView();

    sidebar.classList.remove('open');
  });
});

// ── Area cards click → detail view
function handleAreaClick(areaName) {
  document.querySelector('.areas-grid').style.display = 'none';
  customAreasSection.style.display = 'none';
  areaDetail.style.display = '';
  areaDetailTitle.textContent = areaName;
}

function showAreasView() {
  document.querySelector('.areas-grid').style.display = '';
  customAreasSection.style.display = '';
  areaDetail.style.display = 'none';
}

document.querySelectorAll('.area-card:not(.area-card--add)').forEach(card => {
  card.addEventListener('click', () => {
    handleAreaClick(card.querySelector('.area-name').textContent);
  });
});

document.getElementById('backToAreas').addEventListener('click', showAreasView);

// ── Modal
function openModal() {
  modalOverlay.classList.add('visible');
  setTimeout(() => modalInput.focus(), 200);
}

function closeModal() {
  modalOverlay.classList.remove('visible');
  modalInput.value = '';
}

addAreaCard.addEventListener('click', openModal);
document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalCancel').addEventListener('click', closeModal);

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

modalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createArea();
});

document.getElementById('modalConfirm').addEventListener('click', createArea);

// ── Create / Delete custom areas
function createArea() {
  const name = modalInput.value.trim();
  if (!name) return;

  if (customAreas.some(a => a.name.toLowerCase() === name.toLowerCase())) {
    modalInput.style.borderColor = '#dc2626';
    setTimeout(() => { modalInput.style.borderColor = ''; }, 1500);
    return;
  }

  customAreas.push({ name, id: Date.now().toString() });
  saveAreas();
  renderCustomAreas();
  closeModal();
}

function deleteArea(id) {
  customAreas = customAreas.filter(a => a.id !== id);
  saveAreas();
  renderCustomAreas();
}

function renderCustomAreas() {
  customAreasGrid.innerHTML = '';

  if (customAreas.length === 0) {
    customAreasGrid.innerHTML = `
      <div class="empty-state" id="emptyState">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
        <p>Nessuna area creata</p>
      </div>`;
    return;
  }

  customAreas.forEach(area => {
    const card = document.createElement('div');
    card.className = 'area-card area-card--custom';
    card.innerHTML = `
      <button class="area-delete" data-id="${area.id}" title="Elimina area">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <div class="area-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <line x1="12" y1="8" x2="12" y2="16"/>
          <line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      </div>
      <h3 class="area-name">${area.name}</h3>
      <p class="area-desc">Area personalizzata</p>`;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.area-delete')) return;
      handleAreaClick(area.name);
    });

    card.querySelector('.area-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteArea(area.id);
    });

    customAreasGrid.appendChild(card);
  });
}

renderCustomAreas();
