// ===== APP.JS — Point d'entrée DailyFit =====
import { loadAll, saveAll, saveAllNow, createPiece, createOutfit, backup, generateId, FRAICHEUR_DEFAULTS } from 'data.js';
import { fetchWeather, applyWindChill, checkMatinSoirAlert, invalidateCache } from 'weather.js';
import { genererOutfit, genererSemaine } from 'generator.js';
import { initSettings, renderSettings, openVoyageModal, saveVoyagePieces, toggleVoyageBanner, applyTheme } from 'settings.js';
import {
  showToast, openModal, closeModal, navigateTo,
  renderWeatherWidget, renderOutfitCard, renderPiecesGrid, renderOutfitsGrid,
  renderAlternatives, renderCalendar, renderHistoryTimeline, renderHeaderDate,
  renderStats, renderHistoryQuickStats, renderWeekPlanning, setupSwipe,
  moodEmoji, catEmoji, animateCount
} from 'ui.js';

// ===== STATE =====
let data = null;
let currentWeather = null;
let currentOutfit = null;
let currentAlternatives = [];
let currentMood = 'travail';
let currentHistoryMonth = { year: new Date().getFullYear(), month: new Date().getMonth() };
let historyDayForRating = null;
let pendingConfirmAction = null;
let composerCategory = 'all';
let composerSearch = '';
let wardrobeFilter = 'all';
let wardrobeSearch = '';
let outfitFilter = 'all';
let currentView = 'home';

// ===== INIT =====
async function init() {
  data = loadAll();
  applyTheme(data.settings.theme);
  initSettings(data, onSettingsUpdate);
  renderHeaderDate();
  setupNavigation();
  setupModalClose();
  setupGlobalListeners();
  toggleVoyageBanner();

  if (!data.pieces.length && !data.outfits.length) {
    showOnboarding();
  } else {
    document.getElementById('onboarding-overlay')?.classList.add('hidden');
    await initHomeView();
  }
}

function setupNavigation() {
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigate(el.dataset.view);
    });
  });
}

export function navigate(view) {
  currentView = view;
  navigateTo(view);
  switch (view) {
    case 'home': initHomeView(); break;
    case 'wardrobe': renderPiecesGrid(data.pieces, wardrobeFilter, wardrobeSearch); break;
    case 'outfits': renderOutfitsGrid(data.outfits, data.pieces, outfitFilter); break;
    case 'history':
      renderHistoryQuickStats(data.history, data.outfits);
      renderCalendar(data.history, currentHistoryMonth.year, currentHistoryMonth.month, openHistoryDay);
      renderHistoryTimeline(data.history, data.outfits);
      break;
    case 'planning': initPlanning(); break;
    case 'stats': renderStats(data); break;
    case 'settings': renderSettings(); break;
  }
}

function setupModalClose() {
  // Close on overlay click and on [data-close] buttons
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });
  document.addEventListener('click', e => {
    if (e.target.dataset.close) closeModal(e.target.dataset.close);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const open = document.querySelector('.modal-overlay:not(.hidden)');
      if (open) closeModal(open.id);
    }
  });
}

