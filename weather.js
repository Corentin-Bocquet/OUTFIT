// ===== WEATHER.JS — Intégration OpenWeatherMap =====

let _cachedWeather = null;
let _cacheTime = null;
const CACHE_TTL = 30 * 60 * 1000; // 30 min

// Get current weather + 5-day forecast
export async function fetchWeather(settings) {
  const { apiWeatherKey, latitude, longitude } = settings;

  // Return cache if fresh
  if (_cachedWeather && _cacheTime && (Date.now() - _cacheTime) < CACHE_TTL) {
    return _cachedWeather;
  }

  if (!apiWeatherKey) {
    return { error: 'no_key' };
  }

  try {
    const [currentRes, forecastRes] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${apiWeatherKey}&units=metric&lang=fr`),
      fetch(`https://api.openweathermap.org/data/2.5/forecast?lat=${latitude}&lon=${longitude}&appid=${apiWeatherKey}&units=metric&lang=fr`),
    ]);

    if (!currentRes.ok) {
      if (currentRes.status === 401) return { error: 'invalid_key' };
      return { error: 'api_error', status: currentRes.status };
    }

    const current = await currentRes.json();
    const forecast = await forecastRes.json();

    const result = parseWeather(current, forecast);
    _cachedWeather = result;
    _cacheTime = Date.now();
    return result;
  } catch (e) {
    return { error: 'network', message: e.message };
  }
}

function parseWeather(current, forecast) {
  const now = {
    temp: Math.round(current.main.temp),
    feelsLike: Math.round(current.main.feels_like),
    tempMin: Math.round(current.main.temp_min),
    tempMax: Math.round(current.main.temp_max),
    humidity: current.main.humidity,
    windSpeed: Math.round((current.wind?.speed || 0) * 3.6), // m/s → km/h
    pluie: (current.rain?.['1h'] || current.rain?.['3h'] || 0) > 0,
    pop: 0,
    description: current.weather[0]?.description || '',
    icon: current.weather[0]?.icon || '01d',
    ville: current.name,
  };

  // Get today's forecast for matin/soir
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayForecasts = (forecast.list || []).filter(f => f.dt_txt.startsWith(todayStr));

  // Morning (6h-12h)
  const matinForecasts = todayForecasts.filter(f => {
    const h = parseInt(f.dt_txt.slice(11, 13));
    return h >= 6 && h < 12;
  });

  // Evening (18h-22h)
  const soirForecasts = todayForecasts.filter(f => {
    const h = parseInt(f.dt_txt.slice(11, 13));
    return h >= 18 && h <= 22;
  });

  const maxPop = todayForecasts.reduce((m, f) => Math.max(m, f.pop || 0), 0);
  now.pop = Math.round(maxPop * 100); // percentage
  now.pluie = now.pop > 40;

  const matin = matinForecasts.length > 0 ? {
    temp: Math.round(avg(matinForecasts.map(f => f.main.feels_like))),
    icon: matinForecasts[0].weather[0]?.icon,
  } : null;

  const soir = soirForecasts.length > 0 ? {
    temp: Math.round(avg(soirForecasts.map(f => f.main.feels_like))),
    icon: soirForecasts[0].weather[0]?.icon,
  } : null;

  // 5-day forecast (one per day)
  const futurDays = {};
  for (const f of (forecast.list || [])) {
    const day = f.dt_txt.slice(0, 10);
    if (!futurDays[day]) {
      futurDays[day] = { temps: [], pop: [], icon: f.weather[0]?.icon };
    }
    futurDays[day].temps.push(f.main.feels_like);
    futurDays[day].pop.push(f.pop || 0);
  }
  const forecasts5 = Object.entries(futurDays).slice(0, 5).map(([date, d]) => ({
    date,
    tempMoy: Math.round(avg(d.temps)),
    pop: Math.round(Math.max(...d.pop) * 100),
    pluie: Math.max(...d.pop) > 0.4,
    icon: d.icon,
  }));

  return { ...now, matin, soir, forecasts5, raw: current };
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Apply wind chill correction
export function applyWindChill(weather) {
  if (!weather || weather.error) return weather;
  if (weather.windSpeed > 40) {
    return { ...weather, feelsLike: weather.feelsLike - 3 };
  }
  return weather;
}

// Get season label from feels_like and settings thresholds
export function getSaisonFromTemp(feelsLike, seuils) {
  if (feelsLike < seuils.hiverFroid) return 'hiver';
  if (feelsLike < seuils.hiverDoux) return 'hiver_doux';
  if (feelsLike < seuils.miSaison) return 'mi-saison';
  if (feelsLike < seuils.printemps) return 'printemps';
  if (feelsLike < seuils.ete) return 'été';
  return 'été_chaud';
}

// Check matin/soir ecart
export function checkMatinSoirAlert(weather, settings) {
  if (!settings.distinguerMeteoMatinSoir) return null;
  if (!weather || !weather.matin || !weather.soir) return null;
  const ecart = Math.abs(weather.matin.temp - weather.soir.temp);
  if (ecart >= settings.seuilEcartMatin) {
    const dir = weather.soir.temp < weather.matin.temp ? 'moins' : 'plus';
    const diff = Math.round(ecart);
    return `⚠️ Il fera ${diff}°C de ${dir} ce soir (${weather.soir.temp}°C) — pense à ${dir === 'moins' ? 'prendre une veste' : 'alléger ta tenue'} !`;
  }
  return null;
}

// Get weather icon URL
export function getWeatherIconUrl(icon) {
  return `https://openweathermap.org/img/wn/${icon}@2x.png`;
}

// Get weather emoji
export function getWeatherEmoji(icon) {
  if (!icon) return '🌡️';
  const code = icon.slice(0, 2);
  const map = {
    '01': '☀️', '02': '🌤️', '03': '⛅', '04': '☁️',
    '09': '🌧️', '10': '🌦️', '11': '⛈️', '13': '❄️', '50': '🌫️',
  };
  return map[code] || '🌡️';
}

// Test API key
export async function testApiKey(key, lat, lon) {
  try {
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${key}&units=metric`);
    if (res.ok) return { ok: true };
    if (res.status === 401) return { ok: false, error: 'Clé API invalide' };
    return { ok: false, error: `Erreur ${res.status}` };
  } catch {
    return { ok: false, error: 'Erreur réseau' };
  }
}

// Geocode city name to lat/lon using OWM geocoding
export async function geocodeCity(cityName, apiKey) {
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cityName)}&limit=1&appid=${apiKey}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: data[0].lat, lon: data[0].lon, name: data[0].name };
    }
    return null;
  } catch {
    return null;
  }
}

// Invalidate cache
export function invalidateCache() {
  _cachedWeather = null;
  _cacheTime = null;
}
