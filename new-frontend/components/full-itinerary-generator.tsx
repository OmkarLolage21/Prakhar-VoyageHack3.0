'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, Clock, MapPin, Utensils, Hotel, Sparkles } from 'lucide-react';

interface ItineraryActivity {
  time: string;
  title: string;
  description: string;
  type: 'breakfast' | 'activity' | 'lunch' | 'attraction' | 'dinner' | 'hotel';
  duration: string;
  cost?: number;
  location: string;
}

interface ItineraryDay {
  day: number;
  date: string;
  activities: ItineraryActivity[];
}

interface FullItineraryGeneratorProps {
  destination: string;
  startDate: string;
  endDate: string;
  itinerary?: any;
  onClose: () => void;
  onAddToPlanner: (activities: ItineraryActivity[]) => void;
}

// Pre-generated itineraries for popular destinations
const itineraryTemplates: { [key: string]: ItineraryDay[] } = {
  'paris': [
    {
      day: 1,
      date: '2024-06-01',
      activities: [
        { time: '08:00', title: 'Check-in', description: 'Hotel check-in and settle', type: 'hotel', duration: '1h', location: 'Ritz Paris', cost: 280 },
        { time: '09:30', title: 'Breakfast', description: 'Croissants at a local café', type: 'breakfast', duration: '1h', location: 'Café de Paris', cost: 15 },
        { time: '11:00', title: 'Eiffel Tower', description: 'Visit the iconic tower with skip-the-line tickets', type: 'attraction', duration: '2h', location: 'Eiffel Tower', cost: 30 },
        { time: '13:30', title: 'Lunch', description: 'Traditional French bistro', type: 'lunch', duration: '1.5h', location: 'Les Deux Magots', cost: 40 },
        { time: '15:00', title: 'Louvre Museum', description: 'See Mona Lisa and masterpieces', type: 'attraction', duration: '3h', location: 'Louvre', cost: 17 },
        { time: '18:30', title: 'Seine Cruise', description: 'Evening river cruise with lights', type: 'activity', duration: '1h', location: 'Seine River', cost: 25 },
        { time: '20:00', title: 'Dinner', description: 'Michelin-starred French cuisine', type: 'dinner', duration: '2h', location: 'Le Jules Verne', cost: 150 },
      ],
    },
    {
      day: 2,
      date: '2024-06-02',
      activities: [
        { time: '08:00', title: 'Breakfast', description: 'Pastries at your hotel', type: 'breakfast', duration: '1h', location: 'Hotel Restaurant', cost: 20 },
        { time: '09:00', title: 'Notre-Dame Cathedral', description: 'Visit the historic Gothic cathedral', type: 'attraction', duration: '1.5h', location: 'Notre-Dame', cost: 0 },
        { time: '10:45', title: 'Sainte-Chapelle', description: 'Stunning stained-glass windows', type: 'attraction', duration: '1h', location: 'Sainte-Chapelle', cost: 12 },
        { time: '12:15', title: 'Lunch', description: 'Casual French brasserie', type: 'lunch', duration: '1h', location: 'Café Le Comptoir', cost: 28 },
        { time: '13:30', title: 'Musée d\'Orsay', description: 'Impressionist art collection', type: 'activity', duration: '2h', location: 'Musée d\'Orsay', cost: 14 },
        { time: '16:00', title: 'Shopping', description: 'Champs-Élysées boutiques', type: 'activity', duration: '2h', location: 'Champs-Élysées', cost: 0 },
        { time: '18:30', title: 'Dinner', description: 'French wine and cheese experience', type: 'dinner', duration: '1.5h', location: 'La Belle Époque', cost: 85 },
      ],
    },
    {
      day: 3,
      date: '2024-06-03',
      activities: [
        { time: '08:00', title: 'Breakfast', description: 'Café au lait and croissants', type: 'breakfast', duration: '1h', location: 'Local Café', cost: 12 },
        { time: '09:30', title: 'Versailles Palace', description: 'Day trip to the royal palace', type: 'attraction', duration: '4h', location: 'Palace of Versailles', cost: 20 },
        { time: '13:30', title: 'Lunch', description: 'At Versailles gardens', type: 'lunch', duration: '1h', location: 'Versailles Restaurant', cost: 35 },
        { time: '14:45', title: 'Gardens Exploration', description: 'Walk through the magnificent gardens', type: 'activity', duration: '2h', location: 'Versailles Gardens', cost: 0 },
        { time: '17:30', title: 'Return to Paris', description: 'Train back to city center', type: 'activity', duration: '1h', location: 'Paris', cost: 8 },
        { time: '19:00', title: 'Dinner', description: 'Relaxed evening dinner', type: 'dinner', duration: '1.5h', location: 'Bistro du Marais', cost: 60 },
      ],
    },
  ],
  'tokyo': [
    {
      day: 1,
      date: '2024-06-01',
      activities: [
        { time: '14:00', title: 'Hotel Check-in', description: 'Arrive and settle at luxury hotel', type: 'hotel', duration: '1h', location: 'Hotel Okura', cost: 320 },
        { time: '15:30', title: 'Tsukiji Market', description: 'Fresh seafood and street food', type: 'activity', duration: '1.5h', location: 'Tsukiji Outer Market', cost: 40 },
        { time: '17:00', title: 'Senso-ji Temple', description: 'Historic Buddhist temple visit', type: 'attraction', duration: '1h', location: 'Asakusa', cost: 0 },
        { time: '18:30', title: 'Dinner', description: 'Sushi at Michelin-starred restaurant', type: 'dinner', duration: '1.5h', location: 'Michelin Sushi', cost: 180 },
        { time: '20:15', title: 'Shibuya Crossing', description: 'World\'s busiest pedestrian crossing', type: 'activity', duration: '1h', location: 'Shibuya', cost: 0 },
      ],
    },
    {
      day: 2,
      date: '2024-06-02',
      activities: [
        { time: '08:00', title: 'Breakfast', description: 'Traditional Japanese breakfast', type: 'breakfast', duration: '1h', location: 'Hotel', cost: 25 },
        { time: '09:00', title: 'Tokyo Tower', description: 'Panoramic city views', type: 'attraction', duration: '2h', location: 'Tokyo Tower', cost: 22 },
        { time: '11:15', title: 'Meiji Shrine', description: 'Peaceful Shinto shrine in the forest', type: 'attraction', duration: '1h', location: 'Meiji Shrine', cost: 0 },
        { time: '12:30', title: 'Lunch', description: 'Ramen experience', type: 'lunch', duration: '1h', location: 'Ramen Alley', cost: 12 },
        { time: '13:45', title: 'Harajuku', description: 'Street fashion and culture', type: 'activity', duration: '2h', location: 'Harajuku', cost: 30 },
        { time: '16:00', title: 'TeamLab Borderless', description: 'Digital art museum', type: 'activity', duration: '2h', location: 'TeamLab', cost: 35 },
        { time: '18:30', title: 'Dinner', description: 'Kaiseki fine dining', type: 'dinner', duration: '2h', location: 'Kaiseki Restaurant', cost: 150 },
      ],
    },
    {
      day: 3,
      date: '2024-06-03',
      activities: [
        { time: '08:00', title: 'Breakfast', description: 'Hotel breakfast buffet', type: 'breakfast', duration: '1h', location: 'Hotel', cost: 28 },
        { time: '09:00', title: 'Mount Fuji Day Trip', description: 'Scenic views from Hakone', type: 'activity', duration: '6h', location: 'Mount Fuji', cost: 95 },
        { time: '15:30', title: 'Return to Tokyo', description: 'Train back to city', type: 'activity', duration: '1.5h', location: 'Tokyo', cost: 50 },
        { time: '17:30', title: 'Rest at Hotel', description: 'Relax before evening', type: 'activity', duration: '1h', location: 'Hotel', cost: 0 },
        { time: '19:00', title: 'Dinner', description: 'Casual okonomiyaki', type: 'dinner', duration: '1h', location: 'Okonomiyaki Restaurant', cost: 30 },
      ],
    },
  ],
  'rome': [
    {
      day: 1,
      date: '2024-06-01',
      activities: [
        { time: '14:00', title: 'Hotel Check-in', description: 'Arrive at luxury hotel', type: 'hotel', duration: '1h', location: 'Hotel Artemide', cost: 350 },
        { time: '15:30', title: 'Colosseum', description: 'Ancient Roman amphitheater tour', type: 'attraction', duration: '2h', location: 'Colosseum', cost: 18 },
        { time: '17:45', title: 'Roman Forum', description: 'Ancient ruins and history', type: 'attraction', duration: '1.5h', location: 'Roman Forum', cost: 14 },
        { time: '19:30', title: 'Dinner', description: 'Traditional Roman pasta', type: 'dinner', duration: '1.5h', location: 'Trattoria da Valentino', cost: 50 },
      ],
    },
    {
      day: 2,
      date: '2024-06-02',
      activities: [
        { time: '08:00', title: 'Breakfast', description: 'Italian espresso and pastry', type: 'breakfast', duration: '45m', location: 'Local Café', cost: 8 },
        { time: '09:00', title: 'Vatican City Tour', description: 'St. Peter\'s Basilica and museums', type: 'attraction', duration: '4h', location: 'Vatican', cost: 35 },
        { time: '13:15', title: 'Lunch', description: 'Papal pizza and wine', type: 'lunch', duration: '1h', location: 'Vatican Restaurant', cost: 30 },
        { time: '14:30', title: 'Sistine Chapel', description: 'Michelangelo\'s masterpiece', type: 'attraction', duration: '1h', location: 'Sistine Chapel', cost: 0 },
        { time: '16:00', title: 'Spanish Steps', description: 'Beautiful Renaissance square', type: 'activity', duration: '1h', location: 'Spanish Steps', cost: 0 },
        { time: '17:30', title: 'Fontana di Trevi', description: 'Iconic fountain at sunset', type: 'attraction', duration: '1h', location: 'Trevi Fountain', cost: 0 },
        { time: '19:00', title: 'Dinner', description: 'Fine dining carbonara', type: 'dinner', duration: '1.5h', location: 'Michelin Restaurant', cost: 120 },
      ],
    },
  ],
};