function setupGlobalListeners() {
  // Theme toggle
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const cur = data.settings.theme === 'dark' ? 'light' : 'dark';
    data.settings.theme = cur;
    applyTheme(cur);
    saveAll(data);
  });

  document.getElementById('settings-shortcut')?.addEventListener('click', () => navigate('settings'));

  // Mood pills
  document.getElementById('mood-pills')?.addEventListener('click', e => {
    const pill = e.target.closest('.mood-pill');
    if (!pill) return;
    document.querySelectorAll('.mood-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    currentMood = pill.dataset.mood;
    generateAndRender();
  });

  // Re-roll
  document.getElementById('btn-reroll')?.addEventListener('click', reroll);

  // Confirm outfit
  document.getElementById('btn-confirm')?.addEventListener('click', confirmOutfit);

  // Fav
  document.getElementById('fav-heart')?.addEventListener('click', toggleFav);

  // Share
  document.getElementById('btn-share')?.addEventListener('click', openShare);

  // Edit outfit
  document.getElementById('btn-edit-outfit')?.addEventListener('click', () => {
    if (currentOutfit) openCreateOutfitModal(currentOutfit.id);
  });

  // Swipe
  const wrapper = document.getElementById('outfit-card-wrapper');
  if (wrapper) {
    setupSwipe(wrapper, () => reroll(), () => confirmOutfit());
  }

  // Wardrobe filters
  document.getElementById('wardrobe-filters')?.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#wardrobe-filters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    wardrobeFilter = btn.dataset.filter;
    renderPiecesGrid(data.pieces, wardrobeFilter, wardrobeSearch);
  });

  document.getElementById('wardrobe-search')?.addEventListener('input', e => {
    wardrobeSearch = e.target.value;
    renderPiecesGrid(data.pieces, wardrobeFilter, wardrobeSearch);
  });

  // Add piece btn
  document.getElementById('btn-add-piece')?.addEventListener('click', () => openAddPieceModal());

  // Outfits filter
  document.getElementById('outfits-filter-bar')?.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#outfits-filter-bar .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    outfitFilter = btn.dataset.filter;
    renderOutfitsGrid(data.outfits, data.pieces, outfitFilter);
  });

  document.getElementById('btn-create-outfit')?.addEventListener('click', () => openCreateOutfitModal());

  // Piece form
  document.getElementById('btn-save-piece')?.addEventListener('click', savePiece);
  document.getElementById('photo-upload-trigger')?.addEventListener('click', () => document.getElementById('piece-photos-input').click());
  document.getElementById('piece-photos-input')?.addEventListener('change', handlePhotoUpload);
  document.getElementById('btn-add-color')?.addEventListener('click', addColor);
  document.getElementById('piece-categorie')?.addEventListener('change', onCategorieChange);
  document.getElementById('piece-temp-min')?.addEventListener('input', updateTempLabel);
  document.getElementById('piece-temp-max')?.addEventListener('input', updateTempLabel);

  // Tag selectors (piece moods/saisons)
  setupTagSelector('piece-moods');
  setupTagSelector('piece-saisons');
  setupTagSelector('outfit-moods');
  setupTagSelector('outfit-saisons');

  // Outfit form
  document.getElementById('btn-save-outfit')?.addEventListener('click', saveOutfit);
  document.getElementById('outfit-tmin')?.addEventListener('input', e => document.getElementById('o-tmin-label').textContent = e.target.value + '°C');
  document.getElementById('outfit-tmax')?.addEventListener('input', e => document.getElementById('o-tmax-label').textContent = e.target.value + '°C');
  document.getElementById('composer-search')?.addEventListener('input', e => {
    composerSearch = e.target.value;
    renderComposerPieces();
  });
  document.getElementById('composer-filters')?.addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#composer-filters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    composerCategory = btn.dataset.filter;
    renderComposerPieces();
  });

  // Rating stars
  document.querySelectorAll('.star').forEach(star => {
    star.addEventListener('mouseenter', () => {
      const val = parseInt(star.dataset.val);
      document.querySelectorAll('.star').forEach(s => {
        s.classList.toggle('hovered', parseInt(s.dataset.val) <= val);
      });
    });
    star.addEventListener('mouseleave', () => {
      document.querySelectorAll('.star').forEach(s => s.classList.remove('hovered'));
    });
    star.addEventListener('click', () => {
      const val = parseInt(star.dataset.val);
      document.querySelectorAll('.star').forEach(s => {
        s.classList.toggle('active', parseInt(s.dataset.val) <= val);
      });
    });
  });

  document.getElementById('btn-submit-rating')?.addEventListener('click', submitRating);

  // Share buttons
  document.getElementById('btn-dl-img')?.addEventListener('click', downloadOutfitImage);
  document.getElementById('btn-copy-img')?.addEventListener('click', copyOutfitImage);
  document.getElementById('btn-copy-text')?.addEventListener('click', copyOutfitText);

  // Confirm action
  document.getElementById('btn-confirm-action')?.addEventListener('click', () => {
    if (pendingConfirmAction) pendingConfirmAction();
    closeModal('modal-confirm');
    pendingConfirmAction = null;
  });

  // Calendar nav
  document.getElementById('cal-prev')?.addEventListener('click', () => {
    currentHistoryMonth.month--;
    if (currentHistoryMonth.month < 0) { currentHistoryMonth.month = 11; currentHistoryMonth.year--; }
    renderCalendar(data.history, currentHistoryMonth.year, currentHistoryMonth.month, openHistoryDay);
    renderHistoryTimeline(data.history, data.outfits);
  });
  document.getElementById('cal-next')?.addEventListener('click', () => {
    currentHistoryMonth.month++;
    if (currentHistoryMonth.month > 11) { currentHistoryMonth.month = 0; currentHistoryMonth.year++; }
    renderCalendar(data.history, currentHistoryMonth.year, currentHistoryMonth.month, openHistoryDay);
    renderHistoryTimeline(data.history, data.outfits);
  });

  // Planning
  document.getElementById('btn-regen-week')?.addEventListener('click', generateWeek);
  document.getElementById('btn-validate-week')?.addEventListener('click', validateWeek);

  // History day rating
  document.getElementById('hd-btn-rate')?.addEventListener('click', () => {
    if (historyDayForRating) {
      closeModal('modal-history-day');
      document.getElementById('rate-date').value = historyDayForRating;
      openModal('modal-rate');
    }
  });

  // Voyage banner
  document.getElementById('voyage-banner-disable')?.addEventListener('click', () => {
    data.settings.modeVoyage = false;
    saveAll(data);
    toggleVoyageBanner();
    showToast('Mode Voyage désactivé', 'info');
  });

  // Piece detail buttons
  document.getElementById('pd-btn-lavage')?.addEventListener('click', togglePieceLavage);
  document.getElementById('pd-btn-archive')?.addEventListener('click', archivePiece);
  document.getElementById('pd-btn-edit')?.addEventListener('click', editPieceFromDetail);
  document.getElementById('pd-btn-delete')?.addEventListener('click', deletePiece);

  // Outfit detail buttons
  document.getElementById('od-btn-edit')?.addEventListener('click', editOutfitFromDetail);
  document.getElementById('od-btn-dup')?.addEventListener('click', duplicateOutfit);
  document.getElementById('od-btn-toggle')?.addEventListener('click', toggleOutfitAvailability);
  document.getElementById('od-btn-archive')?.addEventListener('click', archiveOutfit);
  document.getElementById('od-btn-delete')?.addEventListener('click', deleteOutfit);
}

// ===== HOME / OUTFIT GENERATION =====
async function initHomeView() {
  renderHeaderDate();

  // Set mood from settings
  const dayOfWeek = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'][new Date().getDay()];
  currentMood = data.settings.semaineType[dayOfWeek] || 'travail';
  document.querySelectorAll('.mood-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.mood === currentMood);
  });

  // Weather
  currentWeather = await fetchWeather(data.settings);
  currentWeather = applyWindChill(currentWeather);
  renderWeatherWidget(currentWeather);

  // Weather alert
  const alert = checkMatinSoirAlert(currentWeather, data.settings);
  const alertEl = document.getElementById('weather-alert');
  if (alertEl) {
    alertEl.textContent = alert || '';
    alertEl.classList.toggle('hidden', !alert);
  }

  if (data.settings.autoGenerateOnOpen) {
    await generateAndRender();
  }
}

async function generateAndRender(excludeId = null) {
  const voyagePieces = data.settings.modeVoyage ? data.voyagePieces : null;
  const excludeIds = excludeId ? [excludeId] : [];

  const result = genererOutfit({
    mood: currentMood,
    date: new Date().toISOString().slice(0, 10),
    weather: currentWeather,
    pieces: data.pieces,
    outfits: data.outfits,
    history: data.history,
    settings: data.settings,
    excludeIds,
    voyagePieces,
  });

  currentOutfit = result.outfit;
  currentAlternatives = result.alternatives || [];

  renderOutfitCard(currentOutfit, data.pieces, {
    isFallback: result.isFallback,
    fallbackReasons: result.fallbackReasons,
    weather: currentWeather,
    currentMood,
  });

  renderAlternatives(currentAlternatives, data.pieces, currentOutfit?.id, selectAlternative);
}

function reroll() {
  const card = document.getElementById('main-outfit-card');
  if (card) {
    card.classList.add('card-exit-left');
    setTimeout(() => {
      card.classList.remove('card-exit-left');
      generateAndRender(currentOutfit?.id);
    }, 300);
  } else {
    generateAndRender(currentOutfit?.id);
  }
}

