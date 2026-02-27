'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

interface FiltersProps {
  onFilterChange?: (filters: FilterState) => void;
}

export interface FilterState {
  priceRange: [number, number];
  stars: number[];
  amenities: string[];
  sustainableOnly: boolean;
  distanceFromCenter: number;
}

export function FiltersSidebar({ onFilterChange }: FiltersProps) {
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 500]);
  const [selectedStars, setSelectedStars] = useState<number[]>([]);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [sustainableOnly, setSustainableOnly] = useState(false);
  const [distance, setDistance] = useState(15);

  const amenitiesList = ['WiFi', 'Pool', 'Gym', 'Restaurant', 'Parking', 'Spa', 'Bar', 'Breakfast'];

  const handleStarChange = (star: number) => {
    setSelectedStars((prev) =>
      prev.includes(star) ? prev.filter((s) => s !== star) : [...prev, star]
    );
  };

  const handleAmenityChange = (amenity: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(amenity) ? prev.filter((a) => a !== amenity) : [...prev, amenity]
    );
  };

  const handleApplyFilters = () => {
    onFilterChange?.({
      priceRange,
      stars: selectedStars,
      amenities: selectedAmenities,
      sustainableOnly,
      distanceFromCenter: distance,
    });
  };

  const handleReset = () => {
    setPriceRange([0, 500]);
    setSelectedStars([]);
    setSelectedAmenities([]);
    setSustainableOnly(false);
    setDistance(15);
    onFilterChange?.({
      priceRange: [0, 500],
      stars: [],
      amenities: [],
      sustainableOnly: false,
      distanceFromCenter: 15,
    });
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="font-bold text-lg mb-4">Filters</h3>

        {/* Price Range */}
        <div className="mb-6">
          <h4 className="font-semibold text-foreground mb-3">Price per Night</h4>
          <Slider
            value={priceRange}
            onValueChange={(value) => setPriceRange([value[0], value[1]])}
            min={0}
            max={1000}
            step={10}
            className="mb-3"
          />
          <div className="flex items-center justify-between text-sm text-foreground/70">
            <span>${priceRange[0]}</span>
            <span>${priceRange[1]}</span>
          </div>
        </div>

        {/* Star Rating */}
        <div className="mb-6">
          <h4 className="font-semibold text-foreground mb-3">Star Rating</h4>
          <div className="space-y-2">
            {[5, 4, 3, 2, 1].map((star) => (
              <div key={star} className="flex items-center gap-2">
                <Checkbox
                  id={`star-${star}`}
                  checked={selectedStars.includes(star)}
                  onCheckedChange={() => handleStarChange(star)}
                />
                <Label htmlFor={`star-${star}`} className="cursor-pointer text-sm">
                  {star} Star{star !== 1 ? 's' : ''} & up
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Amenities */}
        <div className="mb-6">
          <h4 className="font-semibold text-foreground mb-3">Amenities</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {amenitiesList.map((amenity) => (
              <div key={amenity} className="flex items-center gap-2">
                <Checkbox
                  id={`amenity-${amenity}`}
                  checked={selectedAmenities.includes(amenity)}
                  onCheckedChange={() => handleAmenityChange(amenity)}
                />
                <Label htmlFor={`amenity-${amenity}`} className="cursor-pointer text-sm">
                  {amenity}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Distance from Center */}
        <div className="mb-6">
          <h4 className="font-semibold text-foreground mb-3">Distance from Center</h4>
          <Slider
            value={[distance]}
            onValueChange={(value) => setDistance(value[0])}
            min={0}
            max={30}
            step={1}
            className="mb-2"
          />
          <p className="text-sm text-foreground/70">{distance} km</p>
        </div>

        {/* Sustainability Filter */}
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <Checkbox
              id="eco-friendly"
              checked={sustainableOnly}
              onCheckedChange={(checked) => setSustainableOnly(checked as boolean)}
            />
            <Label htmlFor="eco-friendly" className="cursor-pointer text-sm font-medium">
              Eco-Friendly Only
            </Label>
          </div>
        </div>

        {/* Buttons */}
        <div className="space-y-2">
          <Button onClick={handleApplyFilters} className="w-full">
            Apply Filters
          </Button>
          <Button onClick={handleReset} variant="outline" className="w-full">
            Reset
          </Button>
        </div>
      </Card>
    </div>
  );
}
