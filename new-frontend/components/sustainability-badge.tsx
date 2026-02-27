'use client';

import { Card } from '@/components/ui/card';
import { Leaf, Droplet, Zap, Recycle } from 'lucide-react';

export interface SustainabilityScore {
  overall: number;
  carbonFootprint: number; // kg CO2 per night
  waterUsage: number; // liters saved vs industry average
  energyEfficiency: number; // percentage of renewable energy
  wasteManagement: number; // percentage recycled
}

interface SustainabilityBadgeProps {
  hotelName: string;
  score: SustainabilityScore;
  certifications?: string[];
}

export function SustainabilityBadge({
  hotelName,
  score,
  certifications = ['Green Seal', 'LEED Certified'],
}: SustainabilityBadgeProps) {
  const getScoreColor = (score: number) => {
    if (score >= 8) return 'text-green-600 bg-green-50';
    if (score >= 6) return 'text-orange-600 bg-orange-50';
    return 'text-red-600 bg-red-50';
  };

  const getScoreBadge = (score: number) => {
    if (score >= 8) return '🌟 Excellent';
    if (score >= 6) return '✓ Good';
    return '⚠ Fair';
  };

  return (
    <div className="space-y-4">
      {/* Main Score Card */}
      <Card className={`p-6 border-2 ${getScoreColor(score.overall)}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-bold text-lg text-foreground mb-1">{hotelName}</h3>
            <p className="text-sm font-semibold">Eco-Friendly Hotel</p>
          </div>
          <div className="text-center">
            <div className="text-4xl font-bold">{score.overall}</div>
            <div className="text-xs font-semibold mt-1">/10</div>
          </div>
        </div>
        <div className="text-sm font-medium">{getScoreBadge(score.overall)}</div>
      </Card>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4">
        {/* Carbon Footprint */}
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <Zap className="w-5 h-5 text-blue-600" />
            <h4 className="font-semibold text-foreground">Carbon</h4>
          </div>
          <p className="text-2xl font-bold text-foreground">{score.carbonFootprint}</p>
          <p className="text-xs text-foreground/60">kg CO₂ per night</p>
        </Card>

        {/* Water Usage */}
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <Droplet className="w-5 h-5 text-cyan-600" />
            <h4 className="font-semibold text-foreground">Water Saved</h4>
          </div>
          <p className="text-2xl font-bold text-foreground">{score.waterUsage}%</p>
          <p className="text-xs text-foreground/60">vs industry avg</p>
        </Card>

        {/* Energy Efficiency */}
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <Leaf className="w-5 h-5 text-green-600" />
            <h4 className="font-semibold text-foreground">Renewable</h4>
          </div>
          <p className="text-2xl font-bold text-foreground">{score.energyEfficiency}%</p>
          <p className="text-xs text-foreground/60">renewable energy</p>
        </Card>

        {/* Waste Management */}
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-2">
            <Recycle className="w-5 h-5 text-purple-600" />
            <h4 className="font-semibold text-foreground">Recycled</h4>
          </div>
          <p className="text-2xl font-bold text-foreground">{score.wasteManagement}%</p>
          <p className="text-xs text-foreground/60">waste recycled</p>
        </Card>
      </div>

      {/* Certifications */}
      {certifications.length > 0 && (
        <Card className="p-4">
          <h4 className="font-semibold text-foreground mb-3">Certifications</h4>
          <div className="flex flex-wrap gap-2">
            {certifications.map((cert) => (
              <span
                key={cert}
                className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full"
              >
                ✓ {cert}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Impact Summary */}
      <Card className="p-4 bg-green-50/50 border-green-200">
        <h4 className="font-semibold text-foreground mb-2">Your Impact</h4>
        <ul className="space-y-2 text-sm">
          <li className="flex items-start gap-2">
            <span className="text-green-600 font-bold mt-0.5">•</span>
            <span className="text-foreground/70">
              By staying here, you save {Math.round(score.waterUsage * 1.5)} liters of water
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 font-bold mt-0.5">•</span>
            <span className="text-foreground/70">
              Approximately {score.carbonFootprint} kg CO₂ emissions (vs {Math.round(score.carbonFootprint * 1.8)} kg industry average)
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-600 font-bold mt-0.5">•</span>
            <span className="text-foreground/70">
              Supporting a hotel committed to renewable energy and sustainability practices
            </span>
          </li>
        </ul>
      </Card>

      {/* Eco Tips */}
      <Card className="p-4 border-blue-200 bg-blue-50/30">
        <h4 className="font-semibold text-foreground mb-2">Be a Sustainable Traveler</h4>
        <ul className="space-y-1 text-xs text-foreground/70">
          <li>✓ Reuse towels and linens</li>
          <li>✓ Use in-room water bottles instead of plastic</li>
          <li>✓ Turn off lights and AC when out</li>
          <li>✓ Support local restaurants and shops</li>
        </ul>
      </Card>
    </div>
  );
}
