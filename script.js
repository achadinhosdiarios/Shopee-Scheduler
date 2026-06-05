/* ── CONFIG & STATE ──────────────────────────────── */
const STORAGE_KEY = 'achadinhos-v5';
const AUTH_KEY = 'achadinhos-auth-v1';
const LOG_KEY = 'achadinhos-ping-log-v1';
const PALETTE = ['#f36b35','#e85d2a','#ff8a4c','#d97706','#e85c8a','#9b5de5','#3b82f6','#10b981'];
const DEFAULT = { apiUrl:'', accent:'#f36b35', density:1, radius:20, view:'table', theme:'light', page:'overview', fontScale:1, gridOpacity:.28, blur:10, surface:'solid', motion:'on', __v5:true };
const PAGE_LABELS = { overview: 'Resumo', agenda: 'Agenda', editor: 'Novo', edit: 'Editar', settings: 'Ajustes' };

let temporarySettings = {};
let currentCalendarDate = new Date();
let filterFrame = 0;
let previewFrame = 0;
let lastMediaPreviewKey = '';
let lastStatsSnapshot = '';

const S = {
  items: [], filtered: [], loading: true, fetchSeq: 0,
  writeQueue: Promise.resolve(), pendingWrites: 0,
  pingLog: (() => { try { return JSON.parse(localStorage.getItem(LOG_KEY)||'[]'); } catch { return []; } })(),
  cfg: (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
      const cfg = {...DEFAULT, ...saved};
      if (!saved.__v5) { cfg.view = 'table'; cfg.__v5 = true; }
      return cfg;
    } catch {
      return {...DEFAULT};
    }
  })()
};

/* ── ELEMENTS ────────────────────────────────────── */
const q  = (s, r=document) => r.querySelector(s);
const qq = (s, r=document) => [...r.querySelectorAll(s)];

const E = {
  connStatus: q('#connStatus'), connLabel: q('#connLabel'),
  refreshBtn: q('#refreshBtn'), agendaRefreshBtn: q('#agendaRefreshBtn'),
  themeBtn: q('#themeBtn'),
  newTopBtn: q('#newTopBtn'), heroNewBtn: q('#heroNewBtn'), heroAgendaBtn: q('#heroAgendaBtn'),
  crumbLabel: q('#crumbLabel'),
  totalCount: q('#totalCount'), pendingCount: q('#pendingCount'), postedCount: q('#postedCount'), todayCount: q('#todayCount'),
  miniTotal: q('#miniTotal'), miniPending: q('#miniPending'), miniPosted: q('#miniPosted'),
  nextItemText: q('#nextItemText'),
  upcomingList: q('#upcomingList'),
  searchInput: q('#searchInput'), 
  platformFilterWrapper: q('#platformFilterWrapper'), statusFilterWrapper: q('#statusFilterWrapper'), sortSelectWrapper: q('#sortSelectWrapper'),
  tipoWrapper: q('#tipoWrapper'), plataformaWrapper: q('#plataformaWrapper'), postadoWrapper: q('#postadoWrapper'),
  dataWrapper: q('#dataWrapper'), horaWrapper: q('#horaWrapper'),
  calendarInlineContainer: q('#calendarInlineContainer'), timeInlineContainer: q('#timeInlineContainer'),
  openFiltersBtn: q('#openFiltersBtn'), closeFiltersBtn: q('#closeFiltersBtn'), applyFiltersBtn: q('#applyFiltersBtn'), clearFiltersBtn: q('#clearFiltersBtn'), filterOverlay: q('#filterOverlay'), filterPopover: q('#filterPopover'), filterBadge: q('#filterBadge'),
  dataZone: q('#dataZone'), agendaSummary: q('#agendaSummary'),
  scheduleForm: q('#scheduleForm'), editorTitle: q('#editorTitle'),
  editorGrid: q('#editorGrid'), editorFormMount: q('#editorFormMount'), editFormMount: q('#editFormMount'),
  editTitle: q('#editTitle'), editSubtitle: q('#editSubtitle'), editContextTitle: q('#editContextTitle'), editContextMeta: q('#editContextMeta'), editContextBadge: q('#editContextBadge'),
  rowNumber: q('#rowNumber'),
  midia: q('#midia'), titulo: q('#titulo'), descricao: q('#descricao'), comentario: q('#comentario'),
  saveBtn: q('#saveBtn'), resetFormBtn: q('#resetFormBtn'), duplicateCurrentBtn: q('#duplicateCurrentBtn'),
  liveMedia: q('#liveMedia'), previewTitle: q('#previewTitle'), previewStatusTag: q('#previewStatusTag'), captionPreview: q('#captionPreview'),
  apiUrlInput: q('#apiUrlInput'), saveSettingsBtn: q('#saveSettingsBtn'), testConnectionBtn: q('#testConnectionBtn'),
  paletteButtons: q('#paletteButtons'), customColor: q('#customColor'),
  densityRange: q('#densityRange'), densityValue: q('#densityValue'),
  radiusRange: q('#radiusRange'), radiusValue: q('#radiusValue'),
  fontScaleRange: q('#fontScaleRange'), fontScaleValue: q('#fontScaleValue'),
  gridOpacityRange: q('#gridOpacityRange'), gridOpacityValue: q('#gridOpacityValue'),
  blurRange: q('#blurRange'), blurValue: q('#blurValue'),
  pingLogList: q('#pingLogList'), clearPingLogBtn: q('#clearPingLogBtn'),
  publishViewerOverlay: q('#publishViewerOverlay'), publishViewerBody: q('#publishViewerBody'), viewerCloseBtn: q('#viewerCloseBtn'),
  toastStack: q('#toastStack'),
  loginGate: q('#loginGate'), loginForm: q('#loginForm'), loginApiUrl: q('#loginApiUrl'),
  loginEmail: q('#loginEmail'), loginPassword: q('#loginPassword'), loginBtn: q('#loginBtn'),
  loginMsg: q('#loginMsg')
};

/* ── HELPER INSTANCES ────────────────────────────── */
function isToday(i) { 
  if (!i.dateValue) return false; 
  const n = new Date(); 
  const d = i.dateValue; 
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate(); 
}
const gt = i => i.dateValue?.getTime() ?? 8640000000000000;

/* ── INTERFACE COMPONENT: POP-UP SELECTION ───────── */
function initCustomSelect(wrapperEl, onSelectCallback = null) {
  if (!wrapperEl) return;
  const trigger = wrapperEl.querySelector('.custom-select-trigger');
  const optionsContainer = wrapperEl.querySelector('.custom-select-options');
  const labelSpan = trigger.querySelector('.label');

  trigger.addEventListener('click', (e) => {
    // Se o clique vier de dentro dos controles interativos de hora ou calendário, previne o fechamento indesejado
    if (e.target.closest('.time-picker-container') || e.target.closest('.calendar-container')) return;
    
    e.stopPropagation();
    qq('.custom-select-options').forEach(el => { if (el !== optionsContainer) el.classList.remove('show'); });
    qq('.custom-select-wrapper').forEach(el => { if (el !== wrapperEl) el.classList.remove('active'); });
    
    optionsContainer.classList.toggle('show');
    wrapperEl.classList.toggle('active');
  });

  optionsContainer.addEventListener('click', (e) => {
    // Ignora cliques que acontecem dentro dos containers avançados para não fechar a janela antes do set definitivo
    if (e.target.closest('.time-picker-container') || e.target.closest('.calendar-container')) return;

    const option = e.target.closest('.custom-option');
    if (!option) return;
    e.stopPropagation();

    const val = option.dataset.value !== undefined ? option.dataset.value : option.textContent;
    
    [...optionsContainer.children].forEach(c => c.classList.remove('selected'));
    option.classList.add('selected');
    labelSpan.textContent = option.textContent;
    
    wrapperEl.dataset.value = val;
    optionsContainer.classList.remove('show');
    wrapperEl.classList.remove('active');

    if (onSelectCallback) onSelectCallback(val);
  });
}

function setCustomSelectValue(wrapperEl, val) {
  if (!wrapperEl) return;
  const options = wrapperEl.querySelector('.custom-select-options');
  const labelSpan = wrapperEl.querySelector('.custom-select-trigger .label');
  
  wrapperEl.dataset.value = val;
  let targetOption = [...options.children].find(c => (c.dataset.value !== undefined ? c.dataset.value : c.textContent) === val);
  
  [...options.children].forEach(c => c.classList.remove('selected'));
  if (targetOption) {
    targetOption.classList.add('selected');
    labelSpan.textContent = targetOption.textContent;
  } else {
    if (wrapperEl.id === 'dataWrapper') {
      labelSpan.textContent = val ? val : 'dd/mm/aaaa';
    } else if (wrapperEl.id === 'horaWrapper') {
      labelSpan.textContent = val ? val : '--:--';
    } else {
      labelSpan.textContent = wrapperEl.id.includes('Filter') ? 'Todas' : 'Selecione';
    }
  }
}

function getCustomSelectValue(wrapperEl) { return wrapperEl ? (wrapperEl.dataset.value ?? '') : ''; }

/* ── INTERACTIVE CALENDAR ENGINE (dd/mm/aaaa) ────── */
function renderInteractiveCalendar() {
  const container = E.calendarInlineContainer;
  if (!container) return;

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  let html = `
    <div class="calendar-container">
      <div class="calendar-header">
        <button type="button" class="sbtn" id="calPrevMonthBtn">‹</button>
        <span>${monthNames[month]} ${year}</span>
        <button type="button" class="sbtn" id="calNextMonthBtn">›</button>
      </div>
      <div class="calendar-days-grid">
        <div class="calendar-day-label">D</div><div class="calendar-day-label">S</div>
        <div class="calendar-day-label">T</div><div class="calendar-day-label">Q</div>
        <div class="calendar-day-label">Q</div><div class="calendar-day-label">S</div>
        <div class="calendar-day-label">S</div>
  `;

  for (let i = 0; i < firstDayIndex; i++) {
    html += `<div class="calendar-cell empty"></div>`;
  }

  const selectedStr = getCustomSelectValue(E.dataWrapper);
  let selDay = 0, selMonth = -1, selYear = 0;
  if (selectedStr) {
    const parts = selectedStr.split('/');
    if (parts.length === 3) {
      selDay = +parts[0]; selMonth = +parts[1] - 1; selYear = +parts[2];
    }
  }

  for (let day = 1; day <= totalDays; day++) {
    const isSelected = (day === selDay && month === selMonth && year === selYear);
    html += `<div class="calendar-cell${isSelected ? ' selected' : ''}" data-day="${day}">${day}</div>`;
  }

  html += `</div></div>`;
  container.innerHTML = html;

  q('#calPrevMonthBtn', container).addEventListener('click', (e) => { e.stopPropagation(); currentCalendarDate.setMonth(month - 1); renderInteractiveCalendar(); });
  q('#calNextMonthBtn', container).addEventListener('click', (e) => { e.stopPropagation(); currentCalendarDate.setMonth(month + 1); renderInteractiveCalendar(); });

  qq('.calendar-cell:not(.empty)', container).forEach(cell => {
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      const d = String(cell.dataset.day).padStart(2, '0');
      const m = String(month + 1).padStart(2, '0');
      const formattedDate = `${d}/${m}/${year}`;
      
      setCustomSelectValue(E.dataWrapper, formattedDate);
      E.dataWrapper.querySelector('.custom-select-options').classList.remove('show');
      E.dataWrapper.classList.remove('active');
      updatePreview();
    });
  });
}

