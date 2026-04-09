// ===== SETTINGS.JS — Rendu et gestion des paramètres =====
import { saveAll, exportJSON, parseImport, backup, DEFAULT_SETTINGS } from './data.js';
import { testApiKey, geocodeCity, invalidateCache } from './weather.js';
import { showToast, openModal, closeModal } from './ui.js';

let _data = null;
let _onUpdate = null;
let _importParsed = null;

export function initSettings(data, onUpdate) {
  _data = data;
  _onUpdate = onUpdate;
}

export function renderSettings() {
  const el = document.getElementById('settings-content');
  if (!el) return;
  const s = _data.settings;

  el.innerHTML = `
    <!-- 1. Localisation -->
    <div class="settings-section">
      <h2 class="settings-section-title">📍 Localisation & Météo</h2>
      <div class="setting-row">
        <div><div class="setting-label">Ville</div><div class="setting-desc">Utilisée pour la météo</div></div>
        <div class="setting-control" style="display:flex;gap:8px;align-items:center;">
          <input type="text" id="s-ville" value="${esc(s.ville)}" style="width:120px">
          <button class="btn-sm" id="s-ville-save">Enregistrer</button>
        </div>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Coordonnées</div><div class="setting-desc">Lat: ${s.latitude.toFixed(4)}, Lon: ${s.longitude.toFixed(4)}</div></div>
        <button class="btn-sm" id="s-geolocate">📍 Me localiser</button>
      </div>

      <!-- 2. API Key -->
      <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:10px;">
        <div class="setting-label">Clé API OpenWeatherMap</div>
        <div style="display:flex;gap:8px;width:100%;">
          <input type="password" id="s-api-key" value="${esc(s.apiWeatherKey)}" placeholder="Colle ta clé ici..." style="flex:1">
          <button class="btn-sm" id="s-toggle-key">👁️</button>
          <button class="btn-sm" id="s-test-key">Tester</button>
        </div>
        <p class="field-hint">Obtenir une clé gratuite sur <a href="https://openweathermap.org/api" target="_blank" class="link-accent">openweathermap.org/api</a> → API Keys</p>
        <div id="s-key-status"></div>
      </div>
    </div>

    <!-- 3. Génération -->
    <div class="settings-section">
      <h2 class="settings-section-title">🎲 Comportement de génération</h2>
      <div class="setting-row">
        <div><div class="setting-label">Génération automatique à l'ouverture</div></div>
        <label class="toggle-switch"><input type="checkbox" id="s-auto-gen" class="toggle-input" ${s.autoGenerateOnOpen ? 'checked' : ''}><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Distinguer météo matin / soir</div><div class="setting-desc">Affiche une alerte si écart important</div></div>
        <label class="toggle-switch"><input type="checkbox" id="s-matin-soir" class="toggle-input" ${s.distinguerMeteoMatinSoir ? 'checked' : ''}><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Seuil écart matin/soir : <strong id="s-seuil-label">${s.seuilEcartMatin}°C</strong></div></div>
        <input type="range" id="s-seuil-matin" min="3" max="15" value="${s.seuilEcartMatin}" class="range-input" style="width:140px">
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Éviter répétition de couleur</div><div class="setting-desc">Ne pas reproposer même couleur 2 jours de suite</div></div>
        <label class="toggle-switch"><input type="checkbox" id="s-evit-coul" class="toggle-input" ${s.eviterRepetitionCouleur ? 'checked' : ''}><span class="toggle-slider"></span></label>
      </div>
      <div class="setting-row">
        <div><div class="setting-label">Fenêtre de répétition : <strong id="s-fenetre-label">${s.fenetreRepetition} jours</strong></div></div>
        <input type="range" id="s-fenetre" min="1" max="14" value="${s.fenetreRepetition}" class="range-input" style="width:140px">
      </div>
    </div>

    <!-- 4. Semaine type -->
    <div class="settings-section">
      <h2 class="settings-section-title">📅 Semaine type</h2>
      <div class="week-type-grid">
        ${['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'].map(j => `
          <div class="week-day-select">
            <div class="week-day-label">${j.slice(0,3)}</div>
            <select id="s-day-${j}">
              <option value="travail" ${s.semaineType[j]==='travail'?'selected':''}>💼</option>
              <option value="chill" ${s.semaineType[j]==='chill'?'selected':''}>😎</option>
              <option value="soirée" ${s.semaineType[j]==='soirée'?'selected':''}>🌙</option>
              <option value="sport" ${s.semaineType[j]==='sport'?'selected':''}>🏃</option>
              <option value="old money" ${s.semaineType[j]==='old money'?'selected':''}>👑</option>
            </select>
          </div>
        `).join('')}
      </div>
      <button class="btn-secondary" id="s-save-week" style="margin-top:12px;">Enregistrer</button>
    </div>

    <!-- 5. Seuils température -->
    <div class="settings-section">
      <h2 class="settings-section-title">🌡️ Seuils de température</h2>
      <div class="temp-thresholds-grid">
        ${[
          ['hiverFroid','Hiver froid (< X°C)', -10, 10],
          ['hiverDoux','Hiver doux (< X°C)', 0, 15],
          ['miSaison','Mi-saison (< X°C)', 10, 22],
          ['printemps','Printemps (< X°C)', 16, 28],
          ['ete','Été (< X°C)', 20, 32],
        ].map(([key, label, min, max]) => `
          <div class="setting-row" style="flex-direction:column;align-items:flex-start;gap:6px;border-bottom:1px solid var(--border);padding:10px 0;">
            <div class="setting-label">${label.replace('X', `<span id="s-seuil-${key}-label">${s.seuilsTemperature[key]}</span>`)}</div>
            <input type="range" id="s-seuil-${key}" min="${min}" max="${max}" value="${s.seuilsTemperature[key]}" class="range-input" style="width:100%">
          </div>
        `).join('')}
      </div>
      <button class="btn-secondary" id="s-save-seuils" style="margin-top:12px;">Enregistrer les seuils</button>
    </div>

    <!-- 6. Thème -->
    <div class="settings-section">
      <h2 class="settings-section-title">🎨 Apparence</h2>
      <div class="setting-row">
        <div class="setting-label">Thème</div>
        <div style="display:flex;gap:8px;">
          <button class="theme-btn ${s.theme==='dark'?'active':''}" data-theme-pick="dark">🌙 Sombre</button>
          <button class="theme-btn ${s.theme==='light'?'active':''}" data-theme-pick="light">☀️ Clair</button>
          <button class="theme-btn ${s.theme==='auto'?'active':''}" data-theme-pick="auto">🖥️ Auto</button>
        </div>
      </div>
    </div>

    <!-- 7. Données -->
    <div class="settings-section">
      <h2 class="settings-section-title">💾 Données</h2>
      <div class="setting-row">
        <div><div class="setting-label">Espace utilisé</div><div class="setting-desc" id="s-storage-size">Calcul...</div></div>
      </div>
      <div class="settings-data-btns">
        <button class="btn-secondary" id="s-export">⬇️ Exporter (JSON)</button>
        <button class="btn-secondary" id="s-import-trigger">⬆️ Importer (JSON)</button>
        <button class="btn-danger" id="s-reset">🗑️ Réinitialiser</button>
        <input type="file" id="s-import-input" accept=".json" class="hidden">
      </div>
    </div>

    <!-- 8. Mode Voyage -->
    <div class="settings-section">
      <h2 class="settings-section-title">✈️ Mode Voyage</h2>
      <div class="setting-row">
        <div><div class="setting-label">Activer le mode voyage</div><div class="setting-desc">Seules les pièces sélectionnées seront utilisées</div></div>
        <label class="toggle-switch"><input type="checkbox" id="s-voyage" class="toggle-input" ${s.modeVoyage ? 'checked' : ''}><span class="toggle-slider"></span></label>
      </div>
      <button class="btn-secondary" id="s-open-voyage" style="margin-top:8px;">✈️ Gérer les pièces du voyage</button>
    </div>
  `;

  attachSettingsEvents();
  updateStorageSize();
}

