const useTboApi = /^(1|true|yes|on)$/i.test(String(process.env.NEXT_PUBLIC_TBO_API || '').trim());
const configuredApiBase = (process.env.NEXT_PUBLIC_API_BASE_URL || '').trim();
const configuredTboBase = (process.env.NEXT_PUBLIC_TBO_BACKEND_URL || '').trim();

function normalizeBaseUrl(url: string, fallback: string, rewrite8000To5000 = false): string {
  const raw = (url || fallback).trim();
  const normalized = rewrite8000To5000 ? raw.replace(/:8000(\/|$)/, ':5000$1') : raw;
  return normalized.replace(/\/+$/, '');
}

const API_BASE_URL = useTboApi
  ? normalizeBaseUrl(configuredTboBase, 'http://localhost:8001', false)
  : normalizeBaseUrl(configuredApiBase, 'http://localhost:5000', true);

const SESSION_KEY = useTboApi ? 'voyage_tbo_session_id' : 'voyage_backend_session_id';
const TRIPS_KEY = 'voyage_trips_v1';
const BOOKINGS_KEY = 'voyage_bookings_v1';

export interface ChatMessageDTO {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  results?: any[];
}

export interface TripDTO {
  id: string;
  user_id: string;
  name: string;
  origin: string;
  destination: string;
  start_date: string;
  end_date: string;
  days_count: number;
  budget: number;
  itinerary: any[];
  chat_history: ChatMessageDTO[];
  favorite_hotels: string[];
  created_at: string;
  updated_at: string;
}

type StoredTrip = TripDTO & {
  _hotel_cache?: Record<string, any>;
  _transport_cache?: any[];
};

type StoredBooking = {
  id: string;
  trip_id?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  currency: string;
  total_amount: number;
  confirmation_number?: string;
  selections: Array<{
    category: 'hotel' | 'transport' | 'activity';
    item_id: string;
    title: string;
    amount: number;
    metadata?: Record<string, any>;
  }>;
  payment?: {
    status: string;
    method?: string;
    reference?: string;
  };
  created_at: string;
  updated_at: string;
};

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function readJSON<T>(key: string, fallback: T): T {
  if (!canUseStorage()) return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON<T>(key: string, value: T): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getTripsMap(): Record<string, StoredTrip> {
  return readJSON<Record<string, StoredTrip>>(TRIPS_KEY, {});
}

function saveTripsMap(map: Record<string, StoredTrip>): void {
  writeJSON(TRIPS_KEY, map);
}

function upsertTrip(trip: StoredTrip): void {
  const map = getTripsMap();
  map[trip.id] = trip;
  saveTripsMap(map);
}

function getTripInternal(tripId: string): StoredTrip | null {
  const map = getTripsMap();
  return map[tripId] || null;
}

function removeTripInternal(tripId: string): void {
  const map = getTripsMap();
  delete map[tripId];
  saveTripsMap(map);
}

function getBookingsMap(): Record<string, StoredBooking> {
  return readJSON<Record<string, StoredBooking>>(BOOKINGS_KEY, {});
}

function saveBookingsMap(map: Record<string, StoredBooking>): void {
  writeJSON(BOOKINGS_KEY, map);
}

async function rawFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`API ${response.status}: ${detail}`);
  }
  return (await response.json()) as T;
}

function getStoredSessionId(): string | null {
  if (!canUseStorage()) return null;
  return window.localStorage.getItem(SESSION_KEY);
}

function setStoredSessionId(sessionId: string): void {
  if (!canUseStorage()) return;
  window.localStorage.setItem(SESSION_KEY, sessionId);
}

async function ensureBackendSession(forceNew = false): Promise<string> {
  if (!forceNew) {
    const existing = getStoredSessionId();
    if (existing) return existing;
  }
  const created = await rawFetch<{ session_id: string }>('/sessions', {
    method: 'POST',
    body: '{}',
  });
  setStoredSessionId(created.session_id);
  return created.session_id;
}