/* ── ENGINE SELETOR DE HORA LIBERTADOR (Sliders + Teclado Direto) ── */
function renderInteractiveTimeList() {
  const container = E.timeInlineContainer;
  if (!container) return;

  const currentSelected = getCustomSelectValue(E.horaWrapper) || "12:00";
  let [hours, minutes] = currentSelected.split(':').map(v => v === undefined ? 0 : parseInt(v, 10));
  if (isNaN(hours) || hours < 0 || hours > 23) hours = 12;
  if (isNaN(minutes) || minutes < 0 || minutes > 59) minutes = 0;

  container.innerHTML = `
    <div class="time-picker-container">
      <div class="time-picker-manual">
        <input type="text" class="time-manual-input" id="timeManualInput" value="${pad(hours)}:${pad(minutes)}" placeholder="00:00" maxlength="5" autocomplete="off">
      </div>
      <div class="time-slider-row">
        <div class="time-slider-header"><span>Horas</span><span id="sliderHoursVal">${pad(hours)}h</span></div>
        <input type="range" id="timeHoursSlider" min="0" max="23" value="${hours}" step="1">
      </div>
      <div class="time-slider-row">
        <div class="time-slider-header"><span>Minutos</span><span id="sliderMinutesVal">${pad(minutes)}m</span></div>
        <input type="range" id="timeMinutesSlider" min="0" max="59" value="${minutes}" step="1">
      </div>
    </div>
  `;

  const hSlider = q('#timeHoursSlider', container);
  const mSlider = q('#timeMinutesSlider', container);
  const manualInput = q('#timeManualInput', container);
  const hDisplay = q('#sliderHoursVal', container);
  const mDisplay = q('#sliderMinutesVal', container);

  function syncFromSliders() {
    const hh = pad(hSlider.value);
    const mm = pad(mSlider.value);
    hDisplay.textContent = `${hh}h`;
    mDisplay.textContent = `${mm}m`;
    manualInput.value = `${hh}:${mm}`;
    setCustomSelectValue(E.horaWrapper, `${hh}:${mm}`);
    updatePreview();
  }

  hSlider.addEventListener('input', syncFromSliders);
  mSlider.addEventListener('input', syncFromSliders);

  // Tratamento da máscara e digitação direta libertadora (Teclado)
  manualInput.addEventListener('input', (e) => {
    let clean = e.target.value.replace(/\D/g, '');
    if (clean.length > 4) clean = clean.slice(0, 4);
    
    if (clean.length >= 3) {
      clean = clean.slice(0, 2) + ':' + clean.slice(2);
    }
    e.target.value = clean;

    if (clean.length === 5) {
      let [hh, mm] = clean.split(':').map(Number);
      if (hh > 23) hh = 23;
      if (mm > 59) mm = 59;
      
      hSlider.value = hh;
      mSlider.value = mm;
      hDisplay.textContent = `${pad(hh)}h`;
      mDisplay.textContent = `${pad(mm)}m`;
      
      setCustomSelectValue(E.horaWrapper, `${pad(hh)}:${pad(mm)}`);
      updatePreview();
    }
  });

  manualInput.addEventListener('blur', () => {
    // Autocompleta caso o usuário saia sem preencher tudo
    const parts = manualInput.value.split(':');
    let hh = parseInt(parts[0], 10) || 0;
    let mm = parseInt(parts[1], 10) || 0;
    if (isNaN(hh) || hh > 23 || hh < 0) hh = 0;
    if (isNaN(mm) || mm > 59 || mm < 0) mm = 0;
    
    const finalTime = `${pad(hh)}:${pad(mm)}`;
    setCustomSelectValue(E.horaWrapper, finalTime);
    renderInteractiveTimeList();
    updatePreview();
  });
}


/* ── AUTH GATE ───────────────────────────────────── */
function getStoredAuth() {
  try {
    const auth = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
    const expires = auth?.expiresAt ? new Date(auth.expiresAt).getTime() : 0;
    if (auth?.token && expires > Date.now()) return auth;
  } catch {}
  localStorage.removeItem(AUTH_KEY);
  return null;
}

function isAuthenticated() { return Boolean(getStoredAuth()); }

function initAuthGate() {
  const auth = getStoredAuth();
  if (E.loginApiUrl) E.loginApiUrl.value = S.cfg.apiUrl || '';
  if (auth) {
    document.body.classList.add('is-authed');
    document.body.classList.remove('is-locked');
    setConn('', 'Sincronizando...');
  } else {
    document.body.classList.remove('is-authed');
    document.body.classList.add('is-locked');
    setConn('offline', 'Login necessário');
    renderAuthRequired();
  }
}

function setLoginMessage(message, mode = '') {
  if (!E.loginMsg) return;
  E.loginMsg.textContent = message || '';
  E.loginMsg.classList.toggle('err', mode === 'err');
  E.loginMsg.classList.toggle('ok', mode === 'ok');
}

async function handleLogin(event) {
  event?.preventDefault?.();

  const apiUrl = normalizeApiUrl(E.loginApiUrl?.value || S.cfg.apiUrl);
  const email = String(E.loginEmail?.value || '').trim().toLowerCase();
  const password = String(E.loginPassword?.value || '');

  if (!apiUrl) { setLoginMessage('Informe a URL pública do Apps Script para validar o acesso.', 'err'); return; }
  if (!email || !password) { setLoginMessage('Preencha login e senha.', 'err'); return; }

  try {
    validateAppsScriptUrl(apiUrl);
    E.loginBtn.disabled = true;
    setLoginMessage('Validando credenciais no Apps Script...');

    const passwordHash = await sha256Hex(password);
    const response = await jsonpFetch(apiUrl, { action: 'login', email, passwordHash }, 12000);

    if (!response?.authenticated) throw new Error(response?.message || 'Login ou senha incorretos.');

    const auth = {
      token: response.session?.token || `${email}:${Date.now()}`,
      email: response.user?.email || email,
      name: response.user?.name || email,
      expiresAt: response.session?.expiresAt || new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    };

    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
    saveCfg({ apiUrl }, { noPage: true });
    if (E.apiUrlInput) E.apiUrlInput.value = apiUrl;

    E.loginPassword.value = '';
    setLoginMessage('Login autorizado. Carregando painel...', 'ok');
    document.body.classList.add('is-authed');
    document.body.classList.remove('is-locked');
    toast('✦ Login autorizado', `Bem-vindo(a), ${auth.name}.`);
    goPage('overview', true);
    await fetchItems();
  } catch (err) {
    localStorage.removeItem(AUTH_KEY);
    document.body.classList.remove('is-authed');
    document.body.classList.add('is-locked');
    setConn('offline', 'Login necessário');
    setLoginMessage(err.message || 'Não foi possível validar o login.', 'err');
  } finally {
    if (E.loginBtn) E.loginBtn.disabled = false;
  }
}

function logout(showToast = true) {
  localStorage.removeItem(AUTH_KEY);
  document.body.classList.remove('is-authed');
  document.body.classList.add('is-locked');
  setConn('offline', 'Login necessário');
  S.items = []; S.filtered = [];
  renderStats(); renderOverview(); renderAuthRequired();
  if (showToast) toast('Sessão encerrada', 'Faça login novamente para liberar o painel.');
}

