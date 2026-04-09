// ===== UI.JS — Rendu DOM & animations =====

// ---- TOAST ----
export function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

// ---- MODALS ----
export function openModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

export function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('hidden');
  // Only restore scroll if no other modal open
  if (!document.querySelector('.modal-overlay:not(.hidden)')) {
    document.body.style.overflow = '';
  }
}

// ---- NAVIGATION ----
export function navigateTo(viewId) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.classList.add('hidden');
  });
  const target = document.getElementById(`view-${viewId}`);
  if (target) {
    target.classList.remove('hidden');
    target.classList.add('active');
  }
  // Update nav items
  document.querySelectorAll('.nav-item, .bnav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewId);
  });
}

// ---- WEATHER WIDGET ----
export function renderWeatherWidget(weather) {
  const el = document.getElementById('weather-widget');
  if (!el) return;

  if (!weather || weather.error === 'no_key') {
    el.innerHTML = `<span class="weather-detail">🔑 <a href="#" onclick="window.app?.navigate('settings')" class="link-accent">Ajouter une clé météo</a></span>`;
    return;
  }
  if (weather.error) {
    el.innerHTML = `<span class="weather-detail" style="color:var(--error)">⚠️ Météo indisponible</span>`;
    return;
  }

  const emoji = getWeatherEmoji(weather.icon);
  el.innerHTML = `
    <span class="weather-icon">${emoji}</span>
    <span class="weather-temp">${weather.temp}°C</span>
    <div class="weather-details">
      <span>Ressenti ${weather.feelsLike}°C</span>
      <span> · Vent ${weather.windSpeed} km/h</span>
      ${weather.pluie ? '<span> · 🌧️ Pluie prévue</span>' : ''}
      ${weather.ville ? `<span> · ${weather.ville}</span>` : ''}
    </div>
  `;
}

function getWeatherEmoji(icon) {
  if (!icon) return '🌡️';
  const code = icon.slice(0, 2);
  const map = { '01':'☀️','02':'🌤️','03':'⛅','04':'☁️','09':'🌧️','10':'🌦️','11':'⛈️','13':'❄️','50':'🌫️' };
  return map[code] || '🌡️';
}

// ---- OUTFIT CARD ----
export function renderOutfitCard(outfit, pieces, { isFallback, fallbackReasons, weather, currentMood } = {}) {
  const nameEl = document.getElementById('outfit-name');
  const tagsEl = document.getElementById('outfit-tags');
  const piecesEl = document.getElementById('outfit-pieces-mini');
  const badgesEl = document.getElementById('outfit-badges');
  const loadedEl = document.getElementById('outfit-loaded');
  const emptyEl = document.getElementById('outfit-empty-state');
  const favBtn = document.getElementById('fav-heart');
  const scoreEl = document.getElementById('outfit-score');
  const fallbackAlert = document.getElementById('fallback-alert');

  if (!outfit) {
    loadedEl?.classList.add('hidden');
    emptyEl?.classList.remove('hidden');
    fallbackAlert?.classList.add('hidden');
    updateAvatarColors([]);
    return;
  }

  loadedEl?.classList.remove('hidden');
  emptyEl?.classList.add('hidden');

  // Name
  if (nameEl) nameEl.textContent = outfit.nom;

  // Score + fav
  if (scoreEl) {
    const stars = outfit.score > 0 ? '★'.repeat(Math.round(outfit.score)) + '☆'.repeat(5 - Math.round(outfit.score)) : '—';
    scoreEl.textContent = outfit.score > 0 ? `${stars} ${outfit.score.toFixed(1)}` : '';
  }
  if (favBtn) {
    favBtn.textContent = outfit.favori ? '❤️' : '🤍';
    favBtn.classList.toggle('active', outfit.favori);
  }

  // Tags
  if (tagsEl) {
    const tags = [];
    (outfit.moods || []).forEach(m => tags.push(`<span class="tag tag-mood">${moodEmoji(m)} ${m}</span>`));
    (outfit.saisons || []).forEach(s => tags.push(`<span class="tag tag-saison">${s}</span>`));
    if (outfit.pluieOK) tags.push(`<span class="tag tag-pluie">🌧️ Pluie OK</span>`);
    tags.push(`<span class="tag">${outfit.tempMin}°C – ${outfit.tempMax}°C</span>`);
    tagsEl.innerHTML = tags.join('');
  }

  // Pieces mini chips
  const pieceMap = {};
  for (const p of pieces) pieceMap[p.id] = p;
  if (piecesEl) {
    piecesEl.innerHTML = (outfit.pieces || []).map(pid => {
      const p = pieceMap[pid];
      if (!p) return '';
      const photo = p.photos && p.photos[0]
        ? `<img class="piece-mini-photo" src="${p.photos[0]}" alt="${esc(p.nom)}">`
        : `<span class="piece-mini-placeholder">${catEmoji(p.categorie)}</span>`;
      return `<div class="piece-mini-chip">${photo}<span>${esc(p.nom)}</span></div>`;
    }).join('');
  }

  // Badges (fallback)
  if (badgesEl && isFallback && fallbackReasons) {
    badgesEl.innerHTML = fallbackReasons.slice(0, 3).map(r => `<span class="badge badge-warn">⚠️ ${esc(r)}</span>`).join('');
  } else if (badgesEl) {
    badgesEl.innerHTML = '';
  }

  // Fallback alert
  if (fallbackAlert) {
    if (isFallback) {
      fallbackAlert.textContent = '⚠️ Aucun outfit parfait — meilleure approximation affichée.';
      fallbackAlert.classList.remove('hidden');
    } else {
      fallbackAlert.classList.add('hidden');
    }
  }

  // Update avatar colors
  const outfitPieces = (outfit.pieces || []).map(pid => pieceMap[pid]).filter(Boolean);
  updateAvatarColors(outfitPieces);
  setupAvatarHover(outfitPieces);

  // Animate card
  const card = document.getElementById('main-outfit-card');
  if (card) {
    card.classList.remove('card-enter', 'card-enter-right');
    void card.offsetWidth; // reflow
    card.classList.add('card-enter');
  }
}

