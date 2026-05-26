// ═══════════════════════════════════
// Firestore reference
// ═══════════════════════════════════
const db = window.db;

// ═══════════════════════════════════
// State
// ═══════════════════════════════════
let customAreas = [];
let operators = {};
let shifts = {};
let attendance = {};
let currentArea = null;
let editingOperatorId = null;
let deletingOperatorId = null;
let editingShiftId = null;
let copyingShift = null;
let selectedDate = new Date();
let calendarView = 'day';
let orariDate = new Date();
let orariView = 'day';
let centesimalMode = false;

// ═══════════════════════════════════
// Firestore save helpers
// ═══════════════════════════════════
function saveAreas() {
  db.collection('config').doc('areas').set({ data: customAreas });
}
function saveOperators() {
  db.collection('config').doc('operators').set({ data: operators });
}
function saveShifts() {
  db.collection('config').doc('shifts').set({ data: shifts });
}
function saveAttendance() {
  db.collection('config').doc('attendance').set({ data: attendance });
}

// ═══════════════════════════════════
// Firestore real-time listeners
// ═══════════════════════════════════
function refreshCurrentView() {
  // Re-render whatever the user is currently looking at
  renderCustomAreas();
  if (currentArea) {
    const activeTab = document.querySelector('.sub-tab.active');
    if (!activeTab) return;
    if (activeTab.dataset.tab === 'operatori') renderOperators();
    if (activeTab.dataset.tab === 'turni') { renderCalendar(); renderShifts(); }
    if (activeTab.dataset.tab === 'orari') { renderOrariCalendar(); renderOrari(); }
  }
}

function setSyncStatus(connected) {
  const dot = document.getElementById('syncDot');
  const label = document.getElementById('syncLabel');
  if (!dot || !label) return;
  if (connected) {
    dot.style.background = '#16a34a';
    label.textContent = 'Sincronizzato';
  } else {
    dot.style.background = '#dc2626';
    label.textContent = 'Non connesso';
  }
}

function initRealtimeSync() {
  let areasReady = false, opsReady = false, shiftsReady = false, attReady = false;

  function checkReady() {
    if (areasReady && opsReady && shiftsReady && attReady) setSyncStatus(true);
  }

  // Areas
  db.collection('config').doc('areas').onSnapshot(doc => {
    if (doc.exists && doc.data().data) {
      customAreas = doc.data().data;
    } else {
      customAreas = [];
    }
    areasReady = true; checkReady();
    refreshCurrentView();
  }, err => { console.error('Areas sync error:', err); setSyncStatus(false); });

  // Operators
  db.collection('config').doc('operators').onSnapshot(doc => {
    if (doc.exists && doc.data().data) {
      operators = doc.data().data;
    } else {
      operators = {};
    }
    opsReady = true; checkReady();
    refreshCurrentView();
  }, err => { console.error('Operators sync error:', err); setSyncStatus(false); });

  // Shifts
  db.collection('config').doc('shifts').onSnapshot(doc => {
    if (doc.exists && doc.data().data) {
      shifts = doc.data().data;
    } else {
      shifts = {};
    }
    shiftsReady = true; checkReady();
    if (currentArea) {
      const activeTab = document.querySelector('.sub-tab.active');
      if (activeTab && activeTab.dataset.tab === 'turni') {
        renderCalendar();
        renderShifts();
      }
      if (activeTab && activeTab.dataset.tab === 'orari') {
        renderOrariCalendar();
        renderOrari();
      }
    }
  });

  // Attendance
  db.collection('config').doc('attendance').onSnapshot(doc => {
    if (doc.exists && doc.data().data) {
      attendance = doc.data().data;
    } else {
      attendance = {};
    }
    attReady = true; checkReady();
    if (currentArea) {
      const activeTab = document.querySelector('.sub-tab.active');
      if (activeTab && activeTab.dataset.tab === 'orari') {
        renderOrari();
      }
    }
  }, err => { console.error('Attendance sync error:', err); setSyncStatus(false); });
}

// ═══════════════════════════════════
// Date helpers
// ═══════════════════════════════════
const DAYS = ['Domenica','Lunedi','Martedi','Mercoledi','Giovedi','Venerdi','Sabato'];
const DAYS_SHORT = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

