// ═══════════════════════════════════
// Firestore reference
// ═══════════════════════════════════
const db = window.db;

// ═══════════════════════════════════
// Time picker helpers (dual select: 00-23 hours, 00/15/30/45 minutes)
// ═══════════════════════════════════
function _tpInner(value) {
  var parts = value ? value.split(':') : ['', ''];
  var selH = parts[0] || '', selM = parts[1] || '';
  var hoursOpts = '<option value="">--</option>';
  for (var i = 0; i < 24; i++) {
    var v = String(i).padStart(2, '0');
    hoursOpts += '<option value="' + v + '"' + (v === selH ? ' selected' : '') + '>' + v + '</option>';
  }
  var minsOpts = '<option value="">--</option>';
  ['00','15','30','45'].forEach(function(v) {
    minsOpts += '<option value="' + v + '"' + (v === selM ? ' selected' : '') + '>' + v + '</option>';
  });
  return '<select class="tp-h">' + hoursOpts + '</select>' +
    '<span class="tp-sep">:</span>' +
    '<select class="tp-m">' + minsOpts + '</select>';
}

// Render a time picker into an existing container element
function renderTimePicker(el, value) {
  el.innerHTML = _tpInner(value || '');
}

// Read combined HH:MM value from a time-picker container
function getTimePickerValue(el) {
  var h = el.querySelector('.tp-h').value;
  var m = el.querySelector('.tp-m').value;
  if (!h || !m) return '';
  return h + ':' + m;
}

// Build inline HTML for a time-picker div (for innerHTML string construction)
function timePickerHTML(extraClass, dataAttrs, value) {
  return '<div class="time-picker' + (extraClass ? ' ' + extraClass : '') + '"' +
    (dataAttrs ? ' ' + dataAttrs : '') + '>' +
    _tpInner(value || '') + '</div>';
}

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
let pendingDeleteAction = null;
let copiedWeekData = null;
let dragState = { row: null, shiftId: null };
let overviewDate = new Date();

// ═══════════════════════════════════
// Toast notifications
// ═══════════════════════════════════
(function initToastContainer() {
  const c = document.createElement('div');
  c.className = 'toast-container';
  c.id = 'toastContainer';
  document.body.appendChild(c);
})();

function showToast(message, type) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ' toast--' + type : '');
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, 2500);
}

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
  renderDailyOverview();
  if (currentArea) {
    const activeTab = document.querySelector('.sub-tab.active');
    if (!activeTab) return;
    if (activeTab.dataset.tab === 'operatori') renderOperators();
    if (activeTab.dataset.tab === 'turni') { renderCalendar(); renderShifts(); }
    if (activeTab.dataset.tab === 'orari') { renderOrariCalendar(); renderOrari(); }
    if (activeTab.dataset.tab === 'riepilogo') { renderRiepilogoCalendar(); renderRiepilogo(); }
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
    // Always update the daily overview (visible on main page)
    renderDailyOverview();
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
const areasGrid = document.getElementById('areasGrid');
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
  document.getElementById('areasContainer').style.display = 'none';
  document.getElementById('dailyOverview').style.display = 'none';
  areaDetail.style.display = '';
  areaDetailTitle.textContent = areaName;
  switchSubTab('operatori');
  renderOperators();
}

function showAreasView() {
  document.getElementById('areasContainer').style.display = '';
  document.getElementById('dailyOverview').style.display = '';
  areaDetail.style.display = 'none';
  currentArea = null;
  // Reset overview to today
  overviewDate = new Date();
  renderDailyOverview();
}

document.querySelectorAll('.area-card:not(.area-card--add):not(.area-card--custom)').forEach(card => {
  card.addEventListener('click', (e) => {
    if (e.target.closest('.area-drag-handle')) return;
    handleAreaClick(card.querySelector('.area-name').textContent);
  });
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
  if (tab === 'riepilogo') { renderRiepilogoCalendar(); renderRiepilogo(); }
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
  // Remove old custom cards
  areasGrid.querySelectorAll('.area-card--custom').forEach(el => el.remove());
  const addBtn = document.getElementById('addAreaCard');

  customAreas.forEach(area => {
    const card = document.createElement('div');
    card.className = 'area-card area-card--custom';
    card.draggable = true;
    card.innerHTML = '<span class="area-drag-handle" title="Trascina per riordinare">⠿</span>' +
      '<button class="area-delete" title="Elimina area"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
      '<div class="area-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></div>' +
      '<h3 class="area-name">' + area.name + '</h3><p class="area-desc">Gestisci il personale dell\'area ' + area.name.toLowerCase() + '</p>';
    card.addEventListener('click', (e) => {
      if (e.target.closest('.area-delete') || e.target.closest('.area-drag-handle')) return;
      handleAreaClick(area.name);
    });
    card.querySelector('.area-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      openGenericDeleteConfirm('Sei sicuro di voler eliminare l\'area "' + area.name + '"?', () => deleteArea(area.id));
    });
    areasGrid.insertBefore(card, addBtn);
  });

  initAreaDragAndDrop();
}