function attachSettingsEvents() {
  const s = _data.settings;

  // Ville save
  document.getElementById('s-ville-save')?.addEventListener('click', async () => {
    const ville = document.getElementById('s-ville').value.trim();
    if (!ville) return;
    const geo = await geocodeCity(ville, s.apiWeatherKey);
    if (geo) {
      _data.settings.ville = geo.name || ville;
      _data.settings.latitude = geo.lat;
      _data.settings.longitude = geo.lon;
    } else {
      _data.settings.ville = ville;
    }
    invalidateCache();
    saveAndUpdate();
    showToast(`Ville mise à jour : ${_data.settings.ville}`, 'success');
  });

  // Geolocate
  document.getElementById('s-geolocate')?.addEventListener('click', () => {
    if (!navigator.geolocation) { showToast('Géolocalisation non disponible', 'error'); return; }
    navigator.geolocation.getCurrentPosition(pos => {
      _data.settings.latitude = pos.coords.latitude;
      _data.settings.longitude = pos.coords.longitude;
      invalidateCache();
      saveAndUpdate();
      showToast('Position mise à jour !', 'success');
      renderSettings();
    }, () => showToast('Impossible d\'obtenir la position', 'error'));
  });

  // API key toggle visibility
  document.getElementById('s-toggle-key')?.addEventListener('click', () => {
    const inp = document.getElementById('s-api-key');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  // Test API key
  document.getElementById('s-test-key')?.addEventListener('click', async () => {
    const key = document.getElementById('s-api-key').value.trim();
    const status = document.getElementById('s-key-status');
    if (!key) { showToast('Saisis d\'abord une clé', 'warning'); return; }
    status.textContent = 'Test en cours...';
    status.style.color = 'var(--text-secondary)';
    const result = await testApiKey(key, _data.settings.latitude, _data.settings.longitude);
    if (result.ok) {
      _data.settings.apiWeatherKey = key;
      invalidateCache();
      saveAndUpdate();
      status.textContent = '✅ Clé valide !';
      status.style.color = 'var(--success)';
      showToast('Clé API valide et enregistrée !', 'success');
    } else {
      status.textContent = `❌ ${result.error}`;
      status.style.color = 'var(--error)';
    }
  });

  // Auto gen
  document.getElementById('s-auto-gen')?.addEventListener('change', e => {
    _data.settings.autoGenerateOnOpen = e.target.checked;
    saveAndUpdate();
  });

  // Matin/soir
  document.getElementById('s-matin-soir')?.addEventListener('change', e => {
    _data.settings.distinguerMeteoMatinSoir = e.target.checked;
    saveAndUpdate();
  });

  // Seuil matin
  document.getElementById('s-seuil-matin')?.addEventListener('input', e => {
    const v = parseInt(e.target.value);
    _data.settings.seuilEcartMatin = v;
    document.getElementById('s-seuil-label').textContent = v + '°C';
    saveAndUpdate();
  });

  // Eviter couleur
  document.getElementById('s-evit-coul')?.addEventListener('change', e => {
    _data.settings.eviterRepetitionCouleur = e.target.checked;
    saveAndUpdate();
  });

  // Fenetre
  document.getElementById('s-fenetre')?.addEventListener('input', e => {
    const v = parseInt(e.target.value);
    _data.settings.fenetreRepetition = v;
    document.getElementById('s-fenetre-label').textContent = v + ' jours';
    saveAndUpdate();
  });

  // Week type save
  document.getElementById('s-save-week')?.addEventListener('click', () => {
    ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'].forEach(j => {
      const sel = document.getElementById(`s-day-${j}`);
      if (sel) _data.settings.semaineType[j] = sel.value;
    });
    saveAndUpdate();
    showToast('Semaine type enregistrée', 'success');
  });

  // Seuils temp
  ['hiverFroid','hiverDoux','miSaison','printemps','ete'].forEach(key => {
    document.getElementById(`s-seuil-${key}`)?.addEventListener('input', e => {
      _data.settings.seuilsTemperature[key] = parseInt(e.target.value);
      const lbl = document.getElementById(`s-seuil-${key}-label`);
      if (lbl) lbl.textContent = e.target.value;
    });
  });
  document.getElementById('s-save-seuils')?.addEventListener('click', () => {
    saveAndUpdate();
    showToast('Seuils enregistrés', 'success');
  });

  // Theme buttons
  document.querySelectorAll('[data-theme-pick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.themePick;
      _data.settings.theme = theme;
      applyTheme(theme);
      saveAndUpdate();
      document.querySelectorAll('[data-theme-pick]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll(`[data-theme-pick="${theme}"]`).forEach(b => b.classList.add('active'));
    });
  });

  // Export
  document.getElementById('s-export')?.addEventListener('click', () => {
    exportJSON(_data);
    showToast('Export téléchargé !', 'success');
  });

  // Import
  document.getElementById('s-import-trigger')?.addEventListener('click', () => {
    document.getElementById('s-import-input').click();
  });

  document.getElementById('s-import-input')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const result = parseImport(text);
    if (!result.valid) {
      showToast('Fichier JSON invalide', 'error');
      return;
    }
    _importParsed = result.parsed;
    const preview = document.getElementById('import-preview');
    if (preview) {
      preview.innerHTML = `
        <div class="import-preview-info">
          <div class="import-stat"><span>Pièces</span><strong>${result.summary.pieces}</strong></div>
          <div class="import-stat"><span>Outfits</span><strong>${result.summary.outfits}</strong></div>
          <div class="import-stat"><span>Jours d'historique</span><strong>${result.summary.history}</strong></div>
        </div>
      `;
    }
    openModal('modal-import');
    e.target.value = '';
  });

  document.getElementById('btn-confirm-import')?.addEventListener('click', () => {
    confirmImport();
  });

  // Reset
  document.getElementById('s-reset')?.addEventListener('click', () => {
    openConfirm(
      'Réinitialiser toutes les données',
      'Cette action supprimera TOUTES tes pièces, outfits et ton historique. Un backup sera sauvegardé automatiquement.',
      () => {
        backup(_data);
        _data.pieces = [];
        _data.outfits = [];
        _data.history = [];
        _data.planning = {};
        _data.voyagePieces = [];
        saveAndUpdate();
        showToast('Données réinitialisées', 'warning');
        renderSettings();
      }
    );
  });

  // Voyage toggle
  document.getElementById('s-voyage')?.addEventListener('change', e => {
    _data.settings.modeVoyage = e.target.checked;
    saveAndUpdate();
    toggleVoyageBanner();
  });

  document.getElementById('s-open-voyage')?.addEventListener('click', () => {
    openVoyageModal();
  });

  // Save voyage
  document.getElementById('btn-save-voyage')?.addEventListener('click', () => {
    saveVoyagePieces();
  });
}