function dateKey(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dd}`;
}

function sameDay(a, b) { return dateKey(a) === dateKey(b); }

function formatDateLabel(d, view) {
  if (view === 'day') return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (view === 'week') {
    const start = new Date(d);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return `${start.getDate()} ${MONTHS[start.getMonth()].slice(0,3)} - ${end.getDate()} ${MONTHS[end.getMonth()].slice(0,3)} ${end.getFullYear()}`;
  }
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function getWeekStart(d) {
  const s = new Date(d);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

// ═══════════════════════════════════
// DOM refs
// ═══════════════════════════════════
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

const sectionTitles = { dipendenti: 'Gestione dipendenti', prenotazioni: 'Prenotazioni' };

// ═══════════════════════════════════
// Sidebar toggle
// ═══════════════════════════════════
sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
document.addEventListener('click', (e) => {
  if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== sidebarToggle)
    sidebar.classList.remove('open');
});

// ═══════════════════════════════════
// Navigation
// ═══════════════════════════════════
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

// ═══════════════════════════════════
// Area cards
// ═══════════════════════════════════
function handleAreaClick(areaName) {
  currentArea = areaName;
  document.querySelector('.areas-grid').style.display = 'none';
  customAreasSection.style.display = 'none';
  areaDetail.style.display = '';
  areaDetailTitle.textContent = areaName;
  switchSubTab('operatori');
  renderOperators();
}

function showAreasView() {
  document.querySelector('.areas-grid').style.display = '';
  customAreasSection.style.display = '';
  areaDetail.style.display = 'none';
  currentArea = null;
}

document.querySelectorAll('.area-card:not(.area-card--add)').forEach(card => {
  card.addEventListener('click', () => handleAreaClick(card.querySelector('.area-name').textContent));
});
document.getElementById('backToAreas').addEventListener('click', showAreasView);

// ═══════════════════════════════════
// Sub-tabs
// ═══════════════════════════════════
function switchSubTab(tab) {
  document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.sub-tab[data-tab="${tab}"]`).classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
  document.getElementById(`tab-${tab}`).style.display = '';
  if (tab === 'turni') { renderCalendar(); renderShifts(); }
  if (tab === 'operatori') renderOperators();
  if (tab === 'orari') { renderOrariCalendar(); renderOrari(); }
}

document.querySelectorAll('.sub-tab').forEach(tab => {
  tab.addEventListener('click', () => switchSubTab(tab.dataset.tab));
});

// ═══════════════════════════════════
// Modal: Create area
// ═══════════════════════════════════
function openAreaModal() { modalOverlay.classList.add('visible'); setTimeout(() => modalInput.focus(), 200); }
function closeAreaModal() { modalOverlay.classList.remove('visible'); modalInput.value = ''; }

addAreaCard.addEventListener('click', openAreaModal);
document.getElementById('modalClose').addEventListener('click', closeAreaModal);
document.getElementById('modalCancel').addEventListener('click', closeAreaModal);
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeAreaModal(); });
modalInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') createArea(); });
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
  closeAreaModal();
}

function deleteArea(id) {
  customAreas = customAreas.filter(a => a.id !== id);
  saveAreas();
}

function renderCustomAreas() {
  customAreasGrid.innerHTML = '';
  if (customAreas.length === 0) {
    customAreasGrid.innerHTML = `<div class="empty-state"><svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg><p>Nessuna area creata</p></div>`;
    return;
  }
  customAreas.forEach(area => {
    const card = document.createElement('div');
    card.className = 'area-card area-card--custom';
    card.innerHTML = `<button class="area-delete" title="Elimina area"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button><div class="area-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></div><h3 class="area-name">${area.name}</h3><p class="area-desc">Area personalizzata</p>`;
    card.addEventListener('click', (e) => { if (!e.target.closest('.area-delete')) handleAreaClick(area.name); });
    card.querySelector('.area-delete').addEventListener('click', (e) => { e.stopPropagation(); deleteArea(area.id); });
    customAreasGrid.appendChild(card);
  });
}

// ═══════════════════════════════════
// Operators CRUD
// ═══════════════════════════════════
const opModalOverlay = document.getElementById('operatorModalOverlay');
const opName = document.getElementById('opName');
const opRole = document.getElementById('opRole');
const opContract = document.getElementById('opContract');
const opConfirmBtn = document.getElementById('operatorModalConfirm');

function openOperatorModal(op) {
  editingOperatorId = op ? op.id : null;
  document.getElementById('operatorModalTitle').textContent = op ? 'Modifica operatore' : 'Aggiungi nuovo operatore';
  opConfirmBtn.textContent = op ? 'Salva modifiche' : 'Conferma registrazione';
  opName.value = op ? op.name : '';
  opRole.value = op ? op.role : '';
  opContract.value = op ? op.contract : '';
  opModalOverlay.classList.add('visible');
  setTimeout(() => opName.focus(), 200);
}

function closeOperatorModal() {
  opModalOverlay.classList.remove('visible');
  opName.value = ''; opRole.value = ''; opContract.value = '';
  editingOperatorId = null;
}