// Drag and drop for all area cards — event delegation (set up once)
var areaDragSrc = null;
areasGrid.addEventListener('dragstart', function(e) {
  var card = e.target.closest('.area-card:not(.area-card--add)');
  if (!card) return;
  areaDragSrc = card;
  card.classList.add('card-dragging');
  e.dataTransfer.effectAllowed = 'move';
});
areasGrid.addEventListener('dragend', function(e) {
  var card = e.target.closest('.area-card');
  if (card) card.classList.remove('card-dragging');
  areasGrid.querySelectorAll('.card-drag-over').forEach(function(el) { el.classList.remove('card-drag-over'); });
  areaDragSrc = null;
});
areasGrid.addEventListener('dragover', function(e) {
  var card = e.target.closest('.area-card:not(.area-card--add)');
  if (!card || !areaDragSrc || areaDragSrc === card) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  areasGrid.querySelectorAll('.card-drag-over').forEach(function(el) { el.classList.remove('card-drag-over'); });
  card.classList.add('card-drag-over');
});
areasGrid.addEventListener('drop', function(e) {
  var card = e.target.closest('.area-card:not(.area-card--add)');
  if (!card) return;
  e.preventDefault();
  card.classList.remove('card-drag-over');
  if (!areaDragSrc || areaDragSrc === card) return;
  var addBtn = document.getElementById('addAreaCard');
  var allCards = Array.from(areasGrid.querySelectorAll('.area-card:not(.area-card--add)'));
  var fromIdx = allCards.indexOf(areaDragSrc);
  var toIdx = allCards.indexOf(card);
  if (fromIdx < 0 || toIdx < 0) return;
  allCards.forEach(function(c) { c.remove(); });
  var item = allCards.splice(fromIdx, 1)[0];
  allCards.splice(toIdx, 0, item);
  allCards.forEach(function(c) { areasGrid.insertBefore(c, addBtn); });
});

// Keep for backward compat (called after renderCustomAreas)
function initAreaDragAndDrop() {
  // No-op: drag is handled by event delegation above
}

// ═══════════════════════════════════
// Shift status helper
// ═══════════════════════════════════
function getShiftStatus(shift, date) {
  const now = new Date();
  const dk_ = dateKey(date);
  const todayDk = dateKey(now);

  if (!shift.startTime) {
    if (dk_ < todayDk) return { label: 'Terminato',   cls: 'ended',     dotCls: 'gray'  };
    return               { label: 'Programmato', cls: 'scheduled', dotCls: 'amber' };
  }

  const startMins = parseInt(shift.startTime.split(':')[0]) * 60 + parseInt(shift.startTime.split(':')[1]);
  const endMins   = shift.endTime
    ? parseInt(shift.endTime.split(':')[0]) * 60 + parseInt(shift.endTime.split(':')[1])
    : 1440;

  if (dk_ < todayDk) return { label: 'Terminato',   cls: 'ended',     dotCls: 'gray'  };
  if (dk_ > todayDk) return { label: 'Programmato', cls: 'scheduled', dotCls: 'amber' };

  // Today
  const nowMins = now.getHours() * 60 + now.getMinutes();
  if (nowMins >= startMins && nowMins <= endMins)
    return { label: 'In corso',    cls: 'active',    dotCls: 'green' };
  if (nowMins > endMins)
    return { label: 'Terminato',   cls: 'ended',     dotCls: 'gray'  };
  return   { label: 'Programmato', cls: 'scheduled', dotCls: 'amber' };
}

