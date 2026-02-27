'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { MapView, type Location } from '@/components/map-view';
import { ItineraryBuilder, type Day } from '@/components/itinerary-builder';
import { AIPlannerChat } from '@/components/ai-planner-chat';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Bus, Calendar, Car, Check, Eye, Hotel, Loader2, Map as MapIcon, Plane, ShoppingCart, Sparkles, Train, Wand2, X } from 'lucide-react';
import { generateItinerary, geocodePlace, getTrip, optimizeItinerary, planTransport, saveTrip, searchHotels } from '@/lib/api-client';

type ViewMode = 'kanban' | 'map' | 'hotels' | 'transport';
type DraftKind = 'generate' | 'optimize' | null;

interface HotelResult {
  id: string;
  name: string;
  location: string;
  rating?: number;
  reviews?: number;
  price: number;
  amenities?: string[];
  image_url?: string;
  source_url?: string;
}

interface TransportOption {
  id: string;
  segment: string;
  type: 'flight' | 'train' | 'bus' | 'cab' | 'mix';
  provider: string;
  departure: string;
  arrival: string;
  duration: string;
  price: number;
  rating?: number;
  details?: string;
  source_url?: string;
}

interface DayStayOption {
  key: string;
  day: number;
  date: string;
  checkIn: string;
  checkOut: string;
  location: string;
}

interface HotelCartItem {
  dayKey: string;
  day: number;
  location: string;
  checkIn: string;
  checkOut: string;
  hotel: HotelResult;
}