// ---- AVATAR ----
export function updateAvatarColors(pieces) {
  const root = document.documentElement;
  const catMap = {};
  for (const p of pieces) {
    catMap[p.categorie] = p;
  }

  const get = (cat) => {
    const p = catMap[cat];
    return p && p.couleurs && p.couleurs.length > 0 ? p.couleurs[0] : null;
  };

  const haut = get('haut');
  const bas = get('bas');
  const shoes = get('chaussures');
  const manteau = get('manteau');
  const veste = get('veste');
  const pull = get('pull');

  root.style.setProperty('--av-haut', haut || '#3a3a4a');
  root.style.setProperty('--av-bas', bas || '#1a1a2e');
  root.style.setProperty('--av-shoes', shoes || '#111111');
  root.style.setProperty('--av-manteau', manteau || 'transparent');
  root.style.setProperty('--av-veste', veste || 'transparent');
  root.style.setProperty('--av-pull', pull || 'transparent');

  // Show/hide layers
  const manteauLayer = document.getElementById('av-manteau-layer');
  const vesteLayer = document.getElementById('av-veste-layer');
  const pullLayer = document.getElementById('av-pull-layer');
  if (manteauLayer) manteauLayer.style.display = manteau ? 'block' : 'none';
  if (vesteLayer) vesteLayer.style.display = veste ? 'block' : 'none';
  if (pullLayer) pullLayer.style.display = pull ? 'block' : 'none';
}

export function setupAvatarHover(pieces) {
  const catMap = {};
  for (const p of pieces) {
    if (!catMap[p.categorie]) catMap[p.categorie] = p;
  }

  const tooltip = document.getElementById('lg-tooltip');
  const tooltipImg = document.getElementById('lg-img');
  const tooltipName = document.getElementById('lg-name');
  const tooltipCat = document.getElementById('lg-cat');

  const zones = document.querySelectorAll('.av-hover');
  zones.forEach(zone => {
    zone.addEventListener('mouseenter', (e) => {
      const cat = zone.dataset.cat;
      const label = zone.dataset.label || cat;
      const piece = catMap[cat];
      if (!tooltip) return;

      if (piece) {
        if (tooltipImg) {
          tooltipImg.src = piece.photos && piece.photos[0] ? piece.photos[0] : '';
          tooltipImg.style.display = piece.photos && piece.photos[0] ? 'block' : 'none';
        }
        if (tooltipName) tooltipName.textContent = piece.nom;
        if (tooltipCat) tooltipCat.textContent = label;
      } else {
        if (tooltipImg) { tooltipImg.src = ''; tooltipImg.style.display = 'none'; }
        if (tooltipName) tooltipName.textContent = 'Aucune pièce';
        if (tooltipCat) tooltipCat.textContent = label;
      }
      tooltip.classList.remove('hidden');
    });

    zone.addEventListener('mouseleave', () => {
      tooltip?.classList.add('hidden');
    });
  });
}

