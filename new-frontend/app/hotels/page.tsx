'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { geocodePlace, searchHotels } from '@/lib/api-client';
import { MapView, type Location } from '@/components/map-view';
import { Heart, Loader2, MapPin, Star } from 'lucide-react';

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

interface CircleRegion {
  lat: number;
  lng: number;
  radiusKm: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const base = new Date(isoDate);
  base.setDate(base.getDate() + Math.max(0, days));
  return base.toISOString().slice(0, 10);
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

function HotelsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const destinationParam = searchParams.get('destination') || '';
  const guestsParam = Number(searchParams.get('guests') || 1);
  const checkInParam = searchParams.get('checkIn') || '';
  const checkOutParam = searchParams.get('checkOut') || '';

  const [selectedLocation, setSelectedLocation] = useState<string>(destinationParam);
  const [budget, setBudget] = useState<number>(30000);
  const [adults, setAdults] = useState<number>(Math.max(1, guestsParam || 1));
  const [checkIn, setCheckIn] = useState<string>(checkInParam || todayIso());
  const [checkOut, setCheckOut] = useState<string>(checkOutParam || addDays(todayIso(), 2));
  const [searching, setSearching] = useState(false);
  const [source, setSource] = useState<'ai' | 'tbo' | 'ai_fallback' | ''>('');
  const [hotels, setHotels] = useState<HotelResult[]>([]);
  const [error, setError] = useState<string>('');
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [mapLocations, setMapLocations] = useState<Location[]>([]);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 20.5937, lng: 78.9629 });
  const [circleRegion, setCircleRegion] = useState<CircleRegion | null>(null);

  const cacheKey = useMemo(() => {
    const keyLocation = selectedLocation.trim().toLowerCase() || 'anywhere';
    return `voyage_hotels_adhoc_${keyLocation}_${checkIn}_${checkOut}_${budget}_${adults}`;
  }, [selectedLocation, checkIn, checkOut, budget, adults]);

  useEffect(() => {
    if (!selectedLocation.trim()) return;
    let cancelled = false;
    (async () => {
      try {
        const point = await geocodePlace(selectedLocation.trim());
        if (cancelled) return;
        if (Number.isFinite(point.lat) && Number.isFinite(point.lng)) {
          setMapCenter({ lat: Number(point.lat), lng: Number(point.lng) });
        }
      } catch {
        // keep default center
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedLocation]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cached = window.sessionStorage.getItem(cacheKey);
    if (!cached) return;
    try {
      const parsed = JSON.parse(cached) as { hotels?: HotelResult[]; source?: 'ai' | 'tbo' | 'ai_fallback' };
      setHotels(Array.isArray(parsed.hotels) ? parsed.hotels : []);
      if (parsed.source) setSource(parsed.source);
    } catch {
      // ignore invalid cache
    }
  }, [cacheKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hotels.length) {
        if (!cancelled) setMapLocations([]);
        return;
      }
      const mapped: Location[] = [];
      for (let i = 0; i < Math.min(30, hotels.length); i += 1) {
        const hotel = hotels[i];
        try {
          const geo = await geocodePlace(`${hotel.name}, ${hotel.location || selectedLocation}`);
          const lat = Number(geo.lat);
          const lng = Number(geo.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
          mapped.push({
            id: String(hotel.id),
            name: hotel.name,
            lat,
            lng,
            type: 'hotel',
            price: Number(hotel.price || 0),
          });
        } catch {
          // skip failed geocode
        }
      }
      if (!cancelled) setMapLocations(mapped);
    })();
    return () => {
      cancelled = true;
    };
  }, [hotels, selectedLocation]);

  const coordinatesByHotelId = useMemo(() => {
    const out = new Map<string, { lat: number; lng: number }>();
    mapLocations.forEach((item) => out.set(String(item.id), { lat: item.lat, lng: item.lng }));
    return out;
  }, [mapLocations]);

  const visibleHotels = useMemo(() => {
    if (!circleRegion) return hotels;
    return hotels.filter((hotel) => {
      const point = coordinatesByHotelId.get(String(hotel.id));
      if (!point) return false;
      return distanceKm(point.lat, point.lng, circleRegion.lat, circleRegion.lng) <= circleRegion.radiusKm;
    });
  }, [hotels, circleRegion, coordinatesByHotelId]);

  const handleSearchHotels = async () => {
    if (!selectedLocation.trim()) {
      setError('Enter a location to search hotels.');
      return;
    }
    setSearching(true);
    setError('');
    try {
      const result = await searchHotels({
        location: selectedLocation.trim(),
        budget: Number(budget || 0),
        check_in: checkIn || undefined,
        check_out: checkOut || undefined,
        adults: Math.max(1, adults || 1),
        children: 0,
      });
      setHotels((result.hotels || []) as HotelResult[]);
      setSource(result.source);
      setCircleRegion(null);
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(cacheKey, JSON.stringify({ hotels: result.hotels || [], source: result.source }));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Hotel search failed. Verify backend service and try again.';
      setError(message);
    } finally {
      setSearching(false);
    }
  };

  const handleFavoriteToggle = (hotelId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(hotelId)) next.delete(hotelId);
      else next.add(hotelId);
      return next;
    });
  };

  const handleBook = (hotel: HotelResult) => {
    const payload = {
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
            adults,
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
          const merged = [...(existing.selections || []), ...payload.selections];
          const deduped = merged.filter(
            (item, index, arr) =>
              arr.findIndex((x) => x.category === item.category && x.item_id === item.item_id) === index
          );
          window.sessionStorage.setItem(
            'voyage_checkout_payload',
            JSON.stringify({ ...existing, selections: deduped, currency: 'INR' })
          );
        } catch {
          window.sessionStorage.setItem('voyage_checkout_payload', JSON.stringify(payload));
        }
      } else {
        window.sessionStorage.setItem('voyage_checkout_payload', JSON.stringify(payload));
      }
    }
    router.push('/payment');
  };

  const handleViewDetails = (hotel: HotelResult) => {
    const query = new URLSearchParams({
      location: selectedLocation,
      name: hotel.name,
      checkIn: checkIn || '',
      checkOut: checkOut || '',
      guests: String(Math.max(1, adults || 1)),
    });
    router.push(`/hotel/${encodeURIComponent(hotel.id)}?${query.toString()}`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="bg-card border-b border-border p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold text-foreground mb-2">Hotels</h1>
            <p className="text-sm text-foreground/70">Ad-hoc hotel search with map-based region filtering.</p>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-[360px,1fr] gap-6 items-start">
            <div className="space-y-4 lg:sticky lg:top-4">
              <Card className="overflow-hidden">
                <MapView
                  locations={mapLocations}
                  drawRoutes={false}
                  center={mapCenter}
                  mapMinHeight="260px"
                  onCircleSearch={(lat, lng, radius) => {
                    if (!radius || radius <= 0) {
                      setCircleRegion(null);
                      return;
                    }
                    setCircleRegion({ lat, lng, radiusKm: radius });
                  }}
                  onCircleClear={() => setCircleRegion(null)}
                />
              </Card>

              <Card className="p-4 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-foreground/60 block mb-1">Location</label>
                  <input
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    placeholder="City or area (e.g., Abu Road)"
                    className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
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
                      onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
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
                </div>

                <Button onClick={handleSearchHotels} disabled={searching || !selectedLocation.trim()} className="w-full">
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search Hotels'}
                </Button>

                {source && (
                  <div className="text-xs px-3 py-2 rounded bg-muted text-foreground/80 text-center">
                    Source: {source === 'tbo' ? 'TBO API' : source === 'ai_fallback' ? 'AI Fallback' : 'AI'}
                  </div>
                )}

                {circleRegion ? (
                  <div className="text-xs px-3 py-2 rounded bg-blue-50 text-blue-900 border border-blue-200">
                    Region active: {circleRegion.radiusKm.toFixed(2)} km around selected center.
                  </div>
                ) : (
                  <div className="text-xs px-3 py-2 rounded bg-muted text-foreground/70">
                    Click <strong>Circle Search</strong> on map, then click center and edge to filter hotels by region.
                  </div>
                )}

                {!!error && <p className="text-sm text-red-600">{error}</p>}
              </Card>
            </div>

            <div>
              {hotels.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-foreground/70">Run a hotel search to view results.</p>
                </Card>
              ) : visibleHotels.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-foreground/70">
                    No hotels found inside the selected circle. Clear the region filter or draw a bigger circle.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {visibleHotels.map((hotel) => {
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
            </div>
          </div>
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
