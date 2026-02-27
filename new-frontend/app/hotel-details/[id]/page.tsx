'use client';

import { Navbar } from '@/components/navbar';
import { Footer } from '@/components/footer';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Star, MapPin, CheckCircle, Wifi, UtensilsCrossed, Dumbbell, Waves, Shield } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

interface HotelDetails {
  id: string;
  name: string;
  location: string;
  rating: number;
  reviews: number;
  bookings: number;
  price: number;
  originalPrice: number;
  images: string[];
  description: string;
  amenities: { icon: any; name: string }[];
  reviews_list: Array<{ author: string; date: string; rating: number; text: string }>;
}

const hotelData: Record<string, HotelDetails> = {
  '1': {
    id: '1',
    name: 'Luxury Grand Palace Hotel',
    location: 'Downtown Center, Paris',
    rating: 4.9,
    reviews: 2340,
    bookings: 5420,
    price: 450,
    originalPrice: 520,
    images: [
      'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=800&h=600&fit=crop',
      'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1578683078519-a680066cff91?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1611432579699-484f7990f081?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=400&h=300&fit=crop',
    ],
    description:
      'Experience luxury at its finest in our iconic 5-star hotel. Located in the heart of downtown, the Grand Palace offers world-class amenities, exceptional service, and unforgettable experiences. Each room features premium bedding, marble bathrooms, and stunning city views.',
    amenities: [
      { icon: Wifi, name: 'WiFi' },
      { icon: UtensilsCrossed, name: 'Breakfast' },
      { icon: Dumbbell, name: 'Gym' },
      { icon: Waves, name: 'Pool' },
      { icon: Shield, name: 'Spa' },
      { icon: null, name: 'Valet Parking' },
    ],
    reviews_list: [
      {
        author: 'Sarah Johnson',
        date: 'March 10, 2024',
        rating: 5,
        text: 'Absolutely amazing! The service was impeccable and the location is perfect. Will definitely come back!',
      },
      {
        author: 'Michael Chen',
        date: 'March 5, 2024',
        rating: 5,
        text: 'Luxury at its best. The room was spacious and comfortable, and the staff went above and beyond.',
      },
      {
        author: 'Emma Wilson',
        date: 'February 28, 2024',
        rating: 4,
        text: 'Great hotel with excellent amenities. Only minor complaint was the breakfast being a bit crowded.',
      },
    ],
  },
};