// ═══════════════════════════════════
// Daily Overview
// ═══════════════════════════════════
function renderDailyOverview() {
  const container = document.getElementById('dailyOverviewContent');
  const dateEl = document.getElementById('dailyOverviewDate');
  const overviewBox = document.getElementById('dailyOverview');
  if (!container || !dateEl) return;

  overviewBox.style.display = currentArea ? 'none' : '';

  const dk = dateKey(overviewDate);
  dateEl.textContent = DAYS[overviewDate.getDay()] + ' ' + overviewDate.getDate() + ' ' + MONTHS[overviewDate.getMonth()] + ' ' + overviewDate.getFullYear();

  // All areas: fixed + custom (includes Sicurezza)
  const allAreas = ['Staff cucina', 'Staff sala', 'Sicurezza'].concat(customAreas.map(a => a.name));

  // Group all shifts by shift name across all areas
  // shiftGroups: { shiftName: [{ areaName, shift, areaOps }] }
  const shiftGroups = {};
  const shiftGroupOrder = [];

  allAreas.forEach(areaName => {
    const areaShifts = (shifts[areaName] && shifts[areaName][dk]) || [];
    const areaOps = operators[areaName] || [];
    areaShifts.forEach(shift => {
      if (!shiftGroups[shift.name]) {
        shiftGroups[shift.name] = [];
        shiftGroupOrder.push(shift.name);
      }
      shiftGroups[shift.name].push({ areaName, shift, areaOps });
    });
  });

  container.innerHTML = '';

  if (shiftGroupOrder.length === 0) {
    container.innerHTML = '<div class="overview-empty"><p>Nessun turno programmato per questa giornata</p></div>';
    return;
  }

  const now = new Date();

  shiftGroupOrder.forEach(shiftName => {
    const entries = shiftGroups[shiftName];

    // Use first entry for the main header (emoji + status)
    const firstShift = entries[0].shift;
    const emoji = getShiftEmoji(firstShift.name, firstShift.startTime);
    const status = getShiftStatus(firstShift, overviewDate);
    const isGroupActive = status.cls === 'active';

    const card = document.createElement('div');
    card.className = 'overview-shift-card';

    // Main header: shift name + status
    const header = document.createElement('div');
    header.className = 'overview-shift-card-header';
    header.innerHTML =
      '<div class="shift-badge">' + emoji + ' ' + shiftName + '</div>' +
      '<div class="shift-status ' + status.cls + '">' +
      '<span class="status-dot ' + status.dotCls + '"></span>' +
      status.label +
      '</div>';
    card.appendChild(header);

    // One sub-section per area
    entries.forEach(({ areaName, shift, areaOps }) => {
      const timeStr = (shift.startTime || '') + (shift.endTime ? ' – ' + shift.endTime : '');
      const areaStatus = getShiftStatus(shift, overviewDate);
      const isShiftActive = areaStatus.cls === 'active';

      // Area sub-header
      const subHeader = document.createElement('div');
      subHeader.className = 'overview-area-subheader';

      const gotoBtn = document.createElement('button');
      gotoBtn.className = 'overview-goto-btn';
      gotoBtn.title = 'Vai al turno';
      gotoBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
      gotoBtn.addEventListener('click', () => {
        handleAreaClick(areaName);
        switchSubTab('turni');
        selectedDate = new Date(overviewDate);
        renderCalendar();
        renderShifts();
        setTimeout(() => {
          document.querySelectorAll('#shiftsArea .shift-card').forEach(sc => {
            const badge = sc.querySelector('.shift-badge');
            if (badge && badge.textContent.includes(shift.name)) {
              sc.scrollIntoView({ behavior: 'smooth', block: 'center' });
              sc.style.boxShadow = '0 0 0 2px var(--accent)';
              setTimeout(() => { sc.style.boxShadow = ''; }, 2000);
            }
          });
        }, 150);
      });

      subHeader.innerHTML =
        '<span class="overview-area-label">' + areaName + '</span>' +
        (timeStr ? '<span class="overview-area-time">' + timeStr + '</span>' : '');
      subHeader.appendChild(gotoBtn);
      card.appendChild(subHeader);

      // Table
      if (shift.assignments && shift.assignments.length > 0) {
        const table = document.createElement('table');
        table.className = 'overview-table overview-table--compact';

        const thead = document.createElement('thead');
        thead.innerHTML = '<tr><th>Mansione</th><th>Operatori</th><th>Inizio</th><th>Fine</th></tr>';
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        shift.assignments.forEach(a => {
          const opData = areaOps.find(o => o.id === a.operatorId);
          const opName = opData ? opData.name : '(rimosso)';
          let isOpActive = false;
          if (isShiftActive && a.inizio) {
            const nowMins = now.getHours() * 60 + now.getMinutes();
            const aStart = parseInt(a.inizio.split(':')[0]) * 60 + parseInt(a.inizio.split(':')[1]);
            const aEnd = a.fine ? parseInt(a.fine.split(':')[0]) * 60 + parseInt(a.fine.split(':')[1]) : 1440;
            isOpActive = nowMins >= aStart && nowMins <= aEnd;
          }
          const tr = document.createElement('tr');
          tr.innerHTML =
            '<td class="mansione-cell"><div class="mansione-name">' + (a.mansione || 'Altro') + '</div></td>' +
            '<td><div class="operator-cell"><span class="op-indicator" style="background:' + (isOpActive ? '#16a34a' : '#d1d5db') + '"></span>' + opName + '</div></td>' +
            '<td class="time-cell">' + (a.inizio || '--') + '</td>' +
            '<td class="time-cell">' + (a.fine || '--') + '</td>';
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        card.appendChild(table);
      } else {
        const empty = document.createElement('div');
        empty.className = 'shift-empty-ops shift-empty-ops--compact';
        empty.textContent = 'Nessun operatore assegnato';
        card.appendChild(empty);
      }
    });

    container.appendChild(card);
  });
}

// Overview date navigation
document.getElementById('overviewPrev').addEventListener('click', () => {
  overviewDate.setDate(overviewDate.getDate() - 1);
  renderDailyOverview();
});
document.getElementById('overviewNext').addEventListener('click', () => {
  overviewDate.setDate(overviewDate.getDate() + 1);
  renderDailyOverview();
});

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
  showToast(editingOperatorId ? 'Operatore aggiornato' : 'Operatore aggiunto', 'success');
}

// Delete confirmation
const deleteOverlay = document.getElementById('deleteConfirmOverlay');
const deleteText = document.getElementById('deleteConfirmText');

function openDeleteConfirm(op) {
  deletingOperatorId = op.id;
  pendingDeleteAction = null;
  deleteText.textContent = "Sei sicuro di voler eliminare l'operatore \"" + op.name + "\"?";
  deleteOverlay.classList.add('visible');
}
function openGenericDeleteConfirm(text, action) {
  deletingOperatorId = null;
  pendingDeleteAction = action;
  deleteText.textContent = text;
  deleteOverlay.classList.add('visible');
}
function closeDeleteConfirm() { deleteOverlay.classList.remove('visible'); deletingOperatorId = null; pendingDeleteAction = null; }

document.getElementById('deleteConfirmClose').addEventListener('click', closeDeleteConfirm);
document.getElementById('deleteConfirmCancel').addEventListener('click', closeDeleteConfirm);
deleteOverlay.addEventListener('click', (e) => { if (e.target === deleteOverlay) closeDeleteConfirm(); });
document.getElementById('deleteConfirmOk').addEventListener('click', () => {
  if (pendingDeleteAction) {
    pendingDeleteAction();
    showToast('Eliminato con successo', 'danger');
  } else if (deletingOperatorId && operators[currentArea]) {
    operators[currentArea] = operators[currentArea].filter(o => o.id !== deletingOperatorId);
    saveOperators();
    showToast('Operatore eliminato', 'danger');
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
  renderTimePicker(shiftStartInput, shift ? shift.startTime : '');
  renderTimePicker(shiftEndInput, shift ? shift.endTime : '');
  shiftModalOverlay.classList.add('visible');
  setTimeout(() => shiftNameInput.focus(), 200);
}

function closeShiftModal() {
  shiftModalOverlay.classList.remove('visible');
  shiftNameInput.value = ''; renderTimePicker(shiftStartInput, ''); renderTimePicker(shiftEndInput, '');
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
    if (s) { s.name = name; s.startTime = getTimePickerValue(shiftStartInput); s.endTime = getTimePickerValue(shiftEndInput); }
  } else {
    shifts[currentArea][dk].push({
      id: Date.now().toString(),
      name,
      startTime: getTimePickerValue(shiftStartInput),
      endTime: getTimePickerValue(shiftEndInput),
      assignments: []
    });
  }
  saveShifts();
  closeShiftModal();
  showToast(editingShiftId ? 'Turno aggiornato' : 'Turno creato', 'success');
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
  const startDate = document.getElementById('copyStartDate').value;
  const endDate = document.getElementById('copyEndDate').value;
  if (!startDate || !copyingShift) return;
  if (!shifts[currentArea]) shifts[currentArea] = {};

  // Build list of target dates
  const dates = [];
  if (endDate && endDate >= startDate) {
    let cur = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    while (cur <= end) {
      dates.push(dateKey(cur));
      cur.setDate(cur.getDate() + 1);
    }
  } else {
    dates.push(startDate);
  }

  dates.forEach(dk => {
    if (!shifts[currentArea][dk]) shifts[currentArea][dk] = [];
    const copy = JSON.parse(JSON.stringify(copyingShift));
    copy.id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
    copy.assignments.forEach(a => { a.id = Date.now().toString() + Math.random().toString(36).slice(2, 6); });
    shifts[currentArea][dk].push(copy);
  });

  saveShifts();
  copyOverlay.classList.remove('visible'); copyingShift = null;
  showToast('Turno copiato su ' + dates.length + (dates.length === 1 ? ' giorno' : ' giorni'), 'success');
});

// ═══════════════════════════════════
// Turni: Render shifts
// ═══════════════════════════════════
function renderShifts() {
  const container = document.getElementById('shiftsArea');
  const dk = dateKey(selectedDate);
  const dayShifts = (shifts[currentArea] && shifts[currentArea][dk]) || [];

  // Render week actions if in week view
  renderWeekActions();

  if (dayShifts.length === 0) {
    container.innerHTML = '<div class="turni-empty"><svg class="turni-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><p>Nessun turno per questa giornata</p></div>';
    return;
  }

  container.innerHTML = '';
  const now = new Date();
  const areaOps = operators[currentArea] || [];

  dayShifts.forEach(shift => {
    const card = document.createElement('div');
    card.className = 'shift-card';

    // Determine status
    const status = getShiftStatus(shift, selectedDate);
    const isActive = status.cls === 'active';

    // Header
    const header = document.createElement('div');
    header.className = 'shift-card-header';
    header.innerHTML =
      '<div class="shift-badge">' + getShiftEmoji(shift.name, shift.startTime) + ' ' + shift.name + '</div>' +
      '<div class="shift-status ' + status.cls + '">' +
      '<span class="status-dot ' + status.dotCls + '"></span>' +
      status.label +
      '</div>';
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
      thead.innerHTML = '<tr><th></th><th>MANSIONE</th><th>OPERATORI</th><th>INIZIO</th><th>FINE</th><th></th></tr>';
      table.appendChild(thead);

      const tbody = document.createElement('tbody');

      shift.assignments.forEach((a, idx) => {
        const tr = document.createElement('tr');
        tr.draggable = true;
        tr.dataset.assignIdx = idx;
        tr.dataset.shiftId = shift.id;

        const opData = areaOps.find(o => o.id === a.operatorId);
        const opDisplayName = opData ? opData.name : '(rimosso)';

        let isWorking = false;
        if (isActive && a.inizio) {
          const nowMins = now.getHours() * 60 + now.getMinutes();
          const aStart = parseInt(a.inizio.split(':')[0]) * 60 + parseInt(a.inizio.split(':')[1]);
          const aEnd = a.fine ? parseInt(a.fine.split(':')[0]) * 60 + parseInt(a.fine.split(':')[1]) : 1440;
          isWorking = nowMins >= aStart && nowMins <= aEnd;
        }

        tr.innerHTML =
          '<td class="drag-handle-cell" title="Trascina per riordinare">⠿</td>' +
          '<td class="mansione-cell"><div class="mansione-name">' + (a.mansione || 'Altro') + '</div></td>' +
          '<td><div class="operator-cell"><span class="op-indicator" style="background:' + (isWorking ? '#16a34a' : '#d1d5db') + '"></span>' + opDisplayName + '</div></td>' +
          '<td class="time-cell">' + timePickerHTML('shift-time-edit', 'data-assign-id="' + a.id + '" data-field="inizio"', a.inizio || '') + '</td>' +
          '<td class="time-cell">' + timePickerHTML('shift-time-edit', 'data-assign-id="' + a.id + '" data-field="fine"', a.fine || '') + '</td>' +
          '<td><button class="icon-btn icon-btn--danger remove-assign-btn" data-aid="' + a.id + '" title="Rimuovi"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></td>';

        // Drag events
        tr.addEventListener('dragstart', (e) => {
          dragState.row = tr;
          dragState.shiftId = shift.id;
          tr.classList.add('row-dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        tr.addEventListener('dragend', () => {
          tr.classList.remove('row-dragging');
          tbody.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
          dragState.row = null;
          dragState.shiftId = null;
        });
        tr.addEventListener('dragover', (e) => {
          if (dragState.shiftId !== shift.id) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          tbody.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
          tr.classList.add('drag-over');
        });
        tr.addEventListener('drop', (e) => {
          e.preventDefault();
          tr.classList.remove('drag-over');
          if (!dragState.row || dragState.shiftId !== shift.id) return;
          const fromIdx = parseInt(dragState.row.dataset.assignIdx);
          const toIdx = parseInt(tr.dataset.assignIdx);
          if (fromIdx === toIdx) return;
          const item = shift.assignments.splice(fromIdx, 1)[0];
          shift.assignments.splice(toIdx, 0, item);
          saveShifts();
        });

        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      card.appendChild(table);
    }

    // Footer
    const footer = document.createElement('div');
    footer.className = 'shift-card-footer';
    footer.innerHTML =
      '<button class="shift-footer-btn add-op-btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Aggiungi operatore</button>' +
      '<button class="shift-footer-btn edit-shift-btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Modifica</button>' +
      '<button class="shift-footer-btn copy-shift-btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copia turno</button>' +
      '<button class="shift-footer-btn shift-footer-btn--danger del-shift-btn"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Elimina</button>';

    footer.querySelector('.add-op-btn').addEventListener('click', () => openAddOperatorRow(shift, card));
    footer.querySelector('.edit-shift-btn').addEventListener('click', () => openShiftModal(shift));
    footer.querySelector('.copy-shift-btn').addEventListener('click', () => {
      copyingShift = shift;
      document.getElementById('copyStartDate').value = '';
      document.getElementById('copyEndDate').value = '';
      copyOverlay.classList.add('visible');
    });
    footer.querySelector('.del-shift-btn').addEventListener('click', () => {
      openGenericDeleteConfirm('Sei sicuro di voler eliminare il turno "' + shift.name + '"?', () => deleteShift(shift.id));
    });

    card.appendChild(footer);

    // Remove assignment buttons (with confirmation)
    card.querySelectorAll('.remove-assign-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const aid = btn.dataset.aid;
        const assign = shift.assignments.find(a => a.id === aid);
        const areaOps = operators[currentArea] || [];
        const op = areaOps.find(o => o.id === (assign ? assign.operatorId : ''));
        const opName = op ? op.name : (assign ? assign.operatorId : 'operatore');
        openGenericDeleteConfirm(
          'Sei sicuro di voler rimuovere "' + opName + '" dal turno "' + shift.name + '"?',
          () => {
            shift.assignments = shift.assignments.filter(a => a.id !== aid);
            saveShifts();
          }
        );
      });
    });

    // Editable time pickers for operator assignments
    card.querySelectorAll('.shift-time-edit').forEach(picker => {
      picker.querySelectorAll('select').forEach(sel => {
        sel.addEventListener('change', () => {
          const assignId = picker.dataset.assignId;
          const field = picker.dataset.field;
          const assign = shift.assignments.find(a => a.id === assignId);
          if (assign) {
            assign[field] = getTimePickerValue(picker);
            saveShifts();
          }
        });
      });
    });

    container.appendChild(card);
  });
}

