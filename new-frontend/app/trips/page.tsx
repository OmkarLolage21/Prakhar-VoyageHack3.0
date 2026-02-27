'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { deleteTrip, generateItinerary, listTrips, type TripDTO } from '@/lib/api-client';
import { Calendar, MapPin, Trash2, X } from 'lucide-react';

function dayCount(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.max(1, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

export default function TripsPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    origin: 'Delhi',
    destination: '',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    budget: 30000,
  });

  const refreshTrips = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listTrips();
      setTrips(data);
    } catch {
      setError('Unable to load trips.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshTrips();
  }, []);

  const upcomingTrips = useMemo(
    () => trips.filter((trip) => new Date(trip.start_date) >= new Date()).length,
    [trips]
  );
  const pastTrips = useMemo(
    () => trips.filter((trip) => new Date(trip.end_date) < new Date()).length,
    [trips]
  );

  const handleDeleteTrip = async (id: string) => {
    const ok = typeof window !== 'undefined' ? window.confirm('Delete this trip?') : true;
    if (!ok) return;
    try {
      await deleteTrip(id);
      await refreshTrips();
    } catch {
      setError('Failed to delete trip.');
    }
  };

  const handleCreateTrip = async () => {
    if (!formData.destination.trim()) {
      setError('Destination is required.');
      return;
    }
    if (!formData.origin.trim()) {
      setError('Origin is required.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const days = dayCount(formData.startDate, formData.endDate);
      const result = await generateItinerary({
        destination: formData.destination.trim(),
        origin: formData.origin.trim(),
        days,
        budget: Number(formData.budget || 0),
        start_date: formData.startDate,
        end_date: formData.endDate,
        preferences: [],
      });
      setShowCreateModal(false);
      setFormData({
        name: '',
        origin: 'Delhi',
        destination: '',
        startDate: new Date().toISOString().slice(0, 10),
        endDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        budget: 30000,
      });
      await refreshTrips();
      router.push(`/planner?trip=${encodeURIComponent(result.trip_id)}`);
    } catch {
      setError('Failed to create trip.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="bg-card border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-4xl font-bold text-foreground mb-2">My Trips</h1>
                <p className="text-foreground/70">Saved trips from chat and itinerary planner.</p>
              </div>
              <Button size="lg" onClick={() => setShowCreateModal(true)}>
                New Trip
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <p className="text-sm text-foreground/70 mb-1">Total</p>
                <p className="text-3xl font-bold text-primary">{trips.length}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-foreground/70 mb-1">Upcoming</p>
                <p className="text-3xl font-bold text-orange-600">{upcomingTrips}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-foreground/70 mb-1">Past</p>
                <p className="text-3xl font-bold text-green-600">{pastTrips}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-foreground/70 mb-1">Budget Sum</p>
                <p className="text-3xl font-bold text-primary">
                  INR {Math.round(trips.reduce((sum, trip) => sum + Number(trip.budget || 0), 0))}
                </p>
              </Card>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <Card className="p-8 text-center text-sm text-foreground/70">Loading trips...</Card>
          ) : error ? (
            <Card className="p-8 text-center text-sm text-red-600">{error}</Card>
          ) : trips.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-foreground/70 mb-4">No trips yet.</p>
              <Button onClick={() => setShowCreateModal(true)}>Create First Trip</Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {trips.map((trip) => {
                const start = new Date(trip.start_date);
                const end = new Date(trip.end_date);
                const duration = dayCount(trip.start_date, trip.end_date);
                return (
                  <Card key={trip.id} className="p-5 flex flex-col">
                    <h3 className="text-lg font-bold text-foreground mb-2">{trip.name}</h3>
                    <div className="space-y-2 text-sm text-foreground/70 mb-4 flex-1">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        {trip.origin || 'Origin'} {'->'} {trip.destination || 'Destination'}
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4" />
                        {start.toLocaleDateString()} - {end.toLocaleDateString()}
                      </div>
                      <p>{duration} day(s) • Budget INR {Math.round(Number(trip.budget || 0))}</p>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/planner?trip=${encodeURIComponent(trip.id)}`} className="flex-1">
                        <Button className="w-full">Edit Trip</Button>
                      </Link>
                      <Link href={`/hotels?trip=${encodeURIComponent(trip.id)}`}>
                        <Button variant="outline">Hotels</Button>
                      </Link>
                      <Button variant="destructive" size="icon" onClick={() => handleDeleteTrip(trip.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-foreground">Create Trip</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-foreground/60 hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-sm font-semibold text-foreground block mb-1">Trip Name (Optional)</label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Rajasthan Adventure"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-foreground block mb-1">Origin</label>
                  <Input
                    value={formData.origin}
                    onChange={(e) => setFormData((prev) => ({ ...prev, origin: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-foreground block mb-1">Destination</label>
                  <Input
                    value={formData.destination}
                    onChange={(e) => setFormData((prev) => ({ ...prev, destination: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-foreground block mb-1">Start Date</label>
                  <Input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-foreground block mb-1">End Date</label>
                  <Input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-foreground block mb-1">Budget (INR)</label>
                <Input
                  type="number"
                  value={formData.budget}
                  onChange={(e) => setFormData((prev) => ({ ...prev, budget: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleCreateTrip} disabled={creating}>
                {creating ? 'Creating...' : 'Create & Open Planner'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      <Footer />
    </div>
  );
}