// ---- PIECES GRID ----
export function renderPiecesGrid(pieces, filter = 'all', search = '') {
  const grid = document.getElementById('pieces-grid');
  if (!grid) return;

  let filtered = pieces.filter(p => !p.archived);
  if (filter !== 'all') filtered = filtered.filter(p => p.categorie === filter);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(p => p.nom.toLowerCase().includes(q) || p.categorie.toLowerCase().includes(q));
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">👔</div>
      <h3>Garde-robe vide</h3>
      <p>Ajoute tes premiers vêtements pour commencer !</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(p => {
    const photo = p.photos && p.photos[0] ? `<img src="${p.photos[0]}" alt="${esc(p.nom)}" loading="lazy">` : `<div class="piece-photo-placeholder">${catEmoji(p.categorie)}</div>`;
    const colors = (p.couleurs || []).slice(0, 5).map(c => `<div class="piece-color-dot" style="background:${c}"></div>`).join('');
    let statusBadge = '';
    if (p.enLavage) statusBadge = `<span class="piece-card-status status-lavage">🧺 Lavage</span>`;
    else if (!p.disponible) statusBadge = `<span class="piece-card-status status-inactive">⏸️ Inactif</span>`;
    return `
      <div class="piece-card stagger" data-id="${p.id}">
        <div class="piece-card-photo">${photo}${statusBadge}${p.favori ? '<span class="piece-card-fav">❤️</span>' : ''}</div>
        <div class="piece-card-body">
          <div class="piece-card-name">${esc(p.nom)}</div>
          <div class="piece-card-cat">${p.categorie}</div>
          <div class="piece-card-colors">${colors}</div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.piece-card').forEach(card => {
    card.addEventListener('click', () => {
      if (window.app) window.app.openPieceDetail(card.dataset.id);
    });
  });
}

// ---- OUTFITS GRID ----
export function renderOutfitsGrid(outfits, pieces, filter = 'all') {
  const grid = document.getElementById('outfits-grid');
  if (!grid) return;

  const pieceMap = {};
  for (const p of pieces) pieceMap[p.id] = p;

  let filtered = outfits.filter(o => !o.archived);
  if (filter !== 'all') filtered = filtered.filter(o => (o.moods || []).includes(filter));

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">🧩</div>
      <h3>Aucun outfit</h3>
      <p>Crée ton premier outfit depuis ta garde-robe !</p>
    </div>`;
    return;
  }

  grid.innerHTML = filtered.map(o => {
    const moodLabel = (o.moods || []).join(', ') || '—';
    const stars = o.score > 0 ? `★ ${o.score.toFixed(1)}` : '';
    const pieces4 = (o.pieces || []).slice(0, 4).map(pid => {
      const p = pieceMap[pid];
      if (!p || !p.photos || !p.photos[0]) return `<div class="outfit-mosaic-cell" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem">${p ? catEmoji(p.categorie) : '?'}</div>`;
      return `<div class="outfit-mosaic-cell"><img src="${p.photos[0]}" alt="" loading="lazy"></div>`;
    });
    while (pieces4.length < 4) pieces4.push('<div class="outfit-mosaic-cell"></div>');

    return `
      <div class="outfit-grid-card" data-id="${o.id}">
        <div class="outfit-mosaic">${pieces4.join('')}</div>
        <div class="outfit-grid-body">
          <div class="outfit-grid-name">${esc(o.nom)}</div>
          <div class="outfit-grid-meta">
            <span class="outfit-grid-moods">${moodLabel}</span>
            <span class="outfit-grid-score">${stars}</span>
          </div>
          <div class="outfit-grid-ports">${o.nombrePorts} port${o.nombrePorts !== 1 ? 's' : ''}${o.dernierPort ? ` · dernier : ${fmtDate(o.dernierPort)}` : ''}</div>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.outfit-grid-card').forEach(card => {
    card.addEventListener('click', () => {
      if (window.app) window.app.openOutfitDetail(card.dataset.id);
    });
  });
}

// ---- ALTERNATIVES CAROUSEL ----
export function renderAlternatives(alternativeOutfits, pieces, currentOutfitId, onSelect) {
  const carousel = document.getElementById('alternatives-carousel');
  if (!carousel) return;

  const pieceMap = {};
  for (const p of pieces) pieceMap[p.id] = p;

  if (!alternativeOutfits || alternativeOutfits.length === 0) {
    carousel.innerHTML = `<div style="color:var(--text-tertiary);font-size:0.82rem;padding:8px 0">Aucune alternative disponible</div>`;
    return;
  }

  carousel.innerHTML = alternativeOutfits.map(o => {
    const colors = (o.couleursGlobales || []).slice(0, 4).map(c => `<div class="alt-color-dot" style="background:${c}"></div>`).join('');
    const isSelected = o.id === currentOutfitId;
    return `
      <div class="alt-card ${isSelected ? 'selected' : ''}" data-id="${o.id}">
        <div class="alt-card-name">${esc(o.nom)}</div>
        <div class="alt-card-mood">${(o.moods || []).map(m => moodEmoji(m)).join('')}</div>
        <div class="alt-card-colors">${colors}</div>
        ${o.score > 0 ? `<div class="alt-card-score">★ ${o.score.toFixed(1)}</div>` : ''}
      </div>
    `;
  }).join('');

  carousel.querySelectorAll('.alt-card').forEach(card => {
    card.addEventListener('click', () => {
      if (onSelect) onSelect(card.dataset.id);
    });
  });
}

// ---- HISTORY CALENDAR ----
export function renderCalendar(history, year, month, onDayClick) {
  const grid = document.getElementById('calendar-grid');
  const label = document.getElementById('cal-month-label');
  if (!grid) return;

  const months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
  if (label) label.textContent = `${months[month]} ${year}`;

  const days = ['L','M','M','J','V','S','D'];
  const histMap = {};
  for (const h of history) { histMap[h.date] = h; }

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0
  const todayStr = new Date().toISOString().slice(0, 10);

  let html = days.map(d => `<div class="cal-day-header">${d}</div>`).join('');

  // Empty cells before
  for (let i = 0; i < startDow; i++) html += `<div class="cal-day empty"></div>`;

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const hasOutfit = !!histMap[dateStr];
    const isToday = dateStr === todayStr;
    const h = histMap[dateStr];
    const dotColor = hasOutfit && h && h.note ? noteColor(h.note) : 'var(--accent)';
    html += `
      <div class="cal-day ${hasOutfit ? 'has-outfit' : ''} ${isToday ? 'today' : ''}" data-date="${dateStr}">
        <span>${d}</span>
        ${hasOutfit ? `<div class="cal-day-dot" style="background:${dotColor}"></div>` : ''}
      </div>
    `;
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.cal-day.has-outfit').forEach(cell => {
    cell.addEventListener('click', () => {
      if (onDayClick) onDayClick(cell.dataset.date);
    });
  });
}

// ---- HISTORY TIMELINE ----
export function renderHistoryTimeline(history, outfits, limit = 30) {
  const el = document.getElementById('history-timeline');
  if (!el) return;

  const outfitMap = {};
  for (const o of outfits) outfitMap[o.id] = o;

  const sorted = [...history].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, limit);

  if (sorted.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📅</div><h3>Aucun historique</h3><p>Commence à confirmer des tenues !</p></div>`;
    return;
  }

  el.innerHTML = sorted.map(h => {
    const o = outfitMap[h.outfitId];
    const name = o ? o.nom : 'Outfit supprimé';
    const weather = h.meteo ? `${h.meteo.temp}°C ${h.meteo.pluie ? '🌧️' : ''}` : '';
    const stars = h.note ? '★'.repeat(h.note) : '';
    return `
      <div class="timeline-item" data-date="${h.date}">
        <div class="tl-date">${fmtDateFull(h.date)}</div>
        <div class="tl-outfit-name">${esc(name)}</div>
        <div class="tl-mood">${h.mood ? moodEmoji(h.mood) + ' ' + h.mood : ''}</div>
        <div class="tl-weather">${weather}</div>
        <div class="tl-score" style="color:var(--warning)">${stars}</div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.timeline-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.app) window.app.openHistoryDay(item.dataset.date);
    });
  });
}

// ---- HEADER DATE ----
export function renderHeaderDate() {
  const el = document.getElementById('header-date');
  if (!el) return;
  const now = new Date();
  const jours = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const mois = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  el.textContent = `${jours[now.getDay()]} ${now.getDate()} ${mois[now.getMonth()]} ${now.getFullYear()}`;
}

// ---- STATS ----
export function renderStats(data) {
  const { pieces, outfits, history } = data;

  // KPIs
  animateCount('kpi-total-pieces', pieces.filter(p => !p.archived).length);
  animateCount('kpi-total-worn', history.length);

  const streak = calcStreak(history);
  animateCount('kpi-streak', streak.current);
  animateCount('kpi-streak-max', streak.max);

  // Charts
  renderChart30d(history);
  renderChartMoods(history);
  renderChartTop5(outfits, history);
  renderChartSaisons(outfits, history);

  // Extra lists
  renderUnusedPieces(pieces, outfits, history);
  renderTopColors(outfits, history);
  renderRatings(outfits);
}

function renderChart30d(history) {
  const ctx = document.getElementById('chart-30d');
  if (!ctx) return;
  if (ctx._chartInst) ctx._chartInst.destroy();

  const labels = [];
  const values = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const str = d.toISOString().slice(0, 10);
    labels.push(i === 0 ? 'Auj.' : d.getDate() + '/' + (d.getMonth()+1));
    values.push(history.filter(h => h.date === str).length);
  }

  ctx._chartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: '#c9a96e',
        backgroundColor: 'rgba(201,169,110,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#c9a96e',
      }]
    },
    options: chartOptions(),
  });
}

function renderChartMoods(history) {
  const ctx = document.getElementById('chart-moods');
  if (!ctx) return;
  if (ctx._chartInst) ctx._chartInst.destroy();

  const moodMap = {};
  for (const h of history) {
    if (h.mood) moodMap[h.mood] = (moodMap[h.mood] || 0) + 1;
  }

  const labels = Object.keys(moodMap);
  const values = Object.values(moodMap);

  ctx._chartInst = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: ['#c9a96e','#6e9ec9','#30d158','#ff9f0a','#ff453a'], borderWidth: 0 }]
    },
    options: { ...chartOptions(), cutout: '60%' },
  });
}

function renderChartTop5(outfits, history) {
  const ctx = document.getElementById('chart-top5');
  if (!ctx) return;
  if (ctx._chartInst) ctx._chartInst.destroy();

  const counts = {};
  for (const h of history) {
    if (h.outfitId) counts[h.outfitId] = (counts[h.outfitId] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 5);
  const outfitMap = {};
  for (const o of outfits) outfitMap[o.id] = o;

  ctx._chartInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(([id]) => (outfitMap[id]?.nom || 'Inconnu').slice(0, 20)),
      datasets: [{ data: sorted.map(([,v]) => v), backgroundColor: '#c9a96e', borderRadius: 6 }]
    },
    options: { ...chartOptions(), indexAxis: 'y' },
  });
}

function renderChartSaisons(outfits, history) {
  const ctx = document.getElementById('chart-saisons');
  if (!ctx) return;
  if (ctx._chartInst) ctx._chartInst.destroy();

  const outfitMap = {};
  for (const o of outfits) outfitMap[o.id] = o;

  const saisonCount = {};
  for (const h of history) {
    const o = outfitMap[h.outfitId];
    if (o) {
      for (const s of (o.saisons || [])) {
        saisonCount[s] = (saisonCount[s] || 0) + 1;
      }
    }
  }

  ctx._chartInst = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: Object.keys(saisonCount),
      datasets: [{ data: Object.values(saisonCount), backgroundColor: ['#c9a96e','#6e9ec9','#30d158','#ff9f0a','#ff453a','#bf5af2','#32ade6'], borderWidth: 0 }]
    },
    options: chartOptions(),
  });
}

function chartOptions() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    responsive: true,
    plugins: {
      legend: { labels: { color: isDark ? '#8e8e93' : '#6c6c70', font: { family: 'DM Sans', size: 11 } } },
    },
    scales: {
      x: { ticks: { color: isDark ? '#48484a' : '#aeaeb2', font: { size: 10 } }, grid: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' } },
      y: { ticks: { color: isDark ? '#48484a' : '#aeaeb2', font: { size: 10 } }, grid: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' } },
    },
  };
}

function renderUnusedPieces(pieces, outfits, history) {
  const el = document.getElementById('stat-unused');
  if (!el) return;
  const outfitMap = {};
  for (const o of outfits) outfitMap[o.id] = o;

  const pieceLastWorn = {};
  for (const h of history) {
    const o = outfitMap[h.outfitId];
    if (o) {
      for (const pid of (o.pieces || [])) {
        if (!pieceLastWorn[pid] || h.date > pieceLastWorn[pid]) {
          pieceLastWorn[pid] = h.date;
        }
      }
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const unused = pieces.filter(p => !p.archived).map(p => {
    const lastWorn = pieceLastWorn[p.id];
    const daysSince = lastWorn ? Math.floor((new Date(today) - new Date(lastWorn)) / 86400000) : 9999;
    return { piece: p, daysSince };
  }).filter(x => x.daysSince > 14).sort((a, b) => b.daysSince - a.daysSince).slice(0, 8);

  el.innerHTML = unused.length === 0 ? '<div style="color:var(--text-tertiary);font-size:0.82rem">Toutes les pièces sont portées régulièrement !</div>' :
    unused.map(x => `
      <div class="stat-list-item">
        <span class="stat-list-item-name">${catEmoji(x.piece.categorie)} ${esc(x.piece.nom)}</span>
        <span class="stat-list-item-val">${x.daysSince === 9999 ? 'Jamais portée' : `${x.daysSince}j`}</span>
      </div>
    `).join('');
}

function renderTopColors(outfits, history) {
  const el = document.getElementById('stat-colors');
  if (!el) return;
  const outfitMap = {};
  for (const o of outfits) outfitMap[o.id] = o;
  const colorCount = {};
  for (const h of history) {
    const o = outfitMap[h.outfitId];
    if (o) for (const c of (o.couleursGlobales || [])) colorCount[c] = (colorCount[c] || 0) + 1;
  }
  const sorted = Object.entries(colorCount).sort((a,b) => b[1]-a[1]).slice(0, 8);
  el.innerHTML = sorted.length === 0 ? '<div style="color:var(--text-tertiary);font-size:0.82rem">Aucune donnée</div>' :
    `<div style="display:flex;flex-wrap:wrap;gap:8px;">${sorted.map(([c, n]) => `<div title="${c} · ${n}x" style="width:28px;height:28px;border-radius:50%;background:${c};border:2px solid var(--border);cursor:default" aria-label="${c}"></div>`).join('')}</div>`;
}

function renderRatings(outfits) {
  const el = document.getElementById('stat-ratings');
  if (!el) return;
  const rated = outfits.filter(o => o.score > 0 && !o.archived).sort((a,b) => b.score - a.score).slice(0, 6);
  el.innerHTML = rated.length === 0 ? '<div style="color:var(--text-tertiary);font-size:0.82rem">Aucun outfit noté</div>' :
    rated.map(o => `
      <div class="stat-list-item">
        <span class="stat-list-item-name">${esc(o.nom)}</span>
        <span class="stat-list-item-val" style="color:var(--warning)">${'★'.repeat(Math.round(o.score))} ${o.score.toFixed(1)}</span>
      </div>
    `).join('');
}

// ---- HISTORY QUICK STATS ----
export function renderHistoryQuickStats(history, outfits) {
  const el = document.getElementById('history-quick-stats');
  if (!el) return;
  const streak = calcStreak(history);
  const outfitMap = {};
  for (const o of outfits) outfitMap[o.id] = o;
  const thisMonth = new Date().getMonth();
  const thisMonthHistory = history.filter(h => new Date(h.date).getMonth() === thisMonth);
  const mostWorn = Object.entries(thisMonthHistory.reduce((acc, h) => {
    acc[h.outfitId] = (acc[h.outfitId] || 0) + 1; return acc;
  }, {})).sort((a,b) => b[1]-a[1])[0];

  el.innerHTML = `
    <div class="history-quick-stat"><div class="hqs-val">${streak.current}</div><div class="hqs-label">Streak actuel</div></div>
    <div class="history-quick-stat"><div class="hqs-val">${thisMonthHistory.length}</div><div class="hqs-label">Tenues ce mois</div></div>
    ${mostWorn ? `<div class="history-quick-stat"><div class="hqs-val" style="font-size:1rem;line-height:1.3">${esc(outfitMap[mostWorn[0]]?.nom || '?')}</div><div class="hqs-label">Outfit fav du mois</div></div>` : ''}
  `;
}

// ---- WEEK PLANNING ----
export function renderWeekPlanning(planning, weather, onReroll, onValidate) {
  const grid = document.getElementById('week-grid');
  if (!grid) return;

  const jours = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
  const joursLabels = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];

  if (!planning || Object.keys(planning).length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🗓️</div><h3>Semaine non planifiée</h3><p>Clique sur "Regénérer" pour planifier ta semaine !</p></div>`;
    return;
  }

  grid.innerHTML = jours.map((jour, i) => {
    const day = planning[jour];
    if (!day) return `<div class="week-day-card"><div class="wdc-day">${joursLabels[i]}</div><div class="wdc-empty">—</div></div>`;
    const outfit = day.outfit;
    const validated = day.validated;
    const fw = day.weather;
    return `
      <div class="week-day-card ${validated ? 'wdc-validated' : ''}">
        <div class="wdc-day">${joursLabels[i]}</div>
        <div class="wdc-date">${fmtDate(day.date)}</div>
        ${fw ? `<div class="wdc-weather">${fw.tempMoy}°C ${fw.pluie ? '🌧️' : ''}</div>` : ''}
        ${outfit ? `
          <div class="wdc-outfit-name">${esc(outfit.nom)}</div>
          <div class="wdc-mood">${moodEmoji(day.mood)} ${day.mood}</div>
          ${!validated ? `<button class="wdc-reroll" data-jour="${jour}">🔄 Changer</button>` : '<div class="wdc-validated-badge" style="color:var(--success);font-size:0.75rem">✅ Validé</div>'}
        ` : '<div class="wdc-empty">Aucun outfit</div>'}
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.wdc-reroll').forEach(btn => {
    btn.addEventListener('click', () => { if (onReroll) onReroll(btn.dataset.jour); });
  });
}

// ---- COUNT-UP ANIMATION ----
export function animateCount(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('count-up');
  const duration = 600;
  const start = performance.now();
  const from = 0;
  const tick = (now) => {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(from + (target - from) * ease);
    if (progress < 1) requestAnimationFrame(tick);
    else el.textContent = target;
  };
  requestAnimationFrame(tick);
}

// ---- SWIPE SUPPORT ----
export function setupSwipe(element, onLeft, onRight) {
  let startX = 0, startY = 0;
  element.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  element.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      if (dx < 0) onLeft?.();
      else onRight?.();
    }
  }, { passive: true });
}

// ---- HELPERS ----
export function moodEmoji(mood) {
  const map = { travail: '💼', chill: '😎', soirée: '🌙', sport: '🏃', 'old money': '👑' };
  return map[mood] || '';
}

export function catEmoji(cat) {
  const map = { haut: '👕', bas: '👖', chaussures: '👟', manteau: '🧥', veste: '🧣', pull: '🧶', accessoire: '⌚', 'sous-vetement': '🩲', chaussettes: '🧦' };
  return map[cat] || '👔';
}

function calcStreak(history) {
  if (!history.length) return { current: 0, max: 0 };
  const dates = new Set(history.map(h => h.date));
  const today = new Date();
  let current = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (dates.has(d.toISOString().slice(0, 10))) current++;
    else if (i > 0) break;
  }
  let max = 0, cur = 0;
  const sortedDates = [...dates].sort();
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) { cur = 1; }
    else {
      const prev = new Date(sortedDates[i-1]);
      prev.setDate(prev.getDate() + 1);
      if (prev.toISOString().slice(0,10) === sortedDates[i]) cur++;
      else cur = 1;
    }
    max = Math.max(max, cur);
  }
  return { current, max };
}

function fmtDate(str) {
  if (!str) return '';
  const d = new Date(str);
  return `${d.getDate()}/${d.getMonth()+1}`;
}

function fmtDateFull(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  const jours = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const mois = ['jan','fév','mar','avr','mai','juin','juil','aoû','sep','oct','nov','déc'];
  return `${jours[d.getDay()]} ${d.getDate()} ${mois[d.getMonth()]}`;
}

function noteColor(note) {
  if (note >= 4) return 'var(--success)';
  if (note >= 3) return 'var(--warning)';
  return 'var(--error)';
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