document.getElementById('addOperatorBtn').addEventListener('click', () => openOperatorModal(null));
document.getElementById('operatorModalClose').addEventListener('click', closeOperatorModal);
document.getElementById('operatorModalCancel').addEventListener('click', closeOperatorModal);
opModalOverlay.addEventListener('click', (e) => { if (e.target === opModalOverlay) closeOperatorModal(); });
opConfirmBtn.addEventListener('click', saveOperator);

function saveOperator() {
  const name = opName.value.trim();
  if (!name) { opName.style.borderColor = '#dc2626'; setTimeout(() => { opName.style.borderColor = ''; }, 1500); return; }
  if (!operators[currentArea]) operators[currentArea] = [];
  if (editingOperatorId) {
    const op = operators[currentArea].find(o => o.id === editingOperatorId);
    if (op) { op.name = name; op.role = opRole.value.trim(); op.contract = opContract.value.trim(); }
  } else {
    operators[currentArea].push({ id: Date.now().toString(), name, role: opRole.value.trim(), contract: opContract.value.trim() });
  }
  saveOperators();
  closeOperatorModal();
}

// Delete confirmation
const deleteOverlay = document.getElementById('deleteConfirmOverlay');
const deleteText = document.getElementById('deleteConfirmText');

function openDeleteConfirm(op) {
  deletingOperatorId = op.id;
  deleteText.textContent = `Sei sicuro di voler eliminare l'operatore "${op.name}"?`;
  deleteOverlay.classList.add('visible');
}
function closeDeleteConfirm() { deleteOverlay.classList.remove('visible'); deletingOperatorId = null; }

document.getElementById('deleteConfirmClose').addEventListener('click', closeDeleteConfirm);
document.getElementById('deleteConfirmCancel').addEventListener('click', closeDeleteConfirm);
deleteOverlay.addEventListener('click', (e) => { if (e.target === deleteOverlay) closeDeleteConfirm(); });
document.getElementById('deleteConfirmOk').addEventListener('click', () => {
  if (deletingOperatorId && operators[currentArea]) {
    operators[currentArea] = operators[currentArea].filter(o => o.id !== deletingOperatorId);
    saveOperators();
  }
  closeDeleteConfirm();
});

function renderOperators() {
  const list = document.getElementById('operatorsList');
  const areaOps = operators[currentArea] || [];
  list.innerHTML = '';
  if (areaOps.length === 0) {
    list.innerHTML = `<div class="empty-state"><svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2"/></svg><p>Nessun operatore registrato</p></div>`;
    return;
  }
  areaOps.forEach(op => {
    const row = document.createElement('div');
    row.className = 'operator-row';
    row.innerHTML = `<div class="operator-info"><div class="operator-name">${op.name}</div><div class="operator-meta">${op.role ? `<span>${op.role}</span>` : ''}${op.role && op.contract ? ' &middot; ' : ''}${op.contract ? `<span>${op.contract}</span>` : ''}</div></div><div class="operator-actions"><button class="icon-btn edit-btn" title="Modifica"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="icon-btn icon-btn--danger delete-btn" title="Elimina"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>`;
    row.querySelector('.edit-btn').addEventListener('click', () => openOperatorModal(op));
    row.querySelector('.delete-btn').addEventListener('click', () => openDeleteConfirm(op));
    list.appendChild(row);
  });
}

// ═══════════════════════════════════
// Turni: Calendar & Views
// ═══════════════════════════════════
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    calendarView = btn.dataset.view;
    renderCalendar();
    renderShifts();
  });
});

document.getElementById('datePrev').addEventListener('click', () => {
  if (calendarView === 'day') selectedDate.setDate(selectedDate.getDate() - 1);
  else if (calendarView === 'week') selectedDate.setDate(selectedDate.getDate() - 7);
  else selectedDate.setMonth(selectedDate.getMonth() - 1);
  renderCalendar(); renderShifts();
});

document.getElementById('dateNext').addEventListener('click', () => {
  if (calendarView === 'day') selectedDate.setDate(selectedDate.getDate() + 1);
  else if (calendarView === 'week') selectedDate.setDate(selectedDate.getDate() + 7);
  else selectedDate.setMonth(selectedDate.getMonth() + 1);
  renderCalendar(); renderShifts();
});