function getShiftEmoji(name, startTime) {
  const n = name.toLowerCase();
  // Name-based detection
  if (n.includes('colazione')) return '☕';
  if (n.includes('brunch')) return '☕';
  if (n.includes('pranzo') || n.includes('mattina')) return '☀️';
  if (n.includes('aperitivo')) return '🍹';
  if (n.includes('cena')) return '🌙';
  if (n.includes('serata') || n.includes('discoteca') || n.includes('afterparty') || n.includes('after party')) return '🍸';
  if (n.includes('notte')) return '🌃';
  // Time-based fallback
  if (startTime) {
    const parts = startTime.split(':');
    const mins = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    if (mins >= 360 && mins < 690) return '☕';       // 06:00-11:29 colazione
    if (mins >= 690 && mins < 930) return '☀️';  // 11:30-15:29 pranzo
    if (mins >= 930 && mins < 1140) return '🍹';      // 15:30-18:59 aperitivo
    if (mins >= 1140 && mins < 1260) return '🌙';     // 19:00-20:59 cena
    if (mins >= 1260) return '🍸';                     // 21:00+ serata
    if (mins < 360) return '🍸';                       // 00:00-05:59 afterparty
  }
  return '🕒';
}

// ═══════════════════════════════════
// Turni: Add operator to shift (inline)
// ═══════════════════════════════════
function openAddOperatorRow(shift, card) {
  const existing = card.querySelector('.add-op-inline');
  if (existing) { existing.remove(); return; }

  const areaOps = operators[currentArea] || [];
  // Filter out operators already assigned to this shift
  const assignedIds = (shift.assignments || []).map(a => a.operatorId);
  const availableOps = areaOps.filter(op => !assignedIds.includes(op.id));

  if (areaOps.length === 0) {
    alert("Nessun operatore registrato in questa area. Vai alla sezione Operatori per aggiungerne.");
    return;
  }
  if (availableOps.length === 0) {
    alert("Tutti gli operatori sono già assegnati a questo turno.");
    return;
  }

  const row = document.createElement('div');
  row.className = 'add-op-inline add-op-row';

  let opOptions = availableOps.map(op => '<option value="' + op.id + '">' + op.name + (op.role ? ' — ' + op.role : '') + '</option>').join('');

  row.innerHTML = `
    <select class="inline-op-select">${opOptions}</select>
    <input type="text" class="modal-input inline-mansione" placeholder="Mansione" style="max-width:140px">
    <div class="time-picker inline-inizio"></div>
    <div class="time-picker inline-fine"></div>
    <button class="btn btn--primary inline-confirm" style="padding:7px 14px;font-size:.82rem">Aggiungi</button>
    <button class="btn btn--secondary inline-cancel" style="padding:7px 14px;font-size:.82rem">Annulla</button>`;

  const select = row.querySelector('.inline-op-select');
  const mansioneInput = row.querySelector('.inline-mansione');
  const inizioEl = row.querySelector('.inline-inizio');
  const fineEl = row.querySelector('.inline-fine');

  function autoFillMansione() {
    const op = availableOps.find(o => o.id === select.value);
    if (op && op.role) mansioneInput.value = op.role;
  }
  autoFillMansione();
  select.addEventListener('change', autoFillMansione);

  renderTimePicker(inizioEl, shift.startTime || '');
  renderTimePicker(fineEl, shift.endTime || '');

  row.querySelector('.inline-confirm').addEventListener('click', () => {
    const opId = select.value;
    const mansione = mansioneInput.value.trim() || 'Altro';
    shift.assignments.push({
      id: Date.now().toString() + Math.random().toString(36).slice(2,6),
      operatorId: opId,
      mansione,
      inizio: getTimePickerValue(inizioEl),
      fine: getTimePickerValue(fineEl)
    });
    saveShifts();
  });

  row.querySelector('.inline-cancel').addEventListener('click', () => row.remove());

  const footer = card.querySelector('.shift-card-footer');
  card.insertBefore(row, footer);
}

