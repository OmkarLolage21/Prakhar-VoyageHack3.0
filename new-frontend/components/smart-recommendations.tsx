'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Sparkles, MapPin, Clock, Users, DollarSign } from 'lucide-react';

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  type: 'hotel' | 'activity' | 'restaurant' | 'destination';
  rating: number;
  price: number;
  priceLevel: 'budget' | 'moderate' | 'upscale';
  duration?: string;
  location: string;
  image: string;
  reason: string;
}

interface SmartRecommendationsProps {
  recommendations?: Recommendation[];
  userPreferences?: {
    budget: 'low' | 'medium' | 'high';
    interests: string[];
    tripStyle: 'adventure' | 'relaxation' | 'cultural' | 'luxury';
  };
}

const mockRecommendations: Recommendation[] = [
  {
    id: '1',
    title: 'Luxury Palace Hotel',
    description: 'Premium 5-star accommodation with world-class amenities',
    type: 'hotel',
    rating: 4.8,
    price: 250,
    priceLevel: 'upscale',
    location: 'Downtown District',
    image: '🏨',
    reason: 'Matches your luxury preference and receives excellent reviews',
  },
  {
    id: '2',
    title: 'Mountain Hiking Adventure',
    description: 'Guided 8-hour trek through scenic mountain trails',
    type: 'activity',
    rating: 4.6,
    price: 120,
    priceLevel: 'moderate',
    duration: '8 hours',
    location: 'Mountain Ridge',
    image: '⛰️',
    reason: 'Perfect for your adventure interests',
  },
  {
    id: '3',
    title: 'Local Cuisine Restaurant',
    description: 'Authentic regional dishes in a cozy atmosphere',
    type: 'restaurant',
    rating: 4.7,
    price: 45,
    priceLevel: 'moderate',
    location: 'Historic Quarter',
    image: '🍽️',
    reason: 'Highly rated by cultural travelers like you',
  },
  {
    id: '4',
    title: 'Tropical Island Getaway',
    description: 'Paradise beaches with water sports and relaxation',
    type: 'destination',
    rating: 4.9,
    price: 1500,
    priceLevel: 'upscale',
    location: 'South Pacific',
    image: '🏝️',
    reason: 'Next destination you might enjoy based on your travel history',
  },
];

const priceLevelColors: { [key: string]: string } = {
  budget: 'bg-green-50 text-green-700',
  moderate: 'bg-blue-50 text-blue-700',
  upscale: 'bg-purple-50 text-purple-700',
};

export function SmartRecommendations({
  recommendations = mockRecommendations,
  userPreferences,
}: SmartRecommendationsProps) {
  const getTypeEmoji = (type: string) => {
    const emojis: { [key: string]: string } = {
      hotel: '🏨',
      activity: '🎯',
      restaurant: '🍽️',
      destination: '🗺️',
    };
    return emojis[type] || '⭐';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Sparkles className="w-6 h-6 text-primary" />
        <h2 className="text-2xl font-bold text-foreground">Personalized Recommendations</h2>
      </div>

      {/* User Preferences Summary */}
      {userPreferences && (
        <Card className="p-4 bg-primary/5 border-primary/20">
          <p className="text-sm text-foreground/70 mb-2">
            Based on your <span className="font-semibold">{userPreferences.tripStyle}</span> travel style and
            interests in {userPreferences.interests.join(', ')}, we've curated these suggestions for you.
          </p>
        </Card>
      )}

      {/* Recommendations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {recommendations.map((rec) => (
          <Card
            key={rec.id}
            className="overflow-hidden hover:shadow-lg transition flex flex-col"
          >
            {/* Image */}
            <div className="h-40 bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-6xl">
              {rec.image}
            </div>

            {/* Content */}
            <div className="p-6 flex-1 flex flex-col">
              {/* Type Badge */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{getTypeEmoji(rec.type)}</span>
                <span className={`text-xs font-bold px-2 py-1 rounded ${priceLevelColors[rec.priceLevel]}`}>
                  {rec.priceLevel.toUpperCase()}
                </span>
              </div>

              {/* Title and Rating */}
              <h3 className="text-lg font-bold text-foreground mb-1">{rec.title}</h3>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-foreground">⭐ {rec.rating}</span>
                <span className="text-xs text-foreground/60">
                  {rec.rating > 4.5 ? 'Highly rated' : rec.rating > 4 ? 'Well reviewed' : 'Popular'}
                </span>
              </div>

              {/* Description */}
              <p className="text-sm text-foreground/70 mb-4 flex-1">{rec.description}</p>

              {/* Reason */}
              <div className="bg-green-50/50 border-l-4 border-green-600 px-3 py-2 rounded mb-4">
                <p className="text-xs text-green-700 font-medium">💡 {rec.reason}</p>
              </div>

              {/* Details */}
              <div className="space-y-2 mb-4 text-sm">
                <div className="flex items-center gap-2 text-foreground/70">
                  <MapPin className="w-4 h-4" />
                  {rec.location}
                </div>
                {rec.duration && (
                  <div className="flex items-center gap-2 text-foreground/70">
                    <Clock className="w-4 h-4" />
                    {rec.duration}
                  </div>
                )}
                <div className="flex items-center gap-2 text-foreground/70">
                  <DollarSign className="w-4 h-4" />
                  ${rec.price}
                  {rec.type !== 'destination' && '/person'}
                </div>
              </div>

              {/* Action Button */}
              <Button className="w-full" variant="outline">
                Learn More
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* More Recommendations CTA */}
      <div className="text-center pt-4">
        <Link href="/hotels">
          <Button size="lg" variant="outline">
            View All Recommendations
          </Button>
        </Link>
      </div>
    </div>
  );
}
