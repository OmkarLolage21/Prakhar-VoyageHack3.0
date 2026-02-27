'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Circle, MapPin, Route } from 'lucide-react';

export interface Location {
  id: string;
  lat: number;
  lng: number;
  name: string;
  type?: 'hotel' | 'activity' | 'attraction';
  price?: number;
  day?: number;
}

interface MapViewProps {
  onCircleSearch?: (lat: number, lng: number, radius: number) => void;
  locations?: Location[];
  center?: { lat: number; lng: number };
  drawRoutes?: boolean;
}

export function MapView({ onCircleSearch, locations = [], center = { lat: 40, lng: -95 }, drawRoutes = true }: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [circleMode, setCircleMode] = useState(false);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const circleRef = useRef<any>(null);

  useEffect(() => {
    // Check if Mapbox API key is set
    const apiKey = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!apiKey) {
      console.warn('Mapbox API key not found. Map will display in demo mode.');
    } else {
      mapboxgl.accessToken = apiKey;
    }

    if (mapContainer.current && !map.current) {
      try {
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [center.lng, center.lat],
          zoom: 12,
        });

        map.current.on('load', () => {
          setMapLoaded(true);
        });
      } catch (error) {
        console.log('Mapbox not initialized (demo mode)');
      }
    }

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Draw routes between locations
  useEffect(() => {
    if (!map.current || !mapLoaded || locations.length < 2 || !drawRoutes) return;

    // Remove existing route layer and source
    if (map.current.getLayer('route-line')) {
      map.current.removeLayer('route-line');
    }
    if (map.current.getSource('route')) {
      map.current.removeSource('route');
    }

    // Sort locations by day for correct route order
    const sortedLocations = [...locations].sort((a, b) => (a.day || 0) - (b.day || 0));

    // Create route coordinates
    const coordinates = sortedLocations.map((loc) => [loc.lng, loc.lat]);

    // Add route source and layer
    map.current.addSource('route', {
      type: 'geojson',
      data: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coordinates,
        },
      },
    });

    map.current.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#3b82f6', 'line-width': 3, 'line-opacity': 0.6 },
    });
  }, [locations, mapLoaded, drawRoutes]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    // Add location markers
    locations.forEach((location, index) => {
      if (map.current) {
        const el = document.createElement('div');
        el.className = 'marker';
        const colors: { [key: string]: string } = {
          hotel: 'bg-blue-500',
          activity: 'bg-green-500',
          attraction: 'bg-purple-500',
        };
        const color = colors[location.type || 'hotel'] || 'bg-primary';

        el.innerHTML = `
          <div class="${color} text-white rounded-full w-10 h-10 flex items-center justify-center text-sm font-bold cursor-pointer hover:shadow-lg transition shadow-md">
            ${index + 1}
          </div>
        `;

        const popupHTML = `
          <div class="text-sm">
            <strong>${location.name}</strong>
            ${location.type ? `<br/><span class="text-xs text-gray-600">${location.type}</span>` : ''}
            ${location.price ? `<br/><span class="font-semibold">$${location.price}</span>` : ''}
            ${location.day ? `<br/><span class="text-xs text-gray-500">Day ${location.day}</span>` : ''}
          </div>
        `;

        const marker = new mapboxgl.Marker(el)
          .setLngLat([location.lng, location.lat])
          .setPopup(new mapboxgl.Popup().setHTML(popupHTML))
          .addTo(map.current);

        markersRef.current.push(marker);
      }
    });

    // Auto-fit bounds if there are locations
    if (locations.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      locations.forEach((loc) => bounds.extend([loc.lng, loc.lat]));
      map.current.fitBounds(bounds, { padding: 50 });
    }
  }, [locations, mapLoaded]);

  const handleCircleSearch = () => {
    if (!map.current) return;

    const center = map.current.getCenter();
    const radius = 5; // 5km radius

    // Call parent callback
    onCircleSearch?.(center.lat, center.lng, radius);

    // Visual feedback
    alert(`Searching for hotels within ${radius}km of current map center`);
  };

  const handleZoomToCenter = () => {
    if (map.current) {
      map.current.easeTo({
        center: [center.lng, center.lat],
        zoom: 12,
        duration: 1000,
      });
    }
  };

  return (
    <Card className="overflow-hidden h-full min-h-96">
      <div className="relative h-full">
        {/* Map Container */}
        <div
          ref={mapContainer}
          className="w-full h-full bg-muted flex items-center justify-center"
          style={{ minHeight: '500px' }}
        >
          {!mapLoaded && (
            <div className="text-center">
              <p className="text-foreground/60 mb-4">
                Map requires Mapbox API key to display.
              </p>
              <p className="text-sm text-foreground/40">
                Set NEXT_PUBLIC_MAPBOX_TOKEN in your environment variables
              </p>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="absolute top-4 right-4 space-y-2 z-10">
          <Button
            onClick={handleZoomToCenter}
            size="sm"
            variant="secondary"
            className="gap-2 shadow-lg"
          >
            <MapPin className="w-4 h-4" />
            Center Map
          </Button>

          <Button
            onClick={handleCircleSearch}
            size="sm"
            variant={circleMode ? 'default' : 'secondary'}
            className="gap-2 shadow-lg w-full"
          >
            <Circle className="w-4 h-4" />
            {circleMode ? 'Drawing...' : 'Circle Search'}
          </Button>
        </div>

        {/* Info Panel */}
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur p-4 rounded-lg shadow-lg max-w-sm">
          <h3 className="font-bold text-sm text-foreground mb-2">Trip Visualization</h3>
          <ul className="text-xs text-foreground/70 space-y-1">
            <li>• Numbered markers show trip order</li>
            <li>• Blue line connects all destinations</li>
            <li>• Click markers for location details</li>
            <li>• {locations.length} destinations on this trip</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}