function confirmImport() {
  if (!_importParsed) return;
  const mode = document.getElementById('import-mode')?.value || 'merge';
  backup(_data);
  if (mode === 'replace') {
    _data.pieces = _importParsed.pieces;
    _data.outfits = _importParsed.outfits;
    _data.history = _importParsed.history;
    if (_importParsed.settings) {
      _data.settings = { ...DEFAULT_SETTINGS, ..._importParsed.settings };
    }
  } else {
    // Merge: avoid duplicate IDs
    const existingPieceIds = new Set(_data.pieces.map(p => p.id));
    const existingOutfitIds = new Set(_data.outfits.map(o => o.id));
    const existingHistoryDates = new Set(_data.history.map(h => h.date));
    _data.pieces = [..._data.pieces, ..._importParsed.pieces.filter(p => !existingPieceIds.has(p.id))];
    _data.outfits = [..._data.outfits, ..._importParsed.outfits.filter(o => !existingOutfitIds.has(o.id))];
    _data.history = [..._data.history, ..._importParsed.history.filter(h => !existingHistoryDates.has(h.date))];
  }
  saveAndUpdate();
  closeModal('modal-import');
  showToast('Import réussi !', 'success');
  _importParsed = null;
}

export function openVoyageModal() {
  const list = document.getElementById('voyage-pieces-list');
  if (!list) return;
  const voyageSet = new Set(_data.voyagePieces || []);
  list.innerHTML = _data.pieces
    .filter(p => !p.archived)
    .sort((a, b) => a.categorie.localeCompare(b.categorie))
    .map(p => `
      <div class="voyage-piece-item ${voyageSet.has(p.id) ? 'checked' : ''}" data-id="${p.id}">
        <input type="checkbox" ${voyageSet.has(p.id) ? 'checked' : ''} data-id="${p.id}">
        <div>
          <div class="voyage-piece-name">${esc(p.nom)}</div>
          <div class="voyage-piece-cat">${p.categorie}</div>
        </div>
      </div>
    `).join('');

  // Toggle on click
  list.querySelectorAll('.voyage-piece-item').forEach(item => {
    item.addEventListener('click', e => {
      const cb = item.querySelector('input[type="checkbox"]');
      if (e.target !== cb) cb.checked = !cb.checked;
      item.classList.toggle('checked', cb.checked);
    });
  });

  openModal('modal-voyage');
}

