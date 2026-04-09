// ===== GENERATOR.JS — Algorithme de génération d'outfit =====
import { checkFraicheur, getSaisonFromTemp } from './data.js';
import { getSaisonFromTemp as getS } from './weather.js';

// Main generation function
export function genererOutfit(opts) {
  const { mood, date, weather, pieces, outfits, history, settings, excludeIds = [], voyagePieces = null } = opts;

  const today = date || new Date().toISOString().slice(0, 10);
  const feelsLike = weather && !weather.error ? weather.feelsLike : null;
  const pluie = weather && !weather.error ? weather.pluie : false;
  const saison = feelsLike !== null ? getS(feelsLike, settings.seuilsTemperature) : getCurrentSaisonByCal();

  // Build a map of outfitId → piece objects
  const pieceMap = {};
  for (const p of pieces) pieceMap[p.id] = p;

  // Build piece → outfits they appear in
  const pieceToOutfits = {};
  for (const o of outfits) {
    for (const pid of (o.pieces || [])) {
      if (!pieceToOutfits[pid]) pieceToOutfits[pid] = [];
      pieceToOutfits[pid].push(o.id);
    }
  }

  // Voyage filter: only pieces in voyage list
  const activePieceIds = voyagePieces !== null
    ? new Set(voyagePieces)
    : null;

  // Score each outfit
  const scored = [];
  const fallbackScored = [];

  for (const outfit of outfits) {
    if (outfit.archived || !outfit.disponible) continue;
    if (excludeIds.includes(outfit.id)) continue;

    // Voyage check: all pieces must be in voyage list
    if (activePieceIds !== null) {
      const allAvail = (outfit.pieces || []).every(pid => activePieceIds.has(pid));
      if (!allAvail) continue;
    }

    const outfitPieces = (outfit.pieces || []).map(pid => pieceMap[pid]).filter(Boolean);

    // ---- HARD FILTERS ----
    let hardFail = false;
    let failReasons = [];

    // Piece in lavage or unavailable
    for (const p of outfitPieces) {
      if (p.enLavage) { hardFail = true; failReasons.push(`${p.nom} est en lavage`); break; }
      if (!p.disponible || p.archived) { hardFail = true; failReasons.push(`${p.nom} non disponible`); break; }
    }

    // Temperature check
    if (!hardFail && feelsLike !== null) {
      if (feelsLike < outfit.tempMin || feelsLike > outfit.tempMax) {
        hardFail = true;
        failReasons.push(`Température hors plage (${outfit.tempMin}–${outfit.tempMax}°C)`);
      }
    }

    // Rain check
    if (!hardFail && pluie && !outfit.pluieOK) {
      hardFail = true;
      failReasons.push('Non adapté à la pluie');
    }

    // Freshness check for each piece
    if (!hardFail) {
      for (const p of outfitPieces) {
        const outfitsWithPiece = pieceToOutfits[p.id] || [];
        const freshness = checkFraicheur(p, outfitsWithPiece, history);
        if (!freshness.ok) {
          hardFail = true;
          failReasons.push(`${p.nom}: ${freshness.reason}`);
          break;
        }
      }
    }

    // ---- SCORING ----
    let score = 100;

    // Mood
    const moodMatch = mood && (outfit.moods || []).includes(mood);
    if (!moodMatch && mood) score -= 30;
    if (moodMatch) score += 25;

    // Season
    const saisonMatch = (outfit.saisons || []).includes(saison) ||
      // Adjacent seasons
      isSaisonAdjacent(saison, outfit.saisons || []);
    if (!saisonMatch) score -= 20;

    // Recent wear
    const recentHistory = history.filter(h => h.outfitId === outfit.id);
    const sortedHistory = [...recentHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
    if (sortedHistory.length > 0) {
      const lastWorn = new Date(sortedHistory[0].date);
      const today_ = new Date(today);
      today_.setHours(0,0,0,0);
      lastWorn.setHours(0,0,0,0);
      const daysSince = Math.floor((today_ - lastWorn) / 86400000);

      const wornInWindow = recentHistory.filter(h => {
        const d = new Date(h.date);
        const cutoff = new Date(today);
        cutoff.setDate(cutoff.getDate() - settings.fenetreRepetition);
        return d >= cutoff;
      }).length;

      if (wornInWindow > 0) {
        score -= 10 * wornInWindow;
      }
      if (daysSince > 14) score += 15;
    } else {
      // Never worn, slight boost
      score += 8;
    }

    // Color repetition check (yesterday)
    if (settings.eviterRepetitionCouleur) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);
      const yesterdayEntry = history.find(h => h.date === yesterdayStr);
      if (yesterdayEntry) {
        const yesterdayOutfit = outfits.find(o => o.id === yesterdayEntry.outfitId);
        if (yesterdayOutfit) {
          const overlap = (outfit.couleursGlobales || []).some(c =>
            (yesterdayOutfit.couleursGlobales || []).includes(c)
          );
          if (overlap) score -= 15;
        }
      }
    }

    // Rating-based
    if (outfit.score >= 4) score += 10;
    if (outfit.score < 3 && outfit.score > 0) score -= 25;

    // Favorites
    if (outfit.favori) score += 20;

    const entry = { outfit, score, hardFail, failReasons, saison };

    if (hardFail) {
      fallbackScored.push(entry);
    } else {
      scored.push(entry);
    }
  }

  // Sort by score
  scored.sort((a, b) => b.score - a.score);

  let selected = null;
  let alternatives = [];
  let isFallback = false;
  let fallbackReasons = [];

  if (scored.length > 0) {
    // Weighted random from top 5
    const topN = scored.slice(0, Math.min(5, scored.length));
    selected = weightedRandom(topN);
    alternatives = scored.filter(e => e.outfit.id !== selected.outfit.id).slice(0, 5);
  } else if (fallbackScored.length > 0) {
    // Fallback: best approximation
    fallbackScored.sort((a, b) => b.score - a.score);
    selected = fallbackScored[0];
    alternatives = fallbackScored.slice(1, 5);
    isFallback = true;
    fallbackReasons = selected.failReasons;
  }

  return {
    outfit: selected ? selected.outfit : null,
    alternatives: alternatives.map(a => a.outfit),
    isFallback,
    fallbackReasons,
    saison,
    feelsLike,
    pluie,
  };
}