async function sha256Hex(text) {
  if (!window.crypto?.subtle) throw new Error('Seu navegador não oferece criptografia local para o login.');
  const bytes = new TextEncoder().encode(String(text || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}


/* ── BOOT ────────────────────────────────────────── */
temporarySettings = { ...S.cfg };
applySettings(); hydrateSettingsForm(); renderPalette();
initDropdowns(); bindEvents(); initAuthGate();
goPage('overview', true);
updatePreview(); renderPingLog(); renderFilterBadge();
if (isAuthenticated()) fetchItems();

function initDropdowns() {
  initCustomSelect(E.platformFilterWrapper, scheduleApplyFilters);
  initCustomSelect(E.statusFilterWrapper, scheduleApplyFilters);
  initCustomSelect(E.sortSelectWrapper, scheduleApplyFilters);
  
  initCustomSelect(E.tipoWrapper, updatePreview);
  initCustomSelect(E.plataformaWrapper, updatePreview);
  initCustomSelect(E.postadoWrapper, updatePreview);

  initCustomSelect(E.dataWrapper, () => { renderInteractiveCalendar(); });
  initCustomSelect(E.horaWrapper, () => { renderInteractiveTimeList(); });
  
  renderInteractiveCalendar();
  renderInteractiveTimeList();
}

document.addEventListener('click', (e) => {
  if (e.target.closest('.custom-select-options') || e.target.closest('.custom-select-trigger')) return;
  qq('.custom-select-options').forEach(el => el.classList.remove('show'));
  qq('.custom-select-wrapper').forEach(el => el.classList.remove('active'));
});

/* ── SETTINGS MANAGEMENT ─────────────────────────── */
function saveCfg(patch = {}, opts = {}) {
  Object.assign(S.cfg, patch);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(S.cfg));
  applySettings(); hydrateSettingsForm(); renderPalette();
  if (!opts.noPage && patch.page) goPage(patch.page, true);
}

function updateTemporaryVisual(patch = {}) {
  Object.assign(temporarySettings, patch);
  const { theme, accent, density, radius, fontScale, gridOpacity, blur, surface, motion } = temporarySettings;
  const root = document.documentElement;
  
  root.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  const rgb = hexToRgb(accent);
  root.style.setProperty('--a', accent);
  root.style.setProperty('--a2', lightenHex(accent, theme === 'dark' ? 26 : 34));
  root.style.setProperty('--ar', rgb.join(' '));
  root.style.setProperty('--r', `${radius}px`);
  root.style.setProperty('--r2', `${Math.max(10, radius - 6)}px`);
  root.style.setProperty('--font-scale', Number(fontScale || 1));
  root.style.setProperty('--grid-opacity', Number(gridOpacity ?? .4));
  root.style.setProperty('--blur', `blur(${Number(blur ?? 20)}px) saturate(1.3)`);
  root.dataset.surface = surface === 'solid' ? 'solid' : 'glass';
  root.dataset.motion = motion === 'reduced' ? 'reduced' : 'on';

  E.themeBtn.classList.toggle('is-dark', theme === 'dark');
  E.themeBtn.setAttribute('aria-pressed', String(theme === 'dark'));
  qq('[data-theme-option]').forEach(b => b.classList.toggle('active', b.dataset.themeOption === theme));
  qq('[data-surface-option]').forEach(b => b.classList.toggle('active', b.dataset.surfaceOption === (surface || 'glass')));
  qq('[data-motion-option]').forEach(b => b.classList.toggle('active', b.dataset.motionOption === (motion || 'on')));
}

function applySettings() {
  temporarySettings = { ...S.cfg };
  updateTemporaryVisual();
  qq('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === S.cfg.view));
  syncDock();
}

function hydrateSettingsForm() {
  E.apiUrlInput.value = S.cfg.apiUrl || '';
  E.customColor.value = normalizeColor(S.cfg.accent);
  E.densityRange.value = String(S.cfg.density);
  E.densityValue.textContent = Number(S.cfg.density).toFixed(2);
  E.radiusRange.value = String(S.cfg.radius);
  E.radiusValue.textContent = `${S.cfg.radius}px`;
  E.fontScaleRange.value = String(S.cfg.fontScale || 1);
  E.fontScaleValue.textContent = Number(S.cfg.fontScale || 1).toFixed(2);
  E.gridOpacityRange.value = String(S.cfg.gridOpacity ?? .4);
  E.gridOpacityValue.textContent = `${Math.round(Number(S.cfg.gridOpacity ?? .4) * 100)}%`;
  E.blurRange.value = String(S.cfg.blur ?? 20);
  E.blurValue.textContent = `${S.cfg.blur ?? 20}px`;
}

function renderPalette() {
  E.paletteButtons.innerHTML = PALETTE.map(c => `<div class="swatch${normalizeColor(c) === normalizeColor(temporarySettings.accent) ? ' active' : ''}" style="background:${c}" data-color="${c}" role="button" tabindex="0" aria-label="Cor ${c}"></div>`).join('');
  qq('.swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      updateTemporaryVisual({ accent: sw.dataset.color });
      renderPalette();
    });
  });
}

/* ── NAVIGATION ──────────────────────────────────── */
function goPage(page, silent = false) {
  const allowed = ['overview','agenda','editor','edit','settings'];
  const p = allowed.includes(page) ? page : 'overview';
  S.cfg.page = p;
  if (!silent) localStorage.setItem(STORAGE_KEY, JSON.stringify(S.cfg));

  qq('.page').forEach(s => s.classList.toggle('active', s.dataset.page === p));
  syncDock();
  E.crumbLabel.textContent = PAGE_LABELS[p] || 'Resumo';

  if (p === 'overview') { renderStats(); renderOverview(); }
  if (p === 'agenda') applyFilters();
  if (p === 'editor' || p === 'edit') { schedulePreviewUpdate(); setTimeout(() => E.titulo.focus(), 80); }

  const behavior = document.documentElement.dataset.motion === 'reduced' ? 'auto' : 'smooth';
  window.scrollTo({ top: 0, behavior });
}

