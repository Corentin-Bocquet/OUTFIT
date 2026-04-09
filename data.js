// ===== DATA.JS — Gestion des données DailyFit =====
// LocalStorage keys
const KEYS = {
  PIECES: 'dailyfit_pieces',
  OUTFITS: 'dailyfit_outfits',
  HISTORY: 'dailyfit_history',
  SETTINGS: 'dailyfit_settings',
  PLANNING: 'dailyfit_planning',
  VOYAGE_PIECES: 'dailyfit_voyage_pieces',
};

// Default settings
const DEFAULT_SETTINGS = {
  ville: 'Paris',
  latitude: 48.8566,
  longitude: 2.3522,
  theme: 'dark',
  langue: 'fr',
  autoGenerateOnOpen: true,
  semaineType: {
    lundi: 'travail', mardi: 'travail', mercredi: 'travail',
    jeudi: 'travail', vendredi: 'chill',
    samedi: 'chill', dimanche: 'chill',
  },
  seuilsTemperature: {
    hiverFroid: 5, hiverDoux: 10, miSaison: 18,
    printemps: 22, ete: 26, eteChaud: 999,
  },
  distinguerMeteoMatinSoir: true,
  seuilEcartMatin: 8,
  eviterRepetitionCouleur: true,
  fenetreRepetition: 7,
  apiWeatherKey: '',
  modeVoyage: false,
};

// Default fraîcheur rules per category
export const FRAICHEUR_DEFAULTS = {
  'sous-vetement':  { maxPortsParSemaine: 1, maxPortsConsecutifs: 1, jourReposMini: 1 },
  'chaussettes':    { maxPortsParSemaine: 1, maxPortsConsecutifs: 1, jourReposMini: 1 },
  'haut':           { maxPortsParSemaine: 1, maxPortsConsecutifs: 1, jourReposMini: 3 },
  'pull':           { maxPortsParSemaine: 3, maxPortsConsecutifs: 3, jourReposMini: 1 },
  'bas':            { maxPortsParSemaine: 7, maxPortsConsecutifs: 7, jourReposMini: 0 },
  'chaussures':     { maxPortsParSemaine: 7, maxPortsConsecutifs: 7, jourReposMini: 0 },
  'manteau':        { maxPortsParSemaine: 7, maxPortsConsecutifs: 7, jourReposMini: 0 },
  'veste':          { maxPortsParSemaine: 7, maxPortsConsecutifs: 7, jourReposMini: 0 },
  'accessoire':     { maxPortsParSemaine: 7, maxPortsConsecutifs: 7, jourReposMini: 0 },
};

// Debounce save
let _saveTimer = null;

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function tryParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

// Load all data from localStorage
export function loadAll() {
  return {
    pieces: tryParse(localStorage.getItem(KEYS.PIECES)) || [],
    outfits: tryParse(localStorage.getItem(KEYS.OUTFITS)) || [],
    history: tryParse(localStorage.getItem(KEYS.HISTORY)) || [],
    settings: { ...DEFAULT_SETTINGS, ...(tryParse(localStorage.getItem(KEYS.SETTINGS)) || {}) },
    planning: tryParse(localStorage.getItem(KEYS.PLANNING)) || {},
    voyagePieces: tryParse(localStorage.getItem(KEYS.VOYAGE_PIECES)) || [],
  };
}

// Save all data with debounce
export function saveAll(data) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => _doSave(data), 500);
}

// Save immediately
export function saveAllNow(data) {
  clearTimeout(_saveTimer);
  _doSave(data);
}

function _doSave(data) {
  try {
    localStorage.setItem(KEYS.PIECES, JSON.stringify(data.pieces));
    localStorage.setItem(KEYS.OUTFITS, JSON.stringify(data.outfits));
    localStorage.setItem(KEYS.HISTORY, JSON.stringify(data.history));
    localStorage.setItem(KEYS.SETTINGS, JSON.stringify(data.settings));
    localStorage.setItem(KEYS.PLANNING, JSON.stringify(data.planning));
    localStorage.setItem(KEYS.VOYAGE_PIECES, JSON.stringify(data.voyagePieces));
    checkStorageSize();
  } catch (e) {
    console.error('Erreur de sauvegarde:', e);
  }
}

export function checkStorageSize() {
  let total = 0;
  for (const key of Object.values(KEYS)) {
    const item = localStorage.getItem(key);
    if (item) total += item.length;
  }
  const mb = total / (1024 * 1024);
  if (mb > 4) {
    return { warn: true, mb: mb.toFixed(1) };
  }
  return { warn: false, mb: mb.toFixed(2) };
}

// Backup before destructive ops
export function backup(data) {
  const date = new Date().toISOString().slice(0, 10);
  const key = `dailyfit_backup_${date}`;
  try {
    localStorage.setItem(key, JSON.stringify({ pieces: data.pieces, outfits: data.outfits, history: data.history, settings: data.settings }));
  } catch (e) {
    console.warn('Backup failed:', e);
  }
}

