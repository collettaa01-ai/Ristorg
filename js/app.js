const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const topbarTitle = document.getElementById('topbarTitle');
const modalOverlay = document.getElementById('modalOverlay');
const modalInput = document.getElementById('areaNameInput');
const customAreasGrid = document.getElementById('customAreasGrid');
const customAreasSection = document.getElementById('customAreasSection');
const areaDetail = document.getElementById('areaDetail');
const areaDetailTitle = document.getElementById('areaDetailTitle');
const addAreaCard = document.getElementById('addAreaCard');

const sectionTitles = {
  dipendenti: 'Gestione dipendenti',
  prenotazioni: 'Prenotazioni'
};

let customAreas = JSON.parse(localStorage.getItem('ristorg_areas') || '[]');
let operators = JSON.parse(localStorage.getItem('ristorg_operators') || '{}');
let currentArea = null;
let editingOperatorId = null;
let deletingOperatorId = null;

function saveAreas() {
  localStorage.setItem('ristorg_areas', JSON.stringify(customAreas));
}

function saveOperators() {
  localStorage.setItem('ristorg_operators', JSON.stringify(operators));
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
  currentArea = areaName;
  document.querySelector('.areas-grid').style.display = 'none';
  customAreasSection.style.display = 'none';
  areaDetail.style.display = '';
  areaDetailTitle.textContent = areaName;

  document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.sub-tab[data-tab="operatori"]').classList.add('active');
  document.getElementById('tab-operatori').style.display = '';
  document.getElementById('tab-orari').style.display = 'none';

  renderOperators();
}

function showAreasView() {
  document.querySelector('.areas-grid').style.display = '';
  customAreasSection.style.display = '';
  areaDetail.style.display = 'none';
  currentArea = null;
}

document.querySelectorAll('.area-card:not(.area-card--add)').forEach(card => {
  card.addEventListener('click', () => {
    handleAreaClick(card.querySelector('.area-name').textContent);
  });
});

document.getElementById('backToAreas').addEventListener('click', showAreasView);

// ── Sub-tabs (Operatori / Orari)
document.querySelectorAll('.sub-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const target = tab.dataset.tab;
    document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
    document.getElementById(`tab-${target}`).style.display = '';
  });
});

// ── Modal: Create area
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
  if (e.key === 'Escape') {
    closeModal();
    closeOperatorModal();
    closeDeleteConfirm();
  }
});

modalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createArea();
});

document.getElementById('modalConfirm').addEventListener('click', createArea);

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
      <div class="empty-state">
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

// ── Operators CRUD ──

const opModalOverlay = document.getElementById('operatorModalOverlay');
const opModalTitle = document.getElementById('operatorModalTitle');
const opName = document.getElementById('opName');
const opRole = document.getElementById('opRole');
const opContract = document.getElementById('opContract');
const opConfirmBtn = document.getElementById('operatorModalConfirm');

function openOperatorModal(op) {
  editingOperatorId = op ? op.id : null;
  opModalTitle.textContent = op ? 'Modifica operatore' : 'Aggiungi nuovo operatore';
  opConfirmBtn.textContent = op ? 'Salva modifiche' : 'Conferma registrazione';
  opName.value = op ? op.name : '';
  opRole.value = op ? op.role : '';
  opContract.value = op ? op.contract : '';
  opModalOverlay.classList.add('visible');
  setTimeout(() => opName.focus(), 200);
}

function closeOperatorModal() {
  opModalOverlay.classList.remove('visible');
  opName.value = '';
  opRole.value = '';
  opContract.value = '';
  editingOperatorId = null;
}

document.getElementById('addOperatorBtn').addEventListener('click', () => openOperatorModal(null));
document.getElementById('operatorModalClose').addEventListener('click', closeOperatorModal);
document.getElementById('operatorModalCancel').addEventListener('click', closeOperatorModal);

opModalOverlay.addEventListener('click', (e) => {
  if (e.target === opModalOverlay) closeOperatorModal();
});

opConfirmBtn.addEventListener('click', saveOperator);

function saveOperator() {
  const name = opName.value.trim();
  const role = opRole.value.trim();
  const contract = opContract.value.trim();

  if (!name) {
    opName.style.borderColor = '#dc2626';
    setTimeout(() => { opName.style.borderColor = ''; }, 1500);
    return;
  }

  if (!operators[currentArea]) operators[currentArea] = [];

  if (editingOperatorId) {
    const op = operators[currentArea].find(o => o.id === editingOperatorId);
    if (op) {
      op.name = name;
      op.role = role;
      op.contract = contract;
    }
  } else {
    operators[currentArea].push({
      id: Date.now().toString(),
      name,
      role,
      contract
    });
  }

  saveOperators();
  renderOperators();
  closeOperatorModal();
}

// ── Delete confirmation
const deleteOverlay = document.getElementById('deleteConfirmOverlay');
const deleteText = document.getElementById('deleteConfirmText');

function openDeleteConfirm(op) {
  deletingOperatorId = op.id;
  deleteText.textContent = `Sei sicuro di voler eliminare l'operatore "${op.name}"?`;
  deleteOverlay.classList.add('visible');
}

function closeDeleteConfirm() {
  deleteOverlay.classList.remove('visible');
  deletingOperatorId = null;
}

document.getElementById('deleteConfirmClose').addEventListener('click', closeDeleteConfirm);
document.getElementById('deleteConfirmCancel').addEventListener('click', closeDeleteConfirm);

deleteOverlay.addEventListener('click', (e) => {
  if (e.target === deleteOverlay) closeDeleteConfirm();
});

document.getElementById('deleteConfirmOk').addEventListener('click', () => {
  if (deletingOperatorId && operators[currentArea]) {
    operators[currentArea] = operators[currentArea].filter(o => o.id !== deletingOperatorId);
    saveOperators();
    renderOperators();
  }
  closeDeleteConfirm();
});

// ── Render operators list
function renderOperators() {
  const list = document.getElementById('operatorsList');
  const areaOps = (operators[currentArea] || []);
  list.innerHTML = '';

  if (areaOps.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="7" r="4"/>
          <path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2"/>
        </svg>
        <p>Nessun operatore registrato</p>
      </div>`;
    return;
  }

  areaOps.forEach(op => {
    const row = document.createElement('div');
    row.className = 'operator-row';
    row.innerHTML = `
      <div class="operator-info">
        <div class="operator-name">${op.name}</div>
        <div class="operator-meta">
          ${op.role ? `<span>${op.role}</span>` : ''}
          ${op.role && op.contract ? '&middot;' : ''}
          ${op.contract ? `<span>${op.contract}</span>` : ''}
        </div>
      </div>
      <div class="operator-actions">
        <button class="icon-btn edit-btn" title="Modifica">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="icon-btn icon-btn--danger delete-btn" title="Elimina">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>`;

    row.querySelector('.edit-btn').addEventListener('click', () => openOperatorModal(op));
    row.querySelector('.delete-btn').addEventListener('click', () => openDeleteConfirm(op));

    list.appendChild(row);
  });
}
