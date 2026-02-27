'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getHotelDetails } from '@/lib/api-client';
import { Loader2, MapPin, Star } from 'lucide-react';

interface HotelDetail {
  id: string;
  name: string;
  location: string;
  rating?: number;
  reviews?: number;
  description?: string;
  price?: number;
  amenities?: string[];
  sustainabilityScore?: number;
  images?: string[];
  room_types?: Array<{ name: string; price: number; capacity: number; description: string }>;
  policies?: {
    check_in?: string;
    check_out?: string;
    cancellation?: string;
    guest_services?: string[];
  };
}

function HotelDetailPageContent() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const hotelId = String(params.id || '');
  const tripId = searchParams.get('trip') || '';
  const location = searchParams.get('location') || '';
  const hotelName = searchParams.get('name') || '';
  const checkInParam = searchParams.get('checkIn') || '';
  const checkOutParam = searchParams.get('checkOut') || '';
  const guestsParam = Math.max(1, Number(searchParams.get('guests') || 1));

  const [detail, setDetail] = useState<HotelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<{ name: string; price: number; capacity: number; description: string } | null>(null);
  const [checkInDate, setCheckInDate] = useState(checkInParam);
  const [checkOutDate, setCheckOutDate] = useState(checkOutParam);
  const [guests, setGuests] = useState(guestsParam);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hotelId || !tripId) {
        setError('Missing trip/hotel context.');
        setLoading(false);
        return;
      }
      try {
        const data = await getHotelDetails(hotelId, {
          trip_id: tripId,
          location: location || undefined,
          hotel_name: hotelName || undefined,
        });
        if (cancelled) return;
        setDetail(data as HotelDetail);
        const room = (data.room_types || [])[0] || null;
        setSelectedRoom(room);
        if (room?.capacity) {
          setGuests(Math.min(room.capacity, 2));
        }
      } catch {
        if (!cancelled) setError('Failed to load hotel details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hotelId, tripId, location, hotelName]);

  const nights = useMemo(() => {
    if (!checkInDate || !checkOutDate) return 1;
    const value = Math.ceil((new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, value);
  }, [checkInDate, checkOutDate]);
  const pricePerNight = Number(selectedRoom?.price || detail?.price || 0);
  const total = Math.round(pricePerNight * nights * 1.12);

  const handleBook = () => {
    if (!detail) return;
    const payload = {
      trip_id: tripId,
      selections: [
        {
          category: 'hotel' as const,
          item_id: String(detail.id),
          title: `${detail.name} (${detail.location})`,
          amount: Number(pricePerNight || 0),
          metadata: {
            location: detail.location,
            check_in: checkInDate || undefined,
            check_out: checkOutDate || undefined,
            room_type: selectedRoom?.name || '',
            guests,
          },
        },
      ],
      currency: 'INR',
    };
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('voyage_checkout_payload', JSON.stringify(payload));
    }
    router.push(`/payment?trip=${encodeURIComponent(tripId)}`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1">
        {loading ? (
          <div className="max-w-6xl mx-auto p-8 text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            <p className="text-sm text-foreground/70">Loading hotel details...</p>
          </div>
        ) : error || !detail ? (
          <div className="max-w-6xl mx-auto p-8 text-center">
            <p className="text-sm text-red-600 mb-4">{error || 'Hotel not found.'}</p>
            <Link href={`/hotels?trip=${encodeURIComponent(tripId)}${location ? `&destination=${encodeURIComponent(location)}` : ''}`}>
              <Button>Back to Hotels</Button>
            </Link>
          </div>
        ) : (
          <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card className="p-6">
                <h1 className="text-3xl font-bold text-foreground">{detail.name}</h1>
                <p className="text-sm text-foreground/70 mt-2 flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {detail.location}
                </p>
                <div className="text-sm text-foreground/70 mt-2 flex items-center gap-2">
                  <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  {detail.rating ?? 4.0} ({detail.reviews ?? 0} reviews)
                </div>
              </Card>

              <div className="grid grid-cols-2 gap-3">
                {(detail.images || []).slice(0, 4).map((image, i) => (
                  <img key={`${image}-${i}`} src={image} alt={`${detail.name} ${i + 1}`} className="w-full h-44 object-cover rounded-lg border border-border" />
                ))}
              </div>

              <Card className="p-6">
                <h2 className="text-xl font-bold text-foreground mb-3">About</h2>
                <p className="text-sm text-foreground/80 mb-4">{detail.description}</p>
                {detail.amenities && detail.amenities.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {detail.amenities.map((amenity) => (
                      <span key={amenity} className="text-xs bg-muted px-2 py-1 rounded">{amenity}</span>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="p-6">
                <h2 className="text-xl font-bold text-foreground mb-3">Policies</h2>
                <p className="text-sm text-foreground/70">Check-in: {detail.policies?.check_in || '-'}</p>
                <p className="text-sm text-foreground/70">Check-out: {detail.policies?.check_out || '-'}</p>
                <p className="text-sm text-foreground/70 mt-2">{detail.policies?.cancellation || '-'}</p>
              </Card>
            </div>

            <div>
              <Card className="p-6 sticky top-20">
                <p className="text-sm text-foreground/60">Price from</p>
                <p className="text-3xl font-bold text-primary mb-4">INR {Math.round(pricePerNight || 0)}</p>

                <div className="space-y-3 mb-4">
                  <div>
                    <label className="text-xs font-semibold text-foreground/70 block mb-1">Check-in</label>
                    <input type="date" value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground/70 block mb-1">Check-out</label>
                    <input type="date" value={checkOutDate} onChange={(e) => setCheckOutDate(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground/70 block mb-1">Guests</label>
                    <input
                      type="number"
                      min={1}
                      max={selectedRoom?.capacity || 4}
                      value={guests}
                      onChange={(e) => setGuests(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                    />
                  </div>
                  {detail.room_types && detail.room_types.length > 0 && (
                    <div>
                      <label className="text-xs font-semibold text-foreground/70 block mb-1">Room Type</label>
                      <select
                        value={selectedRoom?.name || ''}
                        onChange={(e) => {
                          const room = detail.room_types?.find((r) => r.name === e.target.value) || null;
                          setSelectedRoom(room);
                        }}
                        className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                      >
                        {detail.room_types.map((room) => (
                          <option key={room.name} value={room.name}>
                            {room.name} - INR {Math.round(room.price)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-3 mb-4">
                  <p className="text-sm text-foreground/70">Total ({nights} night{nights > 1 ? 's' : ''})</p>
                  <p className="text-2xl font-bold text-primary">INR {Math.round(total)}</p>
                </div>

                <Button onClick={handleBook} className="w-full mb-2">Book & Pay</Button>
                <Link
                  href={`/hotels?trip=${encodeURIComponent(tripId)}${location ? `&destination=${encodeURIComponent(location)}` : ''}`}
                  className="block"
                >
                  <Button variant="outline" className="w-full">Back to Hotels</Button>
                </Link>
              </Card>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

export default function HotelDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex flex-col">
          <Navbar />
          <main className="flex-1 flex items-center justify-center text-sm text-foreground/70">Loading hotel...</main>
          <Footer />
        </div>
      }
    >
      <HotelDetailPageContent />
    </Suspense>
  );
}
