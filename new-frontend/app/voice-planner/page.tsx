'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapView, type Location } from '@/components/map-view';
import { ItineraryBuilder, type Activity, type Day } from '@/components/itinerary-builder';
import { buildSpokenResponse, parseVoiceCommand, transcribeVoiceAudio, type VoiceStage } from '@/lib/voice-client';
import {
  geocodePlace,
  getHotelDetails,
  planTransport,
  saveTrip,
  searchHotels,
} from '@/lib/api-client';
import { Calendar, Check, Hotel, Loader2, Mic, Plane, Sparkles, Square, Volume2, VolumeX } from 'lucide-react';

type ViewMode = 'itinerary' | 'hotels' | 'transport';
type Role = 'user' | 'assistant';

interface Message {
  id: string;
  role: Role;
  text: string;
  at: string;
}

interface PlaceCard {
  id: string;
  name: string;
  description?: string;
  type?: string;
  lat?: number;
  lng?: number;
}

interface HotelResult {
  id: string;
  name: string;
  location: string;
  rating?: number;
  reviews?: number;
  price?: number;
  source_url?: string;
}

interface TransportOption {
  id: string;
  segment: string;
  type: string;
  provider: string;
  departure: string;
  arrival: string;
  duration: string;
  price: number;
  details?: string;
  source_url?: string;
}