function renderCalendar() {
  const label = document.getElementById('dateLabel');
  const area = document.getElementById('calendarArea');
  label.textContent = formatDateLabel(selectedDate, calendarView);

  if (calendarView === 'day') {
    area.innerHTML = '';
    return;
  }

  if (calendarView === 'week') {
    const ws = getWeekStart(selectedDate);
    let html = '<div class="calendar-week">';
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws);
      d.setDate(d.getDate() + i);
      const dk = dateKey(d);
      const today = sameDay(d, new Date());
      const sel = sameDay(d, selectedDate);
      const hasShifts = (shifts[currentArea] && shifts[currentArea][dk] && shifts[currentArea][dk].length > 0);
      html += `<div class="cal-day${today ? ' today' : ''}${sel ? ' selected' : ''}" data-date="${dk}"><div style="font-size:.72rem;color:inherit;opacity:.7;margin-bottom:2px">${DAYS_SHORT[(d.getDay())]}</div>${d.getDate()}${hasShifts ? '<span class="shift-dot"></span>' : ''}</div>`;
    }
    html += '</div>';
    area.innerHTML = html;
    area.querySelectorAll('.cal-day').forEach(el => {
      el.addEventListener('click', () => {
        const parts = el.dataset.date.split('-');
        selectedDate = new Date(parts[0], parts[1]-1, parts[2]);
        renderCalendar(); renderShifts();
      });
    });
    return;
  }

  // Month view
  const year = selectedDate.getFullYear(), month = selectedDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;

  let html = '<div class="calendar-month">';
  ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].forEach(d => { html += `<div class="cal-day-header">${d}</div>`; });

  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startOffset);

  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dk = dateKey(d);
    const isOther = d.getMonth() !== month;
    const today = sameDay(d, new Date());
    const sel = sameDay(d, selectedDate);
    const hasShifts = (shifts[currentArea] && shifts[currentArea][dk] && shifts[currentArea][dk].length > 0);
    html += `<div class="cal-day${isOther ? ' other-month' : ''}${today ? ' today' : ''}${sel ? ' selected' : ''}" data-date="${dk}">${d.getDate()}${hasShifts ? '<span class="shift-dot"></span>' : ''}</div>`;
  }
  html += '</div>';
  area.innerHTML = html;
  area.querySelectorAll('.cal-day').forEach(el => {
    el.addEventListener('click', () => {
      const parts = el.dataset.date.split('-');
      selectedDate = new Date(parts[0], parts[1]-1, parts[2]);
      renderCalendar(); renderShifts();
    });
  });
}

// ═══════════════════════════════════
// Turni: Shift CRUD
// ═══════════════════════════════════
const shiftModalOverlay = document.getElementById('shiftModalOverlay');
const shiftNameInput = document.getElementById('shiftName');
const shiftStartInput = document.getElementById('shiftStart');
const shiftEndInput = document.getElementById('shiftEnd');

function openShiftModal(shift) {
  editingShiftId = shift ? shift.id : null;
  document.getElementById('shiftModalTitle').textContent = shift ? 'Modifica turno' : 'Crea turno';
  document.getElementById('shiftModalConfirm').textContent = shift ? 'Salva modifiche' : 'Crea turno';
  shiftNameInput.value = shift ? shift.name : '';
  shiftStartInput.value = shift ? shift.startTime : '';
  shiftEndInput.value = shift ? shift.endTime : '';
  shiftModalOverlay.classList.add('visible');
  setTimeout(() => shiftNameInput.focus(), 200);
}

function closeShiftModal() {
  shiftModalOverlay.classList.remove('visible');
  shiftNameInput.value = ''; shiftStartInput.value = ''; shiftEndInput.value = '';
  editingShiftId = null;
}

document.getElementById('createShiftBtn').addEventListener('click', () => openShiftModal(null));
document.getElementById('shiftModalClose').addEventListener('click', closeShiftModal);
document.getElementById('shiftModalCancel').addEventListener('click', closeShiftModal);
shiftModalOverlay.addEventListener('click', (e) => { if (e.target === shiftModalOverlay) closeShiftModal(); });

document.getElementById('shiftModalConfirm').addEventListener('click', () => {
  const name = shiftNameInput.value.trim();
  if (!name) { shiftNameInput.style.borderColor = '#dc2626'; setTimeout(() => { shiftNameInput.style.borderColor = ''; }, 1500); return; }

  if (!shifts[currentArea]) shifts[currentArea] = {};
  const dk = dateKey(selectedDate);
  if (!shifts[currentArea][dk]) shifts[currentArea][dk] = [];

  if (editingShiftId) {
    const s = shifts[currentArea][dk].find(s => s.id === editingShiftId);
    if (s) { s.name = name; s.startTime = shiftStartInput.value; s.endTime = shiftEndInput.value; }
  } else {
    shifts[currentArea][dk].push({
      id: Date.now().toString(),
      name,
      startTime: shiftStartInput.value,
      endTime: shiftEndInput.value,
      assignments: []
    });
  }
  saveShifts();
  closeShiftModal();
});

function deleteShift(shiftId) {
  const dk = dateKey(selectedDate);
  if (shifts[currentArea] && shifts[currentArea][dk]) {
    shifts[currentArea][dk] = shifts[currentArea][dk].filter(s => s.id !== shiftId);
    if (shifts[currentArea][dk].length === 0) delete shifts[currentArea][dk];
    saveShifts();
  }
}

