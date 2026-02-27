'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Star, MapPin, Leaf, Heart } from 'lucide-react';
import { useState } from 'react';

export interface Hotel {
  id: string;
  name: string;
  location: string;
  rating: number;
  reviews: number;
  pricePerNight: number;
  image: string;
  amenities: string[];
  sustainabilityScore?: number;
  isSaved?: boolean;
}

interface HotelListProps {
  hotels: Hotel[];
  isLoading?: boolean;
}

export function HotelList({ hotels, isLoading = false }: HotelListProps) {
  const [savedHotels, setSavedHotels] = useState<Set<string>>(new Set());

  const toggleSave = (hotelId: string, e: React.MouseEvent) => {
    e.preventDefault();
    setSavedHotels((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(hotelId)) {
        newSet.delete(hotelId);
      } else {
        newSet.add(hotelId);
      }
      return newSet;
    });
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="overflow-hidden animate-pulse">
            <div className="h-48 bg-muted" />
            <div className="p-4 space-y-3">
              <div className="h-4 bg-muted w-3/4" />
              <div className="h-4 bg-muted w-1/2" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (hotels.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-foreground/60 mb-4">No hotels found matching your criteria.</p>
        <Button variant="outline">Clear Filters</Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {hotels.map((hotel) => (
        <Link key={hotel.id} href={`/hotel/${hotel.id}`}>
          <Card className="overflow-hidden hover:shadow-lg transition cursor-pointer h-full flex flex-col">
            {/* Image */}
            <div className="relative h-48 bg-gradient-to-br from-primary/10 to-accent/10 overflow-hidden group">
              <div className="absolute inset-0 flex items-center justify-center text-4xl font-bold text-primary/20">
                {hotel.image}
              </div>
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition" />

              {/* Save Button */}
              <button
                onClick={(e) => toggleSave(hotel.id, e)}
                className="absolute top-3 right-3 bg-white/90 p-2 rounded-lg hover:bg-white transition shadow-md"
              >
                <Heart
                  className={`w-5 h-5 ${savedHotels.has(hotel.id) ? 'fill-red-500 text-red-500' : 'text-gray-600'}`}
                />
              </button>

              {/* Sustainability Badge */}
              {hotel.sustainabilityScore && hotel.sustainabilityScore >= 7 && (
                <div className="absolute bottom-3 left-3 bg-green-500/90 text-white px-2 py-1 rounded text-xs font-semibold flex items-center gap-1">
                  <Leaf className="w-3 h-3" />
                  Eco-Friendly
                </div>
              )}
            </div>

            {/* Content */}
            <div className="p-4 flex-1 flex flex-col">
              <div className="mb-3">
                <h3 className="font-bold text-lg text-foreground mb-1 line-clamp-2">{hotel.name}</h3>
                <div className="flex items-center gap-1 text-sm text-foreground/60 mb-2">
                  <MapPin className="w-4 h-4" />
                  <span className="line-clamp-1">{hotel.location}</span>
                </div>

                {/* Rating */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={`w-4 h-4 ${
                          i < Math.floor(hotel.rating)
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium text-foreground">{hotel.rating}</span>
                  <span className="text-xs text-foreground/60">({hotel.reviews} reviews)</span>
                </div>
              </div>

              {/* Amenities */}
              <div className="mb-4 flex-1">
                <div className="flex flex-wrap gap-2">
                  {hotel.amenities.slice(0, 3).map((amenity) => (
                    <span
                      key={amenity}
                      className="text-xs bg-muted text-foreground/70 px-2 py-1 rounded"
                    >
                      {amenity}
                    </span>
                  ))}
                </div>
              </div>

              {/* Price and Button */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-2xl font-bold text-primary">${hotel.pricePerNight}</span>
                  <span className="text-sm text-foreground/60">/night</span>
                </div>
                <Button size="sm" className="gap-2">
                  View Details
                </Button>
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
