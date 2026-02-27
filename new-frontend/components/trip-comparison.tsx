'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';

export interface TripOption {
  id: string;
  name: string;
  destination: string;
  duration: number;
  startDate: string;
  endDate: string;
  totalPrice: number;
  hotels: number;
  activities: number;
  meals: number;
  rating: number;
  highlights: string[];
  included: string[];
}

interface TripComparisonProps {
  trips: TripOption[];
  onSelectTrip?: (tripId: string) => void;
}

export function TripComparison({ trips, onSelectTrip }: TripComparisonProps) {
  if (trips.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-foreground/60">No trips to compare yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Comparison Table */}
      <div className="overflow-x-auto">
        <div className="grid gap-4" style={{ gridTemplateColumns: `1fr ${trips.map(() => '1fr').join(' ')}` }}>
          {/* Header - Labels */}
          <div className="font-bold text-foreground bg-muted p-4 rounded-lg">Comparison</div>
          {trips.map((trip) => (
            <div key={trip.id} className="font-bold text-foreground bg-primary/10 p-4 rounded-lg text-center">
              {trip.name}
            </div>
          ))}

          {/* Destination */}
          <div className="font-semibold text-foreground/70 p-4">Destination</div>
          {trips.map((trip) => (
            <div key={trip.id} className="p-4 text-center text-foreground">
              {trip.destination}
            </div>
          ))}

          {/* Duration */}
          <div className="font-semibold text-foreground/70 p-4">Duration</div>
          {trips.map((trip) => (
            <div key={trip.id} className="p-4 text-center text-foreground">
              {trip.duration} days
            </div>
          ))}

          {/* Price */}
          <div className="font-semibold text-foreground/70 p-4">Total Price</div>
          {trips.map((trip) => (
            <div
              key={trip.id}
              className="p-4 text-center text-lg font-bold text-primary"
            >
              ${trip.totalPrice.toLocaleString()}
            </div>
          ))}

          {/* Price per Day */}
          <div className="font-semibold text-foreground/70 p-4">Price/Day</div>
          {trips.map((trip) => (
            <div key={trip.id} className="p-4 text-center text-foreground">
              ${Math.round(trip.totalPrice / trip.duration)}/day
            </div>
          ))}

          {/* Hotels */}
          <div className="font-semibold text-foreground/70 p-4">Hotels</div>
          {trips.map((trip) => (
            <div key={trip.id} className="p-4 text-center text-foreground">
              {trip.hotels}
            </div>
          ))}

          {/* Activities */}
          <div className="font-semibold text-foreground/70 p-4">Activities</div>
          {trips.map((trip) => (
            <div key={trip.id} className="p-4 text-center text-foreground">
              {trip.activities}
            </div>
          ))}

          {/* Meals */}
          <div className="font-semibold text-foreground/70 p-4">Meals</div>
          {trips.map((trip) => (
            <div key={trip.id} className="p-4 text-center text-foreground">
              {trip.meals}
            </div>
          ))}

          {/* Rating */}
          <div className="font-semibold text-foreground/70 p-4">User Rating</div>
          {trips.map((trip) => (
            <div key={trip.id} className="p-4 text-center text-foreground font-semibold">
              ⭐ {trip.rating}
            </div>
          ))}
        </div>
      </div>

      {/* Highlights */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-foreground">Trip Highlights</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {trips.map((trip) => (
            <Card key={trip.id} className="p-6">
              <h4 className="font-bold text-foreground mb-4">{trip.name}</h4>
              <ul className="space-y-2">
                {trip.highlights.map((highlight, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/70">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    {highlight}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </div>

      {/* Included Services */}
      <div className="space-y-4">
        <h3 className="text-xl font-bold text-foreground">What's Included</h3>
        <div className="overflow-x-auto">
          <div className="grid gap-4" style={{ gridTemplateColumns: `1fr ${trips.map(() => '1fr').join(' ')}` }}>
            <div className="font-bold text-foreground bg-muted p-4 rounded-lg">Services</div>
            {trips.map((trip) => (
              <div key={trip.id} className="font-bold text-foreground bg-primary/10 p-4 rounded-lg text-center">
                {trip.name}
              </div>
            ))}

            {/* Accommodation */}
            <div className="font-semibold text-foreground/70 p-4">Accommodation</div>
            {trips.map((trip) => (
              <div key={trip.id} className="p-4 text-center">
                {trip.included.includes('accommodation') ? (
                  <Check className="w-5 h-5 text-green-600 mx-auto" />
                ) : (
                  <X className="w-5 h-5 text-gray-300 mx-auto" />
                )}
              </div>
            ))}

            {/* Meals */}
            <div className="font-semibold text-foreground/70 p-4">Meals</div>
            {trips.map((trip) => (
              <div key={trip.id} className="p-4 text-center">
                {trip.included.includes('meals') ? (
                  <Check className="w-5 h-5 text-green-600 mx-auto" />
                ) : (
                  <X className="w-5 h-5 text-gray-300 mx-auto" />
                )}
              </div>
            ))}

            {/* Guided Tours */}
            <div className="font-semibold text-foreground/70 p-4">Guided Tours</div>
            {trips.map((trip) => (
              <div key={trip.id} className="p-4 text-center">
                {trip.included.includes('tours') ? (
                  <Check className="w-5 h-5 text-green-600 mx-auto" />
                ) : (
                  <X className="w-5 h-5 text-gray-300 mx-auto" />
                )}
              </div>
            ))}

            {/* Transportation */}
            <div className="font-semibold text-foreground/70 p-4">Transportation</div>
            {trips.map((trip) => (
              <div key={trip.id} className="p-4 text-center">
                {trip.included.includes('transportation') ? (
                  <Check className="w-5 h-5 text-green-600 mx-auto" />
                ) : (
                  <X className="w-5 h-5 text-gray-300 mx-auto" />
                )}
              </div>
            ))}

            {/* Travel Insurance */}
            <div className="font-semibold text-foreground/70 p-4">Travel Insurance</div>
            {trips.map((trip) => (
              <div key={trip.id} className="p-4 text-center">
                {trip.included.includes('insurance') ? (
                  <Check className="w-5 h-5 text-green-600 mx-auto" />
                ) : (
                  <X className="w-5 h-5 text-gray-300 mx-auto" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {trips.map((trip) => (
          <Button
            key={trip.id}
            onClick={() => onSelectTrip?.(trip.id)}
            className="w-full"
            size="lg"
          >
            Choose {trip.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