export function FullItineraryGenerator({
  destination,
  startDate,
  endDate,
  itinerary,
  onClose,
  onAddToPlanner,
}: FullItineraryGeneratorProps) {
  const [expandedDay, setExpandedDay] = useState<number | null>(1);

  // Generate itinerary based on destination
  const getItinerary = (): ItineraryDay[] => {
    const destKey = destination.toLowerCase().split(' ')[0];
    return itineraryTemplates[destKey] || itineraryTemplates['paris'];
  };

  const itineraryData = getItinerary();

  const getActivityIcon = (type: string) => {
    const icons: { [key: string]: any } = {
      breakfast: '🥐',
      lunch: '🍽️',
      dinner: '🍷',
      hotel: '🏨',
      activity: '🎯',
      attraction: '🏛️',
    };
    return icons[type] || '📍';
  };

  const getTotalCost = () => {
    return itineraryData.reduce(
      (sum, day) =>
        sum +
        day.activities.reduce((daySum, act) => daySum + (act.cost || 0), 0),
      0
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-primary/10 to-secondary/10 border-b border-border px-6 py-4 flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-primary" />
              Complete {destination} Itinerary
            </h2>
            <p className="text-sm text-foreground/60 mt-1">
              {itineraryData.length} Days • Total Cost: ${getTotalCost()}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-destructive">
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Itinerary Days */}
        <div className="p-6 space-y-4">
          {itineraryData.map((day) => (
            <Card key={day.day} className="overflow-hidden border-primary/20 hover:border-primary/40 transition">
              {/* Day Header */}
              <button
                onClick={() => setExpandedDay(expandedDay === day.day ? null : day.day)}
                className="w-full text-left p-4 bg-primary/5 hover:bg-primary/10 transition border-b border-border flex items-center justify-between"
              >
                <div>
                  <h3 className="font-bold text-foreground">Day {day.day} - {day.date}</h3>
                  <p className="text-xs text-foreground/60 mt-1">
                    {day.activities.length} activities • {day.activities.reduce((sum, a) => sum + parseFloat(a.duration.split('h')[0]), 0).toFixed(1)}h
                  </p>
                </div>
                <div className="text-sm font-semibold text-primary">
                  ${day.activities.reduce((sum, a) => sum + (a.cost || 0), 0)}
                </div>
              </button>

              {/* Day Activities */}
              {expandedDay === day.day && (
                <div className="p-4 space-y-3">
                  {day.activities.map((activity, idx) => (
                    <div key={idx} className="flex gap-4 pb-3 border-b border-border last:border-0">
                      {/* Time */}
                      <div className="flex-shrink-0 w-16">
                        <div className="flex items-center gap-2 font-semibold text-primary">
                          <Clock className="w-4 h-4" />
                          {activity.time}
                        </div>
                        <p className="text-xs text-foreground/60 mt-1">{activity.duration}</p>
                      </div>

                      {/* Activity Details */}
                      <div className="flex-1">
                        <div className="flex items-start gap-2 mb-1">
                          <span className="text-lg">{getActivityIcon(activity.type)}</span>
                          <div>
                            <h4 className="font-bold text-foreground">{activity.title}</h4>
                            <p className="text-xs text-foreground/60">{activity.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-xs text-foreground/70">
                          <MapPin className="w-3 h-3" />
                          {activity.location}
                          {activity.cost && (
                            <>
                              <span className="mx-1">•</span>
                              <span className="font-semibold text-primary">${activity.cost}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-muted/50 border-t border-border px-6 py-4 flex gap-3">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Close
          </Button>
          <Button
            onClick={() => {
              const allActivities = itineraryData.flatMap((day) => day.activities);
              onAddToPlanner(allActivities);
              onClose();
            }}
            className="flex-1 gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Add to Planner
          </Button>
        </div>
      </Card>
    </div>
  );
}
