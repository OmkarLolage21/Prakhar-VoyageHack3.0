'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { addFavoriteHotel, listTrips, removeFavoriteHotel, searchHotels, type TripDTO } from '@/lib/api-client';
import { Heart, Loader2, MapPin, Star } from 'lucide-react';
import Link from 'next/link';

interface HotelResult {
  id: string;
  name: string;
  location: string;
  rating?: number;
  reviews?: number;
  price: number;
  amenities?: string[];
  sustainabilityScore?: number;
  tbo?: Record<string, any>;
  image_url?: string;
  source_url?: string;
}

function uniqueLocations(trip: TripDTO | null): string[] {
  if (!trip) return [];
  const set = new Set<string>();
  if (trip.destination) set.add(trip.destination);
  (trip.itinerary || []).forEach((day: any) => {
    (day.activities || []).forEach((activity: any) => {
      const location = String(activity.location || '').trim();
      if (location) set.add(location);
    });
  });
  return Array.from(set);
}

function HotelsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tripParam = searchParams.get('trip');
  const destinationParam = searchParams.get('destination');
  const guestsParam = Number(searchParams.get('guests') || 1);

  const [trips, setTrips] = useState<TripDTO[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string>(tripParam || '');
  const [selectedLocation, setSelectedLocation] = useState<string>(destinationParam || '');
  const [budget, setBudget] = useState<number>(30000);
  const [adults, setAdults] = useState<number>(Math.max(1, guestsParam || 1));
  const [checkIn, setCheckIn] = useState<string>('');
  const [checkOut, setCheckOut] = useState<string>('');
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [searching, setSearching] = useState(false);
  const [source, setSource] = useState<'ai' | 'tbo' | 'ai_fallback' | ''>('');
  const [hotels, setHotels] = useState<HotelResult[]>([]);
  const [error, setError] = useState<string>('');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) || null,
    [trips, selectedTripId]
  );
  const placeOptions = useMemo(() => uniqueLocations(selectedTrip), [selectedTrip]);

  useEffect(() => {
    let cancelled = false;
    setLoadingTrips(true);
    (async () => {
      try {
        const data = await listTrips();
        if (cancelled) return;
        setTrips(data);
        const currentTrip = data.find((trip) => trip.id === (tripParam || selectedTripId)) || data[0];
        if (!currentTrip) return;
        setSelectedTripId(currentTrip.id);
        setBudget(Number(currentTrip.budget || 30000));
        setCheckIn(currentTrip.start_date || '');
        setCheckOut(currentTrip.end_date || '');
        setFavoriteIds(new Set(currentTrip.favorite_hotels || []));
        const options = uniqueLocations(currentTrip);
        if (!selectedLocation) {
          setSelectedLocation(options[0] || currentTrip.destination || '');
        }
      } catch {
        if (!cancelled) setError('Unable to load trips. Please open Planner once and create a trip.');
      } finally {
        if (!cancelled) setLoadingTrips(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripParam]);

  useEffect(() => {
    if (!selectedTrip) return;
    setBudget(Number(selectedTrip.budget || 30000));
    setCheckIn(selectedTrip.start_date || '');
    setCheckOut(selectedTrip.end_date || '');
    setFavoriteIds(new Set(selectedTrip.favorite_hotels || []));
    if (!placeOptions.includes(selectedLocation)) {
      setSelectedLocation(placeOptions[0] || selectedTrip.destination || '');
    }
  }, [selectedTrip, placeOptions, selectedLocation]);

  useEffect(() => {
    if (!selectedTripId || !selectedLocation) {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }
    const key = `voyage_hotels_${selectedTripId}_${selectedLocation.toLowerCase()}`;
    const cached = window.sessionStorage.getItem(key);
    if (!cached) {
      return;
    }
    try {
      const parsed = JSON.parse(cached) as { hotels?: HotelResult[]; source?: 'ai' | 'tbo' | 'ai_fallback' } | HotelResult[];
      if (Array.isArray(parsed)) {
        setHotels(parsed);
        return;
      }
      setHotels(Array.isArray(parsed.hotels) ? parsed.hotels : []);
      if (parsed.source) {
        setSource(parsed.source);
      }
    } catch {
      // ignore invalid cache
    }
  }, [selectedTripId, selectedLocation]);

  const handleSearchHotels = async () => {
    if (!selectedTripId) {
      setError('Select a trip first.');
      return;
    }
    if (!selectedLocation.trim()) {
      setError('Select a location from itinerary.');
      return;
    }
    setSearching(true);
    setError('');
    try {
      const result = await searchHotels({
        trip_id: selectedTripId,
        location: selectedLocation.trim(),
        budget: Number(budget || 0),
        check_in: checkIn || undefined,
        check_out: checkOut || undefined,
        adults: Math.max(1, adults || 1),
        children: 0,
      });
      setHotels((result.hotels || []) as HotelResult[]);
      setSource(result.source);
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          `voyage_hotels_${selectedTripId}_${selectedLocation.toLowerCase()}`,
          JSON.stringify({ hotels: result.hotels || [], source: result.source })
        );
      }
    } catch {
      setError('Hotel search failed. Verify backend service and try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleFavoriteToggle = async (hotelId: string) => {
    if (!selectedTripId) return;
    const next = new Set(favoriteIds);
    const isFavorite = next.has(hotelId);
    if (isFavorite) {
      next.delete(hotelId);
      setFavoriteIds(next);
      try {
        await removeFavoriteHotel(selectedTripId, hotelId);
      } catch {
        next.add(hotelId);
        setFavoriteIds(new Set(next));
      }
      return;
    }
    next.add(hotelId);
    setFavoriteIds(next);
    try {
      await addFavoriteHotel(selectedTripId, hotelId);
    } catch {
      next.delete(hotelId);
      setFavoriteIds(new Set(next));
    }
  };

  const handleBook = (hotel: HotelResult) => {
    const payload = {
      trip_id: selectedTripId,
      selections: [
        {
          category: 'hotel' as const,
          item_id: String(hotel.id),
          title: `${hotel.name} (${selectedLocation})`,
          amount: Number(hotel.price || 0),
          metadata: {
            location: selectedLocation,
            check_in: checkIn,
            check_out: checkOut,
            tbo: hotel.tbo || null,
          },
        },
      ],
      currency: 'INR',
    };
    if (typeof window !== 'undefined') {
      const existingRaw = window.sessionStorage.getItem('voyage_checkout_payload');
      if (existingRaw) {
        try {
          const existing = JSON.parse(existingRaw) as typeof payload;
          if (!existing.trip_id || existing.trip_id === payload.trip_id) {
            const merged = [...(existing.selections || []), ...payload.selections];
            const deduped = merged.filter(
              (item, index, arr) =>
                arr.findIndex((x) => x.category === item.category && x.item_id === item.item_id) === index
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
      } else {
        window.sessionStorage.setItem('voyage_checkout_payload', JSON.stringify(payload));
      }
    }
    router.push(`/payment?trip=${encodeURIComponent(selectedTripId)}`);
  };

  const handleViewDetails = (hotel: HotelResult) => {
    router.push(
      `/hotel/${encodeURIComponent(hotel.id)}?trip=${encodeURIComponent(selectedTripId)}&location=${encodeURIComponent(
        selectedLocation
      )}&name=${encodeURIComponent(hotel.name)}`
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="bg-card border-b border-border p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold text-foreground mb-2">Hotels</h1>
            <p className="text-sm text-foreground/70 mb-6">
              Find high-rated stays within budget for itinerary locations.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-foreground/60 block mb-1">Trip</label>
                <select
                  value={selectedTripId}
                  onChange={(e) => setSelectedTripId(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                  disabled={loadingTrips}
                >
                  {!trips.length && <option value="">No trips available</option>}
                  {trips.map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {trip.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground/60 block mb-1">Location</label>
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                >
                  {!placeOptions.length && <option value="">No itinerary locations</option>}
                  {placeOptions.map((place) => (
                    <option key={place} value={place}>
                      {place}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground/60 block mb-1">Budget (INR)</label>
                <input
                  type="number"
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground/60 block mb-1">Adults</label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={adults}
                  onChange={(e) => setAdults(Number(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                />
              </div>

              <div className="flex items-end">
                <Button onClick={handleSearchHotels} disabled={searching || !selectedTripId} className="w-full">
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search Hotels'}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="text-xs font-semibold text-foreground/60 block mb-1">Check-in</label>
                <input
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground/60 block mb-1">Check-out</label>
                <input
                  type="date"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                />
              </div>
              <div className="flex items-end">
                {source && (
                  <div className="text-xs px-3 py-2 rounded bg-muted text-foreground/80 w-full text-center">
                    Source: {source === 'tbo' ? 'TBO API' : source === 'ai_fallback' ? 'AI Fallback' : 'AI'}
                  </div>
                )}
              </div>
            </div>

            {!!error && <p className="text-sm text-red-600 mt-3">{error}</p>}
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {!trips.length && !loadingTrips ? (
            <Card className="p-8 text-center">
              <p className="text-foreground/70 mb-4">Create a trip first in Planner to enable trip-aware hotel search.</p>
              <Link href="/planner">
                <Button>Open Planner</Button>
              </Link>
            </Card>
          ) : hotels.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-foreground/70">Run a hotel search to view results.</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {hotels.map((hotel) => {
                const isFavorite = favoriteIds.has(hotel.id);
                return (
                  <Card key={hotel.id} className="overflow-hidden flex flex-col">
                    <div className="h-36 bg-muted">
                      <img
                        src={hotel.image_url || `https://picsum.photos/seed/${encodeURIComponent(hotel.id)}/900/600`}
                        alt={hotel.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-foreground">{hotel.name}</h3>
                        <button type="button" onClick={() => handleFavoriteToggle(hotel.id)} className="text-foreground/50 hover:text-red-500">
                          <Heart className={`w-5 h-5 ${isFavorite ? 'fill-red-500 text-red-500' : ''}`} />
                        </button>
                      </div>

                      <p className="text-xs text-foreground/60 mt-1 flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {hotel.location}
                      </p>

                      <div className="mt-3 flex items-center gap-3 text-xs text-foreground/70">
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          {hotel.rating ?? 4.0}
                        </span>
                        <span>({hotel.reviews ?? 0} reviews)</span>
                      </div>
                      {hotel.source_url && (
                        <a href={hotel.source_url} target="_blank" rel="noreferrer" className="text-[11px] text-primary mt-1 inline-block">
                          Source
                        </a>
                      )}

                      {hotel.amenities && hotel.amenities.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {hotel.amenities.slice(0, 4).map((amenity) => (
                            <span key={`${hotel.id}-${amenity}`} className="text-[11px] bg-muted px-2 py-1 rounded">
                              {amenity}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="mt-auto pt-4 flex items-end justify-between gap-2">
                        <div>
                          <p className="text-2xl font-bold text-primary">INR {Math.round(hotel.price || 0)}</p>
                          <p className="text-xs text-foreground/60">per night</p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button size="sm" variant="outline" onClick={() => handleViewDetails(hotel)}>
                            View Details
                          </Button>
                          <Button size="sm" onClick={() => handleBook(hotel)}>
                            Book & Pay
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default function HotelsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex flex-col">
          <Navbar />
          <main className="flex-1 flex items-center justify-center text-sm text-foreground/70">Loading hotels...</main>
          <Footer />
        </div>
      }
    >
      <HotelsPageContent />
    </Suspense>
  );
}