interface HotelCartItem {
  day: number;
  location: string;
  checkIn: string;
  checkOut: string;
  hotel: HotelResult;
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(baseIso: string, days: number): string {
  const base = new Date(baseIso || todayIso());
  base.setDate(base.getDate() + Math.max(0, days));
  return base.toISOString().slice(0, 10);
}

function parseDayLocation(itinerary: Day[], day: number, fallbackDestination: string): string {
  const target = itinerary[Math.max(0, day - 1)];
  if (!target) return fallbackDestination;
  const first = (target.activities || []).find((a) => String(a.location || '').trim());
  return String(first?.location || fallbackDestination || '').trim();
}

function uniqueLocationsFromItinerary(itinerary: Day[], fallbackDestination: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  itinerary.forEach((day) => {
    (day.activities || []).forEach((activity) => {
      const value = String(activity.location || '').trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(value);
    });
  });
  if (!out.length && fallbackDestination.trim()) out.push(fallbackDestination.trim());
  return out;
}

interface TransportLeg {
  from: string;
  to: string;
  segment: string;
}

function buildTransportLegs(origin: string, stops: string[]): TransportLeg[] {
  const cleanOrigin = String(origin || '').trim();
  const cleanStops = (stops || []).map((item) => String(item || '').trim()).filter(Boolean);
  if (!cleanOrigin || !cleanStops.length) return [];
  const route = [cleanOrigin, ...cleanStops];
  if (route[route.length - 1].toLowerCase() !== cleanOrigin.toLowerCase()) {
    route.push(cleanOrigin);
  }
  const legs: TransportLeg[] = [];
  for (let i = 0; i < route.length - 1; i += 1) {
    legs.push({ from: route[i], to: route[i + 1], segment: `${route[i]} -> ${route[i + 1]}` });
  }
  return legs;
}

function normalizeSegment(segment: string): string {
  return String(segment || '')
    .toLowerCase()
    .replace(/\s*(->|to|[-–—])\s*/g, '->')
    .replace(/\s+/g, ' ')
    .trim();
}

function ensureDays(existing: Day[], total: number, startDate: string): Day[] {
  const count = Math.max(1, total || 1);
  const safeStart = startDate || todayIso();
  const next = [...(existing || [])];
  while (next.length < count) {
    next.push({ date: addDays(safeStart, next.length), activities: [] });
  }
  return next.slice(0, count);
}

function fuzzyMatchByName<T extends { name?: string; provider?: string; segment?: string }>(items: T[], query: string): T | null {
  const q = String(query || '').trim().toLowerCase();
  if (!items.length) return null;
  if (!q) return items[0];
  const cleanedQ = q
    .replace(/\b(view|details|detail|hotel|add|to|cart|show|open|please|for)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const probe = cleanedQ || q;

  const exact = items.find((item) => String(item.name || item.provider || '').toLowerCase() === probe);
  if (exact) return exact;
  const contains = items.find((item) => {
    const text = `${String(item.name || '')} ${String(item.provider || '')} ${String(item.segment || '')}`.toLowerCase();
    return text.includes(probe) || probe.includes(String(item.name || item.provider || '').toLowerCase());
  });
  if (contains) return contains;

  const tokens = probe.split(/\s+/).map((token) => token.trim()).filter((token) => token.length > 1);
  if (!tokens.length) return null;
  let best: T | null = null;
  let bestScore = 0;
  items.forEach((item) => {
    const text = `${String(item.name || '')} ${String(item.provider || '')} ${String(item.segment || '')}`.toLowerCase();
    const score = tokens.reduce((sum, token) => (text.includes(token) ? sum + 1 : sum), 0);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  });
  const threshold = Math.max(2, Math.ceil(tokens.length * 0.6));
  if (best && bestScore >= threshold) return best;
  return null;
}

function summarizeNames(names: string[], limit = 5): string {
  const clean = names.map((n) => String(n || '').trim()).filter(Boolean);
  if (!clean.length) return '';
  const top = clean.slice(0, limit);
  const suffix = clean.length > limit ? ` and ${clean.length - limit} more` : '';
  return `${top.join(', ')}${suffix}`;
}

function isAffirmativeText(text: string): boolean {
  return /\b(yes|yeah|yup|sure|ok|okay|go|continue|proceed|search)\b/i.test(String(text || ''));
}

function isSkipText(text: string): boolean {
  return /\b(skip|next|not now|no)\b/i.test(String(text || ''));
}

function wantsTransport(text: string): boolean {
  return /\b(transport|flight|train|bus|cab)\b/i.test(String(text || ''));
}

function wantsCheckout(text: string): boolean {
  return /\b(checkout|book|booking|payment|pay)\b/i.test(String(text || ''));
}

const VOICE_QUICK_PROMPTS = [
  'Suggest places for a 3 day trip to Gokarna',
  'Add Om Beach to day 1 and Gokarna Beach to day 2',
  'Origin is Pune, trip name is Gokarna trip, dates are 3 March 2026 to 6 March 2026',
  'Day 1 Gokarna, Karnataka, India',
];

const VOICE_LANGUAGES = [
  { code: 'en-IN', label: 'English', aliases: ['english', 'eng'] },
  { code: 'hi-IN', label: 'Hindi', aliases: ['hindi', 'hindustani'] },
  { code: 'mr-IN', label: 'Marathi', aliases: ['marathi'] },
  { code: 'gu-IN', label: 'Gujarati', aliases: ['gujarati'] },
  { code: 'ta-IN', label: 'Tamil', aliases: ['tamil'] },
  { code: 'te-IN', label: 'Telugu', aliases: ['telugu'] },
  { code: 'kn-IN', label: 'Kannada', aliases: ['kannada'] },
  { code: 'ml-IN', label: 'Malayalam', aliases: ['malayalam'] },
  { code: 'bn-IN', label: 'Bengali', aliases: ['bengali', 'bangla'] },
  { code: 'pa-IN', label: 'Punjabi', aliases: ['punjabi'] },
];

function detectVoiceLanguage(text: string): { code: string; label: string } | null {
  const lowered = String(text || '').toLowerCase();
  for (const language of VOICE_LANGUAGES) {
    if (language.aliases.some((alias) => new RegExp(`\\b${alias}\\b`, 'i').test(lowered))) {
      return { code: language.code, label: language.label };
    }
  }
  return null;
}

function languageLabelFromCode(code: string): string {
  const matched = VOICE_LANGUAGES.find((language) => language.code === code);
  return matched?.label || 'English';
}

function hasIntentWords(text: string): boolean {
  return /\b(suggest|recommend|plan|add|search|hotel|transport|checkout|book|origin|trip|day|view|details)\b/i.test(String(text || ''));
}

const configuredMainApiBase = String(process.env.NEXT_PUBLIC_API_BASE_URL || '').trim();
const PRIMARY_PLACE_API_BASE = (configuredMainApiBase || 'http://localhost:5000')
  .replace(/:8000(\/|$)/, ':5000$1')
  .replace(/\/+$/, '');
const PRIMARY_PLACE_SESSION_KEY = 'voyage_voice_place_session_5000';

const geocodeCache = new Map<string, { lat: number; lng: number }>();

function parseCoordPayload(raw: any): { lat: number; lng: number } {
  let data = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      try {
        data = JSON.parse(raw.replace(/'/g, '"'));
      } catch {
        data = {};
      }
    }
  }
  const lat = Number(data?.latitude ?? data?.lat ?? 0);
  const lng = Number(data?.longitude ?? data?.lng ?? 0);
  return { lat: Number.isFinite(lat) ? lat : 0, lng: Number.isFinite(lng) ? lng : 0 };
}

async function primaryPlaceFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${PRIMARY_PLACE_API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Places API ${response.status}: ${text}`);
  }
  return (await response.json()) as T;
}

async function ensurePrimaryPlaceSession(forceNew = false): Promise<string> {
  if (!forceNew && typeof window !== 'undefined') {
    const existing = window.localStorage.getItem(PRIMARY_PLACE_SESSION_KEY);
    if (existing) return existing;
  }
  const created = await primaryPlaceFetch<{ session_id: string }>('/sessions', {
    method: 'POST',
    body: '{}',
  });
  const sid = String(created.session_id || '').trim();
  if (!sid) throw new Error('Failed to create session on primary backend.');
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(PRIMARY_PLACE_SESSION_KEY, sid);
  }
  return sid;
}

async function geocodeLocation(name: string): Promise<{ lat: number; lng: number } | null> {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  try {
    const result = await geocodePlace(name);
    const lat = Number(result.lat);
    const lng = Number(result.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) <= 0.0001 && Math.abs(lng) <= 0.0001) return null;
    const point = { lat, lng };
    geocodeCache.set(key, point);
    return point;
  } catch {
    return null;
  }
}

function isIndiaCoordinate(lat?: number, lng?: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const x = Number(lat);
  const y = Number(lng);
  return x >= 6 && x <= 38 && y >= 68 && y <= 98;
}

function destinationTokens(destination: string): string[] {
  return String(destination || '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);
}

function scorePlaceRelevance(place: PlaceCard, destination: string): number {
  const tokens = destinationTokens(destination);
  const name = String(place.name || '').toLowerCase();
  const tokenHit = tokens.some((token) => name.includes(token));
  const geoHit = isIndiaCoordinate(place.lat, place.lng);
  if (tokenHit && geoHit) return 3;
  if (tokenHit) return 2;
  if (geoHit) return 1;
  return 0;
}

function looksIndianDestination(destination: string): boolean {
  const text = String(destination || '').toLowerCase();
  if (!text) return true;
  if (/\b(france|paris|london|england|europe|usa|canada|australia|japan|singapore|dubai)\b/.test(text)) {
    return false;
  }
  return true;
}

async function suggestPlacesFromPrimaryBackend(destination: string, days: number): Promise<PlaceCard[]> {
  const makeQueryDestination = (value: string) => {
    const cleaned = String(value || '').trim();
    if (!cleaned) return cleaned;
    if (/india/i.test(cleaned)) return cleaned;
    return `${cleaned}, India`;
  };

  const parsePlaces = (response: any, targetDestination: string): PlaceCard[] => {
    const places: PlaceCard[] = (response?.attractions_with_coordinates || []).map((item: any, index: number) => {
      const name = String(item?.name || item?.location_query || `Place ${index + 1}`).trim();
      const coords = parseCoordPayload(item?.coordinates);
      return {
        id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${index + 1}`,
        name,
        description: `Recommended attraction for ${targetDestination}`,
        type: 'attraction',
        lat: coords.lat,
        lng: coords.lng,
      } as PlaceCard;
    });
    return places.filter((item: PlaceCard) => !!item.name);
  };

  const call = async (sid: string, targetDestination: string) =>
    primaryPlaceFetch<{
      attractions_with_coordinates?: Array<{ name?: string; location_query?: string; coordinates?: any }>;
      suggestions?: string;
    }>(`/sessions/${encodeURIComponent(sid)}/suggest-places`, {
      method: 'POST',
      body: JSON.stringify({
        destination: targetDestination,
        duration: `${Math.max(1, days)} days`,
      }),
    });

  const targetDestination = makeQueryDestination(destination);
  const validate = (items: PlaceCard[]) => {
    if (!items.length) return false;
    const scored = items.map((item) => scorePlaceRelevance(item, destination));
    const strong = scored.filter((value) => value >= 2).length;
    const weak = scored.filter((value) => value >= 1).length;
    if (!looksIndianDestination(destination)) {
      return strong >= Math.max(2, Math.floor(items.length * 0.35));
    }
    // For India-focused trips, require mostly India coordinates or destination token matches.
    return weak >= Math.max(3, Math.floor(items.length * 0.6));
  };

  const runOnce = async (forceNewSession: boolean): Promise<PlaceCard[]> => {
    let sid = await ensurePrimaryPlaceSession(forceNewSession);
    try {
      const response = await call(sid, targetDestination);
      return parsePlaces(response, destination);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('404')) throw e;
      sid = await ensurePrimaryPlaceSession(true);
      const retryResponse = await call(sid, targetDestination);
      return parsePlaces(retryResponse, destination);
    }
  };

  const first = await runOnce(false);
  if (validate(first)) return first;

  const second = await runOnce(true);
  if (validate(second)) return second;

  // As a safe fallback, return only the relevant subset rather than random off-topic results.
  const filtered = second.filter((item) => scorePlaceRelevance(item, destination) >= 1);
  if (filtered.length) return filtered;
  return [];
}