// Export JSON
export function exportJSON(data) {
  const date = new Date().toISOString().slice(0, 10);
  const payload = {
    pieces: data.pieces,
    outfits: data.outfits,
    history: data.history,
    settings: data.settings,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dailyfit-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Import JSON — returns { valid, summary, parsed }
export function parseImport(jsonStr) {
  const parsed = tryParse(jsonStr);
  if (!parsed) return { valid: false, error: 'JSON invalide' };
  const pieces = Array.isArray(parsed.pieces) ? parsed.pieces : [];
  const outfits = Array.isArray(parsed.outfits) ? parsed.outfits : [];
  const history = Array.isArray(parsed.history) ? parsed.history : [];
  return {
    valid: true,
    parsed: { pieces, outfits, history, settings: parsed.settings || {} },
    summary: { pieces: pieces.length, outfits: outfits.length, history: history.length },
  };
}

// CRUD: Pieces
export function createPiece(fields) {
  const cat = fields.categorie;
  const fraicheurDef = FRAICHEUR_DEFAULTS[cat] || FRAICHEUR_DEFAULTS['accessoire'];
  return {
    id: generateId(),
    nom: fields.nom || 'Pièce sans nom',
    categorie: cat,
    photos: fields.photos || [],
    couleurs: fields.couleurs || [],
    moods: fields.moods || [],
    saisons: fields.saisons || [],
    tempMin: fields.tempMin ?? 5,
    tempMax: fields.tempMax ?? 25,
    pluie: fields.pluie ?? false,
    fraicheur: {
      maxPortsParSemaine: fields.maxPortsParSemaine ?? fraicheurDef.maxPortsParSemaine,
      maxPortsConsecutifs: fields.maxPortsConsecutifs ?? fraicheurDef.maxPortsConsecutifs,
      jourReposMini: fields.jourReposMini ?? fraicheurDef.jourReposMini,
    },
    disponible: true,
    enLavage: false,
    dateEnLavage: null,
    favori: false,
    archived: false,
    createdAt: new Date().toISOString(),
  };
}

export function createOutfit(fields) {
  return {
    id: generateId(),
    nom: fields.nom || 'Outfit sans nom',
    pieces: fields.pieces || [],
    moods: fields.moods || [],
    saisons: fields.saisons || [],
    couleursGlobales: fields.couleursGlobales || [],
    tempMin: fields.tempMin ?? 5,
    tempMax: fields.tempMax ?? 25,
    pluieOK: fields.pluieOK ?? false,
    score: 0,
    nombrePorts: 0,
    dernierPort: null,
    favori: false,
    archived: false,
    disponible: true,
    notes: [],
    createdAt: new Date().toISOString(),
  };
}

// Get piece ports in last N days (from history)
export function getPortsInLastDays(pieceId, history, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return history.filter(h => {
    if (!h.outfitId) return false;
    const d = new Date(h.date);
    return d >= cutoff;
  });
}

// Check freshness for a piece — returns { ok, reason }
export function checkFraicheur(piece, outfitIds, history) {
  if (!piece.fraicheur) return { ok: true };
  const { maxPortsParSemaine, maxPortsConsecutifs, jourReposMini } = piece.fraicheur;

  // Filter history entries that used an outfit containing this piece
  const pieceHistory = history
    .filter(h => outfitIds.includes(h.outfitId))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // Count ports in last 7 days
  const cutoff7 = new Date();
  cutoff7.setDate(cutoff7.getDate() - 7);
  const portsWeek = pieceHistory.filter(h => new Date(h.date) >= cutoff7).length;
  if (portsWeek >= maxPortsParSemaine) {
    return { ok: false, reason: `Portée ${portsWeek}x cette semaine (max ${maxPortsParSemaine})` };
  }

  // Check last port date for repos
  if (pieceHistory.length > 0 && jourReposMini > 0) {
    const lastPort = new Date(pieceHistory[0].date);
    const today = new Date();
    today.setHours(0,0,0,0);
    lastPort.setHours(0,0,0,0);
    const daysSince = Math.floor((today - lastPort) / 86400000);
    if (daysSince < jourReposMini) {
      return { ok: false, reason: `Repos requis : ${jourReposMini - daysSince} jour(s) restant(s)` };
    }
  }

  // Check consecutive
  if (maxPortsConsecutifs < 7 && pieceHistory.length > 0) {
    let consec = 0;
    const today = new Date();
    today.setHours(0,0,0,0);
    const sorted = [...pieceHistory].sort((a,b) => new Date(b.date) - new Date(a.date));
    for (let i = 0; i < sorted.length; i++) {
      const d = new Date(sorted[i].date);
      d.setHours(0,0,0,0);
      const expected = new Date(today);
      expected.setDate(today.getDate() - i);
      if (d.getTime() === expected.getTime()) { consec++; }
      else { break; }
    }
    if (consec >= maxPortsConsecutifs) {
      return { ok: false, reason: `Portée ${consec} jours consécutifs (max ${maxPortsConsecutifs})` };
    }
  }

  return { ok: true };
}

export { generateId, DEFAULT_SETTINGS };
