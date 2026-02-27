'use client';

import { useState } from 'react';
import { Navbar } from '@/components/navbar';
import { MapView } from '@/components/map-view';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Star, MapPin, DollarSign, Map } from 'lucide-react';

interface Hotel {
  id: string;
  name: string;
  price: number;
  rating: number;
  location: string;
  lat: number;
  lng: number;
  image: string;
  amenities: string[];
}

const mockHotels: Hotel[] = [
  {
    id: '1',
    name: 'Luxury Palace Hotel',
    price: 250,
    rating: 4.8,
    location: 'Downtown District',
    lat: 48.8584,
    lng: 2.2945,
    image: '🏨',
    amenities: ['WiFi', 'Pool', 'Spa', 'Restaurant'],
  },
  {
    id: '2',
    name: 'Boutique Hotel Paris',
    price: 180,
    rating: 4.6,
    location: 'Le Marais',
    lat: 48.8606,
    lng: 2.3622,
    image: '🏛️',
    amenities: ['WiFi', 'Gym', 'Bar'],
  },
  {
    id: '3',
    name: 'Ritz Paris',
    price: 450,
    rating: 4.9,
    location: 'Place Vendôme',
    lat: 48.8684,
    lng: 2.3245,
    image: '👑',
    amenities: ['WiFi', 'Pool', 'Spa', 'Fine Dining'],
  },
  {
    id: '4',
    name: 'Hotel De Nesle',
    price: 120,
    rating: 4.4,
    location: 'Latin Quarter',
    lat: 48.8509,
    lng: 2.3409,
    image: '🏨',
    amenities: ['WiFi', 'Garden'],
  },
];

export default function HotelsMapPage() {
  const [searchText, setSearchText] = useState('');
  const [maxPrice, setMaxPrice] = useState(500);
  const [selectedHotels, setSelectedHotels] = useState<Hotel[]>(mockHotels);
  const [mapLocations, setMapLocations] = useState(mockHotels.map(h => ({
    id: h.id,
    name: h.name,
    lat: h.lat,
    lng: h.lng,
    type: 'hotel' as const,
    price: h.price,
  })));

  const handleSearch = () => {
    const filtered = mockHotels.filter(h => {
      const matchesSearch = h.name.toLowerCase().includes(searchText.toLowerCase()) ||
                          h.location.toLowerCase().includes(searchText.toLowerCase());
      const matchesPrice = h.price <= maxPrice;
      return matchesSearch && matchesPrice;
    });
    setSelectedHotels(filtered);
    setMapLocations(filtered.map(h => ({
      id: h.id,
      name: h.name,
      lat: h.lat,
      lng: h.lng,
      type: 'hotel' as const,
      price: h.price,
    })));
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Find Hotels on Map</h1>
          <p className="text-foreground/60">Search for hotels and draw a circle to find ones in your area</p>
        </div>

        {/* 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[600px]">
          {/* Left Panel: Search & List */}
          <div className="lg:col-span-1 flex flex-col bg-white rounded-lg border border-border overflow-hidden">
            {/* Search Section */}
            <div className="p-4 border-b border-border">
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-semibold text-foreground/70 block mb-1">
                    Search Location
                  </label>
                  <Input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Hotel name or area..."
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-foreground/70 block mb-1">
                    Max Price: ${maxPrice}
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="500"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(parseInt(e.target.value))}
                    className="w-full"
                  />
                </div>
                <Button onClick={handleSearch} className="w-full">
                  Search Hotels
                </Button>
              </div>
            </div>

            {/* Hotels List */}
            <div className="flex-1 overflow-y-auto">
              {selectedHotels.length === 0 ? (
                <div className="p-4 text-center text-foreground/60">
                  <p>No hotels found</p>
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {selectedHotels.map(hotel => (
                    <Card key={hotel.id} className="p-3 hover:shadow-md transition cursor-pointer">
                      <div className="flex items-start gap-3">
                        <span className="text-2xl">{hotel.image}</span>
                        <div className="flex-1">
                          <h4 className="font-bold text-sm text-foreground">{hotel.name}</h4>
                          <p className="text-xs text-foreground/60 mb-1">{hotel.location}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                              <span className="text-xs font-semibold">{hotel.rating}</span>
                            </div>
                            <span className="text-sm font-bold text-primary">${hotel.price}</span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Map */}
          <div className="lg:col-span-2 bg-white rounded-lg border border-border overflow-hidden">
            <div className="h-full relative">
              <MapView locations={mapLocations} drawRoutes={false} />
              <div className="absolute top-4 right-4 bg-white/95 backdrop-blur p-3 rounded-lg shadow-lg">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Map className="w-4 h-4 text-primary" />
                  <p className="font-medium">{selectedHotels.length} hotels found</p>
                </div>
                <p className="text-xs text-foreground/60 mt-1">Draw circle or pan to explore</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
