'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, MapPin, Calendar, Users } from 'lucide-react';
import Link from 'next/link';

interface SearchFormProps {
  isHero?: boolean;
}

export function SearchForm({ isHero = false }: SearchFormProps) {
  const [destination, setDestination] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guests, setGuests] = useState('2');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams({
      destination: destination || 'popular',
      checkIn: checkIn || new Date().toISOString().split('T')[0],
      checkOut: checkOut || new Date(Date.now() + 86400000).toISOString().split('T')[0],
      guests: guests || '2',
    });
    window.location.href = `/hotels?${params.toString()}`;
  };

  if (isHero) {
    return (
      <form onSubmit={handleSearch} className="w-full max-w-4xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-white p-4 rounded-xl shadow-lg border border-border">
          {/* Destination */}
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-600 mb-2">Destination</label>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              <Input
                type="text"
                placeholder="City or hotel name"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="border-0 bg-gray-50 focus-visible:ring-0 focus-visible:bg-white"
              />
            </div>
          </div>

          {/* Check-in Date */}
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-600 mb-2">Check-in</label>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <Input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="border-0 bg-gray-50 focus-visible:ring-0 focus-visible:bg-white"
              />
            </div>
          </div>

          {/* Check-out Date */}
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-600 mb-2">Check-out</label>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-primary" />
              <Input
                type="date"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="border-0 bg-gray-50 focus-visible:ring-0 focus-visible:bg-white"
              />
            </div>
          </div>

          {/* Guests */}
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-gray-600 mb-2">Guests</label>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <Input
                type="number"
                min="1"
                max="8"
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
                className="border-0 bg-gray-50 focus-visible:ring-0 focus-visible:bg-white"
              />
            </div>
          </div>

          {/* Search Button */}
          <div className="flex items-end">
            <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground gap-2">
              <Search className="w-4 h-4" />
              Search
            </Button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={handleSearch} className="w-full">
      <div className="flex gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <Input
            type="text"
            placeholder="Where to?"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
        </div>
        <Input
          type="date"
          value={checkIn}
          onChange={(e) => setCheckIn(e.target.value)}
          className="w-[150px]"
        />
        <Input
          type="date"
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
          className="w-[150px]"
        />
        <Input
          type="number"
          min="1"
          max="8"
          value={guests}
          onChange={(e) => setGuests(e.target.value)}
          className="w-[80px]"
        />
        <Button type="submit" className="gap-2">
          <Search className="w-4 h-4" />
          Search
        </Button>
      </div>
    </form>
  );
}
