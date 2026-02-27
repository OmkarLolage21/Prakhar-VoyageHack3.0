'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getBooking } from '@/lib/api-client';
import { CheckCircle, Loader2 } from 'lucide-react';

interface Booking {
  id: string;
  status: string;
  trip_id?: string;
  currency?: string;
  total_amount?: number;
  confirmation_number?: string;
  selections?: Array<{
    category: 'hotel' | 'transport' | 'activity';
    item_id: string;
    title: string;
    amount: number;
    metadata?: Record<string, any>;
  }>;
  payment?: {
    status?: string;
    method?: string;
    reference?: string;
  };
  created_at?: string;
}

function ConfirmationPageContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get('booking') || '';

  const [booking, setBooking] = useState<Booking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!bookingId) {
        setError('Booking ID not found.');
        setLoading(false);
        return;
      }
      try {
        const data = await getBooking(bookingId);
        if (!cancelled) setBooking(data as Booking);
      } catch {
        if (!cancelled) setError('Unable to load booking confirmation.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const total = useMemo(
    () => Number(booking?.total_amount || (booking?.selections || []).reduce((sum, item) => sum + Number(item.amount || 0), 0)),
    [booking]
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-12">
        {loading ? (
          <Card className="max-w-2xl mx-auto p-8 text-center">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
            <p className="text-sm text-foreground/70">Loading confirmation...</p>
          </Card>
        ) : error ? (
          <Card className="max-w-2xl mx-auto p-8 text-center">
            <p className="text-sm text-red-600 mb-4">{error}</p>
            <Link href="/bookings">
              <Button>Go to Bookings</Button>
            </Link>
          </Card>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            <Card className="p-8 text-center">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h1 className="text-3xl font-bold text-foreground mb-2">Booking Confirmed</h1>
              <p className="text-foreground/70 mb-4">
                Your payment is recorded and itinerary booking is completed.
              </p>
              <div className="inline-block bg-primary/10 border border-primary/20 rounded-lg px-4 py-3">
                <p className="text-xs text-foreground/70 mb-1">Confirmation Number</p>
                <p className="text-xl font-mono font-bold text-primary">
                  {booking?.confirmation_number || 'Pending'}
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-bold text-foreground mb-4">Booking Summary</h2>
              <div className="space-y-3 mb-4">
                {(booking?.selections || []).map((item, index) => (
                  <div key={`${item.item_id}-${index}`} className="flex justify-between gap-3 text-sm">
                    <div>
                      <p className="font-medium text-foreground">{item.title}</p>
                      <p className="text-xs text-foreground/60 capitalize">{item.category}</p>
                    </div>
                    <p className="font-semibold text-foreground">
                      {booking?.currency || 'INR'} {Math.round(item.amount || 0)}
                    </p>
                  </div>
                ))}
              </div>
              <div className="border-t border-border pt-4 flex items-center justify-between">
                <div>
                  <p className="text-xs text-foreground/60">Booking ID</p>
                  <p className="text-sm font-mono">{booking?.id}</p>
                </div>
                <p className="text-2xl font-bold text-primary">
                  {(booking?.currency || 'INR')} {Math.round(total)}
                </p>
              </div>
            </Card>

            <div className="flex gap-2 justify-center">
              <Link href="/bookings">
                <Button>View Bookings</Button>
              </Link>
              <Link href="/trips">
                <Button variant="outline">My Trips</Button>
              </Link>
              <Link href="/planner">
                <Button variant="outline">AI Planner</Button>
              </Link>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex flex-col">
          <Navbar />
          <main className="flex-1 container mx-auto px-4 py-12">
            <Card className="max-w-2xl mx-auto p-8 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p className="text-sm text-foreground/70">Loading confirmation...</p>
            </Card>
          </main>
          <Footer />
        </div>
      }
    >
      <ConfirmationPageContent />
    </Suspense>
  );
}
