'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MapView, type Location } from '@/components/map-view';
import { geocodePlace, planTransport } from '@/lib/api-client';
import { Bus, Car, Loader2, Plane, Train } from 'lucide-react';

interface TransportOption {
  id: string;
  segment: string;
  type: string;
  provider: string;
  departure: string;
  arrival: string;
  duration: string;
  price: number;
  rating?: number;
  details?: string;
  amenities?: string[];
  tbo?: Record<string, any>;
  mix_strategy?: string;
  source_url?: string;
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const base = new Date(isoDate);
  base.setDate(base.getDate() + Math.max(0, days));
  return base.toISOString().slice(0, 10);
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
    return null;
  }
  return null;
}

function TransportPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [origin, setOrigin] = useState(searchParams.get('origin') || 'Delhi');
  const [stopsInput, setStopsInput] = useState(searchParams.get('stops') || '');
  const [mode, setMode] = useState<'flight' | 'train' | 'bus' | 'cab' | 'mix'>('mix');
  const [budget, setBudget] = useState(30000);
  const [startDate, setStartDate] = useState(searchParams.get('startDate') || todayIso());
  const [endDate, setEndDate] = useState(searchParams.get('endDate') || addDays(todayIso(), 2));
  const [options, setOptions] = useState<TransportOption[]>([]);
  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<string>>(new Set());
  const [searching, setSearching] = useState(false);
  const [source, setSource] = useState<'ai' | 'tbo' | 'ai_fallback' | ''>('');
  const [error, setError] = useState('');
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 20.5937, lng: 78.9629 });
  const [mapLocations, setMapLocations] = useState<Location[]>([]);

  const parsedStops = useMemo(
    () =>
      stopsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    [stopsInput]
  );

  const totalCost = Array.from(selectedOptionIds).reduce((sum, id) => {
    const opt = options.find((o) => o.id === id);
    return sum + Number(opt?.price || 0);
  }, 0);

  useEffect(() => {
    if (!origin.trim()) return;
    let cancelled = false;
    (async () => {
      const geo = await geocodeLocation(origin.trim());
      if (cancelled || !geo) return;
      setMapCenter({ lat: geo.lat, lng: geo.lng });
    })();
    return () => {
      cancelled = true;
    };
  }, [origin]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const route = [origin.trim(), ...parsedStops];
      if (!route.filter(Boolean).length) {
        if (!cancelled) setMapLocations([]);
        return;
      }
      if (route.length > 1 && route[route.length - 1].toLowerCase() !== route[0].toLowerCase()) {
        route.push(route[0]);
      }
      const resolved: Location[] = [];
      for (let i = 0; i < route.length; i += 1) {
        const place = route[i];
        if (!place) continue;
        const geo = await geocodeLocation(place);
        if (!geo) continue;
        resolved.push({
          id: `route-${i}-${place}`,
          name: place,
          lat: geo.lat,
          lng: geo.lng,
          type: 'attraction',
          day: i + 1,
        });
      }
      if (!cancelled) setMapLocations(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [origin, parsedStops]);

  const handleSearch = async () => {
    if (!origin.trim()) {
      setError('Origin is required.');
      return;
    }
    if (!parsedStops.length) {
      setError('Add at least one stop/destination.');
      return;
    }
    setSearching(true);
    setError('');
    try {
      const result = await planTransport({
        origin: origin.trim(),
        stops: parsedStops,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        mode,
        budget: Number(budget || 0),
      });
      setOptions((result.options || []) as TransportOption[]);
      setSource(result.source as 'ai' | 'tbo' | 'ai_fallback');
      setSelectedOptionIds(new Set());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transport planning failed.';
      setError(message);
    } finally {
      setSearching(false);
    }
  };

  const toggleOption = (id: string) => {
    setSelectedOptionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const proceedToPayment = () => {
    const selected = options.filter((opt) => selectedOptionIds.has(opt.id));
    if (!selected.length) {
      setError('Select at least one transport option.');
      return;
    }
    const payload = {
      selections: selected.map((opt) => ({
        category: 'transport' as const,
        item_id: String(opt.id),
        title: `${opt.provider} - ${opt.segment}`,
        amount: Number(opt.price || 0),
        metadata: {
          segment: opt.segment,
          type: opt.type,
          tbo: opt.tbo || null,
        },
      })),
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

  const modeIcon = {
    flight: <Plane className="w-4 h-4" />,
    train: <Train className="w-4 h-4" />,
    bus: <Bus className="w-4 h-4" />,
    cab: <Car className="w-4 h-4" />,
    mix: <Plane className="w-4 h-4" />,
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="bg-card border-b border-border p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-3xl font-bold text-foreground mb-2">Transport</h1>
            <p className="text-sm text-foreground/70">Ad-hoc route planning from origin to stops and back to origin.</p>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-[360px,1fr] gap-6 items-start">
            <div className="space-y-4 lg:sticky lg:top-4">
              <Card className="overflow-hidden">
                <MapView locations={mapLocations} center={mapCenter} drawRoutes mapMinHeight="260px" />
              </Card>

              <Card className="p-4 space-y-3">
                <div>
                  <label className="text-xs font-semibold text-foreground/60 block mb-1">Origin</label>
                  <Input value={origin} onChange={(e) => setOrigin(e.target.value)} />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground/60 block mb-1">Stops (comma separated)</label>
                  <Input
                    value={stopsInput}
                    onChange={(e) => setStopsInput(e.target.value)}
                    placeholder="Jaipur, Udaipur, Jodhpur"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-foreground/60 block mb-1">Mode</label>
                    <select
                      value={mode}
                      onChange={(e) => setMode(e.target.value as 'flight' | 'train' | 'bus' | 'cab' | 'mix')}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                    >
                      <option value="mix">Mix (Cheapest)</option>
                      <option value="flight">Flight</option>
                      <option value="train">Train</option>
                      <option value="bus">Bus</option>
                      <option value="cab">Cab</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground/60 block mb-1">Budget (INR)</label>
                    <Input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value) || 0)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-foreground/60 block mb-1">Start</label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground/60 block mb-1">End</label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </div>

                <Button onClick={handleSearch} disabled={searching} className="w-full">
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Plan Transport'}
                </Button>

                <p className="text-xs text-foreground/60">
                  Mix mode evaluates bus, train, flight, and cab per leg and picks cost-effective practical options.
                </p>
                <p className="text-xs text-foreground/60">
                  Route preview: origin {'->'} stops {'->'} origin
                </p>

                {source && (
                  <p className="text-xs text-foreground/70">
                    Source: {source === 'tbo' ? 'TBO API' : source === 'ai_fallback' ? 'AI Fallback' : 'AI'}
                  </p>
                )}
                {!!error && <p className="text-sm text-red-600">{error}</p>}
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                {options.length === 0 ? (
                  <Card className="p-8 text-center text-foreground/70">No options yet. Run transport planning.</Card>
                ) : (
                  options.map((option) => (
                    <Card key={option.id} className="p-5">
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-primary">{modeIcon[(option.type as keyof typeof modeIcon) || 'mix']}</span>
                          <div>
                            <h3 className="font-semibold text-foreground">{option.provider}</h3>
                            <p className="text-xs text-foreground/60">{option.segment}</p>
                          </div>
                        </div>
                        <p className="text-2xl font-bold text-primary">INR {Math.round(option.price || 0)}</p>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-foreground/70 mb-3">
                        <div>
                          <p className="text-foreground/50">Departure</p>
                          <p>{option.departure || '-'}</p>
                        </div>
                        <div>
                          <p className="text-foreground/50">Arrival</p>
                          <p>{option.arrival || '-'}</p>
                        </div>
                        <div>
                          <p className="text-foreground/50">Duration</p>
                          <p>{option.duration || '-'}</p>
                        </div>
                        <div>
                          <p className="text-foreground/50">Rating</p>
                          <p>{option.rating ?? '-'}</p>
                        </div>
                      </div>

                      {option.details && <p className="text-xs text-foreground/70 mb-2">{option.details}</p>}
                      {option.source_url && (
                        <a href={option.source_url} target="_blank" rel="noreferrer" className="text-[11px] text-primary mb-2 inline-block">
                          Source
                        </a>
                      )}
                      {option.mix_strategy && (
                        <p className="text-[11px] text-primary mb-3">{option.mix_strategy}</p>
                      )}

                      <Button
                        variant={selectedOptionIds.has(option.id) ? 'default' : 'outline'}
                        onClick={() => toggleOption(option.id)}
                        className="w-full"
                      >
                        {selectedOptionIds.has(option.id) ? 'Selected' : 'Select'}
                      </Button>
                    </Card>
                  ))
                )}
              </div>

              <Card className="p-6 h-fit sticky top-4">
                <h2 className="text-lg font-bold text-foreground mb-4">Summary</h2>
                <p className="text-sm text-foreground/70 mb-2">Origin: {origin || '-'}</p>
                <p className="text-sm text-foreground/70 mb-2">Stops: {parsedStops.length}</p>
                <p className="text-sm text-foreground/70 mb-4">Selected: {selectedOptionIds.size}</p>
                <div className="border-t border-border pt-4 mb-4">
                  <p className="text-sm text-foreground/70">Total</p>
                  <p className="text-3xl font-bold text-primary">INR {Math.round(totalCost)}</p>
                </div>
                <Button className="w-full" disabled={!selectedOptionIds.size} onClick={proceedToPayment}>
                  Proceed to Payment
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

export default function TransportPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex flex-col">
          <Navbar />
          <main className="flex-1 flex items-center justify-center text-sm text-foreground/70">Loading transport...</main>
          <Footer />
        </div>
      }
    >
      <TransportPageContent />
    </Suspense>
  );
}
