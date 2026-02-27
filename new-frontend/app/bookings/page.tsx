'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { listBookings } from '@/lib/api-client';

interface Booking {
  id: string;
  trip_id?: string;
  status: 'pending' | 'confirmed' | 'cancelled' | string;
  currency?: string;
  total_amount?: number;
  confirmation_number?: string;
  created_at?: string;
  selections?: Array<{
    category: 'hotel' | 'transport' | 'activity';
    item_id: string;
    title: string;
    amount: number;
  }>;
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'pending'>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listBookings();
        if (!cancelled) setBookings(data as Booking[]);
      } catch {
        if (!cancelled) setError('Unable to load bookings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (filter === 'all') return bookings;
    return bookings.filter((booking) => booking.status === filter);
  }, [bookings, filter]);

  const totalSpent = useMemo(
    () => bookings.reduce((sum, booking) => sum + Number(booking.total_amount || 0), 0),
    [bookings]
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="bg-card border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h1 className="text-4xl font-bold text-foreground mb-6">My Bookings</h1>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <p className="text-sm text-foreground/70 mb-1">Total</p>
                <p className="text-3xl font-bold text-primary">{bookings.length}</p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-foreground/70 mb-1">Confirmed</p>
                <p className="text-3xl font-bold text-green-600">
                  {bookings.filter((b) => b.status === 'confirmed').length}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-foreground/70 mb-1">Pending</p>
                <p className="text-3xl font-bold text-orange-600">
                  {bookings.filter((b) => b.status === 'pending').length}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-sm text-foreground/70 mb-1">Total Spent</p>
                <p className="text-3xl font-bold text-primary">INR {Math.round(totalSpent)}</p>
              </Card>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex gap-2 mb-6">
            {(['all', 'confirmed', 'pending'] as const).map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`px-4 py-2 rounded-lg font-medium transition ${
                  filter === value ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'
                }`}
              >
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>

          {loading ? (
            <Card className="p-8 text-center text-sm text-foreground/70">Loading bookings...</Card>
          ) : error ? (
            <Card className="p-8 text-center text-sm text-red-600">{error}</Card>
          ) : filtered.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-foreground/70 mb-4">No bookings found.</p>
              <Link href="/hotels">
                <Button>Book Hotels</Button>
              </Link>
            </Card>
          ) : (
            <div className="space-y-4">
              {filtered.map((booking) => (
                <Card key={booking.id} className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-2">
                      <h2 className="font-bold text-foreground mb-2">Booking {booking.id}</h2>
                      <div className="space-y-1 text-sm text-foreground/70 mb-3">
                        <p>Status: <span className="font-semibold text-foreground capitalize">{booking.status}</span></p>
                        <p>Trip: {booking.trip_id || '-'}</p>
                        <p>Created: {booking.created_at ? new Date(booking.created_at).toLocaleString() : '-'}</p>
                        <p>Confirmation: {booking.confirmation_number || '-'}</p>
                      </div>
                      <div className="space-y-2">
                        {(booking.selections || []).map((item, index) => (
                          <div key={`${item.item_id}-${index}`} className="text-sm flex justify-between gap-2">
                            <span className="text-foreground/80">{item.title}</span>
                            <span className="font-semibold text-foreground">
                              {(booking.currency || 'INR')} {Math.round(item.amount || 0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col justify-between items-end">
                      <div className="text-right">
                        <p className="text-sm text-foreground/60">Total</p>
                        <p className="text-3xl font-bold text-primary">
                          {(booking.currency || 'INR')} {Math.round(booking.total_amount || 0)}
                        </p>
                      </div>
                      <Link href={`/confirmation?booking=${encodeURIComponent(booking.id)}`}>
                        <Button variant="outline">View Confirmation</Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