function selectAlternative(outfitId) {
  const outfit = data.outfits.find(o => o.id === outfitId);
  if (!outfit) return;
  const prev = currentOutfit;
  currentOutfit = outfit;
  // Swap in alternatives
  currentAlternatives = [prev, ...currentAlternatives.filter(o => o.id !== outfitId)].filter(Boolean).slice(0, 5);

  const card = document.getElementById('main-outfit-card');
  if (card) {
    card.classList.add('card-enter-right');
    setTimeout(() => card.classList.remove('card-enter-right'), 400);
  }
  renderOutfitCard(currentOutfit, data.pieces, { weather: currentWeather });
  renderAlternatives(currentAlternatives, data.pieces, currentOutfit.id, selectAlternative);
}

function confirmOutfit() {
  if (!currentOutfit) { showToast('Aucun outfit sélectionné', 'warning'); return; }
  const today = new Date().toISOString().slice(0, 10);

  // Avoid duplicate for today
  const existing = data.history.find(h => h.date === today);
  if (existing) {
    openConfirm('Remplacer l\'outfit du jour', 'Tu as déjà confirmé un outfit aujourd\'hui. Veux-tu le remplacer ?', () => {
      data.history = data.history.filter(h => h.date !== today);
      addToHistory(today);
    });
    return;
  }
  addToHistory(today);
}

function addToHistory(date) {
  data.history.push({
    date,
    outfitId: currentOutfit.id,
    mood: currentMood,
    meteo: currentWeather && !currentWeather.error ? {
      temp: currentWeather.temp,
      ressenti: currentWeather.feelsLike,
      pluie: currentWeather.pluie,
      vent: currentWeather.windSpeed,
      description: currentWeather.description,
    } : null,
    note: null,
    commentaire: '',
  });

  // Update outfit stats
  const idx = data.outfits.findIndex(o => o.id === currentOutfit.id);
  if (idx !== -1) {
    data.outfits[idx].nombrePorts = (data.outfits[idx].nombrePorts || 0) + 1;
    data.outfits[idx].dernierPort = date;
  }

  saveAllNow(data);
  showToast('Outfit confirmé ! 🎉', 'success');

  // Prompt for rating in the evening (after 18h) or immediately
  const h = new Date().getHours();
  if (h >= 18) {
    setTimeout(() => {
      document.getElementById('rate-date').value = date;
      document.querySelectorAll('.star').forEach(s => s.classList.remove('active'));
      document.getElementById('rate-comment').value = '';
      openModal('modal-rate');
    }, 1500);
  }
}

function toggleFav() {
  if (!currentOutfit) return;
  const idx = data.outfits.findIndex(o => o.id === currentOutfit.id);
  if (idx === -1) return;
  data.outfits[idx].favori = !data.outfits[idx].favori;
  currentOutfit = data.outfits[idx];
  const btn = document.getElementById('fav-heart');
  if (btn) {
    btn.textContent = currentOutfit.favori ? '❤️' : '🤍';
    btn.classList.toggle('active', currentOutfit.favori);
    btn.style.animation = 'none';
    void btn.offsetWidth;
    btn.style.animation = 'heartBurst 0.4s var(--spring)';
  }
  saveAll(data);
  showToast(currentOutfit.favori ? 'Ajouté aux favoris ❤️' : 'Retiré des favoris', 'info');
}

// ===== PIECE FORM =====
let _editPieceId = null;
let _piecePhotos = [];
let _pieceColors = [];

export function openAddPieceModal(fromOnboarding = false) {
  _editPieceId = null;
  _piecePhotos = [];
  _pieceColors = [];

  document.getElementById('modal-piece-title').textContent = 'Ajouter un vêtement';
  document.getElementById('piece-edit-id').value = '';
  document.getElementById('piece-nom').value = '';
  document.getElementById('piece-categorie').value = '';
  document.getElementById('photos-preview').innerHTML = '';
  document.getElementById('color-swatches').innerHTML = '';
  document.querySelectorAll('#piece-moods .tag-toggle').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('#piece-saisons .tag-toggle').forEach(t => t.classList.remove('active'));
  document.getElementById('piece-pluie').checked = false;
  document.getElementById('piece-temp-min').value = 5;
  document.getElementById('piece-temp-max').value = 20;
  updateTempLabel();
  onCategorieChange();
  openModal('modal-piece');
}

function openEditPieceModal(pieceId) {
  const p = data.pieces.find(x => x.id === pieceId);
  if (!p) return;
  _editPieceId = pieceId;
  _piecePhotos = [...(p.photos || [])];
  _pieceColors = [...(p.couleurs || [])];

  document.getElementById('modal-piece-title').textContent = 'Modifier le vêtement';
  document.getElementById('piece-edit-id').value = pieceId;
  document.getElementById('piece-nom').value = p.nom;
  document.getElementById('piece-categorie').value = p.categorie;
  renderPhotosPreview();
  renderColorSwatches();

  document.querySelectorAll('#piece-moods .tag-toggle').forEach(t => {
    t.classList.toggle('active', (p.moods || []).includes(t.dataset.val));
  });
  document.querySelectorAll('#piece-saisons .tag-toggle').forEach(t => {
    t.classList.toggle('active', (p.saisons || []).includes(t.dataset.val));
  });

  document.getElementById('piece-pluie').checked = p.pluie || false;
  document.getElementById('piece-temp-min').value = p.tempMin ?? 5;
  document.getElementById('piece-temp-max').value = p.tempMax ?? 20;
  updateTempLabel();

  if (p.fraicheur) {
    document.getElementById('piece-max-semaine').value = p.fraicheur.maxPortsParSemaine;
    document.getElementById('piece-max-consec').value = p.fraicheur.maxPortsConsecutifs;
    document.getElementById('piece-repos').value = p.fraicheur.jourReposMini;
  }

  openModal('modal-piece');
}

export function handlePhotoUpload(input) {
  const files = Array.from(input.files || []);
  files.slice(0, 5 - _piecePhotos.length).forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      // Resize to max 800px
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 800 / Math.max(img.width, img.height));
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const b64 = canvas.toDataURL('image/jpeg', 0.8);
        if (_piecePhotos.length < 5) {
          _piecePhotos.push(b64);
          renderPhotosPreview();
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function renderPhotosPreview() {
  const el = document.getElementById('photos-preview');
  if (!el) return;
  el.innerHTML = _piecePhotos.map((photo, i) => `
    <div class="photo-thumb">
      <img src="${photo}" alt="">
      <button class="photo-thumb-remove" data-idx="${i}">✕</button>
    </div>
  `).join('');
  el.querySelectorAll('.photo-thumb-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      _piecePhotos.splice(parseInt(btn.dataset.idx), 1);
      renderPhotosPreview();
    });
  });
}