// ═══════════════════════════════════
// Turni: Copy shift
// ═══════════════════════════════════
const copyOverlay = document.getElementById('copyShiftOverlay');
document.getElementById('copyShiftClose').addEventListener('click', () => { copyOverlay.classList.remove('visible'); copyingShift = null; });
document.getElementById('copyShiftCancel').addEventListener('click', () => { copyOverlay.classList.remove('visible'); copyingShift = null; });
copyOverlay.addEventListener('click', (e) => { if (e.target === copyOverlay) { copyOverlay.classList.remove('visible'); copyingShift = null; }});

document.getElementById('copyShiftConfirm').addEventListener('click', () => {
  const targetDate = document.getElementById('copyTargetDate').value;
  if (!targetDate || !copyingShift) return;
  if (!shifts[currentArea]) shifts[currentArea] = {};
  if (!shifts[currentArea][targetDate]) shifts[currentArea][targetDate] = [];
  const copy = JSON.parse(JSON.stringify(copyingShift));
  copy.id = Date.now().toString();
  copy.assignments.forEach(a => { a.id = Date.now().toString() + Math.random().toString(36).slice(2,6); });
  shifts[currentArea][targetDate].push(copy);
  saveShifts();
  copyOverlay.classList.remove('visible'); copyingShift = null;
});

// ═══════════════════════════════════
// Turni: Render shifts
// ═══════════════════════════════════
function renderShifts() {
  const container = document.getElementById('shiftsArea');
  const dk = dateKey(selectedDate);
  const dayShifts = (shifts[currentArea] && shifts[currentArea][dk]) || [];

  if (dayShifts.length === 0) {
    container.innerHTML = `<div class="turni-empty"><svg class="turni-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p>Nessun turno per questa giornata</p></div>`;
    return;
  }

  container.innerHTML = '';
  const now = new Date();
  const areaOps = operators[currentArea] || [];

  dayShifts.forEach(shift => {
    const card = document.createElement('div');
    card.className = 'shift-card';

    // Determine status
    let isActive = false;
    if (shift.startTime && sameDay(selectedDate, now)) {
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const startMins = parseInt(shift.startTime.split(':')[0]) * 60 + parseInt(shift.startTime.split(':')[1]);
      const endMins = shift.endTime ? parseInt(shift.endTime.split(':')[0]) * 60 + parseInt(shift.endTime.split(':')[1]) : 1440;
      isActive = nowMins >= startMins && nowMins <= endMins;
    }

    // Header
    const header = document.createElement('div');
    header.className = 'shift-card-header';
    header.innerHTML = `
      <div class="shift-badge">${getShiftEmoji(shift.name)} ${shift.name}</div>
      <div class="shift-status ${isActive ? 'active' : 'inactive'}">
        <span class="status-dot ${isActive ? 'green' : 'gray'}"></span>
        ${isActive ? 'Attivo' : (shift.startTime || '') + (shift.endTime ? ' - ' + shift.endTime : '')}
      </div>`;
    card.appendChild(header);

    // Table / assignments
    if (shift.assignments.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'shift-empty-ops';
      empty.textContent = 'Nessun operatore selezionato';
      card.appendChild(empty);
    } else {
      const table = document.createElement('table');
      table.className = 'shift-table';

      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>MANSIONE</th><th>OPERATORI</th><th>INIZIO</th><th>FINE</th><th></th></tr>';
      table.appendChild(thead);

      const tbody = document.createElement('tbody');

      // Group by mansione
      const groups = {};
      shift.assignments.forEach(a => {
        if (!groups[a.mansione || 'Altro']) groups[a.mansione || 'Altro'] = [];
        groups[a.mansione || 'Altro'].push(a);
      });

      Object.entries(groups).forEach(([mansione, assigns]) => {
        assigns.forEach((a, idx) => {
          const tr = document.createElement('tr');
          const opData = areaOps.find(o => o.id === a.operatorId);
          const opDisplayName = opData ? opData.name : '(rimosso)';

          let isWorking = false;
          if (isActive && a.inizio) {
            const nowMins = now.getHours() * 60 + now.getMinutes();
            const aStart = parseInt(a.inizio.split(':')[0]) * 60 + parseInt(a.inizio.split(':')[1]);
            const aEnd = a.fine ? parseInt(a.fine.split(':')[0]) * 60 + parseInt(a.fine.split(':')[1]) : 1440;
            isWorking = nowMins >= aStart && nowMins <= aEnd;
          }

          if (idx === 0) {
            const mansioneActive = assigns.some(as => {
              if (!isActive || !as.inizio) return false;
              const nm = now.getHours()*60+now.getMinutes();
              const s = parseInt(as.inizio.split(':')[0])*60+parseInt(as.inizio.split(':')[1]);
              const e = as.fine ? parseInt(as.fine.split(':')[0])*60+parseInt(as.fine.split(':')[1]) : 1440;
              return nm >= s && nm <= e;
            });
            tr.innerHTML += `<td class="mansione-cell" rowspan="${assigns.length}"><div class="mansione-name">${mansione}</div>${mansioneActive ? '<div class="mansione-status"><span class="status-dot green"></span> sta lavorando</div>' : ''}</td>`;
          }

          tr.innerHTML += `
            <td><div class="operator-cell"><span class="op-indicator" style="background:${isWorking ? '#16a34a' : '#d1d5db'}"></span>${opDisplayName}</div></td>
            <td class="time-cell">${a.inizio || '—'}</td>
            <td class="time-cell">${a.fine || '—'}</td>
            <td><button class="icon-btn icon-btn--danger remove-assign-btn" data-aid="${a.id}" title="Rimuovi"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></td>`;
          tbody.appendChild(tr);
        });
      });

      table.appendChild(tbody);
      card.appendChild(table);
    }

    // Footer
    const footer = document.createElement('div');
    footer.className = 'shift-card-footer';
    footer.innerHTML = `
      <button class="shift-footer-btn add-op-btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Aggiungi operatore</button>
      <button class="shift-footer-btn edit-shift-btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Modifica</button>
      <button class="shift-footer-btn copy-shift-btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copia turno</button>
      <button class="shift-footer-btn shift-footer-btn--danger del-shift-btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Elimina</button>`;

    footer.querySelector('.add-op-btn').addEventListener('click', () => openAddOperatorRow(shift, card));
    footer.querySelector('.edit-shift-btn').addEventListener('click', () => openShiftModal(shift));
    footer.querySelector('.copy-shift-btn').addEventListener('click', () => {
      copyingShift = shift;
      document.getElementById('copyTargetDate').value = '';
      copyOverlay.classList.add('visible');
    });
    footer.querySelector('.del-shift-btn').addEventListener('click', () => deleteShift(shift.id));

    card.appendChild(footer);

    // Remove assignment buttons
    card.querySelectorAll('.remove-assign-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        shift.assignments = shift.assignments.filter(a => a.id !== btn.dataset.aid);
        saveShifts();
      });
    });

    container.appendChild(card);
  });
}