// ═══════════════════════════════════
// Turni: Week copy/paste
// ═══════════════════════════════════
const copyWeekOverlay = document.getElementById('copyWeekOverlay');
document.getElementById('copyWeekClose').addEventListener('click', () => copyWeekOverlay.classList.remove('visible'));
document.getElementById('copyWeekCancel').addEventListener('click', () => copyWeekOverlay.classList.remove('visible'));
copyWeekOverlay.addEventListener('click', (e) => { if (e.target === copyWeekOverlay) copyWeekOverlay.classList.remove('visible'); });

document.getElementById('copyWeekConfirm').addEventListener('click', () => {
  const targetDateVal = document.getElementById('copyWeekTarget').value;
  if (!targetDateVal || !copiedWeekData) return;
  if (!shifts[currentArea]) shifts[currentArea] = {};

  const targetStart = getWeekStart(new Date(targetDateVal + 'T00:00:00'));

  for (let i = 0; i < 7; i++) {
    const sourceShifts = copiedWeekData[i] || [];
    if (sourceShifts.length === 0) continue;
    const targetDay = new Date(targetStart);
    targetDay.setDate(targetDay.getDate() + i);
    const targetDk = dateKey(targetDay);
    if (!shifts[currentArea][targetDk]) shifts[currentArea][targetDk] = [];
    sourceShifts.forEach(s => {
      const copy = JSON.parse(JSON.stringify(s));
      copy.id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
      copy.assignments.forEach(a => { a.id = Date.now().toString() + Math.random().toString(36).slice(2, 6); });
      shifts[currentArea][targetDk].push(copy);
    });
  }

  saveShifts();
  copyWeekOverlay.classList.remove('visible');
  showToast('Settimana copiata con successo', 'success');
});