export function addColor() {
  const val = document.getElementById('color-input').value;
  if (!_pieceColors.includes(val)) {
    _pieceColors.push(val);
    renderColorSwatches();
  }
}

function renderColorSwatches() {
  const el = document.getElementById('color-swatches');
  if (!el) return;
  el.innerHTML = _pieceColors.map((c, i) => `
    <div class="color-swatch" style="background:${c}" data-idx="${i}" title="${c}"></div>
  `).join('');
  el.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      _pieceColors.splice(parseInt(sw.dataset.idx), 1);
      renderColorSwatches();
    });
  });
}

export function updateTempLabel() {
  const min = document.getElementById('piece-temp-min')?.value || 5;
  const max = document.getElementById('piece-temp-max')?.value || 20;
  const el = document.getElementById('temp-range-display');
  if (el) el.textContent = `${min}°C – ${max}°C`;
}

export function onCategorieChange() {
  const cat = document.getElementById('piece-categorie')?.value;
  if (!cat) return;
  const defaults = FRAICHEUR_DEFAULTS[cat] || FRAICHEUR_DEFAULTS['accessoire'];
  document.getElementById('piece-max-semaine').value = defaults.maxPortsParSemaine;
  document.getElementById('piece-max-consec').value = defaults.maxPortsConsecutifs;
  document.getElementById('piece-repos').value = defaults.jourReposMini;
}

function savePiece() {
  const nom = document.getElementById('piece-nom').value.trim();
  const categorie = document.getElementById('piece-categorie').value;
  if (!nom || !categorie) { showToast('Nom et catégorie requis', 'error'); return; }

  const moods = Array.from(document.querySelectorAll('#piece-moods .tag-toggle.active')).map(t => t.dataset.val);
  const saisons = Array.from(document.querySelectorAll('#piece-saisons .tag-toggle.active')).map(t => t.dataset.val);

  const fields = {
    nom, categorie,
    photos: [..._piecePhotos],
    couleurs: [..._pieceColors],
    moods, saisons,
    tempMin: parseInt(document.getElementById('piece-temp-min').value),
    tempMax: parseInt(document.getElementById('piece-temp-max').value),
    pluie: document.getElementById('piece-pluie').checked,
    maxPortsParSemaine: parseInt(document.getElementById('piece-max-semaine').value),
    maxPortsConsecutifs: parseInt(document.getElementById('piece-max-consec').value),
    jourReposMini: parseInt(document.getElementById('piece-repos').value),
  };

  if (_editPieceId) {
    const idx = data.pieces.findIndex(p => p.id === _editPieceId);
    if (idx !== -1) {
      data.pieces[idx] = { ...data.pieces[idx], ...fields };
      showToast('Vêtement modifié !', 'success');
    }
  } else {
    const piece = createPiece(fields);
    data.pieces.push(piece);
    showToast('Vêtement ajouté ! 👕', 'success');
    updateOnboardingCount();
  }

  saveAllNow(data);
  closeModal('modal-piece');
  renderPiecesGrid(data.pieces, wardrobeFilter, wardrobeSearch);
}

// ===== PIECE DETAIL =====
let _detailPieceId = null;

export function openPieceDetail(pieceId) {
  const p = data.pieces.find(x => x.id === pieceId);
  if (!p) return;
  _detailPieceId = pieceId;

  document.getElementById('pd-title').textContent = p.nom;

  const outfitsWithPiece = data.outfits.filter(o => (o.pieces || []).includes(pieceId));
  const body = document.getElementById('pd-body');

  body.innerHTML = `
    <div class="pd-photos">${(p.photos || []).map(ph => `<img class="pd-photo" src="${ph}" alt="">`).join('')}</div>
    <div class="pd-info-grid">
      <div class="pd-info-item"><div class="pd-info-label">Catégorie</div><div class="pd-info-val">${catEmoji(p.categorie)} ${p.categorie}</div></div>
      <div class="pd-info-item"><div class="pd-info-label">Température</div><div class="pd-info-val">${p.tempMin}°C – ${p.tempMax}°C</div></div>
      <div class="pd-info-item"><div class="pd-info-label">Moods</div><div class="pd-info-val">${(p.moods || []).map(m => moodEmoji(m)+' '+m).join(', ') || '—'}</div></div>
      <div class="pd-info-item"><div class="pd-info-label">Saisons</div><div class="pd-info-val">${(p.saisons || []).join(', ') || '—'}</div></div>
      <div class="pd-info-item"><div class="pd-info-label">Pluie</div><div class="pd-info-val">${p.pluie ? '✅ Oui' : '❌ Non'}</div></div>
      <div class="pd-info-item"><div class="pd-info-label">Status</div><div class="pd-info-val">${p.enLavage ? '🧺 En lavage' : p.disponible ? '✅ Disponible' : '⏸️ Inactif'}</div></div>
    </div>
    ${outfitsWithPiece.length > 0 ? `
      <div class="pd-outfits-list">
        <div class="pd-info-label" style="margin:12px 0 6px">Utilisée dans ${outfitsWithPiece.length} outfit(s) :</div>
        ${outfitsWithPiece.map(o => `<div class="pd-outfit-ref">🧩 ${esc(o.nom)}</div>`).join('')}
      </div>
    ` : ''}
  `;

  const lavageBtn = document.getElementById('pd-btn-lavage');
  if (lavageBtn) lavageBtn.textContent = p.enLavage ? '✅ Sortir du lavage' : '🧺 Mettre en lavage';

  openModal('modal-piece-detail');
}

function togglePieceLavage() {
  if (!_detailPieceId) return;
  const idx = data.pieces.findIndex(p => p.id === _detailPieceId);
  if (idx === -1) return;
  data.pieces[idx].enLavage = !data.pieces[idx].enLavage;
  data.pieces[idx].dateEnLavage = data.pieces[idx].enLavage ? new Date().toISOString() : null;
  saveAllNow(data);
  showToast(data.pieces[idx].enLavage ? '🧺 Mis en lavage' : '✅ Sorti du lavage', 'info');
  closeModal('modal-piece-detail');
  renderPiecesGrid(data.pieces, wardrobeFilter, wardrobeSearch);
}