function getShiftEmoji(name) {
  const n = name.toLowerCase();
  if (n.includes('pranzo') || n.includes('mattina')) return '☀️';
  if (n.includes('cena') || n.includes('sera')) return '🌙';
  if (n.includes('notte')) return '🌃';
  if (n.includes('aperitivo')) return '🍸';
  if (n.includes('brunch')) return '☕';
  return '🕒';
}

// ═══════════════════════════════════
// Turni: Add operator to shift (inline)
// ═══════════════════════════════════
function openAddOperatorRow(shift, card) {
  const existing = card.querySelector('.add-op-inline');
  if (existing) { existing.remove(); return; }

  const areaOps = operators[currentArea] || [];
  if (areaOps.length === 0) {
    alert("Nessun operatore registrato in questa area. Vai alla sezione Operatori per aggiungerne.");
    return;
  }

  const row = document.createElement('div');
  row.className = 'add-op-inline add-op-row';

  let opOptions = areaOps.map(op => `<option value="${op.id}">${op.name}${op.role ? ' — ' + op.role : ''}</option>`).join('');

  row.innerHTML = `
    <select class="inline-op-select">${opOptions}</select>
    <input type="text" class="modal-input inline-mansione" placeholder="Mansione" style="max-width:140px">
    <input type="time" class="modal-input inline-inizio" style="max-width:110px">
    <input type="time" class="modal-input inline-fine" style="max-width:110px">
    <button class="btn btn--primary inline-confirm" style="padding:7px 14px;font-size:.82rem">Aggiungi</button>
    <button class="btn btn--secondary inline-cancel" style="padding:7px 14px;font-size:.82rem">Annulla</button>`;

  const select = row.querySelector('.inline-op-select');
  const mansioneInput = row.querySelector('.inline-mansione');
  const inizioInput = row.querySelector('.inline-inizio');
  const fineInput = row.querySelector('.inline-fine');

  function autoFillMansione() {
    const op = areaOps.find(o => o.id === select.value);
    if (op && op.role) mansioneInput.value = op.role;
  }
  autoFillMansione();
  select.addEventListener('change', autoFillMansione);

  if (shift.startTime) inizioInput.value = shift.startTime;
  if (shift.endTime) fineInput.value = shift.endTime;

  row.querySelector('.inline-confirm').addEventListener('click', () => {
    const opId = select.value;
    const mansione = mansioneInput.value.trim() || 'Altro';
    shift.assignments.push({
      id: Date.now().toString() + Math.random().toString(36).slice(2,6),
      operatorId: opId,
      mansione,
      inizio: inizioInput.value,
      fine: fineInput.value
    });
    saveShifts();
  });

  row.querySelector('.inline-cancel').addEventListener('click', () => row.remove());

  const footer = card.querySelector('.shift-card-footer');
  card.insertBefore(row, footer);
}