export default function VoicePlannerPage() {
  const router = useRouter();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const [tripId, setTripId] = useState('');
  const [tripName, setTripName] = useState('My Voice Trip');
  const [origin, setOrigin] = useState('Pune');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(addDays(todayIso(), 2));
  const [budget, setBudget] = useState(30000);
  const [plannedDays, setPlannedDays] = useState(3);

  const [stage, setStage] = useState<VoiceStage>('discover');
  const [viewMode, setViewMode] = useState<ViewMode>('itinerary');

  const [itinerary, setItinerary] = useState<Day[]>(ensureDays([], 3, todayIso()));
  const [placeCards, setPlaceCards] = useState<PlaceCard[]>([]);

  const [hotelResults, setHotelResults] = useState<HotelResult[]>([]);
  const [hotelSource, setHotelSource] = useState('');
  const [hotelDay, setHotelDay] = useState(1);
  const [hotelLocation, setHotelLocation] = useState('');
  const [hotelCart, setHotelCart] = useState<HotelCartItem[]>([]);
  const [hotelSkippedDays, setHotelSkippedDays] = useState<number[]>([]);
  const [pendingHotelDayPrompt, setPendingHotelDayPrompt] = useState<number | null>(null);
  const [pendingPostHotelChoice, setPendingPostHotelChoice] = useState(false);
  const [hotelMapLocations, setHotelMapLocations] = useState<Location[]>([]);

  const [transportOptions, setTransportOptions] = useState<TransportOption[]>([]);
  const [transportSource, setTransportSource] = useState('');
  const [transportCart, setTransportCart] = useState<TransportOption[]>([]);
  const [transportLegs, setTransportLegs] = useState<TransportLeg[]>([]);
  const [activeTransportLegIndex, setActiveTransportLegIndex] = useState<number | null>(null);
  const [pendingTransportLegPrompt, setPendingTransportLegPrompt] = useState<number | null>(null);
  const [transportSkippedLegs, setTransportSkippedLegs] = useState<string[]>([]);
  const [pendingPostTransportChoice, setPendingPostTransportChoice] = useState(false);
  const [transportMapLocations, setTransportMapLocations] = useState<Location[]>([]);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: createId('msg'),
      role: 'assistant',
      text: 'Voice planner is ready. Which language do you want? You can say English, Hindi, Marathi, Gujarati, Tamil, Telugu, Kannada, Malayalam, Bengali, or Punjabi.',
      at: nowIso(),
    },
  ]);

  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceLanguage, setVoiceLanguage] = useState('en-IN');
  const [pendingLanguageSelection, setPendingLanguageSelection] = useState(true);
  const [lastTranscript, setLastTranscript] = useState('');
  const [error, setError] = useState('');

  const hotelCartTotal = useMemo(
    () => hotelCart.reduce((sum, item) => sum + Number(item.hotel.price || 0), 0),
    [hotelCart]
  );
  const transportCartTotal = useMemo(
    () => transportCart.reduce((sum, item) => sum + Number(item.price || 0), 0),
    [transportCart]
  );
  const grandTotal = hotelCartTotal + transportCartTotal;
  const totalTripDays = useMemo(() => Math.max(1, itinerary.length || plannedDays || 1), [itinerary.length, plannedDays]);
  const transportStops = useMemo(() => uniqueLocationsFromItinerary(itinerary, destination), [itinerary, destination]);
  const hotelMapCenter = useMemo(
    () => (hotelMapLocations[0] ? { lat: hotelMapLocations[0].lat, lng: hotelMapLocations[0].lng } : undefined),
    [hotelMapLocations]
  );
  const transportMapCenter = useMemo(
    () => (transportMapLocations[0] ? { lat: transportMapLocations[0].lat, lng: transportMapLocations[0].lng } : undefined),
    [transportMapLocations]
  );
  const currentVoiceLanguageLabel = useMemo(() => languageLabelFromCode(voiceLanguage), [voiceLanguage]);

  const appendMessage = useCallback((role: Role, text: string) => {
    setMessages((prev) => [...prev, { id: createId('msg'), role, text, at: nowIso() }]);
  }, []);

  const speakText = useCallback(
    async (text: string) => {
      if (!speechEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1;
      utter.pitch = 1;
      utter.lang = voiceLanguage || 'en-IN';
      utter.onstart = () => setSpeaking(true);
      utter.onend = () => setSpeaking(false);
      utter.onerror = () => setSpeaking(false);
      currentUtteranceRef.current = utter;
      window.speechSynthesis.speak(utter);
    },
    [speechEnabled, voiceLanguage]
  );

  const stopSpeaking = useCallback(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    currentUtteranceRef.current = null;
    setSpeaking(false);
  }, []);

  const saveCurrentTrip = useCallback(
    async (nextItinerary: Day[]) => {
      const payload = {
        trip_id: tripId || undefined,
        name: tripName || `${destination || 'Trip'} ${plannedDays}-Day Trip`,
        origin: origin || 'Pune',
        destination: destination || '',
        start_date: startDate || todayIso(),
        end_date: endDate || addDays(todayIso(), Math.max(1, plannedDays) - 1),
        budget: Number(budget || 0),
        itinerary: nextItinerary,
      };
      const saved = await saveTrip(payload);
      if (saved.trip_id) setTripId(saved.trip_id);
      return saved.trip_id || tripId;
    },
    [budget, destination, endDate, origin, plannedDays, startDate, tripId, tripName]
  );

  const findNextHotelDayToHandle = useCallback(
    (fromDay: number, cart: HotelCartItem[], skippedDays: number[]) => {
      const selected = new Set(cart.map((item) => Number(item.day || 0)));
      const skipped = new Set(skippedDays.map((day) => Number(day || 0)));
      for (let day = Math.max(1, fromDay); day <= totalTripDays; day += 1) {
        if (selected.has(day) || skipped.has(day)) continue;
        return day;
      }
      return null;
    },
    [totalTripDays]
  );

  const runHotelSearchForDay = useCallback(
    async (day: number, locationHint?: string) => {
      const safeDay = Math.max(1, Math.min(Number(day || 1), totalTripDays));
      const location = String(locationHint || parseDayLocation(itinerary, safeDay, destination)).trim();
      if (!location) {
        return { reply: `Please tell me location for day ${safeDay}.`, hotels: [] as HotelResult[] };
      }

      setHotelDay(safeDay);
      setHotelLocation(location);
      setViewMode('hotels');

      const dayCheckIn = startDate ? addDays(startDate, safeDay - 1) : todayIso();
      const dayCheckOut = startDate ? addDays(startDate, safeDay) : addDays(todayIso(), 1);
      const result = await searchHotels({
        trip_id: tripId || undefined,
        location,
        budget: Number(budget || 0),
        check_in: dayCheckIn,
        check_out: dayCheckOut,
        adults: 1,
      });
      const hotels = ((result.hotels || []) as HotelResult[]).slice(0, 12);
      setHotelResults(hotels);
      setHotelSource(String(result.source || ''));
      setStage('hotel_results');

      const reply = hotels.length
        ? `I found ${hotels.length} hotels for day ${safeDay}: ${summarizeNames(hotels.map((h) => h.name), 4)}. You can say add hotel to cart or view details.`
        : `I could not find hotels for day ${safeDay} in ${location}.`;
      return { reply, hotels };
    },
    [budget, destination, itinerary, startDate, totalTripDays, tripId]
  );

  const findNextTransportLegToHandle = useCallback(
    (fromIndex: number, legs: TransportLeg[], cart: TransportOption[], skipped: string[]) => {
      const selected = new Set(cart.map((item) => normalizeSegment(item.segment)));
      const skippedSet = new Set(skipped.map((item) => normalizeSegment(item)));
      for (let i = Math.max(0, fromIndex); i < legs.length; i += 1) {
        const key = normalizeSegment(legs[i].segment);
        if (selected.has(key) || skippedSet.has(key)) continue;
        return i;
      }
      return null;
    },
    []
  );

  const runTransportSearchForLeg = useCallback(
    async (legIndex: number, legsOverride?: TransportLeg[]) => {
      const sourceLegs = legsOverride && legsOverride.length ? legsOverride : transportLegs;
      const index = Math.max(0, Math.min(legIndex, sourceLegs.length - 1));
      const leg = sourceLegs[index];
      if (!leg) {
        return { reply: 'No transport legs available.', options: [] as TransportOption[] };
      }

      const planned = await planTransport({
        trip_id: tripId || undefined,
        origin: leg.from,
        stops: [leg.to],
        start_date: startDate,
        end_date: endDate,
        mode: 'mix',
        budget: Number(budget || 0),
      });
      const allOptions = ((planned.options || []) as TransportOption[]).slice(0, 24);
      const targetSegment = normalizeSegment(leg.segment);
      const filtered = allOptions.filter((option) => normalizeSegment(option.segment) === targetSegment);
      const chosen = (filtered.length ? filtered : allOptions).slice(0, 12);

      setTransportOptions(chosen);
      setTransportSource(String((planned as any).source || ''));
      setActiveTransportLegIndex(index);
      setViewMode('transport');
      setStage('transport_results');

      const reply = chosen.length
        ? `I found ${chosen.length} transport options for ${leg.segment}. You can say add to cart.`
        : `I could not find transport options for ${leg.segment}.`;
      return { reply, options: chosen };
    },
    [budget, endDate, startDate, transportLegs, tripId]
  );

  const checkoutAll = useCallback(() => {
    const selections = [
      ...hotelCart.map((item) => ({
        category: 'hotel' as const,
        item_id: `${item.hotel.id}-${item.day}`,
        title: `Day ${item.day}: ${item.hotel.name} (${item.location})`,
        amount: Number(item.hotel.price || 0),
        metadata: {
          day: item.day,
          check_in: item.checkIn,
          check_out: item.checkOut,
          location: item.location,
        },
      })),
      ...transportCart.map((item) => ({
        category: 'transport' as const,
        item_id: String(item.id),
        title: `${item.provider} - ${item.segment}`,
        amount: Number(item.price || 0),
        metadata: {
          segment: item.segment,
          type: item.type,
          departure: item.departure,
          arrival: item.arrival,
        },
      })),
    ];
    if (!selections.length) {
      setError('Cart is empty. Add hotel/transport before checkout.');
      return false;
    }
    if (typeof window !== 'undefined') {
      const payload = { trip_id: tripId || undefined, selections, currency: 'INR' };
      window.sessionStorage.setItem('voyage_checkout_payload', JSON.stringify(payload));
    }
    router.push(tripId ? `/payment?trip=${encodeURIComponent(tripId)}` : '/payment');
    return true;
  }, [hotelCart, router, transportCart, tripId]);

  const handleVoiceCommand = useCallback(
    async (text: string) => {
      const transcript = String(text || '').trim();
      if (!transcript) return;

      setError('');
      setProcessing(true);
      setLastTranscript(transcript);
      appendMessage('user', transcript);

      let assistantReply = 'Done.';
      let replyLanguageCode = voiceLanguage;
      try {
        const normalizedTranscript = transcript.toLowerCase();
        const languageChangeRequested = /\b(change|switch|set)\b.*\blanguage\b/i.test(normalizedTranscript);
        const chosenLanguage = detectVoiceLanguage(normalizedTranscript);
        let skipIntentProcessing = false;

        if (chosenLanguage) {
          setVoiceLanguage(chosenLanguage.code);
          replyLanguageCode = chosenLanguage.code;
          setPendingLanguageSelection(false);
          if (!hasIntentWords(normalizedTranscript) || languageChangeRequested) {
            assistantReply = `Language set to ${chosenLanguage.label}. You can continue planning now.`;
            skipIntentProcessing = true;
          }
        } else if (pendingLanguageSelection) {
          assistantReply =
            'Please tell me your preferred language first: English, Hindi, Marathi, Gujarati, Tamil, Telugu, Kannada, Malayalam, Bengali, or Punjabi.';
          skipIntentProcessing = true;
        } else if (languageChangeRequested) {
          setPendingLanguageSelection(true);
          assistantReply =
            'Sure. Which language do you want? You can say English, Hindi, Marathi, Gujarati, Tamil, Telugu, Kannada, Malayalam, Bengali, or Punjabi.';
          skipIntentProcessing = true;
        }

        if (!skipIntentProcessing) {
        let handledPendingHotelPrompt = false;
        if (pendingHotelDayPrompt !== null) {
          const normalized = transcript.toLowerCase();
          if (isAffirmativeText(normalized)) {
            handledPendingHotelPrompt = true;
            const day = pendingHotelDayPrompt;
            setPendingHotelDayPrompt(null);
            setHotelSkippedDays((prev) => prev.filter((item) => item !== day));
            const location = parseDayLocation(itinerary, day, destination);
            const searched = await runHotelSearchForDay(day, location);
            assistantReply = searched.reply;
          } else if (isSkipText(normalized)) {
            handledPendingHotelPrompt = true;
            const skippedDay = pendingHotelDayPrompt;
            const nextSkipped = Array.from(new Set([...hotelSkippedDays, skippedDay])).sort((a, b) => a - b);
            setHotelSkippedDays(nextSkipped);
            const nextDay = findNextHotelDayToHandle(skippedDay + 1, hotelCart, nextSkipped);
            if (nextDay) {
              setPendingHotelDayPrompt(nextDay);
              const nextLocation = parseDayLocation(itinerary, nextDay, destination) || destination || 'your itinerary location';
              assistantReply = `Okay, skipping day ${skippedDay}. Should I search hotels for day ${nextDay} in ${nextLocation}? Say yes or skip.`;
              setStage('hotel_query');
            } else {
              setPendingHotelDayPrompt(null);
              setPendingPostHotelChoice(true);
              assistantReply = `Okay, skipped day ${skippedDay}. All hotel days are handled. Should we proceed to transport or booking checkout?`;
              setStage('hotel_results');
            }
          }
        }

        if (!handledPendingHotelPrompt) {
          const normalized = transcript.toLowerCase();
          if (pendingPostHotelChoice) {
            if (wantsCheckout(normalized)) {
              handledPendingHotelPrompt = true;
              setPendingPostHotelChoice(false);
              const ok = checkoutAll();
              assistantReply = ok ? 'Proceeding to checkout now.' : 'Please add hotel or transport selections before checkout.';
            } else if (wantsTransport(normalized) || isAffirmativeText(normalized)) {
              handledPendingHotelPrompt = true;
              setPendingPostHotelChoice(false);
              const stops = uniqueLocationsFromItinerary(itinerary, destination);
              if (!stops.length) {
                setViewMode('transport');
                setStage('transport_results');
                assistantReply = 'Moved to transport. Please add itinerary locations first so I can plan trip legs.';
              } else {
                const legs = buildTransportLegs(origin || 'Pune', stops);
                setTransportLegs(legs);
                setTransportSkippedLegs([]);
                setPendingTransportLegPrompt(null);
                setPendingPostTransportChoice(false);
                const searched = await runTransportSearchForLeg(0, legs);
                assistantReply = searched.reply;
              }
            } else if (isSkipText(normalized)) {
              handledPendingHotelPrompt = true;
              setPendingPostHotelChoice(false);
              assistantReply = 'Okay. Say transport when you are ready, or say checkout.';
            }
          }
        }

        if (!handledPendingHotelPrompt) {
          const normalized = transcript.toLowerCase();
          if (pendingTransportLegPrompt !== null) {
            if (isAffirmativeText(normalized)) {
              handledPendingHotelPrompt = true;
              const legIndex = pendingTransportLegPrompt;
              setPendingTransportLegPrompt(null);
              const searched = await runTransportSearchForLeg(legIndex);
              assistantReply = searched.reply;
            } else if (isSkipText(normalized)) {
              handledPendingHotelPrompt = true;
              const currentIndex = pendingTransportLegPrompt;
              const leg = transportLegs[currentIndex];
              const nextSkipped = leg
                ? Array.from(new Set([...transportSkippedLegs, leg.segment]))
                : [...transportSkippedLegs];
              setTransportSkippedLegs(nextSkipped);
              const nextLeg = findNextTransportLegToHandle(currentIndex + 1, transportLegs, transportCart, nextSkipped);
              if (nextLeg !== null) {
                setPendingTransportLegPrompt(nextLeg);
                assistantReply = `Okay, skipping ${transportLegs[currentIndex]?.segment}. Should I search for ${transportLegs[nextLeg].segment}? Say yes or skip.`;
                setViewMode('transport');
                setStage('transport_results');
              } else {
                setPendingTransportLegPrompt(null);
                setPendingPostTransportChoice(true);
                assistantReply = 'All transport legs are handled. Should we proceed to checkout?';
              }
            }
          }
        }

        if (!handledPendingHotelPrompt) {
          const normalized = transcript.toLowerCase();
          if (pendingPostTransportChoice) {
            if (wantsCheckout(normalized) || isAffirmativeText(normalized)) {
              handledPendingHotelPrompt = true;
              setPendingPostTransportChoice(false);
              const ok = checkoutAll();
              assistantReply = ok ? 'Proceeding to checkout now.' : 'Please add hotel or transport selections before checkout.';
            } else if (isSkipText(normalized)) {
              handledPendingHotelPrompt = true;
              setPendingPostTransportChoice(false);
              assistantReply = 'Okay. Say checkout when you are ready.';
            }
          }
        }

        if (!handledPendingHotelPrompt) {
          const parsed = await parseVoiceCommand(transcript, {
            stage,
            destination,
            origin,
            trip_name: tripName,
            planned_days: plannedDays,
            known_places: placeCards.map((p) => p.name),
            hotel_results: hotelResults.map((h) => h.name),
            transport_results: transportOptions.map((o) => `${o.provider} ${o.segment}`),
          });

          setStage(parsed.stage);
          assistantReply = parsed.reply || assistantReply;

          for (const action of parsed.actions || []) {
          const type = String(action.type || '');

          if (type === 'search_places') {
            const days = Math.max(1, Number(action.days || plannedDays || 3));
            const dest = String(action.destination || destination || '').trim();
            if (dest) setDestination(dest);
            setPlannedDays(days);

            const results = (await suggestPlacesFromPrimaryBackend(dest, days)).slice(0, 12);
            setPlaceCards(results);

            const next = ensureDays(itinerary, days, startDate);
            setItinerary(next);
            await saveCurrentTrip(next);
            setViewMode('itinerary');
            const names = summarizeNames(results.map((item) => item.name));
            assistantReply = results.length
              ? `I found ${results.length} places: ${names}. Tell me which places to add to which day.`
              : `I could not find places from backend right now. Please verify backend on port 5000 and try again.`;
          }

          if (type === 'add_places_to_days') {
            const assignments = Array.isArray(action.assignments) ? action.assignments : [];
            if (!assignments.length) continue;

            const maxDay = assignments.reduce((max: number, item: any) => Math.max(max, Number(item.day || 1)), plannedDays || 1);
            const next = ensureDays(itinerary, maxDay, startDate).map((d) => ({ ...d, activities: [...(d.activities || [])] }));

            const addedLabels: string[] = [];
            assignments.forEach((item: any) => {
              const day = Math.max(1, Number(item.day || 1));
              const targetDayIndex = day - 1;
              if (!next[targetDayIndex]) return;
              const placeRaw = String(item.place || '').trim();
              if (!placeRaw) return;
              const matched = fuzzyMatchByName(placeCards, placeRaw);
              const placeName = String(matched?.name || placeRaw);
              const exists = next[targetDayIndex].activities.some((a) => String(a.location || '').toLowerCase() === placeName.toLowerCase());
              if (exists) return;

              const timeHour = 9 + next[targetDayIndex].activities.length * 2;
              const activity: Activity = {
                id: createId('act'),
                title: `Visit ${placeName}`,
                description: matched?.description || 'Added via voice command',
                time: `${String(Math.min(timeHour, 21)).padStart(2, '0')}:00`,
                location: placeName,
                type: 'activity',
              };
              next[targetDayIndex].activities.push(activity);
              addedLabels.push(`${placeName} to day ${day}`);
            });

            setItinerary(next);
            assistantReply = addedLabels.length
              ? `I have added ${addedLabels.join(', ')}. Please confirm origin, trip name, and dates.`
              : 'I could not map those places. Please repeat using place name and day number.';
          }

          if (type === 'update_trip_meta') {
            const nextTripName = String(action.trip_name || tripName || '').trim();
            const nextOrigin = String(action.origin || origin || '').trim();
            const nextStart = String(action.start_date || startDate || '').trim();
            const nextEnd = String(action.end_date || endDate || '').trim();

            if (nextTripName) setTripName(nextTripName);
            if (nextOrigin) setOrigin(nextOrigin);
            if (nextStart) setStartDate(nextStart);
            if (nextEnd) setEndDate(nextEnd);

            const dated = itinerary.map((day, idx) => ({
              ...day,
              date: nextStart ? addDays(nextStart, idx) : day.date,
            }));
            setItinerary(dated);
            await saveCurrentTrip(dated);
            assistantReply = 'I have updated origin, trip name, and dates. Should we move to hotel search?';
          }

          if (type === 'switch_tab') {
            const tab = String(action.tab || '').toLowerCase();
            if (tab === 'hotels') setViewMode('hotels');
            if (tab === 'transport') setViewMode('transport');
            if (tab === 'itinerary') setViewMode('itinerary');
          }

            if (type === 'search_hotels') {
              const day = Math.max(1, Number(action.day || hotelDay || 1));
              const location = String(action.location || parseDayLocation(itinerary, day, destination)).trim();
              const searched = await runHotelSearchForDay(day, location);
              assistantReply = searched.reply;
              setPendingHotelDayPrompt(null);
              setPendingPostHotelChoice(false);
              setHotelSkippedDays((prev) => prev.filter((item) => item !== day));
            }

            if (type === 'add_hotel_to_cart') {
              if (!hotelResults.length) {
                assistantReply = 'No hotel results available. Ask me to search hotels first.';
                continue;
              }
              const hotelName = String(action.hotel_name || '').trim();
              const picked = fuzzyMatchByName(hotelResults, hotelName);
              if (!picked) {
                assistantReply = 'I could not identify the hotel. Please repeat the hotel name.';
                continue;
              }
              const dayCheckIn = startDate ? addDays(startDate, hotelDay - 1) : todayIso();
              const dayCheckOut = startDate ? addDays(startDate, hotelDay) : addDays(todayIso(), 1);
              const updatedCart: HotelCartItem[] = [
                ...hotelCart.filter((item) => item.day !== hotelDay),
                { day: hotelDay, location: hotelLocation || picked.location, checkIn: dayCheckIn, checkOut: dayCheckOut, hotel: picked },
              ];
              setHotelCart(updatedCart);
              setHotelSkippedDays((prev) => prev.filter((item) => item !== hotelDay));
              const nextDay = findNextHotelDayToHandle(hotelDay + 1, updatedCart, hotelSkippedDays);
              if (nextDay) {
                setPendingHotelDayPrompt(nextDay);
                setPendingPostHotelChoice(false);
                const nextLocation = parseDayLocation(itinerary, nextDay, destination) || destination || 'your itinerary location';
                assistantReply = `${picked.name} has been added to hotel cart for day ${hotelDay}. Should I search hotels for day ${nextDay} in ${nextLocation}? Say yes or skip.`;
                setStage('hotel_query');
              } else {
                setPendingHotelDayPrompt(null);
                setPendingPostHotelChoice(true);
                assistantReply = `${picked.name} has been added to hotel cart for day ${hotelDay}. All hotel days are covered or skipped. Should we proceed to transport or booking checkout?`;
              }
            }

            if (type === 'view_hotel_details') {
            if (!hotelResults.length) {
              assistantReply = 'No hotel list yet. Ask for hotel search first.';
              continue;
            }
            const hotelName = String(action.hotel_name || '').trim();
            const picked = fuzzyMatchByName(hotelResults, hotelName);
            if (!picked) {
              assistantReply = 'I could not identify the hotel to view.';
              continue;
            }
            const detail = await getHotelDetails(picked.id, {
              trip_id: tripId || undefined,
              location: picked.location,
              hotel_name: picked.name,
            });
            const query = new URLSearchParams({
              trip: tripId,
              location: picked.location || hotelLocation || destination,
              name: picked.name,
              checkIn: startDate,
              checkOut: endDate,
              guests: '1',
            });
            if (typeof window !== 'undefined') {
              window.open(`/hotel/${encodeURIComponent(picked.id)}?${query.toString()}`, '_blank');
            }
            const summary = String((detail as any)?.description || '').split('.').slice(0, 2).join('. ').trim();
            assistantReply = summary
              ? `Opened details for ${picked.name}. ${summary}`
              : `Opened details for ${picked.name}.`;
          }

            if (type === 'search_transport') {
              const stops = uniqueLocationsFromItinerary(itinerary, destination);
              if (!stops.length) {
                assistantReply = 'Please add itinerary locations first so I can plan transport legs.';
                continue;
              }
              const legs = buildTransportLegs(origin || 'Pune', stops);
              if (!legs.length) {
                assistantReply = 'I need at least one destination to plan transport.';
                continue;
              }
              setTransportLegs(legs);
              setTransportSkippedLegs([]);
              setPendingTransportLegPrompt(null);
              setPendingPostTransportChoice(false);
              const searched = await runTransportSearchForLeg(0, legs);
              assistantReply = searched.reply;
            }

            if (type === 'add_transport_to_cart') {
              if (!transportOptions.length) {
                assistantReply = 'No transport options yet. Ask me to search transport first.';
                continue;
              }
              const optionName = String(action.option_name || '').trim();
              const picked = fuzzyMatchByName(transportOptions, optionName);
              if (!picked) {
                assistantReply = 'I could not identify the transport option.';
                continue;
              }
              const pickedSegmentKey = normalizeSegment(picked.segment);
              const updatedCart = [
                ...transportCart.filter((item) => normalizeSegment(item.segment) !== pickedSegmentKey),
                picked,
              ];
              setTransportCart(updatedCart);

              const startIndex =
                activeTransportLegIndex !== null
                  ? activeTransportLegIndex + 1
                  : Math.max(
                      0,
                      transportLegs.findIndex((leg) => normalizeSegment(leg.segment) === pickedSegmentKey) + 1
                    );
              const nextLeg = findNextTransportLegToHandle(startIndex, transportLegs, updatedCart, transportSkippedLegs);
              if (nextLeg !== null) {
                setPendingTransportLegPrompt(nextLeg);
                setPendingPostTransportChoice(false);
                assistantReply = `${picked.provider} for ${picked.segment} added to transport cart. Should I search for ${transportLegs[nextLeg].segment}? Say yes or skip.`;
              } else {
                setPendingTransportLegPrompt(null);
                setPendingPostTransportChoice(true);
                assistantReply = `${picked.provider} for ${picked.segment} added to transport cart. All legs are completed. Should we proceed to checkout?`;
              }
            }

            if (type === 'checkout') {
              const ok = checkoutAll();
              assistantReply = ok ? 'Proceeding to checkout now.' : 'Please add hotel or transport selections before checkout.';
            }
          }
        }
        }
      } catch (e) {
        assistantReply = e instanceof Error ? e.message : 'Voice command failed.';
        setError(assistantReply);
      } finally {
        const localizedReply = await buildSpokenResponse(assistantReply, replyLanguageCode || 'en-IN');
        appendMessage('assistant', localizedReply);
        await speakText(localizedReply);
        setProcessing(false);
      }
    },
    [
      appendMessage,
      budget,
      checkoutAll,
      destination,
      endDate,
      findNextHotelDayToHandle,
      findNextTransportLegToHandle,
      activeTransportLegIndex,
      hotelCart,
      hotelDay,
      hotelLocation,
      hotelResults,
      hotelSkippedDays,
      itinerary,
      origin,
      pendingHotelDayPrompt,
      pendingLanguageSelection,
      pendingPostHotelChoice,
      placeCards,
      plannedDays,
      pendingPostTransportChoice,
      pendingTransportLegPrompt,
      runHotelSearchForDay,
      runTransportSearchForLeg,
      saveCurrentTrip,
      speakText,
      stage,
      startDate,
      transportCart,
      transportLegs,
      transportOptions,
      transportSkippedLegs,
      tripId,
      tripName,
    ]
  );

  useEffect(() => {
    const mediaSupported =
      typeof window !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined';
    setVoiceSupported(mediaSupported);
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setSpeaking(false);
    };
  }, []);

  useEffect(() => {
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (viewMode !== 'hotels' || !hotelResults.length) {
        if (!cancelled) setHotelMapLocations([]);
        return;
      }
      const mapped: Location[] = [];
      for (let i = 0; i < Math.min(12, hotelResults.length); i += 1) {
        const hotel = hotelResults[i];
        const query = `${hotel.name}, ${hotel.location || hotelLocation || destination}`.trim();
        const geo = await geocodeLocation(query);
        if (!geo) continue;
        mapped.push({
          id: `voice-hotel-${hotel.id}-${i}`,
          name: hotel.name,
          lat: geo.lat,
          lng: geo.lng,
          type: 'hotel',
          price: hotel.price,
          day: hotelDay,
        });
      }
      if (!cancelled) setHotelMapLocations(mapped);
    })();
    return () => {
      cancelled = true;
    };
  }, [destination, hotelDay, hotelLocation, hotelResults, viewMode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const legsForMap = transportLegs.length ? transportLegs : buildTransportLegs(origin.trim(), transportStops);
      if (viewMode !== 'transport' || !legsForMap.length) {
        if (!cancelled) setTransportMapLocations([]);
        return;
      }
      const route = [legsForMap[0].from, ...legsForMap.map((leg) => leg.to)];
      const resolved: Location[] = [];
      for (let i = 0; i < route.length; i += 1) {
        const geo = await geocodeLocation(route[i]);
        if (!geo) continue;
        resolved.push({
          id: `voice-route-${i}-${route[i]}`,
          name: route[i],
          lat: geo.lat,
          lng: geo.lng,
          type: 'attraction',
          day: i + 1,
        });
      }
      if (!cancelled) setTransportMapLocations(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [origin, transportLegs, transportStops, viewMode]);

  const handleStartListening = async () => {
    if (!voiceSupported) {
      setError('Microphone recording is unavailable in this browser.');
      return;
    }
    if (listening) return;
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      recordedChunksRef.current = [];

      const preferredType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, preferredType ? { mimeType: preferredType } : undefined);

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setListening(false);
        setError('Recording failed. Please retry.');
      };

      recorder.onstop = async () => {
        setListening(false);
        const chunks = [...recordedChunksRef.current];
        recordedChunksRef.current = [];
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
        }
        if (!chunks.length) {
          setError('No voice captured. Please try again.');
          return;
        }
        const audioBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        try {
          setProcessing(true);
          const transcript = await transcribeVoiceAudio(audioBlob, voiceLanguage, voiceLanguage !== 'en-IN');
          if (!transcript) {
            setError('No speech detected. Please speak and retry.');
            return;
          }
          setLastTranscript(transcript);
          setProcessing(false);
          await handleVoiceCommand(transcript);
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Voice transcription failed.';
          setError(msg);
        } finally {
          setProcessing(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setListening(true);
    } catch {
      setListening(false);
      setError('Unable to start microphone. Check permission and retry.');
    }
  };

  const handleStopListening = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      setListening(false);
      return;
    }
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
    setListening(false);
  };

  const handleManualSave = async (days: Day[]) => {
    try {
      await saveCurrentTrip(days);
      const localized = await buildSpokenResponse('Trip saved.', voiceLanguage);
      appendMessage('assistant', localized);
      void speakText(localized);
    } catch {
      setError('Failed to save trip.');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="bg-card border-b border-border p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold text-foreground mb-2">Voice AI Planner</h1>
            <p className="text-sm text-foreground/70">Hands-free planning for itinerary, hotels, transport, and checkout.</p>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
          <Card className="p-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
            <div>
              <p className="text-xs text-foreground/60">Trip Name</p>
              <p className="font-semibold">{tripName || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-foreground/60">Origin</p>
              <p className="font-semibold">{origin || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-foreground/60">Destination</p>
              <p className="font-semibold">{destination || '-'}</p>
            </div>
            <div>
              <p className="text-xs text-foreground/60">Dates</p>
              <p className="font-semibold">
                {startDate || '-'} to {endDate || '-'}
              </p>
            </div>
            <div>
              <p className="text-xs text-foreground/60">Budget</p>
              <p className="font-semibold">INR {Math.round(Number(budget || 0))}</p>
            </div>
            <div>
              <p className="text-xs text-foreground/60">Trip ID</p>
              <p className="font-semibold truncate">{tripId || 'Not saved'}</p>
            </div>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-[360px,minmax(0,1fr)] gap-6 items-start">
            <Card className="p-4 lg:sticky lg:top-20 lg:h-[calc(100vh-220px)] flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-bold text-foreground">Voice Console</h2>
                  <p className="text-xs text-foreground/60">Stage: {stage}</p>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto border border-border rounded-lg p-3 space-y-2 bg-background">
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${
                        message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{message.text}</p>
                      <p className="opacity-70 mt-1">{new Date(message.at).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="mt-3 pt-3 border-t border-border space-y-3">
                {/* <div>
                  <p className="text-xs text-foreground/60 mb-2">Quick prompts:</p>
                  <div className="space-y-2">
                    {VOICE_QUICK_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => {
                          void handleVoiceCommand(prompt);
                        }}
                        className="w-full text-left px-3 py-2 rounded border border-border text-xs hover:bg-muted"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div> */}

                {!!lastTranscript && (
                  <div className="text-xs bg-muted rounded p-2">
                    <p className="font-semibold text-foreground/70 mb-1">Last transcript</p>
                    <p className="text-foreground">{lastTranscript}</p>
                  </div>
                )}
                {!!error && <p className="text-xs text-red-600">{error}</p>}
                {!voiceSupported && (
                  <p className="text-xs text-red-600">
                    Microphone recording is unavailable. Use Chrome/Edge and allow microphone access.
                  </p>
                )}

                <div className="grid grid-cols-1 gap-2">
                  <p className="text-xs text-foreground/70">
                    Language: <span className="font-medium">{currentVoiceLanguageLabel}</span>. Say
                    {' '}<span className="font-medium">"change language to Hindi"</span>{' '}anytime.
                  </p>
                  <Button
                    onClick={listening ? handleStopListening : handleStartListening}
                    disabled={!voiceSupported || processing}
                    className="w-full gap-2"
                  >
                    {processing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : listening ? (
                      <Square className="w-4 h-4" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                    {processing ? 'Transcribing...' : listening ? 'Stop Recording' : 'Start Voice'}
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button size="sm" variant={speechEnabled ? 'default' : 'outline'} onClick={() => setSpeechEnabled((v) => !v)} className="gap-1">
                      <Volume2 className="w-4 h-4" />
                      {speechEnabled ? 'Voice ON' : 'Voice OFF'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={stopSpeaking} disabled={!speaking} className="gap-1">
                      <VolumeX className="w-4 h-4" />
                      Stop Speaking
                    </Button>
                  </div>
                  <p className="text-[11px] text-foreground/60">
                    Mic uses Sarvam STT. Non-English speech is auto-translated to English for command parsing.
                  </p>
                </div>
              </div>
            </Card>

            <div className="space-y-4">
              <Card className="p-3 flex flex-wrap gap-2">
                <Button size="sm" variant={viewMode === 'itinerary' ? 'default' : 'outline'} onClick={() => setViewMode('itinerary')} className="gap-2">
                  <Calendar className="w-4 h-4" />
                  Itinerary
                </Button>
                <Button size="sm" variant={viewMode === 'hotels' ? 'default' : 'outline'} onClick={() => setViewMode('hotels')} className="gap-2">
                  <Hotel className="w-4 h-4" />
                  Hotels
                </Button>
                <Button size="sm" variant={viewMode === 'transport' ? 'default' : 'outline'} onClick={() => setViewMode('transport')} className="gap-2">
                  <Plane className="w-4 h-4" />
                  Transport
                </Button>
              </Card>

              {viewMode === 'itinerary' ? (
                <div className="grid grid-cols-1 lg:grid-cols-[340px,1fr] gap-4">
                  <Card className="p-4">
                    <h3 className="font-bold text-foreground mb-2 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-primary" />
                      Suggested Places
                    </h3>
                    <p className="text-xs text-foreground/60 mb-3">
                      Say: "Add Om Beach to day 1 and Gokarna Beach to day 2"
                    </p>
                    <div className="space-y-2 max-h-[62vh] overflow-y-auto">
                      {placeCards.length === 0 ? (
                        <p className="text-xs text-foreground/60">No places yet. Start with a voice command to suggest places.</p>
                      ) : (
                        placeCards.map((item) => (
                          <div key={item.id} className="border border-blue-200 bg-blue-50 rounded p-2">
                            <p className="text-sm font-semibold text-foreground">{item.name}</p>
                            <p className="text-xs text-foreground/70">{item.description || 'Suggested place'}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </Card>

                  <Card className="p-0 overflow-hidden">
                    <ItineraryBuilder
                      tripName={tripName}
                      startDate={startDate}
                      endDate={endDate}
                      days={itinerary}
                      onChange={setItinerary}
                      onSave={handleManualSave}
                    />
                  </Card>
                </div>
              ) : null}

              {viewMode === 'hotels' ? (
                <div className="flex flex-col xl:flex-row gap-4">
                  <div className="w-full xl:w-[46%] space-y-4">
                    <Card className="p-4">
                      <h3 className="font-bold text-foreground mb-1">Hotel Results</h3>
                      <p className="text-xs text-foreground/60 mb-3">
                        Day {hotelDay} | {hotelLocation || 'No location selected'} {hotelSource ? `| Source: ${hotelSource}` : ''}
                      </p>
                      <div className="space-y-3 max-h-[48vh] overflow-y-auto pr-1">
                        {!hotelResults.length ? (
                          <p className="text-sm text-foreground/60">Ask by voice: "first day, gokarna, karnataka, india"</p>
                        ) : (
                          hotelResults.slice(0, 12).map((hotel) => (
                            <div key={hotel.id} className="border border-border rounded p-3 flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-foreground">{hotel.name}</p>
                                <p className="text-xs text-foreground/70">{hotel.location}</p>
                                <p className="text-xs text-foreground/70">
                                  Rating {hotel.rating ?? '-'} | INR {Math.round(Number(hotel.price || 0))}
                                </p>
                              </div>
                              <div className="flex flex-col gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={async () => {
                                    await handleVoiceCommand(`view details ${hotel.name}`);
                                  }}
                                >
                                  View
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={async () => {
                                    await handleVoiceCommand(`add hotel ${hotel.name} to cart`);
                                  }}
                                >
                                  Add
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </Card>

                    <Card className="p-4">
                      <h3 className="font-bold text-foreground mb-2">Hotel Cart</h3>
                      <div className="space-y-2 text-xs">
                        {hotelCart.length === 0 ? (
                          <p className="text-foreground/60">No hotels in cart.</p>
                        ) : (
                          hotelCart.map((item) => (
                            <p key={`${item.day}-${item.hotel.id}`} className="text-foreground/80">
                              Day {item.day}: {item.hotel.name} - INR {Math.round(Number(item.hotel.price || 0))}
                            </p>
                          ))
                        )}
                      </div>
                      <p className="mt-3 font-semibold">Total: INR {Math.round(hotelCartTotal)}</p>
                    </Card>
                  </div>

                  <div className="w-full xl:w-[54%] space-y-4">
                    {hotelMapLocations.length ? (
                      <MapView locations={hotelMapLocations} center={hotelMapCenter} drawRoutes={false} mapMinHeight="360px" />
                    ) : (
                      <Card className="p-6 text-sm text-foreground/60">Hotel map will appear after search.</Card>
                    )}
                    <Card className="p-4">
                      <h4 className="text-sm font-semibold text-foreground mb-2">Hotel Details</h4>
                      <p className="text-sm text-foreground/60">
                        Click <span className="font-medium">View</span> to open the full hotel details page in a new tab.
                      </p>
                    </Card>
                  </div>
                </div>
              ) : null}

              {viewMode === 'transport' ? (
                <div className="flex flex-col xl:flex-row gap-4">
                  <div className="w-full xl:w-[46%] space-y-4">
                    <Card className="p-4">
                      <h3 className="font-bold text-foreground mb-1">Transport Results</h3>
                      <p className="text-xs text-foreground/60 mb-3">
                        Origin {origin || '-'} {transportSource ? `| Source: ${transportSource}` : ''}
                      </p>
                      {activeTransportLegIndex !== null && transportLegs[activeTransportLegIndex] ? (
                        <p className="text-xs text-foreground/70 mb-2">
                          Current leg: {transportLegs[activeTransportLegIndex].segment}
                        </p>
                      ) : null}
                      {pendingTransportLegPrompt !== null && transportLegs[pendingTransportLegPrompt] ? (
                        <p className="text-xs text-primary mb-2">
                          Pending confirmation: search {transportLegs[pendingTransportLegPrompt].segment}
                        </p>
                      ) : null}
                      <div className="space-y-3 max-h-[48vh] overflow-y-auto pr-1">
                        {!transportOptions.length ? (
                          <p className="text-sm text-foreground/60">Ask by voice: "plan transport for this trip"</p>
                        ) : (
                          transportOptions.map((option) => (
                            <div key={option.id} className="border border-border rounded p-3 flex items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-foreground">{option.provider}</p>
                                <p className="text-xs text-foreground/70">{option.segment}</p>
                                <p className="text-xs text-foreground/70">
                                  {option.departure} - {option.arrival} ({option.duration})
                                </p>
                                <p className="text-xs font-semibold text-primary">INR {Math.round(Number(option.price || 0))}</p>
                              </div>
                              <Button
                                size="sm"
                                variant={
                                  transportCart.some((item) => normalizeSegment(item.segment) === normalizeSegment(option.segment))
                                    ? 'default'
                                    : 'outline'
                                }
                                onClick={() => {
                                  setTransportCart((prev) => {
                                    const segmentKey = normalizeSegment(option.segment);
                                    const exists = prev.some((item) => normalizeSegment(item.segment) === segmentKey);
                                    if (exists) return prev.filter((item) => normalizeSegment(item.segment) !== segmentKey);
                                    return [...prev.filter((item) => normalizeSegment(item.segment) !== segmentKey), option];
                                  });
                                }}
                              >
                                {transportCart.some((item) => normalizeSegment(item.segment) === normalizeSegment(option.segment))
                                  ? 'In Cart'
                                  : 'Add'}
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </Card>

                    <Card className="p-4">
                      <h3 className="font-bold text-foreground mb-2">Transport Cart</h3>
                      <div className="space-y-2 text-xs">
                        {transportCart.length === 0 ? (
                          <p className="text-foreground/60">No transport in cart.</p>
                        ) : (
                          transportCart.map((item) => (
                          <p key={`${item.id}-${normalizeSegment(item.segment)}`} className="text-foreground/80">
                            {item.provider} ({item.segment}) - INR {Math.round(Number(item.price || 0))}
                          </p>
                          ))
                        )}
                      </div>
                      <p className="mt-3 font-semibold">Total: INR {Math.round(transportCartTotal)}</p>
                    </Card>
                  </div>

                  <div className="w-full xl:w-[54%] space-y-4">
                    {transportMapLocations.length ? (
                      <MapView locations={transportMapLocations} center={transportMapCenter} drawRoutes mapMinHeight="360px" />
                    ) : (
                      <Card className="p-6 text-sm text-foreground/60">Transport route map will appear after itinerary stops are available.</Card>
                    )}
                  </div>
                </div>
              ) : null}

              <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-semibold text-foreground">Combined Cart Total: INR {Math.round(grandTotal)}</p>
                  <p className="text-xs text-foreground/60">
                    Hotels: {hotelCart.length} item(s) | Transport: {transportCart.length} item(s)
                  </p>
                </div>
                <Button className="gap-2" disabled={!hotelCart.length && !transportCart.length} onClick={checkoutAll}>
                  <Check className="w-4 h-4" />
                  Checkout All
                </Button>
              </Card>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
