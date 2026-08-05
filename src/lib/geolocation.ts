export interface LatLng {
  lat: number;
  lng: number;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function hashString(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

const CACHE_KEY = (loc: string) => `explore_geo_${hashString(loc.toLowerCase().trim())}`;

function readCache(loc: string): LatLng | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY(loc));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LatLng;
    if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeCache(loc: string, coords: LatLng) {
  try {
    localStorage.setItem(CACHE_KEY(loc), JSON.stringify(coords));
  } catch {
    /* storage unavailable */
  }
}

async function photonGeocode(query: string): Promise<LatLng | null> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1&lang=en`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  const feature = json?.features?.[0];
  const coords = feature?.geometry?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number' && typeof coords[1] === 'number') {
    return { lng: coords[0], lat: coords[1] };
  }
  return null;
}

async function nominatimGeocode(query: string): Promise<LatLng | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'twibs-app/1.0 (explore distances)' } });
  if (!res.ok) return null;
  const json = await res.json();
  const item = Array.isArray(json) ? json[0] : null;
  const lat = Number(item?.lat);
  const lng = Number(item?.lon);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

export async function geocodeLocation(location: string): Promise<LatLng | null> {
  const clean = location.trim();
  if (!clean) return null;

  const cached = readCache(clean);
  if (cached) return cached;

  const coords = (await photonGeocode(clean)) || (await nominatimGeocode(clean));
  if (coords) writeCache(clean, coords);
  return coords;
}

const VIEWER_KEY = 'explore_viewer_geo';
const VIEWER_MAX_AGE_MS = 10 * 60 * 1000;

export function getViewerCoordsFromCache(): LatLng | null {
  try {
    const raw = localStorage.getItem(VIEWER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { coords: LatLng; ts: number };
    if (!parsed.coords || Date.now() - parsed.ts > VIEWER_MAX_AGE_MS) return null;
    return parsed.coords;
  } catch {
    return null;
  }
}

export function cacheViewerCoords(coords: LatLng) {
  try {
    localStorage.setItem(VIEWER_KEY, JSON.stringify({ coords, ts: Date.now() }));
  } catch {
    /* storage unavailable */
  }
}

/**
 * Resolve the viewer's own position. Prefers the device GPS; if that is
 * denied/unavailable, falls back to geocoding their profile's location text.
 */
export async function getViewerLocation(profileLocation: string | null): Promise<LatLng | null> {
  const cached = getViewerCoordsFromCache();
  if (cached) return cached;

  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 300000,
        });
      });
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      cacheViewerCoords(coords);
      return coords;
    } catch {
      /* permission denied or error — fall through to text */
    }
  }

  if (profileLocation) {
    const coords = await geocodeLocation(profileLocation);
    if (coords) cacheViewerCoords(coords);
    return coords;
  }

  return null;
}

export function formatDistanceKm(km: number): string {
  if (km < 1) return 'Nearby';
  if (km < 100) return `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
  if (km < 1000) return `${Math.round(km)} km away`;
  return `${(km / 1000).toFixed(1)}k km away`;
}