async function postToSession<T>(endpoint: string, payload: Record<string, any>): Promise<T> {
  let sessionId = await ensureBackendSession();
  try {
    return await rawFetch<T>(`/sessions/${encodeURIComponent(sessionId)}/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('404')) {
      throw error;
    }
  }
  sessionId = await ensureBackendSession(true);
  return rawFetch<T>(`/sessions/${encodeURIComponent(sessionId)}/${endpoint}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function ensureDateRange(startDate?: string, endDate?: string, days = 3): { startDate: string; endDate: string } {
  const now = new Date();
  const start = startDate ? new Date(startDate) : now;
  const end = endDate ? new Date(endDate) : new Date(start.getTime() + (days - 1) * 24 * 60 * 60 * 1000);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function buildTripDefaults(partial?: Partial<TripDTO>): StoredTrip {
  const range = ensureDateRange(partial?.start_date, partial?.end_date, partial?.days_count || 3);
  return {
    id: partial?.id || createId('trip'),
    user_id: partial?.user_id || 'local-user',
    name: partial?.name || 'My Trip',
    origin: partial?.origin || 'Delhi',
    destination: partial?.destination || '',
    start_date: range.startDate,
    end_date: range.endDate,
    days_count: Math.max(1, Number(partial?.days_count || 3)),
    budget: Number(partial?.budget || 30000),
    itinerary: partial?.itinerary || [],
    chat_history: partial?.chat_history || [],
    favorite_hotels: partial?.favorite_hotels || [],
    created_at: partial?.created_at || nowIso(),
    updated_at: nowIso(),
    _hotel_cache: (partial as StoredTrip)?._hotel_cache || {},
    _transport_cache: (partial as StoredTrip)?._transport_cache || [],
  };
}

function inferTripFromMessage(message: string): Record<string, any> {
  const out: Record<string, any> = {};
  const daysMatch = message.match(/(\d{1,2})\s*day/i);
  if (daysMatch) out.days = Math.max(1, Number(daysMatch[1]));

  const budgetMatch =
    message.match(/(?:under|within|budget(?:\s+of)?)\s*(?:inr|rs\.?)?\s*([0-9][0-9,]*)/i) ||
    message.match(/(?:inr|rs\.?)\s*([0-9][0-9,]*)/i);
  if (budgetMatch) out.budget = Number((budgetMatch[1] || '0').replace(/,/g, '')) || 0;

  const originMatch = message.match(/\bfrom\s+([a-z][a-z\s,-]{1,60})/i);
  if (originMatch) out.origin = originMatch[1].split(/\b(to|for|under|within|with|on|in)\b/i)[0].trim();

  const destinationMatch =
    message.match(/\btrip\s+to\s+([a-z][a-z\s,-]{1,60})/i) ||
    message.match(/\bto\s+([a-z][a-z\s,-]{1,60})/i);
  if (destinationMatch) out.destination = destinationMatch[1].split(/\b(from|for|under|within|with|on|in|budget)\b/i)[0].trim();

  return out;
}

function parseCoordinates(raw: any): { lat: number; lng: number; address: string; source: string } {
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      try {
        parsed = JSON.parse(raw.replace(/'/g, '"'));
      } catch {
        parsed = {};
      }
    }
  }
  const lat = Number(parsed?.latitude ?? parsed?.lat ?? 0);
  const lng = Number(parsed?.longitude ?? parsed?.lng ?? 0);
  return {
    lat: Number.isFinite(lat) ? lat : 0,
    lng: Number.isFinite(lng) ? lng : 0,
    address: String(parsed?.address || ''),
    source: String(parsed?.source || 'unknown'),
  };
}

const PLACE_CATALOG: Record<string, Array<{ name: string; description: string; lat: number; lng: number }>> = {
  gujarat: [
    { name: 'Statue of Unity', description: 'Iconic monument and riverfront area.', lat: 21.838, lng: 73.7191 },
    { name: 'Gir National Park', description: 'Wildlife reserve known for Asiatic lions.', lat: 21.124, lng: 70.824 },
    { name: 'Rani ki Vav, Patan', description: 'UNESCO stepwell with intricate carvings.', lat: 23.8589, lng: 72.1016 },
    { name: 'Somnath Temple', description: 'Historic coastal temple destination.', lat: 20.887, lng: 70.4017 },
    { name: 'Sabarmati Riverfront', description: 'Urban promenade and public spaces in Ahmedabad.', lat: 23.0307, lng: 72.5802 },
    { name: 'Dwarkadhish Temple', description: 'Major pilgrimage and heritage area.', lat: 22.2394, lng: 68.9678 },
  ],
  rajasthan: [
    { name: 'Amber Fort, Jaipur', description: 'Fort complex with city views.', lat: 26.9855, lng: 75.8513 },
    { name: 'City Palace, Udaipur', description: 'Lake-facing palace museum.', lat: 24.576, lng: 73.6835 },
    { name: 'Mehrangarh Fort, Jodhpur', description: 'Hilltop fort and museum.', lat: 26.2978, lng: 73.0181 },
    { name: 'Jaisalmer Fort', description: 'Living fort with markets and temples.', lat: 26.9124, lng: 70.9128 },
    { name: 'Pushkar Lake', description: 'Sacred lake and old-town streets.', lat: 26.4898, lng: 74.5509 },
  ],
  goa: [
    { name: 'Calangute Beach', description: 'Popular beach with water activities.', lat: 15.5439, lng: 73.7553 },
    { name: 'Basilica of Bom Jesus', description: 'Historic church and heritage site.', lat: 15.5, lng: 73.9116 },
    { name: 'Dudhsagar Falls', description: 'Multi-tier waterfall in the Western Ghats.', lat: 15.3144, lng: 74.3141 },
    { name: 'Fort Aguada', description: 'Coastal fort and sunset point.', lat: 15.4932, lng: 73.7737 },
    { name: 'Anjuna Flea Market', description: 'Shopping and local crafts market.', lat: 15.576, lng: 73.7397 },
  ],
};

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  delhi: { lat: 28.6139, lng: 77.209 },
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
  gujarat: { lat: 22.2587, lng: 71.1924 },
  jaipur: { lat: 26.9124, lng: 75.7873 },
  udaipur: { lat: 24.5854, lng: 73.7125 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  pune: { lat: 18.5204, lng: 73.8567 },
  goa: { lat: 15.2993, lng: 74.124 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  kolkata: { lat: 22.5726, lng: 88.3639 },
};

function keyFromText(text: string): string {
  return String(text || '').trim().toLowerCase();
}

function generateSuggestedPlaces(destination: string, days: number) {
  const key = keyFromText(destination);
  const catalogEntry = Object.keys(PLACE_CATALOG).find((item) => key.includes(item));
  const base = catalogEntry ? PLACE_CATALOG[catalogEntry] : [];

  const fallback = [
    { name: `${destination} Old Town`, description: 'Walk through heritage neighborhoods.', lat: CITY_COORDS[key]?.lat || 22.7, lng: CITY_COORDS[key]?.lng || 72.5 },
    { name: `${destination} Museum District`, description: 'Cultural highlights and exhibitions.', lat: (CITY_COORDS[key]?.lat || 22.7) + 0.03, lng: (CITY_COORDS[key]?.lng || 72.5) + 0.02 },
    { name: `${destination} Riverside Promenade`, description: 'Evening views and local food stalls.', lat: (CITY_COORDS[key]?.lat || 22.7) - 0.02, lng: (CITY_COORDS[key]?.lng || 72.5) + 0.01 },
    { name: `${destination} Nature Park`, description: 'Relaxed outdoor activity spot.', lat: (CITY_COORDS[key]?.lat || 22.7) + 0.01, lng: (CITY_COORDS[key]?.lng || 72.5) - 0.03 },
    { name: `${destination} Market Area`, description: 'Shopping and local craft exploration.', lat: (CITY_COORDS[key]?.lat || 22.7) - 0.015, lng: (CITY_COORDS[key]?.lng || 72.5) - 0.015 },
    { name: `${destination} Sunset Point`, description: 'Scenic sunset and viewpoint area.', lat: (CITY_COORDS[key]?.lat || 22.7) + 0.04, lng: (CITY_COORDS[key]?.lng || 72.5) - 0.01 },
  ];

  const merged = [...base, ...fallback];
  const count = Math.max(6, Math.min(12, days * 3));
  return merged.slice(0, count).map((item, index) => ({
    id: `${item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index + 1}`,
    name: item.name,
    description: item.description,
    type: 'attraction' as const,
    lat: item.lat,
    lng: item.lng,
  }));
}

async function suggestPlacesFromBackend(destination: string, days: number): Promise<
  Array<{ id: string; name: string; description: string; type: 'attraction'; lat: number; lng: number }>
> {
  const response = await postToSession<{
    attractions_with_coordinates?: Array<{ name?: string; location_query?: string; coordinates?: any }>;
  }>('suggest-places', {
    destination,
    duration: `${Math.max(1, days)} days`,
  });

  const places = (response.attractions_with_coordinates || []).map((item, index) => {
    const coords = parseCoordinates(item.coordinates);
    const name = String(item.name || item.location_query || `Place ${index + 1}`);
    return {
      id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index + 1}`,
      name,
      description: `Recommended attraction in ${destination}`,
      type: 'attraction' as const,
      lat: coords.lat,
      lng: coords.lng,
    };
  });
  return places.filter((item) => !!item.name);
}

function buildItineraryFromPlaces(
  places: Array<{ name: string; description?: string }>,
  startDate: string,
  endDate: string,
  destination: string
) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
  const names = Array.from(new Set(places.map((place) => String(place.name || '').trim()).filter(Boolean)));
  const effective = names.length ? names : [destination || 'City Highlights'];

  return Array.from({ length: totalDays }, (_, dayIndex) => {
    const date = new Date(start);
    date.setDate(start.getDate() + dayIndex);
    const first = effective[(dayIndex * 2) % effective.length];
    const second = effective[(dayIndex * 2 + 1) % effective.length];
    const activities: any[] = [
      { id: createId('act'), title: `Explore ${first}`, description: `Morning visit around ${first}`, time: '09:00', location: first, type: 'activity' },
      { id: createId('act'), title: 'Lunch', description: 'Local cuisine break', time: '13:00', location: first, type: 'meal' },
    ];
    if (second.toLowerCase() !== first.toLowerCase()) {
      activities.push({
        id: createId('act'),
        title: `Visit ${second}`,
        description: `Afternoon sightseeing at ${second}`,
        time: '15:30',
        location: second,
        type: 'activity',
      });
    }
    activities.push({
      id: createId('act'),
      title: 'Dinner',
      description: 'Dinner and evening walk',
      time: '20:00',
      location: destination || first,
      type: 'meal',
    });
    return { date: date.toISOString().slice(0, 10), activities };
  });
}

function parsePrice(text: string, fallback: number): number {
  const rupeeMatch = text.match(/(?:₹|INR|Rs\.?)\s*([0-9][0-9,]*)/i);
  if (rupeeMatch) {
    const parsed = Number(rupeeMatch[1].replace(/,/g, ''));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const rangeMatch = text.match(/([0-9][0-9,]*)\s*[-–]\s*([0-9][0-9,]*)/);
  if (rangeMatch) {
    const a = Number(rangeMatch[1].replace(/,/g, ''));
    const b = Number(rangeMatch[2].replace(/,/g, ''));
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) {
      return Math.round((a + b) / 2);
    }
  }
  return fallback;
}

function isLikelyHotelName(value: string): boolean {
  const text = value.trim();
  if (!text) return false;
  const lower = text.toLowerCase();
  const blocked = [
    'budget options',
    'mid-range',
    'luxury',
    'booking website',
    'nightly rate',
    'location',
    'amenities',
    'destination',
  ];
  if (blocked.some((item) => lower.includes(item))) return false;
  if (text.length < 3 || text.length > 100) return false;
  return /[a-z]/i.test(text);
}

function normalizeHotelItem(name: string, body: string, location: string, budget: number, index: number) {
  const ratingMatch = body.match(/([3-5](?:\.\d)?)\s*(?:\/\s*5|stars?)/i);
  const urlMatch = body.match(/https?:\/\/[^\s)]+/i);
  const price = parsePrice(body, Math.max(1200, Math.round(budget / 6) + index * 400));
  return {
    id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index + 1}`,
    name,
    location,
    rating: ratingMatch ? Number(ratingMatch[1]) : 4 + ((index % 3) * 0.2),
    reviews: 120 + index * 35,
    price,
    amenities: ['WiFi', 'Breakfast', 'AC'],
    source_url: urlMatch ? urlMatch[0] : '',
  };
}

function parseHotelsFromText(text: string, location: string, budget: number) {
  const normalized = String(text || '').trim();
  const hotels: any[] = [];

  const numberedBoldRegex = /\d+\.\s+\*\*([^*]+)\*\*([\s\S]*?)(?=\n\d+\.\s+\*\*|$)/g;
  let match = numberedBoldRegex.exec(normalized);
  while (match && hotels.length < 12) {
    const name = match[1].trim();
    const body = match[2] || '';
    if (isLikelyHotelName(name)) {
      hotels.push(normalizeHotelItem(name, body, location, budget, hotels.length));
    }
    match = numberedBoldRegex.exec(normalized);
  }

  if (!hotels.length && normalized) {
    const boldRegex = /\*\*([^*]+)\*\*/g;
    const boldItems: Array<{ name: string; index: number }> = [];
    let boldMatch = boldRegex.exec(normalized);
    while (boldMatch) {
      const name = boldMatch[1].trim();
      if (isLikelyHotelName(name)) {
        boldItems.push({ name, index: boldMatch.index });
      }
      boldMatch = boldRegex.exec(normalized);
    }
    boldItems.slice(0, 12).forEach((item, idx) => {
      const start = item.index;
      const end = idx + 1 < boldItems.length ? boldItems[idx + 1].index : Math.min(normalized.length, start + 500);
      const body = normalized.slice(start, end);
      hotels.push(normalizeHotelItem(item.name, body, location, budget, hotels.length));
    });
  }

  if (!hotels.length && normalized) {
    const headingSectionRegex = /(?:^|\n)#{2,4}\s+([^\n]+)\n([\s\S]*?)(?=\n#{2,4}\s+|$)/g;
    let sectionMatch = headingSectionRegex.exec(normalized);
    while (sectionMatch && hotels.length < 12) {
      const heading = sectionMatch[1].trim();
      const body = sectionMatch[2] || '';
      if (isLikelyHotelName(heading) && /(hotel|resort|inn|hostel|villa|suite|palace|lodge|stay)/i.test(heading)) {
        hotels.push(normalizeHotelItem(heading, body, location, budget, hotels.length));
      }
      sectionMatch = headingSectionRegex.exec(normalized);
    }
  }

  if (!hotels.length && normalized) {
    const lines = normalized.split(/\r?\n/);
    lines.forEach((line) => {
      if (hotels.length >= 20) return;
      const clean = line.replace(/^[-*0-9.)\s]+/, '').trim();
      if (!clean) return;
      if (!/(hotel|resort|inn|hostel|villa|suite|palace|lodge|stay)/i.test(clean)) return;
      const name = clean.split(/\s+-\s+|\s+\|\s+|,\s*(?:nightly|price|rate|rating)/i)[0].trim();
      if (!isLikelyHotelName(name)) return;
      hotels.push(normalizeHotelItem(name, clean, location, budget, hotels.length));
    });
  }

  if (hotels.length) {
    const deduped = hotels.filter(
      (item, index, arr) =>
        arr.findIndex((other) => other.name.toLowerCase() === item.name.toLowerCase() && other.location.toLowerCase() === item.location.toLowerCase()) === index
    );
    return deduped.slice(0, 12);
  }

  return [];
}

function coerceNumber(value: any, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stripHtml(value: string): string {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTboHotelResult(hotel: any, fallbackLocation: string, budget: number, index: number) {
  const id = String(hotel?.id || hotel?.HotelCode || hotel?.hotel_code || `hotel-${index + 1}`);
  const name = String(hotel?.name || hotel?.HotelName || `Hotel ${index + 1}`);
  const location = String(hotel?.location || hotel?.CityName || hotel?.Address || fallbackLocation || '');
  const ratingRaw = coerceNumber(hotel?.rating ?? hotel?.HotelRating ?? hotel?.StarRating, 0);
  const priceRaw = coerceNumber(hotel?.price ?? hotel?.Price, 0);
  const fallbackPrice = Math.max(1200, Math.round((budget > 0 ? budget / 6 : 2200) + index * 180));
  const amenities = Array.isArray(hotel?.amenities)
    ? hotel.amenities.map((item: any) => String(item).trim()).filter(Boolean)
    : Array.isArray(hotel?.HotelFacilities)
      ? hotel.HotelFacilities.map((item: any) => String(item).trim()).filter(Boolean)
      : ['WiFi', 'Breakfast'];
  return {
    id,
    name,
    location,
    rating: ratingRaw > 0 ? ratingRaw : 4,
    reviews: Math.max(0, Math.round(coerceNumber(hotel?.reviews ?? hotel?.ReviewCount, 0))),
    price: priceRaw > 0 ? priceRaw : fallbackPrice,
    amenities: amenities.slice(0, 8),
    image_url: String(hotel?.image_url || hotel?.Image || ''),
    source_url: String(hotel?.source_url || hotel?.HotelWebsiteUrl || ''),
    tbo: hotel?.tbo || null,
  };
}

function buildLegs(origin: string, stops: string[]): Array<{ from: string; to: string; segment: string }> {
  const cleanStops = stops.map((item) => item.trim()).filter(Boolean);
  const route = [origin.trim(), ...cleanStops];
  if (route.length < 2) return [];
  if (route[route.length - 1].toLowerCase() !== origin.trim().toLowerCase()) {
    route.push(origin.trim());
  }
  return route.slice(0, -1).map((from, index) => ({ from, to: route[index + 1], segment: `${from} -> ${route[index + 1]}` }));
}

function buildTransportOptionsFromLegs(
  legs: Array<{ from: string; to: string; segment: string }>,
  mode: 'flight' | 'train' | 'bus' | 'cab' | 'mix',
  budget: number,
  aiText = ''
) {
  if (!legs.length) return [];
  const normalizedText = String(aiText || '').trim();
  if (!normalizedText) return [];
  const urlMatches = normalizedText.match(/https?:\/\/[^\s)]+/gi) || [];
  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lines = normalizedText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lowerText = aiText.toLowerCase();
  const extractSnippetForLeg = (from: string, to: string): string => {
    const explicitPattern = new RegExp(`${escapeRegExp(from)}\\s*(?:to|->|[-–])\\s*${escapeRegExp(to)}`, 'i');
    const explicitMatch = explicitPattern.exec(normalizedText);
    if (explicitMatch && typeof explicitMatch.index === 'number') {
      const start = Math.max(0, explicitMatch.index - 140);
      const end = Math.min(normalizedText.length, explicitMatch.index + 520);
      return normalizedText.slice(start, end);
    }
    const fromLower = from.toLowerCase();
    const toLower = to.toLowerCase();
    const fromIdx = lowerText.indexOf(fromLower);
    if (fromIdx !== -1) {
      const near = lowerText.indexOf(toLower, Math.max(0, fromIdx - 40));
      if (near !== -1 && Math.abs(near - fromIdx) < 400) {
        const start = Math.max(0, Math.min(fromIdx, near) - 80);
        const end = Math.min(aiText.length, Math.max(fromIdx, near) + 280);
        return aiText.slice(start, end);
      }
    }
    return '';
  };

  const inferProvider = (text: string, type: string): string => {
    const providerPatterns: Array<{ pattern: RegExp; name: string }> = [
      { pattern: /indigo/i, name: 'IndiGo' },
      { pattern: /air india/i, name: 'Air India' },
      { pattern: /vistara/i, name: 'Vistara' },
      { pattern: /irctc|shatabdi|rajdhani|vande bharat/i, name: 'IRCTC Rail' },
      { pattern: /redbus|intrcity|volvo/i, name: 'RedBus' },
      { pattern: /uber|ola|savaari|cab/i, name: 'Uber Intercity' },
    ];
    const hit = providerPatterns.find((item) => item.pattern.test(text));
    if (hit) return hit.name;
    if (type === 'flight') return 'Flight Partner';
    if (type === 'train') return 'Rail Partner';
    if (type === 'bus') return 'Bus Partner';
    return 'Cab Partner';
  };

  const inferType = (text: string, requested: typeof mode): 'flight' | 'train' | 'bus' | 'cab' => {
    if (requested !== 'mix') return requested;
    if (/flight|air|airport|6e-|ai-/i.test(text)) return 'flight';
    if (/train|rail|irctc|shatabdi|rajdhani/i.test(text)) return 'train';
    if (/bus|redbus|coach|volvo/i.test(text)) return 'bus';
    return 'cab';
  };

  const isLegRelatedLine = (line: string, from: string, to: string) => {
    const text = line.toLowerCase();
    if (text.includes(from.toLowerCase()) && text.includes(to.toLowerCase())) return true;
    if (text.includes(from.toLowerCase())) return true;
    if (text.includes(to.toLowerCase())) return true;
    return false;
  };

  const parseOptionFromText = (line: string, fallbackLeg: { segment: string }, legIndex: number, optionIndex: number) => {
    const cleaned = line.replace(/^[-*•\d.)\s]+/, '').trim();
    if (!cleaned) return null;
    const type = inferType(cleaned, mode);
    const provider = inferProvider(cleaned, type);
    const durationMatch = cleaned.match(/(\d+\s*(?:h|hr|hrs|hours?)(?:\s*\d+\s*(?:m|min|minutes?))?)/i);
    const timeMatch = cleaned.match(/(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*(?:-|to|->)\s*(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)/i);
    const ownUrl = cleaned.match(/https?:\/\/[^\s)]+/i);
    const basePrice =
      type === 'flight' ? 4200 + legIndex * 700 + optionIndex * 350 : type === 'cab' ? 2800 + legIndex * 550 + optionIndex * 250 : type === 'train' ? 1300 + legIndex * 280 + optionIndex * 120 : 950 + legIndex * 220 + optionIndex * 100;
    const parsedPrice = parsePrice(cleaned, basePrice);
    const effectivePrice = Math.max(400, parsedPrice);
    return {
      id: `leg-${legIndex + 1}-${type}-${optionIndex + 1}-${provider.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      segment: fallbackLeg.segment,
      type,
      provider,
      departure: timeMatch ? timeMatch[1].replace('.', ':') : `${String(6 + legIndex * 2 + optionIndex).padStart(2, '0')}:00`,
      arrival: timeMatch ? timeMatch[2].replace('.', ':') : `${String(8 + legIndex * 2 + optionIndex).padStart(2, '0')}:30`,
      duration: durationMatch ? durationMatch[1] : '3h 30m',
      price: effectivePrice,
      details: cleaned.replace(/\s+/g, ' ').trim().slice(0, 220),
      source_url: ownUrl ? ownUrl[0] : '',
      mix_strategy: mode === 'mix' ? 'Mix mode compared available providers for this leg.' : undefined,
    };
  };

  const options: any[] = [];
  legs.forEach((leg, idx) => {
    const snippet = aiText ? extractSnippetForLeg(leg.from, leg.to) : '';
    const blockLines = lines.filter((line) => isLegRelatedLine(line, leg.from, leg.to));
    const snippetLines = snippet
      ? snippet
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => !!line && line.length > 5)
      : [];
    const candidates = snippetLines.length ? snippetLines : blockLines;
    const legOptions = candidates
      .map((line, optionIndex) => parseOptionFromText(line, leg, idx, optionIndex))
      .filter(Boolean)
      .slice(0, 4) as any[];
    if (!legOptions.length && snippet) {
      const fallback = parseOptionFromText(snippet, leg, idx, 0);
      if (fallback) legOptions.push(fallback);
    }
    legOptions.forEach((option, optionIndex) => {
      if (!option.source_url) {
        option.source_url = urlMatches[idx + optionIndex] || urlMatches[optionIndex] || '';
      }
      if (option.price > 0 && Number.isFinite(budget) && budget > 0 && option.price > budget) {
        option.details = `${option.details} (May exceed total budget)`.trim();
      }
      options.push(option);
    });
  });
  return options;
}

export async function sendChatMessage(payload: { message: string; trip_id?: string }) {
  const existing = payload.trip_id ? getTripInternal(payload.trip_id) : null;
  const trip = existing ? buildTripDefaults(existing) : buildTripDefaults();
  const extracted = inferTripFromMessage(payload.message);
  const warnings: string[] = [];

  if (extracted.origin) trip.origin = String(extracted.origin);
  if (extracted.destination) trip.destination = String(extracted.destination);
  if (typeof extracted.budget === 'number' && extracted.budget > 0) trip.budget = extracted.budget;
  if (typeof extracted.days === 'number' && extracted.days > 0) {
    trip.days_count = extracted.days;
    const range = ensureDateRange(trip.start_date, undefined, extracted.days);
    trip.start_date = range.startDate;
    trip.end_date = range.endDate;
  }

  const userMessage: ChatMessageDTO = { id: createId('msg'), role: 'user', content: payload.message, timestamp: nowIso() };
  trip.chat_history.push(userMessage);

  let assistantContent = `Trip context updated: ${trip.origin} -> ${trip.destination || 'Destination not set'}, ${trip.days_count} day(s), INR ${trip.budget}.`;
  let results: any[] = [];

  const shouldSuggest = !!trip.destination && /suggest|plan|trip/i.test(payload.message);
  if (shouldSuggest) {
    try {
      results = await suggestPlacesFromBackend(trip.destination, trip.days_count || 3);
    } catch {
      results = generateSuggestedPlaces(trip.destination, trip.days_count || 3);
      warnings.push('Backend AI unavailable, showing fallback suggestions.');
    }
    assistantContent = results.length
      ? `I found ${results.length} places for ${trip.destination}. Drag these cards into itinerary days.`
      : `Could not generate place cards for ${trip.destination}.`;
    if (!results.length) warnings.push('No place cards could be generated.');
  }

  const assistantMessage: ChatMessageDTO = {
    id: createId('msg'),
    role: 'assistant',
    content: assistantContent,
    timestamp: nowIso(),
    results,
  };
  trip.chat_history.push(assistantMessage);
  trip.updated_at = nowIso();
  upsertTrip(trip);

  return { trip_id: trip.id, assistant_message: assistantMessage, extracted, warnings };
}

export async function getChatHistory(tripId: string) {
  const trip = getTripInternal(tripId);
  return (trip?.chat_history || []) as ChatMessageDTO[];
}

export async function generateItinerary(payload: {
  trip_id?: string;
  destination: string;
  origin: string;
  days: number;
  budget: number;
  start_date: string;
  end_date: string;
  preferences?: string[];
  preview?: boolean;
}) {
  const existing = payload.trip_id ? getTripInternal(payload.trip_id) : null;
  const trip = existing ? buildTripDefaults(existing) : buildTripDefaults();
  trip.destination = payload.destination;
  trip.origin = payload.origin;
  trip.days_count = Math.max(1, Number(payload.days || 1));
  trip.budget = Number(payload.budget || 0);
  trip.start_date = payload.start_date;
  trip.end_date = payload.end_date;
  trip.name = `${payload.destination} ${trip.days_count}-Day Trip`;

  const preferred = (payload.preferences || []).map((item) => ({ name: String(item).trim() })).filter((item) => item.name);
  let suggested = generateSuggestedPlaces(payload.destination, payload.days).map((item) => ({
    name: item.name,
    description: item.description,
  }));
  const warnings: string[] = [];
  try {
    const backendPlaces = await suggestPlacesFromBackend(payload.destination, payload.days);
    if (backendPlaces.length) {
      suggested = backendPlaces.map((item) => ({ name: item.name, description: item.description }));
    }
  } catch {
    warnings.push('Backend AI unavailable, used fallback itinerary suggestions.');
  }
  const unique = new Map<string, { name: string; description?: string }>();
  [...preferred, ...suggested].forEach((item) => {
    unique.set(item.name.toLowerCase(), item);
  });
  const itinerary = buildItineraryFromPlaces(Array.from(unique.values()), payload.start_date, payload.end_date, payload.destination);

  if (!payload.preview || !existing) {
    trip.itinerary = itinerary;
    trip.updated_at = nowIso();
    upsertTrip(trip);
  }

  return { trip_id: trip.id, itinerary, warnings };
}

export async function optimizeItinerary(payload: { trip_id: string; itinerary: any[]; preview?: boolean }) {
  const trip = getTripInternal(payload.trip_id);
  if (!trip) throw new Error('Trip not found');

  const optimized = (payload.itinerary || []).map((day: any) => {
    const deduped: any[] = [];
    const seen = new Set<string>();
    (day.activities || [])
      .sort((a: any, b: any) => String(a.time || '').localeCompare(String(b.time || '')))
      .forEach((activity: any) => {
        const key = `${String(activity.title || '').toLowerCase()}|${String(activity.location || '').toLowerCase()}|${String(activity.time || '')}`;
        if (seen.has(key)) return;
        seen.add(key);
        deduped.push(activity);
      });
    return { date: day.date, activities: deduped };
  });

  if (!payload.preview) {
    trip.itinerary = optimized;
    trip.updated_at = nowIso();
    upsertTrip(trip);
  }
  return { trip_id: payload.trip_id, itinerary: optimized, warnings: [] as string[] };
}

export async function saveTrip(payload: {
  trip_id?: string;
  name: string;
  origin: string;
  destination: string;
  start_date: string;
  end_date: string;
  budget: number;
  itinerary: any[];
}) {
  const existing = payload.trip_id ? getTripInternal(payload.trip_id) : null;
  const trip = existing ? buildTripDefaults(existing) : buildTripDefaults();
  trip.name = payload.name || trip.name;
  trip.origin = payload.origin || trip.origin;
  trip.destination = payload.destination || trip.destination;
  trip.start_date = payload.start_date || trip.start_date;
  trip.end_date = payload.end_date || trip.end_date;
  trip.days_count = Math.max(1, Math.floor((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / (1000 * 60 * 60 * 24)) + 1);
  trip.budget = Number(payload.budget || trip.budget || 0);
  trip.itinerary = payload.itinerary || trip.itinerary || [];
  trip.updated_at = nowIso();
  upsertTrip(trip);
  return { trip_id: trip.id, trip };
}

export async function listTrips() {
  return Object.values(getTripsMap())
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    .map((trip) => ({ ...trip }));
}

export async function getTrip(tripId: string) {
  const trip = getTripInternal(tripId);
  if (!trip) throw new Error('Trip not found');
  return { ...trip };
}

export async function deleteTrip(tripId: string) {
  removeTripInternal(tripId);
  return { ok: true };
}

export async function searchHotels(payload: {
  trip_id: string;
  location: string;
  budget: number;
  check_in?: string;
  check_out?: string;
  adults?: number;
  children?: number;
}) {
  const trip = getTripInternal(payload.trip_id);
  if (!trip) throw new Error('Trip not found');
  let hotels: any[] = [];
  let source: 'ai' | 'ai_fallback' | 'tbo' = useTboApi ? 'tbo' : 'ai';
  try {
    if (useTboApi) {
      const backend = await rawFetch<{ hotels?: any[] }>('/tbo/hotels/search', {
        method: 'POST',
        body: JSON.stringify({
          location: payload.location,
          check_in: payload.check_in || trip.start_date,
          check_out: payload.check_out || trip.end_date,
          adults: Math.max(1, Number(payload.adults || 1)),
          children: Math.max(0, Number(payload.children || 0)),
          max_budget_inr: Number(payload.budget || 0),
          guest_nationality: 'IN',
        }),
      });
      hotels = (backend.hotels || []).map((item, index) =>
        normalizeTboHotelResult(item, payload.location, Number(payload.budget || 0), index)
      );
      source = 'tbo';
    } else {
      const itineraryTextBase = (trip.itinerary || [])
        .map((day: any, idx: number) => {
          const lines = [`Day ${idx + 1} (${day.date || ''})`];
          (day.activities || []).forEach((activity: any) => {
            lines.push(`- ${activity.time || ''} ${activity.title || 'Activity'} @ ${activity.location || ''}`.trim());
          });
          return lines.join('\n');
        })
        .join('\n');
      const itineraryText = `${itineraryTextBase}

Focused stay request:
- Location: ${payload.location}
- Check-in: ${payload.check_in || trip.start_date}
- Check-out: ${payload.check_out || trip.end_date}
- Adults: ${Math.max(1, Number(payload.adults || 1))}
- Max budget: INR ${payload.budget}`;
      const backend = await postToSession<{ accommodation_options?: string }>('find-accommodation-options', {
        itinerary: itineraryText,
        origin: trip.origin,
        max_budget_inr: payload.budget,
      });
      const rawHotels = String(backend.accommodation_options || '').trim();
      if (!rawHotels) throw new Error('Booking agent returned empty hotel response.');
      hotels = parseHotelsFromText(rawHotels, payload.location, payload.budget);
    }
  } catch (error) {
    source = useTboApi ? 'tbo' : 'ai_fallback';
    const reason = error instanceof Error ? error.message : 'Unable to fetch hotels from booking agent.';
    throw new Error(reason);
  }
  if (!hotels.length) {
    throw new Error('No hotels could be parsed from AI response for this day.');
  }
  trip._hotel_cache = trip._hotel_cache || {};
  hotels.forEach((hotel) => {
    trip._hotel_cache![hotel.id] = hotel;
  });
  trip.updated_at = nowIso();
  upsertTrip(trip);
  return { trip_id: payload.trip_id, hotels, source };
}

export async function getHotelDetails(hotelId: string, payload: { trip_id: string; location?: string; hotel_name?: string }) {
  const trip = getTripInternal(payload.trip_id);
  if (!trip) throw new Error('Trip not found');
  const cached = trip._hotel_cache?.[hotelId];
  if (useTboApi) {
    const response = await rawFetch<{ hotel?: any }>('/tbo/hotels/details', {
      method: 'POST',
      body: JSON.stringify({ hotel_code: hotelId }),
    });
    const fromTbo = response.hotel || {};
    const images = Array.isArray(fromTbo.images) ? fromTbo.images.map((item: any) => String(item)).filter(Boolean) : [];
    const primaryPrice = coerceNumber(cached?.price ?? fromTbo.price, 0);
    const effectivePrice = primaryPrice > 0 ? primaryPrice : Math.max(1400, Math.round(trip.budget / 6));
    return {
      id: String(fromTbo.id || hotelId),
      name: String(fromTbo.name || payload.hotel_name || cached?.name || 'Selected Hotel'),
      location: String(fromTbo.location || payload.location || cached?.location || trip.destination),
      rating: coerceNumber(fromTbo.rating, coerceNumber(cached?.rating, 4)),
      reviews: Math.max(0, Math.round(coerceNumber(fromTbo.reviews, coerceNumber(cached?.reviews, 0)))),
      price: effectivePrice,
      amenities: Array.isArray(fromTbo.amenities)
        ? fromTbo.amenities.map((item: any) => String(item).trim()).filter(Boolean).slice(0, 16)
        : cached?.amenities || ['WiFi', 'Breakfast', 'AC'],
      description: stripHtml(String(fromTbo.description || `${fromTbo.name || payload.hotel_name || 'Hotel'} is suitable for your itinerary.`)),
      images: images.length
        ? images
        : [
            `https://picsum.photos/seed/${encodeURIComponent(String(fromTbo.id || hotelId))}-1/1200/800`,
            `https://picsum.photos/seed/${encodeURIComponent(String(fromTbo.id || hotelId))}-2/1200/800`,
          ],
      room_types: [
        { name: 'Standard Room', price: Math.round(effectivePrice * 0.9), capacity: 2, description: 'Comfort room' },
        { name: 'Deluxe Room', price: Math.round(effectivePrice * 1.15), capacity: 3, description: 'Spacious room' },
        { name: 'Family Suite', price: Math.round(effectivePrice * 1.45), capacity: 4, description: 'Family room' },
      ],
      policies: {
        check_in: String(fromTbo?.policies?.check_in || ''),
        check_out: String(fromTbo?.policies?.check_out || ''),
        cancellation: String(fromTbo?.policies?.cancellation || ''),
        guest_services: ['24x7 Front Desk', 'Airport Transfer'],
      },
      source_url: String(fromTbo.source_url || cached?.source_url || ''),
    };
  }
  const base = cached || {
    id: hotelId,
    name: payload.hotel_name || 'Selected Hotel',
    location: payload.location || trip.destination,
    rating: 4.1,
    reviews: 160,
    price: Math.max(1400, Math.round(trip.budget / 6)),
    amenities: ['WiFi', 'Breakfast', 'AC'],
  };
  return {
    ...base,
    description: `${base.name} is suitable for your ${trip.destination} itinerary.`,
    images: [
      `https://picsum.photos/seed/${encodeURIComponent(base.id)}-1/1200/800`,
      `https://picsum.photos/seed/${encodeURIComponent(base.id)}-2/1200/800`,
      `https://picsum.photos/seed/${encodeURIComponent(base.id)}-3/1200/800`,
      `https://picsum.photos/seed/${encodeURIComponent(base.id)}-4/1200/800`,
    ],
    room_types: [
      { name: 'Standard Room', price: Math.round((base.price || 1800) * 0.9), capacity: 2, description: 'Comfort room' },
      { name: 'Deluxe Room', price: Math.round((base.price || 1800) * 1.15), capacity: 3, description: 'Spacious room' },
      { name: 'Family Suite', price: Math.round((base.price || 1800) * 1.45), capacity: 4, description: 'Family room' },
    ],
    policies: {
      check_in: '12:00 PM',
      check_out: '11:00 AM',
      cancellation: 'Free cancellation up to 24h before check-in',
      guest_services: ['24x7 Front Desk', 'Airport Transfer'],
    },
  };
}

export async function addFavoriteHotel(tripId: string, hotelId: string) {
  const trip = getTripInternal(tripId);
  if (!trip) throw new Error('Trip not found');
  if (!trip.favorite_hotels.includes(hotelId)) {
    trip.favorite_hotels.push(hotelId);
    trip.updated_at = nowIso();
    upsertTrip(trip);
  }
  return { ok: true };
}

export async function removeFavoriteHotel(tripId: string, hotelId: string) {
  const trip = getTripInternal(tripId);
  if (!trip) throw new Error('Trip not found');
  trip.favorite_hotels = trip.favorite_hotels.filter((id) => id !== hotelId);
  trip.updated_at = nowIso();
  upsertTrip(trip);
  return { ok: true };
}

export async function planTransport(payload: {
  trip_id?: string;
  origin: string;
  stops: string[];
  start_date?: string;
  end_date?: string;
  mode: 'flight' | 'train' | 'bus' | 'cab' | 'mix';
  budget: number;
}) {
  const trip = payload.trip_id ? getTripInternal(payload.trip_id) : null;
  const legs = buildLegs(payload.origin, payload.stops);
  if (!legs.length) throw new Error('At least one transport leg is required.');
  let aiText = '';
  let source: 'ai' | 'ai_fallback' = 'ai';
  try {
    const itineraryText =
      trip?.itinerary && Array.isArray(trip.itinerary) && trip.itinerary.length
        ? trip.itinerary
            .map((day: any, idx: number) => {
              const lines = [`Day ${idx + 1} (${day.date || ''})`];
              (day.activities || []).forEach((activity: any) => {
                lines.push(`- ${activity.time || ''} ${activity.title || 'Activity'} @ ${activity.location || ''}`.trim());
              });
              return lines.join('\n');
            })
            .join('\n')
        : payload.stops.join(', ');
    const backend = await postToSession<{ transportation_options?: string }>('find-transportation-options', {
      itinerary: itineraryText,
      origin: payload.origin,
      transport_mode: payload.mode === 'mix' ? 'mixed' : payload.mode === 'cab' ? 'car' : payload.mode,
      max_budget_inr: payload.budget,
    });
    aiText = String(backend.transportation_options || '');
    if (!aiText.trim()) throw new Error('Booking agent returned empty transport response.');
  } catch (error) {
    source = 'ai_fallback';
    const reason = error instanceof Error ? error.message : 'Unable to fetch transport options from booking agent.';
    throw new Error(reason);
  }
  const options = buildTransportOptionsFromLegs(legs, payload.mode, payload.budget, aiText);
  if (!options.length) {
    throw new Error('No transport options could be parsed from AI response.');
  }
  if (trip) {
    trip._transport_cache = options;
    trip.updated_at = nowIso();
    upsertTrip(trip);
  }
  return { options, source };
}

export async function createCheckout(payload: {
  trip_id?: string;
  selections: Array<{
    category: 'hotel' | 'transport' | 'activity';
    item_id: string;
    title: string;
    amount: number;
    metadata?: Record<string, any>;
  }>;
  currency?: string;
}) {
  const bookingId = createId('booking');
  const total = payload.selections.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const booking: StoredBooking = {
    id: bookingId,
    trip_id: payload.trip_id,
    status: 'pending',
    currency: (payload.currency || 'INR').toUpperCase(),
    total_amount: total,
    selections: payload.selections.map((item) => ({ ...item })),
    payment: { status: 'pending' },
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  const map = getBookingsMap();
  map[bookingId] = booking;
  saveBookingsMap(map);
  return { booking_id: bookingId, status: booking.status, total_amount: total, currency: booking.currency };
}

export async function confirmPayment(bookingId: string, payload: { payment_method: string; payment_reference: string }) {
  const map = getBookingsMap();
  const booking = map[bookingId];
  if (!booking) throw new Error('Booking not found');
  booking.status = 'confirmed';
  booking.payment = { status: 'confirmed', method: payload.payment_method, reference: payload.payment_reference };
  booking.confirmation_number = booking.confirmation_number || `VH-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  booking.updated_at = nowIso();
  map[bookingId] = booking;
  saveBookingsMap(map);
  return { booking_id: booking.id, status: booking.status, confirmation_number: booking.confirmation_number || '' };
}

export async function listBookings(tripId?: string) {
  const bookings = Object.values(getBookingsMap()).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (!tripId) return bookings;
  return bookings.filter((booking) => booking.trip_id === tripId);
}

export async function getBooking(bookingId: string) {
  const booking = getBookingsMap()[bookingId];
  if (!booking) throw new Error('Booking not found');
  return booking;
}

export async function geocodePlace(query: string) {
  try {
    const backend = await postToSession<{ result?: any }>('coordinates', { location: query });
    const parsed = parseCoordinates(backend.result);
    if (Number.isFinite(parsed.lat) && Number.isFinite(parsed.lng) && (Math.abs(parsed.lat) > 0.0001 || Math.abs(parsed.lng) > 0.0001)) {
      return { query, lat: parsed.lat, lng: parsed.lng, address: parsed.address || query, source: parsed.source || 'backend' };
    }
  } catch {
    // fall through to local/mapbox logic
  }

  const key = keyFromText(query);
  const city = Object.keys(CITY_COORDS).find((item) => key.includes(item));
  if (city) {
    return { query, lat: CITY_COORDS[city].lat, lng: CITY_COORDS[city].lng, address: query, source: 'local' };
  }

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (token) {
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?limit=1&access_token=${encodeURIComponent(token)}`;
      const response = await fetch(url, { cache: 'force-cache' });
      if (response.ok) {
        const data = await response.json();
        const feature = data?.features?.[0];
        const lng = Number(feature?.center?.[0]);
        const lat = Number(feature?.center?.[1]);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return { query, lat, lng, address: String(feature?.place_name || query), source: 'mapbox' };
        }
      }
    } catch {
      // ignore and fallback
    }
  }

  return { query, lat: 20.5937, lng: 78.9629, address: query, source: 'fallback' };
}