// ═══════════════════════════════════
// Orari: View & Date navigation
// ═══════════════════════════════════
document.querySelectorAll('.orari-view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.orari-view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    orariView = btn.dataset.oview;
    renderOrariCalendar();
    renderOrari();
  });
});

document.getElementById('orariDatePrev').addEventListener('click', () => {
  if (orariView === 'day') orariDate.setDate(orariDate.getDate() - 1);
  else if (orariView === 'week') orariDate.setDate(orariDate.getDate() - 7);
  else orariDate.setMonth(orariDate.getMonth() - 1);
  renderOrariCalendar();
  renderOrari();
});

document.getElementById('orariDateNext').addEventListener('click', () => {
  if (orariView === 'day') orariDate.setDate(orariDate.getDate() + 1);
  else if (orariView === 'week') orariDate.setDate(orariDate.getDate() + 7);
  else orariDate.setMonth(orariDate.getMonth() + 1);
  renderOrariCalendar();
  renderOrari();
});

document.getElementById('centesimalToggle').addEventListener('change', (e) => {
  centesimalMode = e.target.checked;
  renderOrari();
});

// ═══════════════════════════════════
// Orari: Calendar rendering
// ═══════════════════════════════════
function renderOrariCalendar() {
  const label = document.getElementById('orariDateLabel');
  const area = document.getElementById('orariCalendarArea');
  label.textContent = formatDateLabel(orariDate, orariView);

  if (orariView === 'day') {
    area.innerHTML = '';
    return;
  }

  if (orariView === 'week') {
    const ws = getWeekStart(orariDate);
    let html = '<div class="calendar-week">';
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws);
      d.setDate(d.getDate() + i);
      const dk = dateKey(d);
      const today = sameDay(d, new Date());
      const sel = sameDay(d, orariDate);
      const hasShifts = (shifts[currentArea] && shifts[currentArea][dk] && shifts[currentArea][dk].length > 0);
      html += '<div class="cal-day' + (today ? ' today' : '') + (sel ? ' selected' : '') + '" data-date="' + dk + '"><div style="font-size:.72rem;color:inherit;opacity:.7;margin-bottom:2px">' + DAYS_SHORT[d.getDay()] + '</div>' + d.getDate() + (hasShifts ? '<span class="shift-dot"></span>' : '') + '</div>';
    }
    html += '</div>';
    area.innerHTML = html;
    area.querySelectorAll('.cal-day').forEach(el => {
      el.addEventListener('click', () => {
        const parts = el.dataset.date.split('-');
        orariDate = new Date(parts[0], parts[1] - 1, parts[2]);
        renderOrariCalendar();
        renderOrari();
      });
    });
    return;
  }

  // Month view
  const year = orariDate.getFullYear(), month = orariDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;

  let html = '<div class="calendar-month">';
  ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].forEach(d => { html += '<div class="cal-day-header">' + d + '</div>'; });

  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startOffset);

  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const dk = dateKey(d);
    const isOther = d.getMonth() !== month;
    const today = sameDay(d, new Date());
    const sel = sameDay(d, orariDate);
    const hasShifts = (shifts[currentArea] && shifts[currentArea][dk] && shifts[currentArea][dk].length > 0);
    html += '<div class="cal-day' + (isOther ? ' other-month' : '') + (today ? ' today' : '') + (sel ? ' selected' : '') + '" data-date="' + dk + '">' + d.getDate() + (hasShifts ? '<span class="shift-dot"></span>' : '') + '</div>';
  }
  html += '</div>';
  area.innerHTML = html;
  area.querySelectorAll('.cal-day').forEach(el => {
    el.addEventListener('click', () => {
      const parts = el.dataset.date.split('-');
      orariDate = new Date(parts[0], parts[1] - 1, parts[2]);
      renderOrariCalendar();
      renderOrari();
    });
  });
}

// ═══════════════════════════════════
// Orari: Hours calculation
// ═══════════════════════════════════
function calcHours(inizio, fine) {
  if (!inizio || !fine) return null;
  const sp = inizio.split(':'), ep = fine.split(':');
  let startMins = parseInt(sp[0]) * 60 + parseInt(sp[1]);
  let endMins = parseInt(ep[0]) * 60 + parseInt(ep[1]);
  if (endMins <= startMins) endMins += 1440; // overnight shift
  const diffMins = endMins - startMins;
  return diffMins;
}