function renderWeekActions() {
  const area = document.getElementById('weekActionsArea');
  if (calendarView !== 'week') {
    area.innerHTML = '';
    return;
  }

  area.innerHTML = '<div class="week-actions">' +
    '<button class="btn btn--primary" id="copyWeekBtn">' +
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
    ' Copia settimana</button></div>';

  document.getElementById('copyWeekBtn').addEventListener('click', () => {
    const ws = getWeekStart(selectedDate);
    copiedWeekData = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws);
      d.setDate(d.getDate() + i);
      const dk = dateKey(d);
      copiedWeekData.push((shifts[currentArea] && shifts[currentArea][dk]) ? JSON.parse(JSON.stringify(shifts[currentArea][dk])) : []);
    }
    document.getElementById('copyWeekTarget').value = '';
    copyWeekOverlay.classList.add('visible');
  });
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
  if (!canOrariGoForward()) return;
  if (orariView === 'day') orariDate.setDate(orariDate.getDate() + 1);
  else if (orariView === 'week') orariDate.setDate(orariDate.getDate() + 7);
  else orariDate.setMonth(orariDate.getMonth() + 1);
  // Clamp to today if overshooting
  const today = new Date();
  if (dateKey(orariDate) > dateKey(today)) orariDate = new Date(today);
  renderOrariCalendar();
  renderOrari();
});

function canOrariGoForward() {
  const today = new Date();
  if (orariView === 'day') return dateKey(orariDate) < dateKey(today);
  if (orariView === 'week') {
    const curWeek = getWeekStart(orariDate);
    const todayWeek = getWeekStart(today);
    return dateKey(curWeek) < dateKey(todayWeek);
  }
  // month: can go forward if not already at current month
  return orariDate.getFullYear() < today.getFullYear() ||
    (orariDate.getFullYear() === today.getFullYear() && orariDate.getMonth() < today.getMonth());
}

function updateOrariNav() {
  const nextBtn = document.getElementById('orariDateNext');
  if (canOrariGoForward()) {
    nextBtn.classList.remove('disabled');
  } else {
    nextBtn.classList.add('disabled');
  }
}

// Close ore-dropdown on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.ore-dropdown').forEach(d => d.style.display = 'none');
});