const KNOWN_COORDS: Record<string, { lat: number; lng: number }> = {
  delhi: { lat: 28.6139, lng: 77.209 },
  jaipur: { lat: 26.9124, lng: 75.7873 },
  udaipur: { lat: 24.5854, lng: 73.7125 },
  jodhpur: { lat: 26.2389, lng: 73.0243 },
  jaisalmer: { lat: 26.9157, lng: 70.9083 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  pune: { lat: 18.5204, lng: 73.8567 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  kolkata: { lat: 22.5726, lng: 88.3639 },
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
};

const geocodeCache = new Map<string, { lat: number; lng: number }>();

function daysDiff(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, diff || 1);
}

function addDays(isoDate: string, days: number): string {
  const base = new Date(isoDate);
  base.setDate(base.getDate() + Math.max(0, days));
  return base.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function itineraryLocations(days: Day[], destination: string): string[] {
  const set = new Set<string>();
  if (destination.trim()) {
    set.add(destination.trim());
  }
  days.forEach((day) => {
    day.activities.forEach((activity) => {
      const location = String(activity.location || '').trim();
      if (location) set.add(location);
    });
  });
  return Array.from(set);
}

async function geocodeLocation(name: string): Promise<{ lat: number; lng: number } | null> {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key)!;
  if (KNOWN_COORDS[key]) {
    geocodeCache.set(key, KNOWN_COORDS[key]);
    return KNOWN_COORDS[key];
  }
  for (const city of Object.keys(KNOWN_COORDS)) {
    if (key.includes(city)) {
      geocodeCache.set(key, KNOWN_COORDS[city]);
      return KNOWN_COORDS[city];
    }
  }
  try {
    const result = await geocodePlace(name);
    const point = { lat: Number(result.lat), lng: Number(result.lng) };
    if (Number.isFinite(point.lat) && Number.isFinite(point.lng) && (Math.abs(point.lat) > 0.0001 || Math.abs(point.lng) > 0.0001)) {
      geocodeCache.set(key, point);
      return point;
    }
  } catch {
    // fallback to direct mapbox request
  }
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
  if (!token) return null;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(name)}.json?limit=1&access_token=${encodeURIComponent(token)}`;
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) return null;
    const data = await response.json();
    const feature = data?.features?.[0];
    const lng = Number(feature?.center?.[0]);
    const lat = Number(feature?.center?.[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const point = { lat, lng };
    geocodeCache.set(key, point);
    return point;
  } catch {
    return null;
  }
}

function PlannerPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tripParam = searchParams.get('trip');

  const [tripId, setTripId] = useState<string | null>(tripParam);
  const [tripName, setTripName] = useState('My Trip');
  const [origin, setOrigin] = useState('Delhi');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [budget, setBudget] = useState(30000);
  const [itinerary, setItinerary] = useState<Day[]>([]);
  const [mapLocations, setMapLocations] = useState<Location[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [loadingTrip, setLoadingTrip] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [draftKind, setDraftKind] = useState<DraftKind>(null);
  const [draftItinerary, setDraftItinerary] = useState<Day[] | null>(null);
  const [draftWarnings, setDraftWarnings] = useState<string[]>([]);
  const [applyingDraft, setApplyingDraft] = useState(false);
  const [savingTrip, setSavingTrip] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const [hotelLocation, setHotelLocation] = useState('');
  const [hotelAdults, setHotelAdults] = useState(1);
  const [hotelSearching, setHotelSearching] = useState(false);
  const [hotelSource, setHotelSource] = useState<'ai' | 'tbo' | 'ai_fallback' | ''>('');
  const [hotelError, setHotelError] = useState('');
  const [hotelDayKey, setHotelDayKey] = useState('');
  const [hotelResults, setHotelResults] = useState<HotelResult[]>([]);
  const [hotelResultsByDay, setHotelResultsByDay] = useState<Record<string, HotelResult[]>>({});
  const [hotelMapLocations, setHotelMapLocations] = useState<Location[]>([]);
  const [hotelCart, setHotelCart] = useState<HotelCartItem[]>([]);

  const [transportMode, setTransportMode] = useState<'flight' | 'train' | 'bus' | 'cab' | 'mix'>('mix');
  const [transportStopsInput, setTransportStopsInput] = useState('');
  const [transportSearching, setTransportSearching] = useState(false);
  const [transportSource, setTransportSource] = useState<'ai' | 'tbo' | 'ai_fallback' | ''>('');
  const [transportError, setTransportError] = useState('');
  const [transportOptions, setTransportOptions] = useState<TransportOption[]>([]);
  const [transportCart, setTransportCart] = useState<TransportOption[]>([]);
  const [transportMapLocations, setTransportMapLocations] = useState<Location[]>([]);

  useEffect(() => {
    setTripId(tripParam);
  }, [tripParam]);

  useEffect(() => {
    if (!startDate || !endDate) {
      const today = todayIso();
      setStartDate((prev) => prev || today);
      setEndDate((prev) => prev || addDays(today, 2));
    }
  }, [startDate, endDate]);

  useEffect(() => {
    if (!tripId) return;
    let cancelled = false;
    setLoadingTrip(true);
    (async () => {
      try {
        const trip = await getTrip(tripId);
        if (cancelled) return;
        setTripName(trip.name || 'My Trip');
        setOrigin(trip.origin || 'Delhi');
        setDestination(trip.destination || '');
        const today = todayIso();
        setStartDate(trip.start_date || today);
        setEndDate(trip.end_date || addDays(today, 2));
        setBudget(Number(trip.budget || 0));
        setItinerary((trip.itinerary || []) as Day[]);
      } catch {
        if (!cancelled) setWarnings(['Unable to load trip details.']);
      } finally {
        if (!cancelled) setLoadingTrip(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sourceDays = draftItinerary && draftItinerary.length ? draftItinerary : itinerary;
      const unique: Array<{ name: string; type: Location['type']; day: number; id: string }> = [];
      const seen = new Set<string>();
      sourceDays.forEach((day, dayIndex) => {
        day.activities.forEach((activity, idx) => {
          const loc = String(activity.location || activity.title || '').trim();
          if (!loc) return;
          const key = `${loc.toLowerCase()}-${dayIndex + 1}`;
          if (seen.has(key)) return;
          seen.add(key);
          unique.push({
            id: `${dayIndex + 1}-${idx}-${loc}`,
            name: loc,
            type: activity.type === 'hotel' ? 'hotel' : activity.type === 'activity' ? 'activity' : 'attraction',
            day: dayIndex + 1,
          });
        });
      });
      const resolved: Location[] = [];
      for (const item of unique) {
        const geo = await geocodeLocation(item.name);
        if (!geo) continue;
        resolved.push({
          id: item.id,
          name: item.name,
          type: item.type,
          day: item.day,
          lat: geo.lat,
          lng: geo.lng,
        });
      }
      if (!cancelled) {
        setMapLocations(resolved);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itinerary, draftItinerary]);

  const plannedDays = daysDiff(startDate, endDate);
  const hasDraft = !!draftItinerary?.length;
  const activeItinerary = useMemo(() => (hasDraft ? draftItinerary! : itinerary), [hasDraft, draftItinerary, itinerary]);
  const itineraryPlaceOptions = useMemo(() => itineraryLocations(activeItinerary, destination), [activeItinerary, destination]);
  const hotelDayOptions = useMemo<DayStayOption[]>(() => {
    const baseDays =
      activeItinerary.length > 0
        ? activeItinerary
        : Array.from({ length: plannedDays }, (_, idx) => ({
            date: addDays(startDate || todayIso(), idx),
            activities: [],
          }));
    return baseDays
      .map((day, idx) => {
        const dayDate = String(day.date || addDays(startDate || todayIso(), idx));
        const nextDate = String(baseDays[idx + 1]?.date || addDays(dayDate, 1));
        const locationFromActivities =
          (day.activities || [])
            .map((activity) => String(activity.location || activity.title || '').trim())
            .find((value) => !!value && !['breakfast', 'lunch', 'dinner', 'meal'].includes(value.toLowerCase())) || '';
        const fallbackLocation = locationFromActivities || destination.trim() || itineraryPlaceOptions[idx] || itineraryPlaceOptions[0] || '';
        return {
          key: `day-${idx + 1}`,
          day: idx + 1,
          date: dayDate,
          checkIn: dayDate,
          checkOut: nextDate,
          location: fallbackLocation,
        };
      })
      .filter((item) => !!item.location);
  }, [activeItinerary, plannedDays, startDate, destination, itineraryPlaceOptions]);
  const selectedHotelDay = useMemo(
    () => hotelDayOptions.find((item) => item.key === hotelDayKey) || hotelDayOptions[0] || null,
    [hotelDayOptions, hotelDayKey]
  );
  const parsedTransportStops = useMemo(
    () => transportStopsInput.split(',').map((s) => s.trim()).filter(Boolean),
    [transportStopsInput]
  );
  const hotelCartTotal = useMemo(
    () => hotelCart.reduce((sum, item) => sum + Number(item.hotel.price || 0), 0),
    [hotelCart]
  );
  const selectedTransportTotal = useMemo(
    () => transportCart.reduce((sum, option) => sum + Number(option.price || 0), 0),
    [transportCart]
  );
  const totalCartAmount = hotelCartTotal + selectedTransportTotal;

  const mergeCheckoutPayload = (payload: {
    trip_id?: string;
    selections: Array<{
      category: 'hotel' | 'transport' | 'activity';
      item_id: string;
      title: string;
      amount: number;
      metadata?: Record<string, any>;
    }>;
    currency: string;
  }) => {
    if (typeof window === 'undefined') return;
    const existingRaw = window.sessionStorage.getItem('voyage_checkout_payload');
    if (!existingRaw) {
      window.sessionStorage.setItem('voyage_checkout_payload', JSON.stringify(payload));
      return;
    }
    try {
      const existing = JSON.parse(existingRaw) as typeof payload;
      if (!existing.trip_id || existing.trip_id === payload.trip_id) {
        const merged = [...(existing.selections || []), ...payload.selections];
        const deduped = merged.filter(
          (item, index, arr) => arr.findIndex((x) => x.category === item.category && x.item_id === item.item_id) === index
        );
        window.sessionStorage.setItem(
          'voyage_checkout_payload',
          JSON.stringify({ ...existing, trip_id: payload.trip_id, selections: deduped, currency: 'INR' })
        );
      } else {
        window.sessionStorage.setItem('voyage_checkout_payload', JSON.stringify(payload));
      }
    } catch {
      window.sessionStorage.setItem('voyage_checkout_payload', JSON.stringify(payload));
    }
  };

  useEffect(() => {
    if (!hotelDayOptions.length) {
      setHotelDayKey('');
      setHotelLocation('');
      setHotelResults([]);
      return;
    }
    setHotelDayKey((prev) => (prev && hotelDayOptions.some((item) => item.key === prev) ? prev : hotelDayOptions[0].key));
  }, [hotelDayOptions]);

  useEffect(() => {
    if (!selectedHotelDay) {
      setHotelLocation('');
      setHotelResults([]);
      return;
    }
    setHotelLocation(selectedHotelDay.location);
    setHotelResults(hotelResultsByDay[selectedHotelDay.key] || []);
  }, [selectedHotelDay, hotelResultsByDay]);

  useEffect(() => {
    const defaultStops = hotelDayOptions.map((item) => item.location).filter(Boolean);
    if (!defaultStops.length) {
      setTransportStopsInput('');
      return;
    }
    setTransportStopsInput((prev) => prev || defaultStops.join(', '));
  }, [hotelDayOptions]);

  const collectPreferredLocations = () => {
    const ignored = new Set(['', 'breakfast', 'lunch', 'dinner', 'hotel', 'restaurant']);
    const out: string[] = [];
    const seen = new Set<string>();
    itinerary.forEach((day) => {
      (day.activities || []).forEach((activity) => {
        if (activity.type !== 'activity' && activity.type !== 'transport') return;
        const value = String(activity.location || '').trim();
        const key = value.toLowerCase();
        if (!value || ignored.has(key) || seen.has(key)) return;
        seen.add(key);
        out.push(value);
      });
    });
    return out.slice(0, 12);
  };

  const handleSaveTrip = async (daysToSave?: Day[]) => {
    const targetDays = daysToSave || activeItinerary;
    if (!origin.trim() || !destination.trim()) {
      setWarnings(['Origin and destination are required before saving trip.']);
      return;
    }
    setSavingTrip(true);
    setSaveMessage('');
    try {
      const result = await saveTrip({
        trip_id: tripId || undefined,
        name: tripName.trim() || `${destination.trim()} ${plannedDays}-Day Trip`,
        origin: origin.trim(),
        destination: destination.trim(),
        start_date: startDate,
        end_date: endDate,
        budget: Number(budget || 0),
        itinerary: targetDays || [],
      });
      setTripId(result.trip_id);
      setSaveMessage('Trip saved');
    } catch {
      setWarnings(['Failed to save trip.']);
    } finally {
      setSavingTrip(false);
    }
  };

  const handleGenerateItinerary = async () => {
    if (!destination.trim() || !origin.trim()) {
      setWarnings(['Please provide origin and destination before generating itinerary.']);
      return;
    }
    setGenerating(true);
    setWarnings([]);
    try {
      const result = await generateItinerary({
        trip_id: tripId || undefined,
        destination: destination.trim(),
        origin: origin.trim(),
        days: plannedDays,
        budget: Number(budget) || 0,
        start_date: startDate,
        end_date: endDate,
        preferences: collectPreferredLocations(),
        preview: true,
      });
      setDraftKind('generate');
      setDraftItinerary((result.itinerary || []) as Day[]);
      setDraftWarnings(result.warnings || []);
      if (!tripId) setTripId(result.trip_id);
    } catch {
      setWarnings(['Failed to generate itinerary. Please try again.']);
    } finally {
      setGenerating(false);
    }
  };

  const handleOptimize = async () => {
    if (!tripId) {
      setWarnings(['Create or load a trip before optimization.']);
      return;
    }
    if (!itinerary.length) {
      setWarnings(['Generate itinerary first, then optimize.']);
      return;
    }
    setOptimizing(true);
    setWarnings([]);
    try {
      const result = await optimizeItinerary({ trip_id: tripId, itinerary, preview: true });
      setDraftKind('optimize');
      setDraftItinerary((result.itinerary || []) as Day[]);
      setDraftWarnings(result.warnings || []);
    } catch {
      setWarnings(['Failed to optimize itinerary.']);
    } finally {
      setOptimizing(false);
    }
  };

  const handleAcceptDraft = async () => {
    if (!draftKind) return;
    setApplyingDraft(true);
    setWarnings([]);
    try {
      if (draftKind === 'generate') {
        const result = await generateItinerary({
          trip_id: tripId || undefined,
          destination: destination.trim(),
          origin: origin.trim(),
          days: plannedDays,
          budget: Number(budget) || 0,
          start_date: startDate,
          end_date: endDate,
          preferences: collectPreferredLocations(),
          preview: false,
        });
        setTripId(result.trip_id);
        setItinerary((result.itinerary || []) as Day[]);
        setWarnings(result.warnings || []);
        setTripName(`${destination.trim()} ${plannedDays}-Day Trip`);
      } else {
        const result = await optimizeItinerary({
          trip_id: tripId || '',
          itinerary: draftItinerary || itinerary,
          preview: false,
        });
        setItinerary((result.itinerary || []) as Day[]);
        setWarnings(result.warnings || []);
      }
      setDraftKind(null);
      setDraftItinerary(null);
      setDraftWarnings([]);
    } catch {
      setWarnings(['Failed to apply AI draft.']);
    } finally {
      setApplyingDraft(false);
    }
  };

  const handleDiscardDraft = () => {
    setDraftKind(null);
    setDraftItinerary(null);
    setDraftWarnings([]);
  };

  const handleTripHotelSearch = async () => {
    if (!tripId) {
      setHotelError('Save or load a trip first.');
      return;
    }
    const targetDay = selectedHotelDay;
    const targetLocation = (hotelLocation || targetDay?.location || '').trim();
    if (!targetDay || !targetLocation) {
      setHotelError('Choose a location from itinerary.');
      return;
    }
    setHotelSearching(true);
    setHotelError('');
    try {
      const result = await searchHotels({
        trip_id: tripId,
        location: targetLocation,
        budget: Number(budget || 0),
        check_in: targetDay.checkIn,
        check_out: targetDay.checkOut,
        adults: Math.max(1, hotelAdults || 1),
        children: 0,
      });
      const parsedHotels = (result.hotels || []) as HotelResult[];
      setHotelResults(parsedHotels);
      setHotelResultsByDay((prev) => ({ ...prev, [targetDay.key]: parsedHotels }));
      setHotelSource(result.source);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to fetch hotels for this trip context.';
      setHotelError(message);
    } finally {
      setHotelSearching(false);
    }
  };

  const openHotelDetailsInNewTab = (hotel: HotelResult) => {
    if (!tripId) {
      setHotelError('Save or load trip first.');
      return;
    }
    const day = selectedHotelDay;
    const query = new URLSearchParams({
      trip: tripId,
      location: day?.location || hotelLocation || hotel.location,
      name: hotel.name,
      checkIn: day?.checkIn || startDate,
      checkOut: day?.checkOut || endDate,
      guests: String(Math.max(1, hotelAdults || 1)),
    });
    const url = `/hotel/${encodeURIComponent(hotel.id)}?${query.toString()}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleAddHotelToCart = (hotel: HotelResult) => {
    const targetDay = selectedHotelDay;
    if (!targetDay) {
      setHotelError('Select a day before adding hotel.');
      return;
    }
    const entry: HotelCartItem = {
      dayKey: targetDay.key,
      day: targetDay.day,
      location: targetDay.location,
      checkIn: targetDay.checkIn,
      checkOut: targetDay.checkOut,
      hotel,
    };
    setHotelCart((prev) => {
      const next = prev.filter((item) => item.dayKey !== entry.dayKey);
      return [...next, entry].sort((a, b) => a.day - b.day);
    });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hotelResults.length || viewMode !== 'hotels') {
        if (!cancelled) setHotelMapLocations([]);
        return;
      }
      const mapped: Location[] = [];
      for (let i = 0; i < Math.min(12, hotelResults.length); i += 1) {
        const hotel = hotelResults[i];
        const geo = await geocodeLocation(`${hotel.name}, ${hotel.location}`);
        if (!geo) continue;
        mapped.push({
          id: `hotel-${hotel.id}-${i}`,
          name: hotel.name,
          lat: geo.lat,
          lng: geo.lng,
          type: 'hotel',
          price: hotel.price,
          day: i + 1,
        });
      }
      if (!cancelled) setHotelMapLocations(mapped);
    })();
    return () => {
      cancelled = true;
    };
  }, [hotelResults, viewMode]);

  const handleTripTransportSearch = async () => {
    if (!tripId) {
      setTransportError('Save or load a trip first.');
      return;
    }
    if (!origin.trim()) {
      setTransportError('Origin is required.');
      return;
    }
    if (!parsedTransportStops.length) {
      setTransportError('Add itinerary stops first.');
      return;
    }
    setTransportSearching(true);
    setTransportError('');
    try {
      const result = await planTransport({
        trip_id: tripId,
        origin: origin.trim(),
        stops: parsedTransportStops,
        start_date: startDate,
        end_date: endDate,
        mode: transportMode,
        budget: Number(budget || 0),
      });
      setTransportOptions((result.options || []) as TransportOption[]);
      setTransportSource(result.source);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to fetch transport for itinerary legs.';
      setTransportError(message);
    } finally {
      setTransportSearching(false);
    }
  };

  const toggleTransportSelection = (option: TransportOption) => {
    setTransportCart((prev) => {
      const exists = prev.some((item) => item.id === option.id);
      if (exists) return prev.filter((item) => item.id !== option.id);
      return [...prev, option];
    });
  };

  const handleCheckoutAll = () => {
    if (!tripId) {
      setTransportError('Trip context is missing. Save or load trip first.');
      return;
    }
    const selections = [
      ...hotelCart.map((item) => ({
        category: 'hotel' as const,
        item_id: `${item.hotel.id}-${item.dayKey}`,
        title: `Day ${item.day}: ${item.hotel.name} (${item.location})`,
        amount: Number(item.hotel.price || 0),
        metadata: {
          day: item.day,
          location: item.location,
          check_in: item.checkIn,
          check_out: item.checkOut,
          adults: hotelAdults,
          hotel_id: item.hotel.id,
        },
      })),
      ...transportCart.map((option) => ({
        category: 'transport' as const,
        item_id: String(option.id),
        title: `${option.provider} - ${option.segment}`,
        amount: Number(option.price || 0),
        metadata: {
          segment: option.segment,
          type: option.type,
          departure: option.departure,
          arrival: option.arrival,
          duration: option.duration,
        },
      })),
    ];
    if (!selections.length) {
      setHotelError('Add hotel or transport selections to cart first.');
      setTransportError('Add hotel or transport selections to cart first.');
      return;
    }
    const payload = {
      trip_id: tripId,
      selections,
      currency: 'INR',
    };
    mergeCheckoutPayload(payload);
    router.push(`/payment?trip=${encodeURIComponent(tripId)}`);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (viewMode !== 'transport' || !origin.trim() || !parsedTransportStops.length) {
        if (!cancelled) setTransportMapLocations([]);
        return;
      }
      const route = [origin.trim(), ...parsedTransportStops];
      if (route[route.length - 1].toLowerCase() !== origin.trim().toLowerCase()) {
        route.push(origin.trim());
      }
      const resolved: Location[] = [];
      for (let i = 0; i < route.length; i += 1) {
        const geo = await geocodeLocation(route[i]);
        if (!geo) continue;
        resolved.push({
          id: `route-${i}-${route[i]}`,
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
  }, [viewMode, origin, parsedTransportStops]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="h-[calc(100vh-80px)] overflow-hidden flex flex-col">
        <div className="border-b border-border px-4 py-3 bg-gradient-to-r from-primary/5 to-secondary/5">
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-foreground/60 block mb-1">Trip Name</label>
              <input
                type="text"
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground/60 block mb-1">Origin</label>
              <input
                type="text"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground/60 block mb-1">Destination</label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground/60 block mb-1">Start</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const nextStart = e.target.value;
                  setStartDate(nextStart);
                  if (new Date(nextStart) > new Date(endDate)) {
                    setEndDate(nextStart);
                  }
                }}
                className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground/60 block mb-1">End</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground/60 block mb-1">Budget (INR)</label>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value) || 0)}
                className="w-full px-2 py-1.5 text-sm border border-border rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={handleGenerateItinerary} disabled={generating} className="gap-2">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              AI Itinerary
            </Button>
            <Button size="sm" variant="outline" onClick={handleOptimize} disabled={optimizing || !itinerary.length} className="gap-2">
              {optimizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              AI Plan
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleSaveTrip()} disabled={savingTrip} className="gap-2">
              {savingTrip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Trip
            </Button>
            <Button size="sm" variant={viewMode === 'kanban' ? 'default' : 'outline'} onClick={() => setViewMode('kanban')} className="gap-2">
              <Calendar className="w-4 h-4" />
              Itinerary
            </Button>
            <Button size="sm" variant={viewMode === 'map' ? 'default' : 'outline'} onClick={() => setViewMode('map')} className="gap-2">
              <MapIcon className="w-4 h-4" />
              Map
            </Button>
            <Button size="sm" variant={viewMode === 'hotels' ? 'default' : 'outline'} onClick={() => setViewMode('hotels')} className="gap-2">
              <Hotel className="w-4 h-4" />
              Hotels
            </Button>
            <Button size="sm" variant={viewMode === 'transport' ? 'default' : 'outline'} onClick={() => setViewMode('transport')} className="gap-2">
              <Plane className="w-4 h-4" />
              Transport
            </Button>
          </div>
          {saveMessage && <p className="text-xs text-emerald-700 mt-2">{saveMessage}</p>}
        </div>

        {hasDraft && (
          <div className="px-4 py-3 border-b border-emerald-200 bg-emerald-50 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-emerald-900">
                Draft {draftKind === 'generate' ? 'AI Itinerary' : 'AI Plan'} ready
              </p>
              <p className="text-xs text-emerald-800">
                Review and choose whether to replace current itinerary.
              </p>
              {draftWarnings.length > 0 && (
                <p className="text-xs text-emerald-800 mt-1">{draftWarnings[0]}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAcceptDraft} disabled={applyingDraft} className="gap-1">
                {applyingDraft ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Accept
              </Button>
              <Button size="sm" variant="outline" onClick={handleDiscardDraft} className="gap-1">
                <X className="w-3 h-3" />
                Discard
              </Button>
            </div>
          </div>
        )}

        {!hasDraft && warnings.length > 0 && (
          <div className="px-4 py-2 border-b border-border bg-amber-50">
            <ul className="text-xs text-amber-900 space-y-1">
              {warnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>- {warning}</li>
              ))}
            </ul>
          </div>
        )}

        {viewMode === 'hotels' ? (
          <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
            <div className="w-full lg:w-[46%] border-r border-border overflow-y-auto bg-white p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-foreground">Trip Hotels</h3>
                  <p className="text-xs text-foreground/60">Context-aware hotel search for this itinerary</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setViewMode('kanban')}>
                  Back to Itinerary
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground/60 block mb-1">Day</label>
                  <select
                    value={hotelDayKey}
                    onChange={(e) => setHotelDayKey(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                  >
                    {!hotelDayOptions.length && <option value="">No day stops</option>}
                    {hotelDayOptions.map((item) => (
                      <option key={item.key} value={item.key}>
                        Day {item.day} - {item.location}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground/60 block mb-1">Location</label>
                  <input
                    type="text"
                    value={hotelLocation}
                    onChange={(e) => setHotelLocation(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground/60 block mb-1">Adults</label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={hotelAdults}
                    onChange={(e) => setHotelAdults(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground/60 block mb-1">Check-in</label>
                  <input
                    type="date"
                    value={selectedHotelDay?.checkIn || startDate}
                    readOnly
                    className="w-full px-3 py-2 border border-border rounded-lg bg-muted text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground/60 block mb-1">Check-out</label>
                  <input
                    type="date"
                    value={selectedHotelDay?.checkOut || endDate}
                    readOnly
                    className="w-full px-3 py-2 border border-border rounded-lg bg-muted text-sm"
                  />
                </div>
              </div>
              <Button onClick={handleTripHotelSearch} disabled={hotelSearching || !tripId || !selectedHotelDay} className="w-full">
                {hotelSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : `Search Hotels for ${selectedHotelDay ? `Day ${selectedHotelDay.day}` : 'Selected Day'}`}
              </Button>
              {hotelSource && (
                <p className="text-xs text-foreground/70">
                  Source: {hotelSource === 'tbo' ? 'TBO API' : hotelSource === 'ai_fallback' ? 'AI Fallback' : 'AI'}
                </p>
              )}
              {!!hotelError && <p className="text-sm text-red-600">{hotelError}</p>}
              <div className="space-y-3">
                {hotelResults.length === 0 ? (
                  <Card className="p-4 text-sm text-foreground/60">No hotels yet. Search a selected day to fetch AI suggestions.</Card>
                ) : (
                  hotelResults.slice(0, 12).map((hotel) => (
                    <Card key={hotel.id} className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">{hotel.name}</p>
                          <p className="text-xs text-foreground/60">{hotel.location}</p>
                          <p className="text-xs text-foreground/70 mt-1">Rating {hotel.rating ?? 4.0} ({hotel.reviews ?? 0} reviews)</p>
                        </div>
                        <p className="text-base font-bold text-primary">INR {Math.round(hotel.price || 0)}</p>
                      </div>
                      {hotel.source_url && (
                        <a href={hotel.source_url} target="_blank" rel="noreferrer" className="text-[11px] text-primary mt-2 inline-block">
                          Source
                        </a>
                      )}
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <Button size="sm" variant="outline" onClick={() => openHotelDetailsInNewTab(hotel)} className="gap-1">
                          <Eye className="w-3 h-3" />
                          View
                        </Button>
                        <Button size="sm" onClick={() => handleAddHotelToCart(hotel)}>
                          {selectedHotelDay && hotelCart.some((item) => item.dayKey === selectedHotelDay.key && item.hotel.id === hotel.id)
                            ? `Day ${selectedHotelDay.day} Added`
                            : `Add Day ${selectedHotelDay?.day || ''}`}
                        </Button>
                      </div>
                    </Card>
                  ))
                )}
              </div>
              <Card className="p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold flex items-center gap-2"><ShoppingCart className="w-4 h-4" />Hotel Cart</p>
                  <p className="text-xs text-foreground/60">{hotelCart.length} day(s)</p>
                </div>
                <div className="mt-2 space-y-1">
                  {hotelCart.length === 0 ? (
                    <p className="text-xs text-foreground/60">Add one hotel per day.</p>
                  ) : (
                    hotelCart.map((item) => (
                      <p key={`${item.dayKey}-${item.hotel.id}`} className="text-xs text-foreground/70">
                        Day {item.day}: {item.hotel.name} - INR {Math.round(item.hotel.price || 0)}
                      </p>
                    ))
                  )}
                </div>
                <p className="text-sm font-semibold mt-2">Hotel Total: INR {Math.round(hotelCartTotal)}</p>
                <Button className="w-full mt-3" onClick={handleCheckoutAll} disabled={!hotelCart.length && !transportCart.length}>
                  Checkout All (Hotel + Transport)
                </Button>
              </Card>
            </div>
            <div className="w-full lg:w-[54%] p-4 bg-background">
              {hotelMapLocations.length ? (
                <MapView locations={hotelMapLocations} drawRoutes={false} />
              ) : (
                <Card className="p-6 text-sm text-foreground/60">Hotel map will appear after search.</Card>
              )}
              <Card className="p-4 mt-4">
                <h4 className="text-sm font-semibold text-foreground mb-2">Hotel Details</h4>
                <p className="text-sm text-foreground/60">
                  Click <span className="font-medium">View</span> to open the full hotel details page in a new tab.
                </p>
              </Card>
            </div>
          </div>
        ) : viewMode === 'transport' ? (
          <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
            <div className="w-full lg:w-[46%] border-r border-border overflow-y-auto bg-white p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-foreground">Trip Transport</h3>
                  <p className="text-xs text-foreground/60">Origin {'->'} itinerary legs {'->'} origin</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setViewMode('kanban')}>
                  Back to Itinerary
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-foreground/60 block mb-1">Origin</label>
                  <input type="text" value={origin} readOnly className="w-full px-3 py-2 border border-border rounded-lg bg-muted text-sm" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground/60 block mb-1">Mode</label>
                  <select
                    value={transportMode}
                    onChange={(e) => setTransportMode(e.target.value as 'flight' | 'train' | 'bus' | 'cab' | 'mix')}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                  >
                    <option value="mix">Mix (Cheapest)</option>
                    <option value="flight">Flight</option>
                    <option value="train">Train</option>
                    <option value="bus">Bus</option>
                    <option value="cab">Cab</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-foreground/60 block mb-1">Stops (itinerary context)</label>
                  <input
                    type="text"
                    value={transportStopsInput}
                    onChange={(e) => setTransportStopsInput(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                  />
                </div>
              </div>
              <Button onClick={handleTripTransportSearch} disabled={transportSearching || !tripId} className="w-full">
                {transportSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Plan Itinerary Transport'}
              </Button>
              <p className="text-xs text-foreground/60">
                Mix mode evaluates bus, train, flight, and cab for each leg and selects the most cost-effective practical option.
              </p>
              <p className="text-xs text-foreground/60">
                Travel window used: {startDate} to {endDate}
              </p>
              {transportSource && (
                <p className="text-xs text-foreground/70">
                  Source: {transportSource === 'tbo' ? 'TBO API' : transportSource === 'ai_fallback' ? 'AI Fallback' : 'AI'}
                </p>
              )}
              {!!transportError && <p className="text-sm text-red-600">{transportError}</p>}
              <div className="space-y-3">
                {transportOptions.length === 0 ? (
                  <Card className="p-4 text-sm text-foreground/60">No transport yet. Plan to view per-leg options.</Card>
                ) : (
                  transportOptions.map((option) => (
                    <Card key={option.id} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {option.type === 'flight' ? <Plane className="w-4 h-4 text-primary" /> : option.type === 'train' ? <Train className="w-4 h-4 text-primary" /> : option.type === 'bus' ? <Bus className="w-4 h-4 text-primary" /> : <Car className="w-4 h-4 text-primary" />}
                          <div>
                            <p className="font-semibold text-foreground">{option.segment}</p>
                            <p className="text-xs text-foreground/60">{option.provider}</p>
                          </div>
                        </div>
                        <p className="text-base font-bold text-primary">INR {Math.round(option.price || 0)}</p>
                      </div>
                      <p className="text-xs text-foreground/70 mt-2">
                        {option.departure} {'->'} {option.arrival} {' - '} {option.duration}
                      </p>
                      {option.details && <p className="text-xs text-foreground/70 mt-1">{option.details}</p>}
                      {option.source_url && (
                        <a href={option.source_url} target="_blank" rel="noreferrer" className="text-[11px] text-primary mt-2 inline-block">
                          Source
                        </a>
                      )}
                      <Button
                        size="sm"
                        variant={transportCart.some((item) => item.id === option.id) ? 'default' : 'outline'}
                        onClick={() => toggleTransportSelection(option)}
                        className="w-full mt-3"
                      >
                        {transportCart.some((item) => item.id === option.id) ? 'In Cart' : 'Add to Cart'}
                      </Button>
                    </Card>
                  ))
                )}
              </div>
              <Card className="p-3">
                <p className="text-xs text-foreground/60">Transport in cart: {transportCart.length}</p>
                <p className="text-xs text-foreground/60">Hotels in cart: {hotelCart.length}</p>
                <p className="text-lg font-bold text-primary mt-1">INR {Math.round(totalCartAmount)}</p>
                <Button className="w-full mt-3" onClick={handleCheckoutAll} disabled={!transportCart.length && !hotelCart.length}>
                  Checkout All
                </Button>
              </Card>
            </div>
            <div className="w-full lg:w-[54%] p-4 bg-background">
              {transportMapLocations.length ? (
                <MapView locations={transportMapLocations} drawRoutes />
              ) : (
                <Card className="p-6 text-sm text-foreground/60">Transport route map will appear after adding stops.</Card>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">
            <div className="w-full lg:w-1/2 border-r border-border overflow-y-auto bg-white">
              <AIPlannerChat
                tripId={tripId}
                onTripCreated={setTripId}
                onExtracted={(extracted) => {
                  if (extracted.origin) setOrigin(String(extracted.origin));
                  if (extracted.destination) setDestination(String(extracted.destination));
                  if (typeof extracted.budget === 'number') setBudget(Number(extracted.budget));
                  if (typeof extracted.days === 'number') {
                    const d = Math.max(1, Number(extracted.days));
                    setEndDate(addDays(startDate, d - 1));
                  }
                }}
              />
            </div>
            <div className="w-full lg:w-1/2 flex flex-col bg-background min-h-[45vh]">
              {loadingTrip ? (
                <div className="flex h-full items-center justify-center text-sm text-foreground/60">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Loading trip...
                </div>
              ) : viewMode === 'kanban' ? (
                <ItineraryBuilder
                  tripName={tripName}
                  startDate={startDate}
                  endDate={endDate}
                  days={activeItinerary}
                  onSave={(days) => handleSaveTrip(days)}
                  onChange={(next) => {
                    if (hasDraft) {
                      setDraftItinerary(next);
                    } else {
                      setItinerary(next);
                    }
                  }}
                />
              ) : mapLocations.length ? (
                <MapView locations={mapLocations} drawRoutes />
              ) : (
                <Card className="m-6 p-6 text-sm text-foreground/60">No itinerary locations yet. Generate itinerary first.</Card>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PlannerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background">
          <Navbar />
          <main className="h-[calc(100vh-80px)] flex items-center justify-center text-sm text-foreground/70">
            Loading planner...
          </main>
        </div>
      }
    >
      <PlannerPageContent />
    </Suspense>
  );
}
