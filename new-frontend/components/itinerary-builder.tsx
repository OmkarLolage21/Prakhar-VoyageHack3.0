'use client';

import { Button } from '@/components/ui/button';
import { Clock, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

export interface Activity {
  id: string;
  title: string;
  description: string;
  time: string;
  location: string;
  type: 'hotel' | 'activity' | 'meal' | 'transport';
}

export interface Day {
  date: string;
  activities: Activity[];
}

interface ItineraryBuilderProps {
  tripName: string;
  startDate: string;
  endDate: string;
  days?: Day[];
  onChange?: (days: Day[]) => void;
  onSave?: (days: Day[]) => void;
  onDropLocation?: (location: { id: string; name: string; lat: number; lng: number; type?: string; day?: number }) => void;
}

const activityTypeColors: Record<Activity['type'], string> = {
  hotel: 'bg-blue-50 border-blue-200',
  activity: 'bg-green-50 border-green-200',
  meal: 'bg-orange-50 border-orange-200',
  transport: 'bg-purple-50 border-purple-200',
};

const activityTypeLabels: Record<Activity['type'], string> = {
  hotel: 'Accommodation',
  activity: 'Activity',
  meal: 'Meal',
  transport: 'Transport',
};

function normalizeIsoDate(value: string): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
}

function buildDateRange(startDate: string, endDate: string): string[] {
  const start = new Date(normalizeIsoDate(startDate));
  const end = new Date(normalizeIsoDate(endDate || startDate));
  const diffMs = Math.max(0, end.getTime() - start.getTime());
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  const out: string[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    out.push(date.toISOString().slice(0, 10));
  }
  return out;
}

function makeActivity(type: Activity['type']): Activity {
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    title: type === 'meal' ? 'Meal' : type === 'hotel' ? 'Hotel' : type === 'transport' ? 'Transport' : 'Activity',
    description: '',
    time: '09:00',
    location: '',
    type,
  };
}