// ═══════════════════════════════════
// Orari: Calendar rendering
// ═══════════════════════════════════
function renderOrariCalendar() {
  const label = document.getElementById('orariDateLabel');
  const area = document.getElementById('orariCalendarArea');
  label.textContent = formatDateLabel(orariDate, orariView);
  updateOrariNav();

  const todayKey = dateKey(new Date());

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
      const isFuture = dk > todayKey;
      const hasShifts = (shifts[currentArea] && shifts[currentArea][dk] && shifts[currentArea][dk].length > 0);
      html += '<div class="cal-day' + (today ? ' today' : '') + (sel ? ' selected' : '') + (isFuture ? ' future' : '') + '" data-date="' + dk + '">' +
        '<div style="font-size:.72rem;color:inherit;opacity:.7;margin-bottom:2px">' + DAYS_SHORT[d.getDay()] + '</div>' +
        d.getDate() + (hasShifts && !isFuture ? '<span class="shift-dot"></span>' : '') + '</div>';
    }
    html += '</div>';
    area.innerHTML = html;
    area.querySelectorAll('.cal-day:not(.future)').forEach(el => {
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
    const isFuture = dk > todayKey;
    const hasShifts = (shifts[currentArea] && shifts[currentArea][dk] && shifts[currentArea][dk].length > 0);
    html += '<div class="cal-day' + (isOther ? ' other-month' : '') + (today ? ' today' : '') + (sel ? ' selected' : '') + (isFuture ? ' future' : '') + '" data-date="' + dk + '">' +
      d.getDate() + (hasShifts && !isFuture ? '<span class="shift-dot"></span>' : '') + '</div>';
  }
  html += '</div>';
  area.innerHTML = html;
  area.querySelectorAll('.cal-day:not(.future)').forEach(el => {
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
    header.innerHTML = '<span class="orari-shift-badge">' + getShiftEmoji(shift.name, shift.startTime) + ' ' + shift.name + '</span>' + (timeLabel ? '<span class="orari-shift-time">' + timeLabel + '</span>' : '');
    group.appendChild(header);

    // Table
    const table = document.createElement('table');
    table.className = 'attendance-table';

    const thead = document.createElement('thead');
    thead.innerHTML = '<tr><th>Operatore</th><th>Orario inizio</th><th>Orario fine</th>' +
      '<th><div class="ore-header-wrap"><span>Ore lavorate</span>' +
      '<button class="ore-dropdown-btn" type="button">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</button>' +
      '<div class="ore-dropdown" style="display:none">' +
      '<div class="ore-dropdown-item' + (!centesimalMode ? ' active' : '') + '" data-mode="traditional">Ore tradizionali</div>' +
      '<div class="ore-dropdown-item' + (centesimalMode ? ' active' : '') + '" data-mode="centesimal">Ore in centesimi</div>' +
      '</div></div></th>' +
      '<th>Mansione</th></tr>';
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
        '<td>' + timePickerHTML('attendance-time-input', 'data-field="inizio" data-shift="' + shift.id + '" data-assign="' + assign.id + '"', record.inizio) + '</td>' +
        '<td>' + timePickerHTML('attendance-time-input', 'data-field="fine" data-shift="' + shift.id + '" data-assign="' + assign.id + '"', record.fine) + '</td>' +
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

  // Attach dropdown toggle for "Ore lavorate"
  container.querySelectorAll('.ore-dropdown-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Close all other dropdowns first
      document.querySelectorAll('.ore-dropdown').forEach(d => d.style.display = 'none');
      const dropdown = btn.nextElementSibling;
      dropdown.style.display = '';
    });
  });

  container.querySelectorAll('.ore-dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      centesimalMode = item.dataset.mode === 'centesimal';
      renderOrari();
    });
  });

  // Attach event listeners to time pickers
  container.querySelectorAll('.attendance-time-input').forEach(picker => {
    picker.querySelectorAll('select').forEach(sel => {
      sel.addEventListener('change', () => {
        const shiftId = picker.dataset.shift;
        const assignId = picker.dataset.assign;
        const field = picker.dataset.field;
        const attKey = shiftId + '_' + assignId;

        if (!attendance[currentArea]) attendance[currentArea] = {};
        if (!attendance[currentArea][dk]) attendance[currentArea][dk] = {};
        if (!attendance[currentArea][dk][attKey]) attendance[currentArea][dk][attKey] = { inizio: '', fine: '' };

        attendance[currentArea][dk][attKey][field] = getTimePickerValue(picker);

        // Update hours display in the same row
        const row = picker.closest('tr');
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
  });
}

// ═══════════════════════════════════
// Riepilogo ore
// ═══════════════════════════════════
let riepilogoView = 'month';
let riepilogoDate = new Date();
let riepilogoCentesimal = false;

document.querySelectorAll('.riepilogo-view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.riepilogo-view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    riepilogoView = btn.dataset.rview;
    renderRiepilogoCalendar();
    renderRiepilogo();
  });
});

document.getElementById('riepilogoPrev').addEventListener('click', () => {
  if (riepilogoView === 'day')        riepilogoDate.setDate(riepilogoDate.getDate() - 1);
  else if (riepilogoView === 'week')  riepilogoDate.setDate(riepilogoDate.getDate() - 7);
  else                                riepilogoDate.setMonth(riepilogoDate.getMonth() - 1);
  renderRiepilogoCalendar(); renderRiepilogo();
});

document.getElementById('riepilogoNext').addEventListener('click', () => {
  if (!canRiepilogoGoForward()) return;
  if (riepilogoView === 'day')        riepilogoDate.setDate(riepilogoDate.getDate() + 1);
  else if (riepilogoView === 'week')  riepilogoDate.setDate(riepilogoDate.getDate() + 7);
  else                                riepilogoDate.setMonth(riepilogoDate.getMonth() + 1);
  const today = new Date();
  if (dateKey(riepilogoDate) > dateKey(today)) riepilogoDate = new Date(today);
  renderRiepilogoCalendar(); renderRiepilogo();
});

function canRiepilogoGoForward() {
  const today = new Date();
  if (riepilogoView === 'day')   return dateKey(riepilogoDate) < dateKey(today);
  if (riepilogoView === 'week') {
    const curWeek = getWeekStart(riepilogoDate);
    const todayWeek = getWeekStart(today);
    return dateKey(curWeek) < dateKey(todayWeek);
  }
  return riepilogoDate.getFullYear() < today.getFullYear() ||
    (riepilogoDate.getFullYear() === today.getFullYear() && riepilogoDate.getMonth() < today.getMonth());
}

function updateRiepilogoNav() {
  const nextBtn = document.getElementById('riepilogoNext');
  if (nextBtn) nextBtn.classList.toggle('disabled', !canRiepilogoGoForward());
}

// Returns array of Date objects for the given period (capped at today)
function getDatesInPeriod(view, date) {
  const todayDk = dateKey(new Date());
  const dates = [];
  if (view === 'day') {
    if (dateKey(date) <= todayDk) dates.push(new Date(date));
  } else if (view === 'week') {
    const ws = getWeekStart(date);
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws);
      d.setDate(d.getDate() + i);
      if (dateKey(d) <= todayDk) dates.push(d);
    }
  } else { // month
    const year = date.getFullYear(), month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      if (dateKey(d) <= todayDk) dates.push(d);
    }
  }
  return dates;
}