export function saveVoyagePieces() {
  const checkboxes = document.querySelectorAll('#voyage-pieces-list input[type="checkbox"]');
  _data.voyagePieces = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.dataset.id);
  saveAndUpdate();
  closeModal('modal-voyage');
  showToast(`${_data.voyagePieces.length} pièce(s) sélectionnée(s) pour le voyage`, 'success');
}

export function toggleVoyageBanner() {
  const banner = document.getElementById('voyage-banner');
  if (banner) {
    banner.classList.toggle('hidden', !_data.settings.modeVoyage);
  }
}

export function applyTheme(theme) {
  let actual = theme;
  if (theme === 'auto') {
    actual = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', actual);
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = actual === 'dark' ? '🌙' : '☀️';
}

function updateStorageSize() {
  const el = document.getElementById('s-storage-size');
  if (!el) return;
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('dailyfit')) {
      total += (localStorage.getItem(key) || '').length;
    }
  }
  const mb = (total / (1024 * 1024)).toFixed(2);
  el.textContent = `${mb} MB utilisé${mb > 4 ? ' ⚠️ Attention : proche de la limite' : ''}`;
  if (mb > 4) el.style.color = 'var(--warning)';
}

function saveAndUpdate() {
  saveAll(_data);
  if (_onUpdate) _onUpdate();
}

function openConfirm(title, msg, onConfirm) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  const btn = document.getElementById('btn-confirm-action');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', () => {
    onConfirm();
    closeModal('modal-confirm');
  });
  openModal('modal-confirm');
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