function archivePiece() {
  if (!_detailPieceId) return;
  openConfirm('Archiver ce vêtement', 'Il ne sera plus utilisé dans la génération d\'outfits.', () => {
    const idx = data.pieces.findIndex(p => p.id === _detailPieceId);
    if (idx !== -1) { data.pieces[idx].archived = true; }
    saveAllNow(data);
    closeModal('modal-piece-detail');
    renderPiecesGrid(data.pieces, wardrobeFilter, wardrobeSearch);
    showToast('Pièce archivée', 'info');
  });
}

function editPieceFromDetail() {
  closeModal('modal-piece-detail');
  openEditPieceModal(_detailPieceId);
}

function deletePiece() {
  if (!_detailPieceId) return;
  openConfirm('Supprimer ce vêtement', 'Cette action est irréversible. La pièce sera retirée de tous les outfits.', () => {
    backup(data);
    data.pieces = data.pieces.filter(p => p.id !== _detailPieceId);
    // Remove from outfits
    data.outfits = data.outfits.map(o => ({ ...o, pieces: (o.pieces || []).filter(pid => pid !== _detailPieceId) }));
    saveAllNow(data);
    closeModal('modal-piece-detail');
    renderPiecesGrid(data.pieces, wardrobeFilter, wardrobeSearch);
    showToast('Pièce supprimée', 'warning');
  });
}

// ===== OUTFIT COMPOSER =====
let _editOutfitId = null;
let _droppedPieceIds = [];

export function openCreateOutfitModal(editId = null) {
  _editOutfitId = editId;
  _droppedPieceIds = [];

  document.getElementById('outfit-modal-title').textContent = editId ? 'Modifier l\'outfit' : 'Créer un outfit';
  document.getElementById('outfit-edit-id').value = editId || '';

  if (editId) {
    const o = data.outfits.find(x => x.id === editId);
    if (o) {
      document.getElementById('outfit-nom').value = o.nom;
      _droppedPieceIds = [...(o.pieces || [])];
      document.getElementById('outfit-tmin').value = o.tempMin ?? 5;
      document.getElementById('outfit-tmax').value = o.tempMax ?? 25;
      document.getElementById('o-tmin-label').textContent = (o.tempMin ?? 5) + '°C';
      document.getElementById('o-tmax-label').textContent = (o.tempMax ?? 25) + '°C';
      document.getElementById('outfit-pluie').checked = o.pluieOK || false;
      document.querySelectorAll('#outfit-moods .tag-toggle').forEach(t => t.classList.toggle('active', (o.moods || []).includes(t.dataset.val)));
      document.querySelectorAll('#outfit-saisons .tag-toggle').forEach(t => t.classList.toggle('active', (o.saisons || []).includes(t.dataset.val)));
    }
  } else {
    document.getElementById('outfit-nom').value = '';
    document.getElementById('outfit-tmin').value = 5;
    document.getElementById('outfit-tmax').value = 25;
    document.getElementById('o-tmin-label').textContent = '5°C';
    document.getElementById('o-tmax-label').textContent = '25°C';
    document.getElementById('outfit-pluie').checked = false;
    document.querySelectorAll('#outfit-moods .tag-toggle, #outfit-saisons .tag-toggle').forEach(t => t.classList.remove('active'));
  }

  composerCategory = 'all';
  composerSearch = '';
  document.getElementById('composer-search').value = '';
  document.querySelectorAll('#composer-filters .filter-btn').forEach((b, i) => b.classList.toggle('active', i === 0));

  renderDroppedPieces();
  renderComposerPieces();
  setupDropZone();
  openModal('modal-outfit');
}

function renderDroppedPieces() {
  const el = document.getElementById('dropped-pieces');
  if (!el) return;
  const pieceMap = {};
  for (const p of data.pieces) pieceMap[p.id] = p;

  if (_droppedPieceIds.length === 0) {
    el.innerHTML = '<div class="drop-hint">Glisse des pièces ici ou clique dessus →</div>';
  } else {
    el.innerHTML = _droppedPieceIds.map(pid => {
      const p = pieceMap[pid];
      if (!p) return '';
      const photo = p.photos && p.photos[0] ? `<img src="${p.photos[0]}" alt="" width="28" height="28" style="object-fit:cover;border-radius:4px">` : `<span>${catEmoji(p.categorie)}</span>`;
      return `<div class="dropped-piece">
        ${photo}
        <span>${esc(p.nom)}</span>
        <span class="dropped-piece-remove" data-id="${pid}">✕</span>
      </div>`;
    }).join('');

    el.querySelectorAll('.dropped-piece-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        _droppedPieceIds = _droppedPieceIds.filter(id => id !== btn.dataset.id);
        renderDroppedPieces();
        renderComputedColors();
        renderComposerPieces();
      });
    });
  }
  renderComputedColors();
}

function renderComputedColors() {
  const el = document.getElementById('outfit-computed-colors');
  if (!el) return;
  const pieceMap = {};
  for (const p of data.pieces) pieceMap[p.id] = p;
  const colors = [];
  for (const pid of _droppedPieceIds) {
    const p = pieceMap[pid];
    if (p && p.couleurs) colors.push(...p.couleurs);
  }
  const unique = [...new Set(colors)].slice(0, 8);
  el.innerHTML = unique.length > 0 ? unique.map(c => `<div style="width:20px;height:20px;border-radius:50%;background:${c};border:1px solid var(--border)" title="${c}"></div>`).join('') : '';
}