function renderRiepilogoCalendar() {
  const label = document.getElementById('riepilogoLabel');
  const area  = document.getElementById('riepilogoCalendarArea');
  if (!label || !area) return;
  label.textContent = formatDateLabel(riepilogoDate, riepilogoView);
  updateRiepilogoNav();

  const todayKey = dateKey(new Date());

  if (riepilogoView === 'month') { area.innerHTML = ''; return; }

  if (riepilogoView === 'week') {
    const ws = getWeekStart(riepilogoDate);
    let html = '<div class="calendar-week">';
    for (let i = 0; i < 7; i++) {
      const d = new Date(ws); d.setDate(d.getDate() + i);
      const dk = dateKey(d);
      const isFuture = dk > todayKey;
      html += '<div class="cal-day' +
        (sameDay(d, new Date()) ? ' today' : '') +
        (sameDay(d, riepilogoDate) ? ' selected' : '') +
        (isFuture ? ' future' : '') +
        '" data-date="' + dk + '">' +
        '<div style="font-size:.72rem;color:inherit;opacity:.7;margin-bottom:2px">' + DAYS_SHORT[d.getDay()] + '</div>' +
        d.getDate() + '</div>';
    }
    html += '</div>';
    area.innerHTML = html;
    area.querySelectorAll('.cal-day:not(.future)').forEach(el => {
      el.addEventListener('click', () => {
        const p = el.dataset.date.split('-');
        riepilogoDate = new Date(p[0], p[1]-1, p[2]);
        renderRiepilogoCalendar(); renderRiepilogo();
      });
    });
    return;
  }

  // Day view — full month calendar
  const year = riepilogoDate.getFullYear(), month = riepilogoDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  let html = '<div class="calendar-month">';
  ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].forEach(d => {
    html += '<div class="cal-day-header">' + d + '</div>';
  });
  const startDate = new Date(firstDay);
  startDate.setDate(startDate.getDate() - startOffset);
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate); d.setDate(d.getDate() + i);
    const dk = dateKey(d);
    const isOther = d.getMonth() !== month;
    const isFuture = dk > todayKey;
    html += '<div class="cal-day' +
      (isOther  ? ' other-month' : '') +
      (sameDay(d, new Date()) ? ' today' : '') +
      (sameDay(d, riepilogoDate) ? ' selected' : '') +
      (isFuture ? ' future' : '') +
      '" data-date="' + dk + '">' + d.getDate() + '</div>';
  }
  html += '</div>';
  area.innerHTML = html;
  area.querySelectorAll('.cal-day:not(.future):not(.other-month)').forEach(el => {
    el.addEventListener('click', () => {
      const p = el.dataset.date.split('-');
      riepilogoDate = new Date(p[0], p[1]-1, p[2]);
      renderRiepilogoCalendar(); renderRiepilogo();
    });
  });
}

function renderRiepilogo() {
  const container = document.getElementById('riepilogoTableArea');
  if (!container) return;

  const areaOps = operators[currentArea] || [];
  if (areaOps.length === 0) {
    container.innerHTML = '<div class="orari-empty"><svg class="orari-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="4"/><path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2"/></svg><p>Nessun operatore registrato in questa area</p></div>';
    return;
  }

  // Sum attendance hours per operator for the selected period
  const opMins = {};
  areaOps.forEach(op => { opMins[op.id] = null; });

  getDatesInPeriod(riepilogoView, riepilogoDate).forEach(d => {
    const dk = dateKey(d);
    const dayAtt    = (attendance[currentArea] && attendance[currentArea][dk]) || {};
    const dayShifts = (shifts[currentArea]     && shifts[currentArea][dk])     || [];

    Object.entries(dayAtt).forEach(([attKey, rec]) => {
      const mins = calcHours(rec.inizio, rec.fine);
      if (!mins || mins <= 0) return;
      // attKey = shiftId + '_' + assignId  (neither part contains '_')
      const sepIdx  = attKey.indexOf('_');
      const shiftId = attKey.slice(0, sepIdx);
      const assignId = attKey.slice(sepIdx + 1);
      const shift = dayShifts.find(s => s.id === shiftId);
      if (!shift) return;
      const assign = shift.assignments.find(a => a.id === assignId);
      if (!assign || opMins[assign.operatorId] === undefined) return;
      opMins[assign.operatorId] = (opMins[assign.operatorId] || 0) + mins;
    });
  });

  // Build table
  const table = document.createElement('table');
  table.className = 'attendance-table riepilogo-table';

  const thead = document.createElement('thead');
  thead.innerHTML =
    '<tr>' +
    '<th>Operatore</th>' +
    '<th>Mansione</th>' +
    '<th>Contratto</th>' +
    '<th><div class="ore-header-wrap"><span>Ore totali</span>' +
    '<button class="ore-dropdown-btn" type="button">' +
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
    '</button>' +
    '<div class="ore-dropdown" style="display:none">' +
    '<div class="ore-dropdown-item' + (!riepilogoCentesimal ? ' active' : '') + '" data-rmode="traditional">Ore tradizionali</div>' +
    '<div class="ore-dropdown-item' + (riepilogoCentesimal  ? ' active' : '') + '" data-rmode="centesimal">Ore in centesimi</div>' +
    '</div></div></th>' +
    '</tr>';
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  areaOps.forEach(op => {
    const mins = opMins[op.id];
    const hoursText  = formatHours(mins, riepilogoCentesimal);
    const hoursClass = (mins !== null && mins > 0) ? 'attendance-hours' : 'attendance-hours empty';
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><div class="attendance-op-name"><span class="op-indicator" style="background:#d1d5db"></span>' + op.name + '</div></td>' +
      '<td class="riepilogo-meta">' + (op.role     || '--') + '</td>' +
      '<td class="riepilogo-meta">' + (op.contract || '--') + '</td>' +
      '<td><span class="' + hoursClass + '">' + hoursText + '</span></td>';
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.innerHTML = '';
  container.appendChild(table);

  // Dropdown toggle
  container.querySelectorAll('.ore-dropdown-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.ore-dropdown').forEach(d => d.style.display = 'none');
      btn.nextElementSibling.style.display = '';
    });
  });
  container.querySelectorAll('.ore-dropdown-item[data-rmode]').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      riepilogoCentesimal = item.dataset.rmode === 'centesimal';
      renderRiepilogo();
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
    copyWeekOverlay.classList.remove('visible');
  }
});

// ═══════════════════════════════════
// Initialize: start Firestore listeners
// ═══════════════════════════════════
initRealtimeSync();
initAreaDragAndDrop();
