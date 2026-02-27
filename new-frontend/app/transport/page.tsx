'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listTrips, planTransport, type TripDTO } from '@/lib/api-client';
import { Bus, Car, Loader2, Plane, Train } from 'lucide-react';
import Link from 'next/link';

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

function tripStops(trip: TripDTO | null): string[] {
  if (!trip) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  (trip.itinerary || []).forEach((day: any) => {
    (day.activities || []).forEach((activity: any) => {
      const loc = String(activity.location || '').trim();
      if (loc && !seen.has(loc.toLowerCase())) {
        seen.add(loc.toLowerCase());
        out.push(loc);
      }
    });
  });
  if (!out.length && trip.destination) out.push(trip.destination);
  return out;
}

function TransportPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tripParam = searchParams.get('trip');

  const [trips, setTrips] = useState<TripDTO[]>([]);
  const [selectedTripId, setSelectedTripId] = useState<string>(tripParam || '');
  const [origin, setOrigin] = useState('Delhi');
  const [stopsInput, setStopsInput] = useState('');
  const [mode, setMode] = useState<'flight' | 'train' | 'bus' | 'cab' | 'mix'>('mix');
  const [budget, setBudget] = useState(30000);
  const [options, setOptions] = useState<TransportOption[]>([]);
  const [selectedOptionIds, setSelectedOptionIds] = useState<Set<string>>(new Set());
  const [loadingTrips, setLoadingTrips] = useState(false);
  const [searching, setSearching] = useState(false);
  const [source, setSource] = useState<'ai' | 'tbo' | 'ai_fallback' | ''>('');
  const [error, setError] = useState('');

  const selectedTrip = useMemo(
    () => trips.find((trip) => trip.id === selectedTripId) || null,
    [trips, selectedTripId]
  );
  const itineraryStops = useMemo(() => tripStops(selectedTrip), [selectedTrip]);

  useEffect(() => {
    let cancelled = false;
    setLoadingTrips(true);
    (async () => {
      try {
        const data = await listTrips();
        if (cancelled) return;
        setTrips(data);
        const trip = data.find((t) => t.id === (tripParam || selectedTripId)) || data[0] || null;
        if (!trip) return;
        setSelectedTripId(trip.id);
        setOrigin(trip.origin || 'Delhi');
        setBudget(Number(trip.budget || 30000));
      } catch {
        if (!cancelled) setError('Unable to load trips.');
      } finally {
        if (!cancelled) setLoadingTrips(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripParam]);

  useEffect(() => {
    if (!itineraryStops.length) return;
    setStopsInput(itineraryStops.join(', '));
  }, [itineraryStops]);

  const parsedStops = stopsInput
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const totalCost = Array.from(selectedOptionIds).reduce((sum, id) => {
    const opt = options.find((o) => o.id === id);
    return sum + Number(opt?.price || 0);
  }, 0);

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
        trip_id: selectedTripId || undefined,
        origin: origin.trim(),
        stops: parsedStops,
        start_date: selectedTrip?.start_date || undefined,
        end_date: selectedTrip?.end_date || undefined,
        mode,
        budget: Number(budget || 0),
      });
      setOptions((result.options || []) as TransportOption[]);
      setSource(result.source);
      setSelectedOptionIds(new Set());
    } catch {
      setError('Transport planning failed.');
    } finally {
      setSearching(false);
    }
  };

  const toggleOption = (id: string) => {
    const next = new Set(selectedOptionIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedOptionIds(next);
  };

  const proceedToPayment = () => {
    const selected = options.filter((opt) => selectedOptionIds.has(opt.id));
    if (!selected.length) {
      setError('Select at least one transport option.');
      return;
    }
    const payload = {
      trip_id: selectedTripId || undefined,
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
    router.push(selectedTripId ? `/payment?trip=${encodeURIComponent(selectedTripId)}` : '/payment');
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
      <main className="flex-1 container mx-auto px-4 py-8">
        <Card className="p-6 mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Transport Planner</h1>
          <p className="text-sm text-foreground/70 mb-6">
            Plan realistic transfers from origin to itinerary stops and automatic return to origin.
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
                {!trips.length && <option value="">No trips</option>}
                {trips.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground/60 block mb-1">Origin</label>
              <Input value={origin} onChange={(e) => setOrigin(e.target.value)} />
            </div>

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

            <div className="flex items-end">
              <Button onClick={handleSearch} disabled={searching} className="w-full">
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Plan Transport'}
              </Button>
            </div>
          </div>

          <div className="mt-3">
            <label className="text-xs font-semibold text-foreground/60 block mb-1">Stops (comma separated)</label>
            <Input
              value={stopsInput}
              onChange={(e) => setStopsInput(e.target.value)}
              placeholder="Jaipur, Udaipur, Jodhpur"
            />
            <p className="text-xs text-foreground/60 mt-2">
              Mix mode = per-leg cheapest realistic option among bus/train/flight/cab with time-cost balance.
            </p>
            {selectedTrip?.start_date && selectedTrip?.end_date && (
              <p className="text-xs text-foreground/60 mt-1">
                Travel window used for planning: {selectedTrip.start_date} to {selectedTrip.end_date}
              </p>
            )}
            {source && (
              <p className="text-xs text-foreground/70 mt-2">
                Source: {source === 'tbo' ? 'TBO API' : source === 'ai_fallback' ? 'AI Fallback' : 'AI'}
              </p>
            )}
            {!!error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </div>
        </Card>

        {!trips.length && !loadingTrips ? (
          <Card className="p-8 text-center">
            <p className="text-foreground/70 mb-4">No trips found. Create one first.</p>
            <Link href="/planner">
              <Button>Open Planner</Button>
            </Link>
          </Card>
        ) : (
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
              <p className="text-sm text-foreground/70 mb-2">Origin: {origin}</p>
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
        )}
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