export default function HotelDetailsPage({ params }: { params: { id: string } }) {
  const hotel = hotelData[params.id] || hotelData['1'];
  const [selectedImage, setSelectedImage] = useState(0);
  const [checkIn, setCheckIn] = useState('2024-03-15');
  const [checkOut, setCheckOut] = useState('2024-03-17');
  const [guests, setGuests] = useState(1);
  const [rooms, setRooms] = useState(1);

  return (
    <>
      <Navbar />
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Image Gallery & Details */}
            <div className="lg:col-span-2 space-y-6">
              {/* Main Image */}
              <div className="relative w-full h-96 rounded-lg overflow-hidden bg-gray-100">
                <Image
                  src={hotel.images[selectedImage]}
                  alt={`${hotel.name} - Image ${selectedImage + 1}`}
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute bottom-4 left-4 bg-black/60 text-white px-3 py-1 rounded text-sm">
                  {selectedImage + 1} / {hotel.images.length}
                </div>
              </div>

              {/* Thumbnail Gallery */}
              <div className="flex gap-2 overflow-x-auto">
                {hotel.images.map((image, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedImage(i)}
                    className={`relative w-24 h-20 rounded flex-shrink-0 overflow-hidden border-2 transition ${
                      selectedImage === i ? 'border-primary' : 'border-transparent'
                    }`}
                  >
                    <Image
                      src={image}
                      alt={`Thumbnail ${i + 1}`}
                      fill
                      className="object-cover"
                    />
                  </button>
                ))}
              </div>

              {/* Hotel Name & Location */}
              <div>
                <h1 className="text-3xl font-bold text-foreground mb-2">{hotel.name}</h1>
                <div className="flex items-center gap-2 text-foreground/70 mb-4">
                  <MapPin className="w-5 h-5" />
                  <span>{hotel.location}</span>
                </div>

                {/* Rating & Reviews */}
                <div className="flex items-center gap-6 mb-6">
                  <div className="flex items-center gap-2">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-5 h-5 ${
                          i < Math.floor(hotel.rating)
                            ? 'fill-orange-400 text-orange-400'
                            : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                  <div>
                    <span className="font-bold text-lg">{hotel.rating}</span>
                    <span className="text-foreground/70 ml-2">({hotel.reviews.toLocaleString()} reviews)</span>
                  </div>
                  <div className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full flex items-center gap-1 text-sm font-medium">
                    <CheckCircle className="w-4 h-4" />
                    98% Trusted
                  </div>
                  <div className="text-foreground/70 text-sm">
                    {hotel.bookings.toLocaleString()} bookings
                  </div>
                </div>
              </div>

              {/* About */}
              <div>
                <h2 className="text-xl font-bold text-foreground mb-3">About</h2>
                <p className="text-foreground/70 leading-relaxed">{hotel.description}</p>
              </div>

              {/* Amenities */}
              <div>
                <h2 className="text-xl font-bold text-foreground mb-4">Amenities</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {hotel.amenities.map((amenity, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
                      {amenity.icon ? (
                        <amenity.icon className="w-5 h-5 text-primary" />
                      ) : (
                        <span className="text-xl">🅿️</span>
                      )}
                      <span className="text-sm font-medium text-foreground">{amenity.name}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Reviews */}
              <div>
                <h2 className="text-xl font-bold text-foreground mb-4">Guest Reviews</h2>
                <div className="space-y-4">
                  {hotel.reviews_list.map((review, i) => (
                    <Card key={i} className="p-4 bg-gray-50">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-semibold text-foreground">{review.author}</p>
                          <p className="text-xs text-foreground/70">{review.date}</p>
                        </div>
                        <div className="flex gap-1">
                          {[...Array(5)].map((_, j) => (
                            <Star
                              key={j}
                              className={`w-4 h-4 ${
                                j < review.rating
                                  ? 'fill-orange-400 text-orange-400'
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-foreground/80 text-sm">{review.text}</p>
                    </Card>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Booking Panel */}
            <div className="lg:col-span-1">
              <Card className="p-6 sticky top-20 bg-blue-50 border-blue-200">
                <h3 className="text-lg font-bold text-foreground mb-4">Your Booking</h3>

                {/* Tabs */}
                <div className="flex gap-2 mb-6 border-b border-blue-200">
                  <button className="pb-2 px-2 font-semibold text-foreground border-b-2 border-primary">
                    Details
                  </button>
                  <button className="pb-2 px-2 font-semibold text-foreground/50">Summary</button>
                </div>

                {/* Check-in/Check-out */}
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                      📅 Check-in
                    </label>
                    <Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-foreground flex items-center gap-2 mb-2">
                      📅 Check-out
                    </label>
                    <Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
                  </div>
                </div>

                {/* Guests & Rooms */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                  <div>
                    <label className="text-sm font-semibold text-foreground mb-2 block">
                      👥 Guests
                    </label>
                    <select
                      value={guests}
                      onChange={(e) => setGuests(Number(e.target.value))}
                      className="w-full border border-border rounded px-3 py-2"
                    >
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-foreground mb-2 block">Rooms</label>
                    <select
                      value={rooms}
                      onChange={(e) => setRooms(Number(e.target.value))}
                      className="w-full border border-border rounded px-3 py-2"
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Booking Button */}
                <Button className="w-full mb-4 bg-blue-600 hover:bg-blue-700 text-white">
                  Proceed to Checkout
                </Button>

                {/* Guarantee Banner */}
                <Card className="p-3 bg-green-50 border-green-200 mb-6">
                  <div className="flex gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-green-700">
                      <span className="font-semibold">Free cancellation</span> up to 24 hours before check-in
                    </p>
                  </div>
                </Card>

                {/* Pricing */}
                <div className="border-t border-blue-200 pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground/70">Price per night</span>
                    <span className="font-semibold">${hotel.price}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-foreground/70">2 nights</span>
                    <span className="font-semibold">${hotel.price * 2}</span>
                  </div>
                  <div className="flex justify-between text-sm text-orange-600">
                    <span>Discount (10%)</span>
                    <span>-${Math.floor((hotel.price * 2 * 0.1))}</span>
                  </div>
                  <div className="border-t border-blue-200 pt-2 mt-2 flex justify-between font-bold">
                    <span>Total</span>
                    <span className="text-lg text-primary">${Math.floor(hotel.price * 2 * 0.9)}</span>
                  </div>
                </div>

                {/* Similar Hotels */}
                <div className="mt-8 pt-6 border-t border-blue-200">
                  <h4 className="font-bold text-foreground mb-3">Similar Hotels</h4>
                  <div className="space-y-3">
                    {[
                      { name: 'Boutique Inn Central', price: 180, rating: 4.7 },
                      { name: 'Modern City Hotel', price: 120, rating: 4.5 },
                    ].map((h, i) => (
                      <div key={i} className="text-sm">
                        <p className="font-medium text-foreground">{h.name}</p>
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex gap-1">
                            {[...Array(5)].map((_, j) => (
                              <Star
                                key={j}
                                className={`w-3 h-3 ${
                                  j < Math.floor(h.rating)
                                    ? 'fill-orange-400 text-orange-400'
                                    : 'text-gray-300'
                                }`}
                              />
                            ))}
                          </div>
                          <span className="font-semibold">${h.price}/night</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