export function ItineraryBuilder({
  tripName,
  startDate,
  endDate,
  days,
  onChange,
  onSave,
  onDropLocation,
}: ItineraryBuilderProps) {
  const isControlled = Array.isArray(days);
  const [internalDays, setInternalDays] = useState<Day[]>([]);
  const targetDays = days ?? internalDays;

  const expectedDates = useMemo(() => buildDateRange(startDate, endDate), [startDate, endDate]);

  useEffect(() => {
    if (isControlled) return;
    setInternalDays((prev) => {
      if (!prev.length) {
        return expectedDates.map((date) => ({ date, activities: [] }));
      }
      const byDate = new Map(prev.map((d) => [d.date, d.activities]));
      return expectedDates.map((date) => ({ date, activities: byDate.get(date) ?? [] }));
    });
  }, [expectedDates, isControlled]);

  const updateDays = (next: Day[]) => {
    if (!isControlled) {
      setInternalDays(next);
    }
    onChange?.(next);
  };

  const addDay = () => {
    const fallbackStart = normalizeIsoDate(startDate);
    const lastDate = targetDays[targetDays.length - 1]?.date ?? fallbackStart;
    const nextDate = new Date(lastDate);
    nextDate.setDate(nextDate.getDate() + 1);
    updateDays([...targetDays, { date: nextDate.toISOString().slice(0, 10), activities: [] }]);
  };

  const removeDay = (dayIndex: number) => {
    if (targetDays.length <= 1) return;
    updateDays(targetDays.filter((_, idx) => idx !== dayIndex));
  };

  const addActivity = (dayIndex: number, type: Activity['type'] = 'activity') => {
    const next = targetDays.map((day, idx) =>
      idx === dayIndex ? { ...day, activities: [...day.activities, makeActivity(type)] } : day
    );
    updateDays(next);
  };

  const removeActivity = (dayIndex: number, activityId: string) => {
    const next = targetDays.map((day, idx) =>
      idx === dayIndex ? { ...day, activities: day.activities.filter((a) => a.id !== activityId) } : day
    );
    updateDays(next);
  };

  const updateActivity = (dayIndex: number, activityId: string, patch: Partial<Activity>) => {
    const next = targetDays.map((day, idx) =>
      idx === dayIndex
        ? {
            ...day,
            activities: day.activities.map((a) => (a.id === activityId ? { ...a, ...patch } : a)),
          }
        : day
    );
    updateDays(next);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="border-b border-border px-6 py-4 bg-white flex items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Trip Itinerary</h2>
          <p className="text-sm text-foreground/70">{tripName || 'Untitled Trip'}</p>
        </div>
        {onSave && (
          <Button size="sm" variant="outline" onClick={() => onSave(targetDays)}>
            Save
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 py-4">
        <div className="flex gap-4 pb-4" style={{ minWidth: 'min-content' }}>
          {targetDays.map((day, dayIndex) => (
            <div
              key={`${day.date}-${dayIndex}`}
              className="flex flex-col flex-shrink-0 w-80 bg-white rounded-xl border border-border overflow-hidden"
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('bg-primary/10', 'border-primary/50');
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove('bg-primary/10', 'border-primary/50');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('bg-primary/10', 'border-primary/50');
                try {
                  const result = JSON.parse(e.dataTransfer.getData('text/plain'));
                  const mapped: Activity = {
                    id: `drop-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
                    title: String(result.name || 'Activity'),
                    description: String(result.description || ''),
                    time: '10:00',
                    location: String(result.name || ''),
                    type: result.type === 'hotel' ? 'hotel' : result.type === 'restaurant' ? 'meal' : 'activity',
                  };
                  const next = targetDays.map((d, idx) =>
                    idx === dayIndex ? { ...d, activities: [...d.activities, mapped] } : d
                  );
                  updateDays(next);
                  if (result.lat && result.lng) {
                    onDropLocation?.({
                      id: String(result.id || mapped.id),
                      name: String(result.name || mapped.title),
                      lat: Number(result.lat),
                      lng: Number(result.lng),
                      type: String(result.type || 'activity'),
                      day: dayIndex + 1,
                    });
                  }
                } catch {
                  // ignore invalid drag payload
                }
              }}
            >
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-foreground">Day {dayIndex + 1}</h3>
                  <p className="text-xs text-foreground/60">
                    {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                {targetDays.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => removeDay(dayIndex)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 h-6 w-6 p-0"
                    title="Delete this day"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>

              <div className="flex-1 p-3 space-y-2 overflow-y-auto max-h-80 min-h-24">
                {day.activities.map((activity) => (
                  <div key={activity.id} className={`p-3 rounded-lg transition ${activityTypeColors[activity.type]}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-primary/80 mb-1">{activityTypeLabels[activity.type]}</div>
                        <input
                          type="text"
                          value={activity.title}
                          onChange={(e) => updateActivity(dayIndex, activity.id, { title: e.target.value })}
                          className="w-full text-sm font-semibold text-foreground bg-transparent border-0 p-0 mb-2 focus:outline-none focus:bg-white/50"
                          placeholder="Activity"
                        />
                        <input
                          type="text"
                          value={activity.location}
                          onChange={(e) => updateActivity(dayIndex, activity.id, { location: e.target.value })}
                          className="w-full text-xs text-foreground/70 bg-transparent border-0 p-0 mb-2 focus:outline-none focus:bg-white/50"
                          placeholder="Location"
                        />
                        <div className="flex items-center gap-2 text-xs text-foreground/70">
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          <input
                            type="time"
                            value={activity.time}
                            onChange={(e) => updateActivity(dayIndex, activity.id, { time: e.target.value })}
                            className="bg-transparent border-0 p-0 focus:outline-none text-xs"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeActivity(dayIndex, activity.id)}
                        className="text-foreground/40 hover:text-red-500 transition flex-shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border px-3 py-2">
                <Button size="sm" variant="outline" onClick={() => addActivity(dayIndex)} className="w-full gap-2 text-xs">
                  <Plus className="w-3 h-3" />
                  Add Activity
                </Button>
              </div>
            </div>
          ))}

          <div className="flex-shrink-0 w-80 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl bg-background/50 min-h-24">
            <Button size="sm" variant="ghost" onClick={addDay} className="gap-2 text-foreground/60">
              <Plus className="w-5 h-5" />
              Add Day
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
