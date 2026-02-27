'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { confirmPayment, createCheckout } from '@/lib/api-client';
import { Loader2, Lock } from 'lucide-react';
import Link from 'next/link';

type CheckoutPayload = {
  trip_id?: string;
  selections: Array<{
    category: 'hotel' | 'transport' | 'activity';
    item_id: string;
    title: string;
    amount: number;
    metadata?: Record<string, any>;
  }>;
  currency?: string;
};

export default function PaymentPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<CheckoutPayload | null>(null);
  const [bookingId, setBookingId] = useState<string>('');
  const [currency, setCurrency] = useState<string>('INR');
  const [total, setTotal] = useState<number>(0);
  const [loadingCheckout, setLoadingCheckout] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [paymentRef, setPaymentRef] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem('voyage_checkout_payload') : null;
        if (!raw) {
          if (mounted) setError('No pending checkout found. Start booking from Hotels or Transport.');
          return;
        }
        const parsed = JSON.parse(raw) as CheckoutPayload;
        if (!parsed.selections || parsed.selections.length === 0) {
          if (mounted) setError('Checkout payload is empty.');
          return;
        }
        if (mounted) setPayload(parsed);

        const checkout = await createCheckout({
          trip_id: parsed.trip_id,
          selections: parsed.selections,
          currency: parsed.currency || 'INR',
        });
        if (!mounted) return;
        setBookingId(checkout.booking_id);
        setCurrency(checkout.currency || parsed.currency || 'INR');
        setTotal(Number(checkout.total_amount || 0));
      } catch {
        if (mounted) setError('Unable to initialize checkout.');
      } finally {
        if (mounted) setLoadingCheckout(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const fallbackTotal = useMemo(
    () => (payload?.selections || []).reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [payload]
  );

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingId) {
      setError('Booking is not ready yet.');
      return;
    }
    setIsProcessing(true);
    setError('');
    try {
      await confirmPayment(bookingId, {
        payment_method: paymentMethod,
        payment_reference: paymentRef || '',
      });
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem('voyage_checkout_payload');
      }
      router.push(`/confirmation?booking=${encodeURIComponent(bookingId)}`);
    } catch {
      setError('Payment confirmation failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 bg-muted/30 p-4">
        <div className="max-w-6xl mx-auto py-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Payment</h1>
          <p className="text-foreground/70 mb-8">Mock payment is supported by backend configuration.</p>

          {loadingCheckout ? (
            <Card className="p-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
              <p className="text-sm text-foreground/70">Initializing checkout...</p>
            </Card>
          ) : error ? (
            <Card className="p-8 text-center">
              <p className="text-sm text-red-600 mb-4">{error}</p>
              <div className="flex items-center justify-center gap-2">
                <Link href="/hotels">
                  <Button variant="outline">Go to Hotels</Button>
                </Link>
                <Link href="/transport">
                  <Button variant="outline">Go to Transport</Button>
                </Link>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2">
                <Card className="p-8">
                  <form onSubmit={handleConfirmPayment} className="space-y-5">
                    <div>
                      <h2 className="text-xl font-bold text-foreground mb-3 flex items-center gap-2">
                        <Lock className="w-5 h-5 text-primary" />
                        Payment Details
                      </h2>
                      <p className="text-sm text-foreground/70">
                        `MOCK_PAYMENT=true` confirms booking without charging a real card.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">Payment Method</label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                      >
                        <option value="card">Card</option>
                        <option value="upi">UPI</option>
                        <option value="netbanking">Net Banking</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">Reference (Optional)</label>
                      <Input
                        value={paymentRef}
                        onChange={(e) => setPaymentRef(e.target.value)}
                        placeholder="txn-12345"
                      />
                    </div>

                    <Button type="submit" disabled={isProcessing || !bookingId} size="lg" className="w-full gap-2">
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Confirming...
                        </>
                      ) : (
                        <>Pay {currency} {Math.round(total || fallbackTotal)}</>
                      )}
                    </Button>
                  </form>
                </Card>
              </div>

              <div>
                <Card className="p-6 h-fit sticky top-4">
                  <h2 className="text-xl font-bold text-foreground mb-4">Order Summary</h2>
                  <div className="space-y-3 mb-4">
                    {(payload?.selections || []).map((item, i) => (
                      <div key={`${item.item_id}-${i}`} className="flex justify-between gap-2 text-sm">
                        <span className="text-foreground/70">{item.title}</span>
                        <span className="font-semibold text-foreground">
                          {currency} {Math.round(item.amount || 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="border-t border-border pt-4">
                    <p className="text-xs text-foreground/60 mb-1">Booking ID</p>
                    <p className="text-sm font-mono mb-4">{bookingId || 'Pending...'}</p>
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-foreground">Total</span>
                      <span className="text-2xl font-bold text-primary">
                        {currency} {Math.round(total || fallbackTotal)}
                      </span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