function syncDock() {
  qq('.dock-btn').forEach(b => {
    const currentPage = S.cfg.page === 'edit' ? 'agenda' : S.cfg.page;
    const active = b.dataset.pageTarget === currentPage;
    b.classList.toggle('active', active);
    b.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

/* ── DATA FETCHING ───────────────────────────────── */
async function fetchItems(options = {}) {
  const quiet = Boolean(options?.quiet);
  if (!isAuthenticated()) {
    S.items = []; S.filtered = []; S.loading = false;
    setConn('offline', 'Login necessário');
    renderStats(); renderOverview(); renderAuthRequired();
    return;
  }
  const apiUrl = normalizeApiUrl(S.cfg.apiUrl);
  if (!apiUrl) {
    S.items = []; S.filtered = []; S.loading = false;
    setConn('offline', 'URL não configurada');
    renderStats(); renderOverview(); renderEmptyConfig();
    return;
  }

  const requestId = ++S.fetchSeq;
  try {
    S.loading = true;
    if (isActivePage('agenda')) renderLoading();
    setConn('', 'Sincronizando...');

    const data = await readRowsFromApi(apiUrl);
    if (requestId !== S.fetchSeq) return;

    const rows = Array.isArray(data) ? data : (data.data || data.rows || data.items || []);
    if (!Array.isArray(rows)) throw new Error('A resposta do Apps Script não contém uma lista de linhas.');

    S.items = rows.map(normalizeRow).filter(r => r.rowNumber);
    populatePlatformFilter();
    setConn('online', 'Online');
    renderStats();
    applyFilters();

    if (!quiet) toast('✦ Sincronizado', `${S.items.length} item(ns) carregado(s).`);
  } catch (err) {
    if (requestId !== S.fetchSeq) return;
    S.items = []; S.filtered = []; setConn('offline', 'Falha na conexão');
    renderStats(); renderOverview(); renderError(err.message || 'Não foi possível carregar.');
    toast('⚠️ Erro', err.message || 'Falha ao carregar dados.', true);
  } finally {
    if (requestId === S.fetchSeq) S.loading = false;
  }
}

async function testApiConnection(apiUrl, quiet = false) {
  const cleanUrl = normalizeApiUrl(apiUrl);
  validateAppsScriptUrl(cleanUrl);
  setConn('', 'Testando...');
  const ping = await pingApi(cleanUrl);
  if (ping && ping.status === 'error') throw new Error(ping.message || 'O Apps Script respondeu com erro.');
  setConn('online', 'Online');

  const version = ping?.version ? ` • ${ping.version}` : '';
  const rows = Number.isFinite(+ping?.lastRow) ? ` • ${Math.max(0, (+ping.lastRow) - 1)} linha(s)` : '';
  addPingLog('ok', `Ping OK${version}${rows}`, ping?.now || '');
  if (!quiet) toast('✓ Conexão OK', `Apps Script respondeu ao ping${version}${rows}.`);
  return ping;
}

async function pingApi(apiUrl) {
  const errors = [];
  try { return await jsonpFetch(apiUrl, { action: 'ping' }, 8500); } catch (err) { errors.push(`JSONP: ${err.message}`); }
  try { return await directJsonFetch(apiUrl, { action: 'ping' }, 5500); } catch (err) { errors.push(`Fetch: ${err.message}`); }
  throw new Error(explainConnectionError(errors.join(' | ')));
}

async function readRowsFromApi(apiUrl) {
  const errors = []; validateAppsScriptUrl(apiUrl);
  try { return await jsonpFetch(apiUrl, {}, 12000); } catch (err) { errors.push(`JSONP: ${err.message}`); }
  try { return await directJsonFetch(apiUrl, {}, 6500); } catch (err) { errors.push(`Fetch: ${err.message}`); }
  throw new Error(explainConnectionError(errors.join(' | ')));
}

async function directJsonFetch(url, params = {}, timeout = 6500) {
  const cleanUrl = normalizeApiUrl(url); if (!cleanUrl) throw new Error('URL vazia.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(buildApiRequestUrl(cleanUrl, { ...params, _: Date.now() }), { method: 'GET', redirect: 'follow', mode: 'cors', signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseApiPayload(text);
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('Tempo esgotado na leitura direta.');
    throw new Error(err?.message || 'Leitura direta bloqueada pelo navegador.');
  } finally { clearTimeout(timer); }
}

function parseApiPayload(text) {
  const raw = String(text || '').trim(); if (!raw) return [];
  if (/^<!doctype html/i.test(raw) || /^<html[\s>]/i.test(raw)) throw new Error('A resposta parece HTML/login do Google, não JSON.');
  try { return JSON.parse(raw); } catch {}
  const wrapped = raw.match(/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\(([\s\S]*)\);?$/);
  if (wrapped) return JSON.parse(wrapped[1]);
  throw new Error('Resposta não é um formato JSON válido.');
}

function jsonpFetch(url, params = {}, timeout = 14000) {
  return new Promise((resolve, reject) => {
    const cb = `__achadinhos_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    const cleanUrl = normalizeApiUrl(url);
    let done = false;
    const cleanup = () => { done = true; clearTimeout(timer); script.remove(); try { delete window[cb]; } catch { window[cb] = undefined; } };
    const timer = setTimeout(() => { if (done) return; cleanup(); reject(new Error('Tempo esgotado no recebimento do callback.')); }, timeout);
    window[cb] = payload => { if (done) return; cleanup(); resolve(payload); };
    script.onerror = () => { if (done) return; cleanup(); reject(new Error('Falha estrutural ao carregar elemento script de comunicação.')); };
    script.src = buildApiRequestUrl(cleanUrl, { ...params, callback: cb, _: Date.now() });
    document.head.appendChild(script);
  });
}

function buildApiRequestUrl(url, params = {}) {
  const cleanUrl = normalizeApiUrl(url);
  try {
    const u = new URL(cleanUrl);
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v)); });
    return u.toString();
  } catch {
    const query = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
    return cleanUrl + (cleanUrl.includes('?') ? '&' : '?') + query;
  }
}

function validateAppsScriptUrl(url) {
  const cleanUrl = normalizeApiUrl(url); if (!cleanUrl) throw new Error('Informe a URL pública do Web App.');
  let u; try { u = new URL(cleanUrl); } catch { throw new Error('URL inválida. Cole a URL completa terminada em /exec.'); }
  if (u.hostname.includes('script.google.com')) {
    if (u.pathname.includes('/home/projects/') || u.pathname.includes('/edit')) throw new Error('Você colou a URL do editor. Publique como Web App e use a URL terminada em /exec.');
    if (/\/dev\/?$/i.test(u.pathname)) throw new Error('Você colou a URL /dev. Use a implantação estável /exec.');
  }
}

function explainConnectionError(message) {
  const msg = String(message || '');
  if (/HTML\/login|accounts\.google/i.test(msg)) return 'O Google retornou uma tela de login. Publique o Web App com acesso configurado para “Qualquer pessoa”.';
  if (/tempo esgotado|callback/i.test(msg)) return 'O navegador não recebeu o callback. Reimplante o script como nova versão e confira se o doGet usa json_().';
  return 'Não foi possível ler o Apps Script. Verifique a URL e garanta que está publicada corretamente: ' + msg;
}

async function postAction(payload, settleMs = 180) {
  const apiUrl = normalizeApiUrl(S.cfg.apiUrl);
  if (!apiUrl) { goPage('settings'); throw new Error('Configure a URL do Apps Script.'); }
  validateAppsScriptUrl(apiUrl);

  if (canSendAsJsonpWrite(apiUrl, payload)) {
    try {
      const response = await jsonpFetch(apiUrl, { ...payload, write: '1' }, 12000);
      if (response && response.status === 'error') throw new Error(response.message || 'O Apps Script recusou a operação.');
      return response || { status: 'success', ok: true };
    } catch (err) {
      if (!shouldFallbackToOpaquePost(payload)) throw err;
      console.warn('[Scheduler] JSONP write fallback:', err);
    }
  }

  try {
    await fetch(apiUrl, {
      method: 'POST',
      mode: 'no-cors',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    if (settleMs > 0) await wait(settleMs);
    return { status: 'success', ok: true, opaque: true };
  } catch (err) {
    throw new Error('Erro ao transmitir dados para o Apps Script.');
  }
}

function canSendAsJsonpWrite(apiUrl, payload) {
  try {
    const url = buildApiRequestUrl(apiUrl, { ...payload, write: '1', callback: '__probe__', _: Date.now() });
    return url.length < 7000;
  } catch {
    return false;
  }
}

function shouldFallbackToOpaquePost(payload) {
  const action = String(payload?.action || '');
  return action === 'add' || action === 'update';
}

function queueSheetWrite(payload, settleMs = 80) {
  S.pendingWrites += 1;
  setSyncState(true);

  const task = S.writeQueue
    .catch(() => null)
    .then(() => postAction(payload, settleMs))
    .finally(() => {
      S.pendingWrites = Math.max(0, S.pendingWrites - 1);
      setSyncState(S.pendingWrites > 0);
    });

  S.writeQueue = task;
  return task;
}

function setSyncState(active) {
  if (!E.connLabel || !E.connStatus) return;
  if (active) {
    setConn('online', 'Sincronizando...');
  } else if (S.cfg.apiUrl) {
    setConn('online', 'Online');
  }
}

function estimateNextRowNumber() {
  const maxRow = S.items.reduce((max, item) => Math.max(max, Number(item.rowNumber) || 1), 1);
  return maxRow + 1;
}

function cloneItemsForRollback() {
  return S.items.map(item => ({ ...item }));
}

function reconcileAddAfterSave(localRow, payload, response) {
  const remoteRow = Number(response?.rowNumber || response?.row?.rowNumber || 0);

  if (remoteRow && remoteRow !== Number(localRow)) {
    S.items = S.items.filter(item => Number(item.rowNumber) !== Number(localRow));
    upsertLocalPayload({ ...payload, rowNumber: remoteRow }, response);
    return;
  }

  if (remoteRow) {
    upsertLocalPayload({ ...payload, rowNumber: remoteRow }, response);
    return;
  }

  fetchItems({ quiet: true });
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/* ── DATA NORMALIZATION ──────────────────────────── */
function normalizeRow(row) {
  const pick = (keys) => { 
    for (const k of keys) {
      if (k in row) return row[k];
      const cleanK = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (cleanK in row) return row[cleanK];
    }
    return ''; 
  };
  const str = v => v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  const item = {
    rowNumber: +pick(['rowNumber','RowNumber','linha','Linha']),
    tipo:      str(pick(['tipo','Tipo'])),
    plataforma: str(pick(['plataforma','Plataforma'])),
    data:       str(pick(['data','Data'])),
    hora:       str(pick(['hora','Hora','horario'])),
    midia:      str(pick(['midia','Mídia','Midia'])),
    titulo:     str(pick(['titulo','Título','Titulo'])),
    descricao:  str(pick(['descricao','Descrição','Descricao'])),
    comentario:  str(pick(['comentario','Comentário'])),
    postado:     str(pick(['postado','Postado'])) || 'Não'
  };
  if (!item.hora) item.hora = extractTimeFromDateText(item.data);
  item.isPosted = /^(sim|yes|true|postado)$/i.test(item.postado.trim());
  item.dateValue = parseDateTimeValue(item.data, item.hora);
  return item;
}

function parseDateValue(v) {
  const s = String(v || '').trim(); if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (m) return new Date(+m[3], +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3], +(m[4]||0), +(m[5]||0));
  const d = new Date(s.includes('T') ? s : s.replace(' ','T'));
  return isNaN(d) ? null : d;
}

function parseDateTimeValue(data, hora) {
  const d = parseDateValue(data); if (!d) return null;
  const t = normalizeTime(hora || extractTimeFromDateText(data));
  if (t) { const [hh, mm] = t.split(':').map(Number); d.setHours(hh || 0, mm || 0, 0, 0); }
  return d;
}
function extractTimeFromDateText(v) { const m = String(v || '').match(/(?:^|\s|T)(\d{1,2}:\d{2})(?::\d{2})?\s*$/); return m ? normalizeTime(m[1]) : ''; }
function normalizeTime(v) { const s = String(v || '').trim(); if (!s) return ''; const m = s.match(/^(\d{1,2})(?::|h)(\d{2})$/i); if (!m) return ''; return `${pad(Math.min(23, +m[1]))}:${pad(Math.min(59, +m[2]))}`; }

/* DATA BRASILEIRA FIX */
function fmtDate(v) { 
  const d = parseDateValue(v); 
  return d ? new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d) : v || '—'; 
}
function fmtTime(v) { return normalizeTime(v) || '—'; }
function fmtSchedule(i) { const date = fmtDate(i?.data); const time = fmtTime(i?.hora); return `${date}${time !== '—' ? ' • ' + time : ''}`; }
function pad(n) { return String(n).padStart(2,'0'); }

/* ── FILTERS & SORT ──────────────────────────────── */
function populatePlatformFilter() {
  const currentFilterValue = getCustomSelectValue(E.platformFilterWrapper);
  const platforms = [...new Set(S.items.map(i => i.plataforma).filter(Boolean))].sort();
  
  const container = q('#platformFilterOptions');
  container.innerHTML = '<div class="custom-option selected" data-value="">Todas</div>' + 
    platforms.map(p => `<div class="custom-option" data-value="${esc(p)}">${esc(p)}</div>`).join('');
    
  setCustomSelectValue(E.platformFilterWrapper, currentFilterValue);
}


function isActivePage(page) {
  return q(`.page[data-page="${page}"]`)?.classList.contains('active');
}

function scheduleApplyFilters() {
  if (filterFrame) cancelAnimationFrame(filterFrame);
  filterFrame = requestAnimationFrame(() => {
    filterFrame = 0;
    applyFilters();
  });
}

function schedulePreviewUpdate() {
  if (previewFrame) cancelAnimationFrame(previewFrame);
  previewFrame = requestAnimationFrame(() => {
    previewFrame = 0;
    updatePreview();
  });
}

function renderAfterDataChange() {
  populatePlatformFilter();
  renderStats();
  applyFilters();
}

function upsertLocalPayload(payload, response = null) {
  const responseRow = Number(response?.rowNumber || response?.row?.rowNumber || 0);
  const row = Number(payload?.rowNumber || responseRow || 0);
  if (!row) return false;

  const index = S.items.findIndex(item => item.rowNumber === row);
  const base = index >= 0 ? S.items[index] : {};
  const next = normalizeRow({
    ...base,
    ...payload,
    ...(response?.row || {}),
    rowNumber: row,
    postado: payload.postado || response?.row?.postado || base.postado || 'Não'
  });

  if (index >= 0) S.items[index] = next;
  else S.items.push(next);

  renderAfterDataChange();
  return true;
}

function removeLocalRow(rowNumber) {
  const removedRow = Number(rowNumber || 0);
  S.items = S.items
    .filter(entry => entry.rowNumber !== removedRow)
    .map(entry => entry.rowNumber > removedRow ? { ...entry, rowNumber: entry.rowNumber - 1 } : entry);
  renderAfterDataChange();
}

function applyFilters() {
  const q2 = E.searchInput.value.trim().toLowerCase();
  const pl = getCustomSelectValue(E.platformFilterWrapper);
  const st = getCustomSelectValue(E.statusFilterWrapper);
  const sortVal = getCustomSelectValue(E.sortSelectWrapper);

  S.filtered = S.items.filter(i => {
    const hay = [i.tipo,i.plataforma,i.data,i.hora,i.titulo,i.descricao,i.comentario].join(' ').toLowerCase();
    return (!q2 || hay.includes(q2)) && (!pl || i.plataforma === pl) && (!st || i.postado.toLowerCase() === st.toLowerCase());
  });

  sortItems(sortVal);
  renderFilterBadge();
  if (isActivePage('agenda')) renderItems();
  if (isActivePage('overview')) renderOverview();
}

function renderFilterBadge() {
  const pl = getCustomSelectValue(E.platformFilterWrapper);
  const st = getCustomSelectValue(E.statusFilterWrapper);
  const sortVal = getCustomSelectValue(E.sortSelectWrapper);
  const count = [pl, st, sortVal !== 'dateAsc' ? sortVal : ''].filter(Boolean).length;
  E.filterBadge.textContent = String(count);
  E.filterBadge.classList.toggle('is-zero', count === 0);
}

function toggleFilterPopover(open) {
  const shouldOpen = typeof open === 'boolean' ? open : E.filterPopover.hidden;
  E.filterPopover.hidden = !shouldOpen;
  E.filterOverlay.hidden = !shouldOpen;
  E.openFiltersBtn.setAttribute('aria-expanded', String(shouldOpen));
}

function clearAgendaFilters() {
  E.searchInput.value = '';
  setCustomSelectValue(E.platformFilterWrapper, '');
  setCustomSelectValue(E.statusFilterWrapper, '');
  setCustomSelectValue(E.sortSelectWrapper, 'dateAsc');
  applyFilters();
}

function sortItems(mode) {
  S.filtered.sort((a,b) => {
    if (mode === 'dateDesc') return gt(b)-gt(a);
    if (mode === 'titleAsc') return (a.titulo||'').localeCompare(b.titulo||'');
    if (mode === 'status') return +a.isPosted - +b.isPosted || gt(a)-gt(b);
    return gt(a)-gt(b);
  });
}

/* ── RENDER STATS & LISTS ────────────────────────── */
function renderStats() {
  const total = S.items.length;
  const posted = S.items.filter(i => i.isPosted).length;
  const pending = total - posted;
  const today = S.items.filter(isToday).length;
  const snapshot = `${total}|${pending}|${posted}|${today}`;
  if (snapshot === lastStatsSnapshot) return;
  lastStatsSnapshot = snapshot;
  animNum(E.totalCount, total); animNum(E.pendingCount, pending); animNum(E.postedCount, posted); animNum(E.todayCount, today);
  animNum(E.miniTotal, total); animNum(E.miniPending, pending); animNum(E.miniPosted, posted);
}

function animNum(el, next) {
  const cur = +el.textContent || 0; if (cur === next) return;
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min((now-start)/240, 1); el.textContent = Math.round(cur + (next-cur)*p);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function renderOverview() {
  const upcoming = [...S.items].sort((a,b) => gt(a)-gt(b)).filter(i => !i.isPosted || !i.dateValue).slice(0,6);
  const next = upcoming.find(i => !i.isPosted) || upcoming[0];
  
  E.nextItemText.textContent = next ? `${next.titulo||'Sem título'} • ${next.plataforma||'—'} • ${fmtSchedule(next)}` : (S.cfg.apiUrl ? 'Nenhum item pendente.' : 'Configure a URL nos Ajustes.');

  if (!S.items.length) {
    E.upcomingList.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><h3>Sem itens</h3><p>Configure ou atualize os agendamentos.</p></div>`;
    return;
  }

  E.upcomingList.innerHTML = `<div class="overview-schedule-list">
    ${upcoming.map(i => `<article class="overview-schedule-row" data-row="${i.rowNumber}">
      <div class="overview-schedule-when">
        <span class="sheet-time">${esc(fmtTime(i.hora))}</span>
        <span class="sheet-date">${esc(fmtDate(i.data))}</span>
      </div>
      <div class="overview-schedule-main">
        <strong>${esc(i.titulo||'Sem título')}</strong>
        <span>${esc((i.descricao||'Sem descrição breve.').slice(0,125))}</span>
        <div class="overview-schedule-tags">
          <span class="tag">${esc(i.tipo||'—')}</span>
          <span class="tag info">${esc(i.plataforma||'—')}</span>
        </div>
      </div>
      <div class="overview-schedule-status">
        <span class="tag ${i.isPosted?'ok':'warn'}">${i.isPosted?'Postado':'Pendente'}</span>
      </div>
      <div class="overview-schedule-actions row-actions">
        <button class="sbtn accent" data-action="viewer">Visualizar</button>
        <button class="sbtn action-icon" data-action="edit" aria-label="Editar">${editIco()}</button>
        <button class="sbtn action-icon" data-action="toggle" aria-label="Alternar status">${statusIco()}</button>
      </div>
    </article>`).join('')}
  </div>`;
  bindItemActions();
}

function renderLoading() { E.dataZone.innerHTML = '<div class="skel-grid"><div class="skel-card"></div><div class="skel-card"></div><div class="skel-card"></div></div>'; E.agendaSummary.textContent = 'Carregando...'; }
function renderEmptyConfig() { E.dataZone.innerHTML = `<div class="empty-state"><div class="empty-icon">⚙️</div><h3>Conexão requerida</h3><p>Insira a URL pública do Apps Script na aba Ajustes.</p></div>`; E.agendaSummary.textContent = 'Sem dados.'; }
function renderAuthRequired() { if (!E.dataZone) return; E.dataZone.innerHTML = `<div class="empty-state"><div class="empty-icon">🔒</div><h3>Login necessário</h3><p>Entre com uma das credenciais autorizadas para visualizar e gerenciar os posts.</p></div>`; if (E.agendaSummary) E.agendaSummary.textContent = 'Aguardando login.'; }
function renderError(msg) { E.dataZone.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div><h3>Erro de carga</h3><p>${esc(msg)}</p></div>`; E.agendaSummary.textContent = 'Erro.'; }

function renderItems() {
  if (!S.cfg.apiUrl) { renderEmptyConfig(); return; }
  if (!S.filtered.length) { E.dataZone.innerHTML = `<div class="empty-state"><div class="empty-icon">🔍</div><h3>Sem resultados</h3><p>Experimente mudar as opções de busca.</p></div>`; E.agendaSummary.textContent = '0 itens'; return; }
  E.agendaSummary.textContent = `${S.filtered.length} item(ns)`;
  S.cfg.view === 'table' ? renderTable() : renderCards();
}

function renderCards() { E.dataZone.innerHTML = `<div class="cards-grid">${S.filtered.map(cardHTML).join('')}</div>`; bindItemActions(); }

function tableThumbHTML(item) {
  const url = firstMediaUrl(item?.midia || '');
  if (!url) return `<span class="sheet-thumb sheet-thumb-empty">📷</span>`;
  const safe = safeUrl(url);
  const clean = safe.split('?')[0].toLowerCase();
  const driveId = getDriveId(url);
  const src = driveId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w240` : safe;
  if (driveId || /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(clean)) {
    return `<a href="${esc(safe)}" target="_blank" rel="noopener" class="sheet-thumb"><img src="${esc(src)}" alt="Prévia" loading="lazy" onerror="this.parentNode.classList.add('sheet-thumb-empty');this.parentNode.textContent='📎';"></a>`;
  }
  if (/\.(mp4|webm|ogg|mov|m4v)$/i.test(clean)) return `<span class="sheet-thumb sheet-thumb-empty">▶</span>`;
  return `<a href="${esc(safe)}" target="_blank" rel="noopener" class="sheet-thumb sheet-thumb-empty">🔗</a>`;
}
function renderTable() {
  E.dataZone.innerHTML = `<div class="sheet-wrap agenda-sheet-wrap"><div class="sheet-scroll agenda-sheet-scroll"><table class="agenda-sheet">
    <colgroup>
      <col class="col-when" />
      <col class="col-title" />
      <col class="col-details" />
      <col class="col-status" />
      <col class="col-actions" />
    </colgroup>
    <thead><tr><th>Quando</th><th>Agendamento</th><th>Detalhes</th><th>Status</th><th>Ações</th></tr></thead>
    <tbody>${S.filtered.map(i => `<tr data-row="${i.rowNumber}">
      <td><div class="sheet-when"><span class="sheet-time">${esc(fmtTime(i.hora))}</span><span class="sheet-date">${esc(fmtDate(i.data))}</span></div></td>
      <td>
        <div class="sheet-post">
          ${tableThumbHTML(i)}
          <div class="sheet-title">
            <strong>${esc(i.titulo||'Sem título')}</strong>
            <span>${esc((i.descricao||'Sem descrição breve.').slice(0,138))}</span>
          </div>
        </div>
      </td>
      <td><div class="sheet-detail-tags">
        <span class="tag">${esc(i.tipo||'—')}</span>
        <span class="tag info">${esc(i.plataforma||'—')}</span>
      </div></td>
      <td><span class="tag ${i.isPosted?'ok':'warn'}">${i.isPosted?'Postado':'Pendente'}</span></td>
      <td><div class="row-actions">
        <button class="sbtn accent action-viewer" data-action="viewer">Visualizar</button>
        <button class="sbtn action-icon" data-action="toggle" aria-label="Alternar status">${statusIco()}</button>
        <button class="sbtn action-icon" data-action="edit" aria-label="Editar">${editIco()}</button>
        <button class="sbtn danger action-icon" data-action="delete" aria-label="Excluir">${trashIco()}</button>
      </div></td>
    </tr>`).join('')}</tbody>
  </table></div></div>`;
  bindItemActions();
}

function cardHTML(i) {
  return `<article class="card sched-card" data-row="${i.rowNumber}">
    <div class="card-media frame-media">${mediaHTML(i.midia, i.tipo)}<span class="media-badge">${esc(i.tipo||'Mídia')}</span></div>
    <div class="card-body">
      <div class="card-head">
        <div class="list-tags"><span class="tag">${esc(i.tipo||'—')}</span><span class="tag info">${esc(i.plataforma||'—')}</span><span class="tag ${i.isPosted?'ok':'warn'}">${i.isPosted?'Postado':'Pendente'}</span></div>
        <div class="card-acts-top"><button class="sbtn accent action-viewer" data-action="viewer">Visualizar</button><button class="sbtn action-icon" data-action="edit" aria-label="Editar">${editIco()}</button><button class="sbtn danger action-icon" data-action="delete" aria-label="Excluir">${trashIco()}</button></div>
      </div>
      <h3 class="card-title">${esc(i.titulo||'Sem título')}</h3>
      <p class="card-desc">${esc((i.descricao||'').slice(0,160))}</p>
      <div class="card-meta">
        <div class="meta-row"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>${esc(fmtSchedule(i))}</div>
      </div>
      <div class="card-acts-bot"><button class="sbtn" data-action="duplicate">Duplicar</button><button class="sbtn accent" data-action="toggle">${i.isPosted?'Marcar não':'Marcar feito'}</button></div>
    </div>
  </article>`;
}

function handleItemActionClick(event) {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const node = btn.closest('[data-row]');
  if (!node) return;

  event.stopPropagation();
  const item = S.items.find(x => x.rowNumber === +node.dataset.row);
  if (!item) return;

  const action = btn.dataset.action;
  if (action === 'edit') openEditor(item);
  if (action === 'duplicate') openEditor({...item, rowNumber:''}, true);
  if (action === 'delete') deleteItem(item);
  if (action === 'toggle') toggleStatus(item);
  if (action === 'viewer') openPublishViewer(item);
  if (action === 'download-all') downloadAllMedia(item);
}

function bindItemActions() {
  // Mantido como compatibilidade. As ações agora usam delegação única de eventos.
}

/* ── FORM & PREVIEW MANAGEMENT ───────────────────── */
function mountEditorGrid(targetPage = 'editor') {
  const mount = targetPage === 'edit' ? E.editFormMount : E.editorFormMount;
  if (mount && E.editorGrid && E.editorGrid.parentElement !== mount) {
    mount.appendChild(E.editorGrid);
  }
}

function setEditContext(item, isEdit, isDupe) {
  if (!E.editTitle) return;

  const title = (item?.titulo || '').trim();
  const date = item?.data ? fmtDate(item.data) : '';
  const time = item?.hora ? fmtTime(item.hora) : '';
  const when = [date, time].filter(Boolean).join(' às ');

  E.editTitle.textContent = isEdit ? 'Editar agendamento' : 'Editar dados';
  E.editSubtitle.textContent = isEdit
    ? 'Altere apenas o item selecionado. Ao salvar, ele será atualizado na mesma linha da planilha.'
    : 'Revise os dados antes de criar um novo item.';
  E.editContextTitle.textContent = title || 'Item selecionado';
  E.editContextMeta.textContent = isEdit
    ? `Linha ${item.rowNumber}${when ? ` • ${when}` : ''}`
    : (isDupe ? 'Duplicando dados para criar um novo agendamento.' : 'Novo agendamento.');
  E.editContextBadge.textContent = isEdit ? 'Edição' : 'Novo';
}

function openEditor(item=null, isDupe=false) {
  const isEdit = Boolean(item?.rowNumber && !isDupe);
  const targetPage = isEdit ? 'edit' : 'editor';

  mountEditorGrid(targetPage);
  item ? fillForm(item, isDupe) : resetForm(false);
  setEditContext(item, isEdit, isDupe);
  goPage(targetPage);
}

function fillForm(item, isDupe) {
  const isEdit = Boolean(item?.rowNumber && !isDupe);
  E.rowNumber.value = isEdit ? String(item.rowNumber) : '';
  
  setCustomSelectValue(E.tipoWrapper, item.tipo||'');
  setCustomSelectValue(E.plataformaWrapper, item.plataforma||'');
  setCustomSelectValue(E.postadoWrapper, isDupe ? 'Não' : (item.postado||'Não'));
  
  const extractedDate = item.data ? fmtDate(item.data) : '';
  const extractedTime = item.hora ? normalizeTime(item.hora) : '12:00';
  
  setCustomSelectValue(E.dataWrapper, extractedDate);
  setCustomSelectValue(E.horaWrapper, extractedTime);
  
  if (item.data) {
    const dValue = parseDateValue(item.data);
    if (dValue) currentCalendarDate = dValue;
  }
  
  renderInteractiveCalendar();
  renderInteractiveTimeList();

  E.midia.value = item.midia||'';
  E.titulo.value = item.titulo||'';
  E.descricao.value = item.descricao||'';
  E.comentario.value = item.comentario||'';
  
  E.editorTitle.textContent = isDupe ? 'Duplicar agendamento' : 'Novo agendamento';
  E.saveBtn.textContent = isEdit ? 'Salvar alterações' : 'Salvar agendamento';
  setEditContext(item, isEdit, isDupe);
  updatePreview();
}

function resetForm(showToast=false) {
  E.scheduleForm.reset();
  E.rowNumber.value = '';
  E.saveBtn.disabled = false;
  setCustomSelectValue(E.tipoWrapper, '');
  setCustomSelectValue(E.plataformaWrapper, '');
  setCustomSelectValue(E.postadoWrapper, 'Não');
  setCustomSelectValue(E.dataWrapper, '');
  setCustomSelectValue(E.horaWrapper, '12:00');
  
  currentCalendarDate = new Date();
  renderInteractiveCalendar();
  renderInteractiveTimeList();

  E.editorTitle.textContent = 'Novo agendamento';
  E.saveBtn.textContent = 'Salvar agendamento';
  updatePreview();
  if (showToast) toast('✦ Formulário limpo', 'Campos reiniciados.');
}

function duplicateCurrent() {
  E.rowNumber.value = '';
  setCustomSelectValue(E.postadoWrapper, 'Não');
  mountEditorGrid('editor');
  E.editorTitle.textContent = 'Duplicar agendamento';
  E.saveBtn.disabled = false;
  E.saveBtn.textContent = 'Salvar agendamento';
  updatePreview();
  goPage('editor');
  toast('✦ Modo duplicar', 'Pronto para salvar como novo item.');
}

function updatePreview() {
  const title = E.titulo.value.trim() || 'Seu título aqui.';
  const isPosted = getCustomSelectValue(E.postadoWrapper) === 'Sim';
  const caption = E.descricao.value.trim() || 'A descrição aparecerá aqui.';
  const mediaKey = `${getCustomSelectValue(E.tipoWrapper) || 'Mídia'}|${E.midia.value.trim()}`;

  E.previewTitle.textContent = title;
  E.previewStatusTag.textContent = isPosted ? 'Postado' : 'Rascunho';
  E.previewStatusTag.className = `tag ${isPosted ? 'ok' : ''}`.trim();
  E.captionPreview.textContent = caption;

  if (mediaKey !== lastMediaPreviewKey) {
    lastMediaPreviewKey = mediaKey;
    E.liveMedia.innerHTML = mediaPreviewInner(E.midia.value.trim(), getCustomSelectValue(E.tipoWrapper) || 'Mídia');
  }
}

function handleSubmit(ev) {
  ev.preventDefault();
  const rn = E.rowNumber.value.trim();
  const isEdit = Boolean(rn);
  const payload = {
    action: isEdit ? 'update' : 'add', rowNumber: rn,
    tipo: getCustomSelectValue(E.tipoWrapper), plataforma: getCustomSelectValue(E.plataformaWrapper),
    data: getCustomSelectValue(E.dataWrapper), hora: getCustomSelectValue(E.horaWrapper), midia: E.midia.value.trim(),
    titulo: E.titulo.value.trim(), descricao: E.descricao.value.trim(),
    comentario: E.comentario.value.trim(),
    postado: getCustomSelectValue(E.postadoWrapper) || 'Não'
  };

  if (!payload.tipo || !payload.plataforma || !payload.titulo) {
    toast('⚠️ Campos vazios', 'Preencha Tipo, Plataforma e Título.', true);
    return;
  }

  const previousItems = cloneItemsForRollback();
  const localRow = isEdit ? Number(rn) : estimateNextRowNumber();
  const optimisticPayload = { ...payload, rowNumber: localRow };

  E.saveBtn.disabled = true;
  E.saveBtn.textContent = isEdit ? 'Aplicando...' : 'Adicionando...';

  upsertLocalPayload(optimisticPayload);
  resetForm(false);
  mountEditorGrid('editor');
  goPage('agenda');
  toast(isEdit ? '✦ Alteração aplicada' : '✦ Agendamento adicionado', 'Sincronizando com a planilha.');

  E.saveBtn.disabled = false;
  E.saveBtn.textContent = 'Salvar agendamento';

  queueSheetWrite(payload, isEdit ? 40 : 70)
    .then(response => {
      if (response?.opaque) {
        fetchItems({ quiet: true });
      } else if (isEdit) {
        upsertLocalPayload({ ...payload, rowNumber: rn }, response);
      } else {
        reconcileAddAfterSave(localRow, payload, response);
      }
      toast('✦ Sincronizado', `${payload.titulo} foi salvo na planilha.`);
    })
    .catch(err => {
      S.items = previousItems;
      renderAfterDataChange();
      toast('⚠️ Erro ao sincronizar', err.message, true);
      if (isEdit) openEditor(previousItems.find(item => Number(item.rowNumber) === Number(rn)) || null);
    });
}

function deleteItem(item) {
  if (!confirm(`Excluir permanentemente "${item.titulo}"?`)) return;
  const previous = cloneItemsForRollback();
  const payload = { action:'delete', rowNumber: item.rowNumber };

  removeLocalRow(item.rowNumber);
  toast('✦ Removido da interface', 'Exclusão sincronizando com a planilha.');

  queueSheetWrite(payload, 40)
    .then(() => toast('✦ Exclusão sincronizada', 'Item removido da planilha.'))
    .catch(err => {
      S.items = previous;
      renderAfterDataChange();
      toast('⚠️ Falha ao remover', err.message, true);
    });
}

function toggleStatus(item) {
  const next = item.isPosted ? 'Não' : 'Sim';
  const previous = item.postado || 'Não';
  const payload = { action:'updateStatus', rowNumber: item.rowNumber, postado: next };

  item.postado = next;
  item.isPosted = next === 'Sim';
  renderAfterDataChange();
  toast('✦ Status aplicado', `${item.titulo} → ${next}. Sincronizando.`);

  queueSheetWrite(payload, 30)
    .then(response => {
      if (response?.status === 'error') throw new Error(response.message || 'Falha ao atualizar status.');
      toast('✦ Status sincronizado', `${item.titulo} → ${next}`);
    })
    .catch(err => {
      item.postado = previous;
      item.isPosted = /^(sim|yes|true|postado)$/i.test(previous);
      renderAfterDataChange();
      toast('⚠️ Erro estrutural', err.message, true);
    });
}


function buildPostClipboardText(item) {
  return `Título:
${item.titulo || ''}

Descrição:
${item.descricao || ''}`.trim();
}

async function copyToClipboard(text, label = 'Texto') {
  const value = String(text || '').trim();
  if (!value) { toast('⚠️ Nada para copiar', `${label} está vazio.`, true); return; }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
    } else {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('✦ Copiado', `${label} copiado para a área de transferência.`);
  } catch (err) {
    toast('⚠️ Falha ao copiar', 'Selecione o texto manualmente e copie.', true);
  }
}

function openPublishViewer(item) {
  const urls = parseMediaUrls(item.midia);
  const mediaCount = urls.length;
  const mediaRows = mediaCount
    ? urls.map((url, index) => `<div class="viewer-media-row">
        <strong>${index + 1}</strong>
        <a href="${esc(safeUrl(url))}" target="_blank" rel="noopener" title="${esc(url)}">${esc(url)}</a>
        <div class="viewer-media-row-actions">
          <button class="sbtn" type="button" data-viewer-action="open-media" data-index="${index}">Abrir</button>
          <button class="sbtn accent" type="button" data-viewer-action="download-one" data-index="${index}">Baixar</button>
        </div>
      </div>`).join('')
    : '<div class="viewer-media-row is-empty"><strong>0</strong><span class="sheet-muted">Nenhuma mídia cadastrada.</span><span></span></div>';

  E.publishViewerOverlay.dataset.row = String(item.rowNumber || '');
  E.publishViewerBody.innerHTML = `<div class="viewer-shell">
    <div class="viewer-head">
      <div>
        <div class="viewer-status-line">
          <span class="tag">${esc(item.plataforma || '—')}</span>
          <span class="tag">${esc(item.tipo || 'Mídia')}</span>
          <span class="tag ${item.isPosted ? 'ok' : 'warn'}">${item.isPosted ? 'Postado' : 'Pendente'}</span>
          <span class="tag info">${esc(fmtSchedule(item))}</span>
        </div>
        <h2 id="viewerTitle">${esc(item.titulo || 'Sem título')}</h2>
        <p>Kit rápido para copiar a postagem, baixar a mídia completa e marcar como feito após publicar.</p>
      </div>
    </div>

    <div class="viewer-grid">
      <div class="viewer-panel">
        <div class="viewer-section-title">
          <h3>Prévia de mídia</h3>
          <span class="tag info">${mediaCount ? `${mediaCount} arquivo(s)` : 'Sem mídia'}</span>
        </div>
        <div class="viewer-media viewer-media-adaptive">${mediaHTML(item.midia, item.tipo)}</div>
        <div class="viewer-download-box">
          <div class="viewer-section-title">
            <h3>Mídias anexas</h3>
            <button class="sbtn" type="button" data-viewer-action="download-all" ${mediaCount ? '' : 'disabled'}>${mediaCount > 1 ? 'Baixar tudo' : 'Baixar mídia'}</button>
          </div>
          <div class="viewer-media-list">${mediaRows}</div>
        </div>
      </div>

      <div class="viewer-panel">
        <div class="viewer-copy-block">
          <div class="viewer-section-title">
            <h3>Título</h3>
            <button class="sbtn" type="button" data-viewer-action="copy-title">Copiar</button>
          </div>
          <div class="viewer-copy-box">${esc(item.titulo || '')}</div>
        </div>

        <div class="viewer-copy-block">
          <div class="viewer-section-title">
            <h3>Descrição</h3>
            <button class="sbtn" type="button" data-viewer-action="copy-description">Copiar</button>
          </div>
          <div class="viewer-copy-box">${esc(item.descricao || '')}</div>
        </div>

        <div class="viewer-system-card">
          <div class="viewer-system-label">Comentário interno</div>
          <div class="viewer-system-text">${esc(item.comentario || 'Nenhum comentário interno cadastrado.')}</div>
        </div>

        <div class="viewer-actions">
          <button class="pbtn" type="button" data-viewer-action="copy-all">Copiar título + descrição</button>
          <button class="gbtn" type="button" data-viewer-action="edit">Editar</button>
          <button class="sbtn accent" type="button" data-viewer-action="toggle-status">${item.isPosted ? 'Marcar como pendente' : 'Marcar como feito'}</button>
        </div>
      </div>
    </div>
  </div>`;

  E.publishViewerOverlay.hidden = false;
  document.body.classList.add('body-viewer-open');
}

function closePublishViewer() {
  E.publishViewerOverlay.hidden = true;
  E.publishViewerBody.innerHTML = '';
  E.publishViewerOverlay.dataset.row = '';
  document.body.classList.remove('body-viewer-open');
}

function currentViewerItem() {
  const row = Number(E.publishViewerOverlay.dataset.row || 0);
  return S.items.find(item => item.rowNumber === row);
}

async function handleViewerAction(event) {
  const btn = event.target.closest('[data-viewer-action]');
  if (!btn) return;

  const item = currentViewerItem();
  if (!item) return;
  const action = btn.dataset.viewerAction;
  const urls = parseMediaUrls(item.midia);

  if (action === 'copy-title') return copyToClipboard(item.titulo, 'Título');
  if (action === 'copy-description') return copyToClipboard(item.descricao, 'Descrição');
  if (action === 'copy-all') return copyToClipboard(buildPostClipboardText(item), 'Título e descrição');
  if (action === 'download-all') return downloadAllMedia(item);
  if (action === 'download-one') {
    const index = Number(btn.dataset.index || 0);
    const source = urls[index];
    if (source) triggerDownload(mediaDirectDownloadUrl(source), mediaDownloadName(item, index, source));
    return;
  }
  if (action === 'open-media') {
    const index = Number(btn.dataset.index || 0);
    const source = urls[index];
    if (source) window.open(safeUrl(source), '_blank', 'noopener');
    return;
  }
  if (action === 'open-first') {
    const first = firstMediaUrl(item.midia);
    if (first) window.open(safeUrl(first), '_blank', 'noopener');
    return;
  }
  if (action === 'edit') {
    closePublishViewer();
    openEditor(item);
    return;
  }
  if (action === 'toggle-status') {
    await toggleStatus(item);
    closePublishViewer();
  }
}

function mediaDownloadName(item, index, sourceUrl = '') {
  const base = slugify(item.titulo || 'midia') || 'midia';
  return `${base}-${pad(index + 1)}${guessMediaExtension(sourceUrl)}`;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 48);
}

function guessMediaExtension(url) {
  const clean = String(url || '').split(/[?#]/)[0];
  const match = clean.match(/\.(png|jpe?g|webp|gif|avif|svg|mp4|webm|ogg|mov|m4v)$/i);
  return match ? `.${match[1].toLowerCase()}` : '';
}

function mediaDirectDownloadUrl(url) {
  const driveId = getDriveId(url);
  return driveId ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(driveId)}` : safeUrl(url);
}

function mediaDownloadUrls(value) {
  return parseMediaUrls(value).map(mediaDirectDownloadUrl).filter(Boolean);
}

function triggerDownload(href, filename = '') {
  if (!href) return;
  const a = document.createElement('a');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  if (filename) a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadAllMedia(item) {
  const urls = parseMediaUrls(item.midia);
  if (!urls.length) { toast('⚠️ Sem mídia', 'Este agendamento não possui mídia para baixar.', true); return; }

  urls.forEach((source, index) => {
    const href = mediaDirectDownloadUrl(source);
    const name = mediaDownloadName(item, index, source);
    setTimeout(() => triggerDownload(href, name), index * 260);
  });

  toast('✦ Download iniciado', urls.length > 1 ? `${urls.length} mídias do carrossel foram acionadas.` : 'A mídia foi acionada para download.');
}


/* ── MÍDIA RENDERS ───────────────────────────────── */
function normalizeMediaType(tipo) {
  return String(tipo || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isCarouselType(tipo) {
  return normalizeMediaType(tipo) === 'carrossel' || normalizeMediaType(tipo) === 'carousel';
}

function parseMediaUrls(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];

  const normalized = raw
    .replace(/\r/g, '\n')
    .split(/\n+|\s+\|\s+|\s+;\s+/)
    .map(part => part.trim().replace(/^[-•*]\s*/, ''))
    .filter(Boolean);

  return [...new Set(normalized)];
}

function firstMediaUrl(value) {
  return parseMediaUrls(value)[0] || '';
}

function mediaHTML(url, tipo) {
  const urls = parseMediaUrls(url);
  const carousel = isCarouselType(tipo) || urls.length > 1;

  if (!urls.length) {
    const emptyLabel = isCarouselType(tipo) ? 'Carrossel sem mídias' : 'Sem mídia';
    return `<div class="media-empty"><span>📷</span><span>${esc(emptyLabel)}</span></div>`;
  }

  if (carousel) return carouselHTML(urls);
  return mediaSingleHTML(urls[0]);
}

function carouselHTML(urls) {
  const slides = urls.map((itemUrl, index) => `
    <div class="media-carousel-slide">
      <span class="media-carousel-index">${index + 1}/${urls.length}</span>
      ${mediaSingleHTML(itemUrl)}
    </div>
  `).join('');

  const dots = urls.map(() => '<span class="media-carousel-dot"></span>').join('');

  return `<div class="media-carousel" aria-label="Carrossel de mídia">
    <div class="media-carousel-track">${slides}</div>
    <div class="media-carousel-hint">${dots}<span>Arraste para ver</span></div>
  </div>`;
}

function mediaSingleHTML(url) {
  const u = String(url||'').trim();
  if (!u) return `<div class="media-empty"><span>📷</span><span>Sem mídia</span></div>`;
  const safe = safeUrl(u); const clean = safe.split('?')[0].toLowerCase();
  const driveId = getDriveId(u);
  if (driveId) {
    const thumb = `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveId)}&sz=w800`;
    return `<a href="${esc(safe)}" target="_blank" rel="noopener" class="media-frame-link"><img src="${esc(thumb)}" alt="Mídia" loading="lazy" onerror="this.parentNode.outerHTML='<div class=media-empty><span>📁</span><span>Drive — sem prévia</span></div>'"></a>`;
  }
  if (/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(clean)) return `<a href="${esc(safe)}" target="_blank" rel="noopener" class="media-frame-link"><img src="${esc(safe)}" alt="Mídia" loading="lazy" onerror="this.parentNode.outerHTML='<div class=media-empty><span>🖼️</span><span>Mídia Externa</span></div>'"></a>`;
  if (/\.(mp4|webm|ogg|mov|m4v)$/i.test(clean)) return `<video controls src="${esc(safe)}" class="media-video"></video>`;
  return `<a href="${esc(safe)}" target="_blank" rel="noopener" class="media-empty"><span>🔗</span><span>Abrir Link de Mídia</span></a>`;
}
function mediaPreviewInner(url, tipo) { return mediaHTML(url, tipo); }
function getDriveId(url) { const v = String(url||'').trim(); for (const p of [/\/file\/d\/([^/]+)/i, /[?&]id=([^&#]+)/i, /\/d\/([^/]+)/i]) { const m = v.match(p); if (m?.[1]) return decodeURIComponent(m[1]); } return ''; }
function mediaDownloadUrl(url) { return mediaDownloadUrls(url)[0] || ''; }

/* ── UTILS: FEEDBACK & LOGS ──────────────────────── */
function setConn(mode, label) { E.connStatus.classList.remove('online','offline'); if (mode) E.connStatus.classList.add(mode); E.connLabel.textContent = label; }
function toast(title, msg, isErr=false) {
  const el = document.createElement('div');
  el.className = `toast${isErr ? ' err' : ''}`;
  el.innerHTML = `<span class="tico">${isErr ? '⚠️' : '✦'}</span><div><strong>${esc(title)}</strong><span>${esc(msg)}</span></div>`;
  E.toastStack.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    setTimeout(() => el.remove(), 260);
  }, 3800);
}

function addPingLog(mode, title, detail='') {
  S.pingLog.unshift({ mode, title, detail, at: new Date().toISOString() }); S.pingLog = S.pingLog.slice(0, 8);
  localStorage.setItem(LOG_KEY, JSON.stringify(S.pingLog)); renderPingLog();
}
function renderPingLog() {
  if (!E.pingLogList) return; if (!S.pingLog.length) { E.pingLogList.innerHTML = '<div class="ping-log-item"><p>Nenhum teste registrado.</p></div>'; return; }
  E.pingLogList.innerHTML = S.pingLog.map(entry => {
    const ok = entry.mode === 'ok'; const date = new Date(entry.at);
    const when = isNaN(date) ? 'agora' : new Intl.DateTimeFormat('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }).format(date);
    return `<div class="ping-log-item ${ok?'ok':'err'}"><div class="ping-log-top"><strong>${ok?'✓':'⚠'} ${esc(entry.title)}</strong><time>${esc(when)}</time></div><p>${esc(entry.detail)}</p></div>`;
  }).join('');
}

/* ── BIND EVENTOS GLOBAIS ────────────────────────── */
function bindEvents() {
  E.loginForm?.addEventListener('submit', handleLogin);
  E.refreshBtn.addEventListener('click', fetchItems);
  E.agendaRefreshBtn.addEventListener('click', fetchItems);
  
  E.themeBtn.addEventListener('click', () => {
    const next = temporarySettings.theme === 'dark' ? 'light' : 'dark';
    updateTemporaryVisual({ theme: next });
    toast(next === 'dark' ? '🌙 Modo escuro' : '☀️ Modo claro', 'Visualização alterada.');
  });
  
  E.newTopBtn.addEventListener('click', () => openEditor());
  E.heroNewBtn.addEventListener('click', () => openEditor());
  E.heroAgendaBtn.addEventListener('click', () => goPage('agenda'));

  qq('[data-go-page]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.goPage === 'editor') { openEditor(); return; }
    goPage(b.dataset.goPage);
  }));
  qq('.dock-btn').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.pageTarget === 'editor') { openEditor(); return; }
    goPage(b.dataset.pageTarget);
  }));

  E.searchInput.addEventListener('input', scheduleApplyFilters);
  E.dataZone.addEventListener('click', handleItemActionClick);
  E.upcomingList.addEventListener('click', handleItemActionClick);
  E.openFiltersBtn.addEventListener('click', () => toggleFilterPopover());
  E.closeFiltersBtn.addEventListener('click', () => toggleFilterPopover(false));
  E.applyFiltersBtn.addEventListener('click', () => { applyFilters(); toggleFilterPopover(false); });
  E.clearFiltersBtn.addEventListener('click', clearAgendaFilters);
  E.filterOverlay.addEventListener('click', () => toggleFilterPopover(false));
  
  qq('[data-view]').forEach(b => b.addEventListener('click', () => { saveCfg({ view: b.dataset.view }, { noPage: true }); renderItems(); }));

  E.scheduleForm.addEventListener('submit', handleSubmit);
  E.resetFormBtn.addEventListener('click', () => resetForm(true));
  E.duplicateCurrentBtn.addEventListener('click', duplicateCurrent);
  [E.midia, E.titulo, E.descricao, E.comentario].forEach(el => {
    el.addEventListener('input', schedulePreviewUpdate);
  });

  E.viewerCloseBtn.addEventListener('click', closePublishViewer);
  E.publishViewerOverlay.addEventListener('click', (event) => {
    if (event.target === E.publishViewerOverlay) closePublishViewer();
  });
  E.publishViewerBody.addEventListener('click', handleViewerAction);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !E.publishViewerOverlay.hidden) closePublishViewer();
  });

  E.saveSettingsBtn.addEventListener('click', async () => {
    const apiUrl = normalizeApiUrl(E.apiUrlInput.value);
    
    saveCfg({
      apiUrl,
      theme: temporarySettings.theme,
      accent: temporarySettings.accent,
      density: temporarySettings.density,
      radius: temporarySettings.radius,
      fontScale: temporarySettings.fontScale,
      gridOpacity: temporarySettings.gridOpacity,
      blur: temporarySettings.blur,
      surface: temporarySettings.surface,
      motion: temporarySettings.motion
    }, { noPage: true });

    const originalText = E.saveSettingsBtn.textContent;
    try {
      E.saveSettingsBtn.disabled = true;
      E.saveSettingsBtn.textContent = 'Aplicando e Sincronizando...';
      if (apiUrl) await testApiConnection(apiUrl, true);
      await fetchItems({ quiet: true });
      
      E.saveSettingsBtn.style.background = '#22c55e';
      E.saveSettingsBtn.style.borderColor = '#16a34a';
      E.saveSettingsBtn.textContent = 'Configurações Aplicadas!';
      
      setTimeout(() => {
        E.saveSettingsBtn.style.background = '';
        E.saveSettingsBtn.style.borderColor = '';
        E.saveSettingsBtn.textContent = originalText;
        E.saveSettingsBtn.disabled = false;
        goPage('overview');
      }, 1200);
    } catch (err) {
      setConn('offline', 'Falha na conexão');
      addPingLog('err', 'Ping failed', err.message);
      renderError(err.message);
      toast('⚠️ Erro de sincronia', err.message, true);
      E.saveSettingsBtn.disabled = false;
      E.saveSettingsBtn.textContent = originalText;
    }
  });

  E.testConnectionBtn.addEventListener('click', async () => {
    const apiUrl = normalizeApiUrl(E.apiUrlInput.value);
    try { await testApiConnection(apiUrl, false); } 
    catch (err) { setConn('offline', 'Falha'); addPingLog('err', 'Teste falhou', err.message); toast('⚠️ Falha no teste', err.message, true); }
  });

  qq('[data-theme-option]').forEach(b => b.addEventListener('click', () => updateTemporaryVisual({ theme: b.dataset.themeOption })));
  
  E.customColor.addEventListener('input', e => {
    updateTemporaryVisual({ accent: e.target.value });
    renderPalette();
  });
  E.densityRange.addEventListener('input', e => {
    updateTemporaryVisual({ density: +e.target.value });
    E.densityValue.textContent = (+e.target.value).toFixed(2);
  });
  E.radiusRange.addEventListener('input', e => {
    updateTemporaryVisual({ radius: +e.target.value });
    E.radiusValue.textContent = `${e.target.value}px`;
  });
  E.fontScaleRange.addEventListener('input', e => {
    updateTemporaryVisual({ fontScale: +e.target.value });
    E.fontScaleValue.textContent = (+e.target.value).toFixed(2);
  });
  E.gridOpacityRange.addEventListener('input', e => {
    updateTemporaryVisual({ gridOpacity: +e.target.value });
    E.gridOpacityValue.textContent = `${Math.round(+e.target.value * 100)}%`;
  });
  E.blurRange.addEventListener('input', e => {
    updateTemporaryVisual({ blur: +e.target.value });
    E.blurValue.textContent = `${e.target.value}px`;
  });
  
  qq('[data-surface-option]').forEach(b => b.addEventListener('click', () => updateTemporaryVisual({ surface: b.dataset.surfaceOption })));
  qq('[data-motion-option]').forEach(b => b.addEventListener('click', () => updateTemporaryVisual({ motion: b.dataset.motionOption })));
  
  E.clearPingLogBtn.addEventListener('click', () => { S.pingLog = []; localStorage.removeItem(LOG_KEY); renderPingLog(); toast('✦ Histórico limpo', 'Logs de teste removidos.'); });

  document.addEventListener('keydown', ev => {
    const typing = ['input','textarea','select'].includes(document.activeElement?.tagName?.toLowerCase());
    if (ev.key === '/' && !typing) { ev.preventDefault(); goPage('agenda'); setTimeout(() => E.searchInput.focus(), 120); }
    if ((ev.key === 'n' || ev.key === 'N') && !typing) { ev.preventDefault(); openEditor(); }
    if ((ev.key === 'r' || ev.key === 'R') && !typing) { ev.preventDefault(); fetchItems(); }
    if (ev.key === 'Escape' && !E.filterPopover.hidden) toggleFilterPopover(false);
  });
}

/* ── SYSTEM DESIGN AUX COMPONENT CORES ───────────── */
function normalizeApiUrl(url) { let v = String(url || '').trim(); if (!v) return ''; v = v.replace(/^['"]|['"]$/g, '').replace(/\s+/g, ''); if (!/^https?:\/\//i.test(v)) v = `https://${v}`; try { const u = new URL(v); return u.toString().replace(/\/$/, ''); } catch { return v.replace(/\/$/, ''); } }
function safeUrl(url) { const v = String(url||'').trim().split(/\r?\n/)[0].trim(); if (!v) return ''; return /^(https?:)?\/\//i.test(v) ? v : `https://${v}`; }
function esc(v) { return String(v??'').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c])); }
function hexToRgb(hex) { const h = normalizeHex(hex); return [0,2,4].map(i => parseInt(h.slice(i,i+2), 16)); }
function normalizeHex(hex) { let h = String(hex||'#f36b35').replace('#','').trim(); if (h.length === 3) h = h.split('').map(c=>c+c).join(''); return h.padEnd(6,'0').slice(0,6); }
function normalizeColor(hex) { return `#${normalizeHex(hex)}`; }
function lightenHex(hex, amount) { const [r,g,b] = hexToRgb(hex); const mix = v => Math.round(v + (255-v) * amount/100); return `#${[mix(r),mix(g),mix(b)].map(v=>v.toString(16).padStart(2,'0')).join('')}`; }

const downloadIco = () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>`;
const editIco  = () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`;
const trashIco = () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>`;
const statusIco= () => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>`;