function renderComposerPieces() {
  const el = document.getElementById('composer-pieces');
  if (!el) return;
  let filtered = data.pieces.filter(p => !p.archived && p.disponible && !p.enLavage);
  if (composerCategory !== 'all') filtered = filtered.filter(p => p.categorie === composerCategory);
  if (composerSearch) {
    const q = composerSearch.toLowerCase();
    filtered = filtered.filter(p => p.nom.toLowerCase().includes(q));
  }

  el.innerHTML = filtered.map(p => {
    const added = _droppedPieceIds.includes(p.id);
    const photo = p.photos && p.photos[0] ? `<img class="composer-piece-img" src="${p.photos[0]}" alt="">` : `<div class="composer-piece-img" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem;background:var(--surface-3)">${catEmoji(p.categorie)}</div>`;
    return `
      <div class="composer-piece-card ${added ? 'added' : ''}" data-id="${p.id}" draggable="true">
        ${photo}
        <div class="composer-piece-name">${esc(p.nom)}</div>
        <div class="composer-piece-cat">${p.categorie}</div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.composer-piece-card').forEach(card => {
    card.addEventListener('click', () => {
      const pid = card.dataset.id;
      if (_droppedPieceIds.includes(pid)) {
        _droppedPieceIds = _droppedPieceIds.filter(id => id !== pid);
      } else {
        _droppedPieceIds.push(pid);
      }
      card.classList.toggle('added', _droppedPieceIds.includes(pid));
      renderDroppedPieces();
      renderComposerPieces();
    });
    // Drag
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('pieceId', card.dataset.id);
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });
}

function setupDropZone() {
  const zone = document.getElementById('outfit-drop-zone');
  if (!zone) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const pid = e.dataTransfer.getData('pieceId');
    if (pid && !_droppedPieceIds.includes(pid)) {
      _droppedPieceIds.push(pid);
      renderDroppedPieces();
      renderComposerPieces();
    }
  });
}

function saveOutfit() {
  const nom = document.getElementById('outfit-nom').value.trim();
  if (!nom) { showToast('Nom de l\'outfit requis', 'error'); return; }
  if (_droppedPieceIds.length === 0) { showToast('Ajoute au moins une pièce', 'error'); return; }

  const moods = Array.from(document.querySelectorAll('#outfit-moods .tag-toggle.active')).map(t => t.dataset.val);
  const saisons = Array.from(document.querySelectorAll('#outfit-saisons .tag-toggle.active')).map(t => t.dataset.val);
  const pieceMap = {};
  for (const p of data.pieces) pieceMap[p.id] = p;
  const colors = [...new Set(_droppedPieceIds.flatMap(pid => (pieceMap[pid]?.couleurs || [])))];

  const fields = {
    nom,
    pieces: [..._droppedPieceIds],
    moods, saisons,
    couleursGlobales: colors,
    tempMin: parseInt(document.getElementById('outfit-tmin').value),
    tempMax: parseInt(document.getElementById('outfit-tmax').value),
    pluieOK: document.getElementById('outfit-pluie').checked,
  };

  if (_editOutfitId) {
    const idx = data.outfits.findIndex(o => o.id === _editOutfitId);
    if (idx !== -1) {
      data.outfits[idx] = { ...data.outfits[idx], ...fields };
      showToast('Outfit modifié !', 'success');
    }
  } else {
    const outfit = createOutfit(fields);
    data.outfits.push(outfit);
    showToast('Outfit créé ! 🧩', 'success');
  }

  saveAllNow(data);
  closeModal('modal-outfit');
  renderOutfitsGrid(data.outfits, data.pieces, outfitFilter);
}

// ===== OUTFIT DETAIL =====
let _detailOutfitId = null;

export function openOutfitDetail(outfitId) {
  const o = data.outfits.find(x => x.id === outfitId);
  if (!o) return;
  _detailOutfitId = outfitId;

  document.getElementById('od-title').textContent = o.nom;
  const pieceMap = {};
  for (const p of data.pieces) pieceMap[p.id] = p;

  const body = document.getElementById('od-body');
  body.innerHTML = `
    <div class="od-stats">
      <div class="od-stat"><span class="od-stat-val">${o.nombrePorts}</span> ports</div>
      <div class="od-stat">Score <span class="od-stat-val">${o.score > 0 ? o.score.toFixed(1) : '—'}</span></div>
      ${o.dernierPort ? `<div class="od-stat">Dernier <span class="od-stat-val">${fmtDate(o.dernierPort)}</span></div>` : ''}
      <div class="od-stat">${o.favori ? '❤️ Favori' : ''}</div>
    </div>
    <div class="od-pieces-grid">
      ${(o.pieces || []).map(pid => {
        const p = pieceMap[pid];
        if (!p) return '';
        const photo = p.photos && p.photos[0] ? `<img class="od-piece-img" src="${p.photos[0]}" alt="">` : `<div class="od-piece-img" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem;background:var(--surface-3)">${catEmoji(p.categorie)}</div>`;
        return `<div class="od-piece">${photo}<div class="od-piece-name">${esc(p.nom)}</div></div>`;
      }).join('')}
    </div>
    <div class="outfit-tags" style="margin-bottom:12px">
      ${(o.moods||[]).map(m=>`<span class="tag tag-mood">${moodEmoji(m)} ${m}</span>`).join('')}
      ${(o.saisons||[]).map(s=>`<span class="tag tag-saison">${s}</span>`).join('')}
      <span class="tag">${o.tempMin}°C – ${o.tempMax}°C</span>
      ${o.pluieOK?'<span class="tag tag-pluie">🌧️ Pluie OK</span>':''}
    </div>
    ${o.notes && o.notes.length > 0 ? `
      <div class="od-notes">
        ${[...o.notes].reverse().slice(0,5).map(n=>`
          <div class="od-note-item">
            <div class="od-note-header">
              <span class="od-note-date">${fmtDateFull(n.date)}</span>
              <span class="od-note-stars">${'★'.repeat(n.note||0)}</span>
            </div>
            ${n.commentaire ? `<div class="od-note-comment">${esc(n.commentaire)}</div>` : ''}
          </div>
        `).join('')}
      </div>
    ` : ''}
  `;

  const toggleBtn = document.getElementById('od-btn-toggle');
  if (toggleBtn) toggleBtn.textContent = o.disponible ? '⏸️ Désactiver' : '▶️ Activer';

  openModal('modal-outfit-detail');
}

function editOutfitFromDetail() {
  closeModal('modal-outfit-detail');
  openCreateOutfitModal(_detailOutfitId);
}

function duplicateOutfit() {
  const o = data.outfits.find(x => x.id === _detailOutfitId);
  if (!o) return;
  const newOutfit = createOutfit({ ...o, nom: o.nom + ' (copie)' });
  data.outfits.push(newOutfit);
  saveAllNow(data);
  closeModal('modal-outfit-detail');
  renderOutfitsGrid(data.outfits, data.pieces, outfitFilter);
  showToast('Outfit dupliqué !', 'success');
}

function toggleOutfitAvailability() {
  const idx = data.outfits.findIndex(o => o.id === _detailOutfitId);
  if (idx === -1) return;
  data.outfits[idx].disponible = !data.outfits[idx].disponible;
  saveAllNow(data);
  closeModal('modal-outfit-detail');
  renderOutfitsGrid(data.outfits, data.pieces, outfitFilter);
  showToast(data.outfits[idx].disponible ? 'Outfit activé' : 'Outfit désactivé', 'info');
}

function archiveOutfit() {
  openConfirm('Archiver cet outfit', 'Il ne sera plus proposé dans la génération.', () => {
    const idx = data.outfits.findIndex(o => o.id === _detailOutfitId);
    if (idx !== -1) data.outfits[idx].archived = true;
    saveAllNow(data);
    closeModal('modal-outfit-detail');
    renderOutfitsGrid(data.outfits, data.pieces, outfitFilter);
    showToast('Outfit archivé', 'info');
  });
}

function deleteOutfit() {
  openConfirm('Supprimer cet outfit', 'Cette action est irréversible.', () => {
    backup(data);
    data.outfits = data.outfits.filter(o => o.id !== _detailOutfitId);
    saveAllNow(data);
    closeModal('modal-outfit-detail');
    renderOutfitsGrid(data.outfits, data.pieces, outfitFilter);
    showToast('Outfit supprimé', 'warning');
  });
}

// ===== RATING =====
function submitRating() {
  const date = document.getElementById('rate-date').value;
  const note = document.querySelectorAll('.star.active').length;
  const commentaire = document.getElementById('rate-comment').value.trim();

  const histIdx = data.history.findIndex(h => h.date === date);
  if (histIdx === -1) { closeModal('modal-rate'); return; }

  data.history[histIdx].note = note;
  data.history[histIdx].commentaire = commentaire;

  const outfitId = data.history[histIdx].outfitId;
  const oIdx = data.outfits.findIndex(o => o.id === outfitId);
  if (oIdx !== -1) {
    const notes = data.outfits[oIdx].notes || [];
    notes.push({ date, note, commentaire });
    data.outfits[oIdx].notes = notes;
    // Recalculate average score
    const avg = notes.reduce((a, n) => a + n.note, 0) / notes.length;
    data.outfits[oIdx].score = Math.round(avg * 10) / 10;
  }

  saveAllNow(data);
  closeModal('modal-rate');
  showToast(`Noté ${note} ⭐ – merci !`, 'success');
}

// ===== HISTORY DAY =====
export function openHistoryDay(date) {
  const h = data.history.find(x => x.date === date);
  if (!h) return;
  historyDayForRating = date;

  const o = data.outfits.find(x => x.id === h.outfitId);
  const pieceMap = {};
  for (const p of data.pieces) pieceMap[p.id] = p;

  document.getElementById('hd-title').textContent = fmtDateFull(date);

  const body = document.getElementById('hd-body');
  body.innerHTML = `
    ${o ? `<div style="margin-bottom:12px"><strong style="font-family:'Playfair Display',serif;font-size:1.1rem">${esc(o.nom)}</strong></div>` : '<div style="color:var(--text-tertiary)">Outfit supprimé</div>'}
    ${h.meteo ? `
      <div style="background:var(--surface-2);border-radius:var(--radius-sm);padding:12px;margin-bottom:12px;font-size:0.88rem;color:var(--text-secondary)">
        🌡️ ${h.meteo.temp}°C · Ressenti ${h.meteo.ressenti}°C · Vent ${h.meteo.vent} km/h ${h.meteo.pluie ? '· 🌧️ Pluie' : ''}
        ${h.meteo.description ? `· ${h.meteo.description}` : ''}
      </div>
    ` : ''}
    ${h.mood ? `<div style="margin-bottom:8px">${moodEmoji(h.mood)} ${h.mood}</div>` : ''}
    ${h.note ? `<div style="color:var(--warning)">${'★'.repeat(h.note)} ${h.note}/5</div>` : ''}
    ${h.commentaire ? `<div style="color:var(--text-secondary);font-size:0.88rem;margin-top:8px">${esc(h.commentaire)}</div>` : ''}
    ${o ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        ${(o.pieces||[]).slice(0,6).map(pid => {
          const p = pieceMap[pid];
          return p ? `<div style="text-align:center"><div style="width:56px;height:56px;border-radius:var(--radius-xs);overflow:hidden;background:var(--surface-3);display:flex;align-items:center;justify-content:center">${p.photos&&p.photos[0]?`<img src="${p.photos[0]}" style="width:100%;height:100%;object-fit:cover">`:`<span style="font-size:1.2rem">${catEmoji(p.categorie)}</span>`}</div><div style="font-size:0.65rem;color:var(--text-tertiary);margin-top:2px;max-width:56px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.nom)}</div></div>` : '';
        }).join('')}
      </div>
    ` : ''}
  `;

  openModal('modal-history-day');
}

// ===== SHARE =====
function openShare() {
  if (!currentOutfit) return;
  const pieceMap = {};
  for (const p of data.pieces) pieceMap[p.id] = p;

  const preview = document.getElementById('share-canvas-preview');
  if (preview) {
    preview.innerHTML = `
      <div id="share-card-content" style="padding:16px;text-align:left;width:100%">
        <div style="font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:700;margin-bottom:8px">✦ ${esc(currentOutfit.nom)}</div>
        <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:8px">${(currentOutfit.moods||[]).join(', ')} · ${currentOutfit.tempMin}–${currentOutfit.tempMax}°C</div>
        <div style="font-size:0.8rem;color:var(--text-secondary)">${(currentOutfit.pieces||[]).map(pid=>pieceMap[pid]?.nom||'').filter(Boolean).join(' · ')}</div>
        <div style="font-size:0.7rem;color:var(--text-tertiary);margin-top:8px">DailyFit · ${new Date().toLocaleDateString('fr-FR')}</div>
      </div>
    `;
  }
  openModal('modal-share');
}

function downloadOutfitImage() {
  const el = document.getElementById('share-card-content');
  if (!el || !window.html2canvas) { showToast('html2canvas non disponible', 'error'); return; }
  html2canvas(el, { backgroundColor: '#141414' }).then(canvas => {
    const a = document.createElement('a');
    a.download = `dailyfit-${currentOutfit?.nom || 'outfit'}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  });
}

function copyOutfitImage() {
  const el = document.getElementById('share-card-content');
  if (!el || !window.html2canvas) { showToast('Non disponible', 'error'); return; }
  html2canvas(el, { backgroundColor: '#141414' }).then(canvas => {
    canvas.toBlob(blob => {
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(() => {
        showToast('Image copiée !', 'success');
      }).catch(() => showToast('Impossible de copier', 'error'));
    });
  });
}

function copyOutfitText() {
  if (!currentOutfit) return;
  const pieceMap = {};
  for (const p of data.pieces) pieceMap[p.id] = p;
  const text = `✦ ${currentOutfit.nom}\n${(currentOutfit.moods||[]).join(', ')}\nPièces : ${(currentOutfit.pieces||[]).map(pid=>pieceMap[pid]?.nom||'').filter(Boolean).join(', ')}\nDailyFit`;
  navigator.clipboard.writeText(text).then(() => showToast('Texte copié !', 'success')).catch(() => showToast('Impossible', 'error'));
}

// ===== PLANNING =====
function initPlanning() {
  renderWeekPlanning(data.planning, currentWeather, rerollPlanningDay, null);
  if (Object.keys(data.planning).length === 0 && data.settings.autoGenerateOnOpen) {
    generateWeek();
  }
}

async function generateWeek() {
  const result = genererSemaine({
    settings: data.settings,
    pieces: data.pieces,
    outfits: data.outfits,
    history: data.history,
    weather: currentWeather,
    forecasts5: currentWeather?.forecasts5,
  });
  data.planning = result;
  saveAll(data);
  renderWeekPlanning(data.planning, currentWeather, rerollPlanningDay, null);
  showToast('Semaine planifiée !', 'success');
}

function rerollPlanningDay(jour) {
  const day = data.planning[jour];
  if (!day) return;
  const usedIds = Object.values(data.planning)
    .filter(d => d.jour !== jour && d.outfit)
    .map(d => d.outfit?.id).filter(Boolean);

  const gen = genererOutfit({
    mood: day.mood,
    date: day.date,
    weather: day.weather ? { feelsLike: day.weather.tempMoy, pluie: day.weather.pluie } : currentWeather,
    pieces: data.pieces,
    outfits: data.outfits,
    history: data.history,
    settings: data.settings,
    excludeIds: [day.outfit?.id, ...usedIds].filter(Boolean),
  });

  data.planning[jour] = { ...day, outfit: gen.outfit, isFallback: gen.isFallback };
  saveAll(data);
  renderWeekPlanning(data.planning, currentWeather, rerollPlanningDay, null);
}

function validateWeek() {
  Object.keys(data.planning).forEach(jour => {
    if (data.planning[jour]) data.planning[jour].validated = true;
  });
  saveAll(data);
  renderWeekPlanning(data.planning, currentWeather, rerollPlanningDay, null);
  showToast('Semaine validée ! ✅', 'success');
}

// ===== ONBOARDING =====
function showOnboarding() {
  document.getElementById('onboarding-overlay')?.classList.remove('hidden');
  setupOnboarding();
}

function setupOnboarding() {
  // Step 1 → 2
  document.getElementById('ob-next-1')?.addEventListener('click', () => {
    goToObStep(2);
  });

  // Theme pick in onboarding
  document.querySelectorAll('[data-theme-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.themePick;
      data.settings.theme = theme;
      applyTheme(theme);
      saveAll(data);
      document.querySelectorAll('[data-theme-pick]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll(`[data-theme-pick="${theme}"]`).forEach(b => b.classList.add('active'));
    });
  });

  // Step 2 → 3
  document.getElementById('ob-next-2')?.addEventListener('click', async () => {
    const key = document.getElementById('ob-api-key')?.value.trim();
    const city = document.getElementById('ob-city')?.value.trim() || 'Paris';
    if (key) {
      data.settings.apiWeatherKey = key;
      const geo = await import('./weather.js').then(m => m.geocodeCity(city, key));
      if (geo) { data.settings.ville = geo.name || city; data.settings.latitude = geo.lat; data.settings.longitude = geo.lon; }
      else data.settings.ville = city;
    } else {
      data.settings.ville = city;
    }
    saveAll(data);
    goToObStep(3);
  });

  document.getElementById('ob-skip-2')?.addEventListener('click', () => goToObStep(3));

  // Add piece from onboarding
  document.getElementById('ob-add-piece-btn')?.addEventListener('click', () => {
    openAddPieceModal();
  });

  // Finish
  document.getElementById('ob-finish-btn')?.addEventListener('click', () => finishOnboarding());
}

function goToObStep(step) {
  document.querySelectorAll('.onboarding-step').forEach(s => s.classList.remove('active'));
  document.querySelector(`.onboarding-step[data-step="${step}"]`)?.classList.add('active');
  document.querySelectorAll('.ob-dot').forEach(d => d.classList.toggle('active', parseInt(d.dataset.step) <= step));
}

function updateOnboardingCount() {
  const countEl = document.getElementById('ob-count');
  if (countEl) countEl.textContent = data.pieces.length;
  const finishBtn = document.getElementById('ob-finish-btn');
  if (finishBtn) finishBtn.disabled = data.pieces.length < 1;
  const preview = document.getElementById('ob-pieces-preview');
  if (preview) {
    preview.innerHTML = data.pieces.slice(-5).map(p => `<div class="ob-piece-chip">${catEmoji(p.categorie)} ${esc(p.nom)}</div>`).join('');
  }
}

function finishOnboarding() {
  document.getElementById('onboarding-overlay')?.classList.add('hidden');
  saveAllNow(data);
  initHomeView();
}

// ===== HELPERS =====
function setupTagSelector(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.addEventListener('click', e => {
    const btn = e.target.closest('.tag-toggle');
    if (btn) btn.classList.toggle('active');
  });
}

function openConfirm(title, msg, onConfirm) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  pendingConfirmAction = onConfirm;
  openModal('modal-confirm');
}

function onSettingsUpdate() {
  applyTheme(data.settings.theme);
  toggleVoyageBanner();
  if (currentView === 'home') {
    invalidateCache();
    initHomeView();
  }
}

function fmtDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
}

function fmtDateFull(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  const jours = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const mois = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  return `${jours[d.getDay()]} ${d.getDate()} ${mois[d.getMonth()]}`;
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Expose to global for HTML onclick and settings module
window.app = { navigate, openAddPieceModal, openPieceDetail, openOutfitDetail, openHistoryDay };

// Start
init();