// Weighted random selection from scored array
function weightedRandom(scoredArr) {
  const minScore = Math.min(...scoredArr.map(e => e.score));
  const weights = scoredArr.map(e => Math.max(0, e.score - minScore + 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < scoredArr.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return scoredArr[i];
  }
  return scoredArr[0];
}

// Calendar-based season fallback
function getCurrentSaisonByCal() {
  const m = new Date().getMonth() + 1;
  if (m === 12 || m <= 2) return 'hiver';
  if (m <= 4) return 'printemps';
  if (m <= 8) return 'été';
  return 'automne';
}

// Check if saison is adjacent (loose matching)
function isSaisonAdjacent(saison, outfitSaisons) {
  const adj = {
    'hiver': ['hiver_doux', 'mi-saison'],
    'hiver_doux': ['hiver', 'mi-saison', 'automne'],
    'mi-saison': ['automne', 'hiver_doux', 'printemps'],
    'automne': ['mi-saison', 'hiver_doux'],
    'printemps': ['mi-saison', 'été'],
    'été': ['printemps', 'été_chaud'],
    'été_chaud': ['été'],
  };
  const adjacents = adj[saison] || [];
  return outfitSaisons.some(s => adjacents.includes(s));
}

// Generate a week of outfits
export function genererSemaine(opts) {
  const { settings, pieces, outfits, history, weather, forecasts5 } = opts;

  const jours = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
  const today = new Date();
  // Find Monday of current week
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon...
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

  const planningHistory = [...history];
  const usedIds = [];
  const result = {};

  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateStr = date.toISOString().slice(0, 10);
    const jourLabel = jours[i];
    const mood = settings.semaineType[jourLabel] || 'chill';

    // Get forecast for this date
    const dayForecast = forecasts5 ? forecasts5.find(f => f.date === dateStr) : null;
    const dayWeather = dayForecast
      ? { feelsLike: dayForecast.tempMoy, pluie: dayForecast.pluie, error: false }
      : (weather && !weather.error ? weather : null);

    const gen = genererOutfit({
      mood,
      date: dateStr,
      weather: dayWeather,
      pieces,
      outfits,
      history: planningHistory,
      settings,
      excludeIds: usedIds,
    });

    result[jourLabel] = {
      date: dateStr,
      mood,
      outfit: gen.outfit,
      isFallback: gen.isFallback,
      weather: dayForecast,
      validated: false,
    };

    if (gen.outfit) {
      usedIds.push(gen.outfit.id);
      // Add to temp history to respect freshness
      planningHistory.push({
        date: dateStr,
        outfitId: gen.outfit.id,
        mood,
      });
    }
  }

  return result;
}

export { getCurrentSaisonByCal };