function formatHours(totalMins, centesimal) {
  if (totalMins === null) return '--:--';
  if (centesimal) {
    return (totalMins / 60).toFixed(2);
  }
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h + 'h ' + String(m).padStart(2, '0') + 'm';
}

// ═══════════════════════════════════
// Orari: Render attendance table
// ═══════════════════════════════════
function renderOrari() {
  const container = document.getElementById('orariTableArea');
  const dk = dateKey(orariDate);
  const dayShifts = (shifts[currentArea] && shifts[currentArea][dk]) || [];
  const areaOps = operators[currentArea] || [];

  if (dayShifts.length === 0) {
    container.innerHTML = '<div class="orari-empty"><svg class="orari-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p>Nessun turno programmato per questa giornata</p></div>';
    return;
  }

  container.innerHTML = '';

  dayShifts.forEach(shift => {
    // Only show shifts that have assigned operators
    if (!shift.assignments || shift.assignments.length === 0) return;

    const group = document.createElement('div');
    group.className = 'orari-shift-group';

    // Shift header
    const header = document.createElement('div');
    header.className = 'orari-shift-header';
    const timeLabel = (shift.startTime || '') + (shift.endTime ? ' - ' + shift.endTime : '');
    header.innerHTML = '<span class="orari-shift-badge">' + getShiftEmoji(shift.name) + ' ' + shift.name + '</span>' + (timeLabel ? '<span class="orari-shift-time">' + timeLabel + '</span>' : '');
    group.appendChild(header);

    // Table
    const table = document.createElement('table');
    table.className = 'attendance-table';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Operatore</th><th>Orario inizio</th><th>Orario fine</th><th>Ore lavorate</th><th>Mansione</th></tr>';
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    shift.assignments.forEach(assign => {
      const opData = areaOps.find(o => o.id === assign.operatorId);
      const opName = opData ? opData.name : '(rimosso)';
      const attKey = shift.id + '_' + assign.id;

      // Read stored attendance or default empty
      const areaAtt = attendance[currentArea] || {};
      const dayAtt = areaAtt[dk] || {};
      const record = dayAtt[attKey] || { inizio: '', fine: '' };

      const totalMins = calcHours(record.inizio, record.fine);
      const hoursText = formatHours(totalMins, centesimalMode);
      const hoursClass = totalMins === null ? 'attendance-hours empty' : 'attendance-hours';

      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td><div class="attendance-op-name"><span class="op-indicator"></span>' + opName + '</div></td>' +
        '<td><input type="time" class="attendance-time-input" data-field="inizio" data-shift="' + shift.id + '" data-assign="' + assign.id + '" value="' + record.inizio + '"></td>' +
        '<td><input type="time" class="attendance-time-input" data-field="fine" data-shift="' + shift.id + '" data-assign="' + assign.id + '" value="' + record.fine + '"></td>' +
        '<td><span class="' + hoursClass + '">' + hoursText + '</span></td>' +
        '<td><span class="attendance-mansione">' + (assign.mansione || '--') + '</span></td>';

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    group.appendChild(table);
    container.appendChild(group);
  });

  // If no shifts had assignments, show empty
  if (container.innerHTML === '') {
    container.innerHTML = '<div class="orari-empty"><svg class="orari-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p>Nessun operatore assegnato ai turni di oggi</p></div>';
    return;
  }

  // Attach event listeners to time inputs
  container.querySelectorAll('.attendance-time-input').forEach(input => {
    input.addEventListener('change', () => {
      const shiftId = input.dataset.shift;
      const assignId = input.dataset.assign;
      const field = input.dataset.field;
      const attKey = shiftId + '_' + assignId;

      if (!attendance[currentArea]) attendance[currentArea] = {};
      if (!attendance[currentArea][dk]) attendance[currentArea][dk] = {};
      if (!attendance[currentArea][dk][attKey]) attendance[currentArea][dk][attKey] = { inizio: '', fine: '' };

      attendance[currentArea][dk][attKey][field] = input.value;

      // Update hours display in the same row
      const row = input.closest('tr');
      const rec = attendance[currentArea][dk][attKey];
      const mins = calcHours(rec.inizio, rec.fine);
      const hoursSpan = row.querySelector('.attendance-hours');
      if (hoursSpan) {
        hoursSpan.textContent = formatHours(mins, centesimalMode);
        hoursSpan.className = mins === null ? 'attendance-hours empty' : 'attendance-hours';
      }

      saveAttendance();
    });
  });
}

// ═══════════════════════════════════
// Global Escape
// ═══════════════════════════════════
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAreaModal();
    closeOperatorModal();
    closeDeleteConfirm();
    closeShiftModal();
    copyOverlay.classList.remove('visible');
    copyingShift = null;
  }
});

// ═══════════════════════════════════
// Initialize: start Firestore listeners
// ═══════════════════════════════════
initRealtimeSync();
