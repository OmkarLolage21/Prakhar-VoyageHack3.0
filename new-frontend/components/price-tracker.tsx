'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, Bell, X } from 'lucide-react';
import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export interface PriceAlert {
  id: string;
  hotelId: string;
  hotelName: string;
  currentPrice: number;
  targetPrice: number;
  created: Date;
  notified: boolean;
}

export interface PriceHistory {
  date: string;
  price: number;
}

interface PriceTrackerProps {
  alerts?: PriceAlert[];
  priceHistory?: PriceHistory[];
  onAddAlert?: (hotelId: string, targetPrice: number) => void;
  onRemoveAlert?: (alertId: string) => void;
}

export function PriceTracker({
  alerts = mockAlerts,
  priceHistory = mockPriceHistory,
  onAddAlert,
  onRemoveAlert,
}: PriceTrackerProps) {
  const [targetPrice, setTargetPrice] = useState('');
  const [selectedHotelId, setSelectedHotelId] = useState('');

  const handleAddAlert = () => {
    if (selectedHotelId && targetPrice) {
      onAddAlert?.(selectedHotelId, parseFloat(targetPrice));
      setTargetPrice('');
      setSelectedHotelId('');
    }
  };

  const savings = alerts.reduce((acc, alert) => {
    if (alert.currentPrice > alert.targetPrice) {
      return acc + (alert.currentPrice - alert.targetPrice);
    }
    return acc;
  }, 0);

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-foreground/70 mb-1">Tracking Hotels</p>
            <p className="text-3xl font-bold text-primary">{alerts.length}</p>
          </div>
          <div>
            <p className="text-sm text-foreground/70 mb-1">Potential Savings</p>
            <p className="text-3xl font-bold text-green-600">${savings.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-foreground/70 mb-1">Price Alerts</p>
            <p className="text-3xl font-bold text-orange-600">
              {alerts.filter((a) => !a.notified).length}
            </p>
          </div>
        </div>
      </Card>

      {/* Price History Chart */}
      {priceHistory.length > 0 && (
        <Card className="p-6">
          <h3 className="font-bold text-lg text-foreground mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Price Trend
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={priceHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12, fill: 'var(--foreground)' }}
                stroke="var(--border)"
              />
              <YAxis
                tick={{ fontSize: 12, fill: 'var(--foreground)' }}
                stroke="var(--border)"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'var(--foreground)' }}
              />
              <Line
                type="monotone"
                dataKey="price"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={{ fill: 'var(--primary)', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Add Alert Form */}
      <Card className="p-6">
        <h3 className="font-bold text-lg text-foreground mb-4">Add Price Alert</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Select Hotel</label>
            <select
              value={selectedHotelId}
              onChange={(e) => setSelectedHotelId(e.target.value)}
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Choose a hotel</option>
              <option value="1">Luxury Palace Hotel</option>
              <option value="2">Budget Comfort Inn</option>
              <option value="3">Beachfront Resort</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Target Price (per night)
            </label>
            <input
              type="number"
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              placeholder="$150"
              className="w-full px-3 py-2 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <Button onClick={handleAddAlert} className="w-full gap-2">
            <Bell className="w-4 h-4" />
            Create Alert
          </Button>
        </div>
      </Card>

      {/* Active Alerts */}
      <Card className="p-6">
        <h3 className="font-bold text-lg text-foreground mb-4">Active Alerts</h3>
        {alerts.length === 0 ? (
          <p className="text-foreground/60 text-center py-6">No price alerts yet.</p>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => {
              const savings = alert.currentPrice - alert.targetPrice;
              const savingsPercent = Math.round((savings / alert.currentPrice) * 100);

              return (
                <div
                  key={alert.id}
                  className={`p-4 rounded-lg border-2 flex items-start justify-between gap-4 ${
                    alert.notified
                      ? 'bg-green-50/50 border-green-200'
                      : 'bg-muted border-border'
                  }`}
                >
                  <div className="flex-1">
                    <div className="font-bold text-foreground">{alert.hotelName}</div>
                    <div className="text-sm text-foreground/70 mt-1">
                      <p>Current: ${alert.currentPrice.toFixed(2)}</p>
                      <p>Target: ${alert.targetPrice.toFixed(2)}</p>
                    </div>
                    {savings > 0 && (
                      <div className="text-sm font-semibold text-green-600 mt-2">
                        Save ${savings.toFixed(2)} ({savingsPercent}% off)
                      </div>
                    )}
                    {alert.notified && (
                      <div className="text-xs font-semibold text-green-600 mt-2 flex items-center gap-1">
                        <span className="w-2 h-2 bg-green-600 rounded-full"></span>
                        Price dropped! Alert sent
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => onRemoveAlert?.(alert.id)}
                    className="text-foreground/40 hover:text-red-500 transition flex-shrink-0 mt-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// Mock data
const mockAlerts: PriceAlert[] = [
  {
    id: '1',
    hotelId: '1',
    hotelName: 'Luxury Palace Hotel',
    currentPrice: 220,
    targetPrice: 180,
    created: new Date('2024-01-15'),
    notified: true,
  },
  {
    id: '2',
    hotelId: '2',
    hotelName: 'Budget Comfort Inn',
    currentPrice: 95,
    targetPrice: 75,
    created: new Date('2024-01-10'),
    notified: false,
  },
];

const mockPriceHistory: PriceHistory[] = [
  { date: 'Jan 1', price: 280 },
  { date: 'Jan 5', price: 265 },
  { date: 'Jan 10', price: 250 },
  { date: 'Jan 15', price: 220 },
  { date: 'Jan 20', price: 235 },
  { date: 'Jan 25', price: 210 },
  { date: 'Feb 1', price: 195 },
];
