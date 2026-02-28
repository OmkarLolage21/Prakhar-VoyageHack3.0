'use client';

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Circle, MapPin, Route, X } from 'lucide-react';

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
  onCircleClear?: () => void;
  locations?: Location[];
  center?: { lat: number; lng: number };
  drawRoutes?: boolean;
  mapMinHeight?: string;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

function circleFeature(centerLng: number, centerLat: number, radiusKm: number, points = 64) {
  const earthRadiusKm = 6371;
  const latRad = (centerLat * Math.PI) / 180;
  const dLat = (radiusKm / earthRadiusKm) * (180 / Math.PI);
  const dLngBase = dLat / Math.max(0.0001, Math.cos(latRad));
  const coordinates: number[][] = [];
  for (let i = 0; i <= points; i += 1) {
    const theta = (i / points) * Math.PI * 2;
    const lng = centerLng + dLngBase * Math.cos(theta);
    const lat = centerLat + dLat * Math.sin(theta);
    coordinates.push([lng, lat]);
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates],
        },
      },
    ],
  } as GeoJSON.FeatureCollection;
}

export function MapView({
  onCircleSearch,
  onCircleClear,
  locations = [],
  center = { lat: 40, lng: -95 },
  drawRoutes = true,
  mapMinHeight = '500px',
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [drawStep, setDrawStep] = useState<'idle' | 'pick_center' | 'draw_radius'>('idle');
  const [circleCenter, setCircleCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [circleRadiusKm, setCircleRadiusKm] = useState(0);
  const [circleDraftRadiusKm, setCircleDraftRadiusKm] = useState(0);
  const [isPointerDown, setIsPointerDown] = useState(false);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const centerMarkerRef = useRef<mapboxgl.Marker | null>(null);

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

  useEffect(() => {
    if (!map.current || !mapLoaded || locations.length > 0) return;
    map.current.easeTo({
      center: [center.lng, center.lat],
      zoom: Math.max(5, map.current.getZoom()),
      duration: 700,
    });
  }, [center.lat, center.lng, mapLoaded, locations.length]);

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

  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    if (!circleCenter) {
      if (centerMarkerRef.current) {
        centerMarkerRef.current.remove();
        centerMarkerRef.current = null;
      }
      return;
    }
    if (!centerMarkerRef.current) {
      const el = document.createElement('div');
      el.innerHTML = '<div style="height:12px;width:12px;border-radius:9999px;background:#2563eb;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>';
      centerMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' });
    }
    centerMarkerRef.current.setLngLat([circleCenter.lng, circleCenter.lat]).addTo(map.current);
  }, [circleCenter, mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const instance = map.current;

    const onClick = (event: mapboxgl.MapMouseEvent) => {
      if (drawStep !== 'pick_center') return;
      const lng = event.lngLat.lng;
      const lat = event.lngLat.lat;
      setCircleCenter({ lat, lng });
      setCircleRadiusKm(0);
      setCircleDraftRadiusKm(0);
      setDrawStep('draw_radius');
    };

    const onMouseDown = (event: mapboxgl.MapMouseEvent) => {
      if (drawStep !== 'draw_radius' || !circleCenter) return;
      event.preventDefault();
      // Radius always starts from selected center and expands as user drags.
      setCircleDraftRadiusKm(0);
      setIsPointerDown(true);
    };

    const onMove = (event: mapboxgl.MapMouseEvent) => {
      if (drawStep !== 'draw_radius' || !circleCenter || !isPointerDown) return;
      const lng = event.lngLat.lng;
      const lat = event.lngLat.lat;
      const radius = distanceKm(circleCenter.lat, circleCenter.lng, lat, lng);
      setCircleDraftRadiusKm(Math.max(0, radius));
    };

    const onMouseUp = (event: mapboxgl.MapMouseEvent) => {
      if (drawStep !== 'draw_radius' || !circleCenter || !isPointerDown) return;
      const lng = event.lngLat.lng;
      const lat = event.lngLat.lat;
      const radius = Math.max(circleDraftRadiusKm, distanceKm(circleCenter.lat, circleCenter.lng, lat, lng));
      setIsPointerDown(false);
      if (radius <= 0) return;
      setCircleRadiusKm(radius);
      setCircleDraftRadiusKm(radius);
      setDrawStep('idle');
      onCircleSearch?.(circleCenter.lat, circleCenter.lng, radius);
    };

    instance.on('click', onClick);
    instance.on('mousedown', onMouseDown);
    instance.on('mousemove', onMove);
    instance.on('mouseup', onMouseUp);
    return () => {
      instance.off('click', onClick);
      instance.off('mousedown', onMouseDown);
      instance.off('mousemove', onMove);
      instance.off('mouseup', onMouseUp);
    };
  }, [drawStep, circleCenter, circleDraftRadiusKm, isPointerDown, mapLoaded, onCircleSearch]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const instance = map.current;
    const shouldLockMap = drawStep === 'draw_radius';

    if (shouldLockMap) {
      instance.dragPan.disable();
      instance.scrollZoom.disable();
      instance.boxZoom.disable();
      instance.doubleClickZoom.disable();
      instance.touchZoomRotate.disable();
    } else {
      if (!instance.dragPan.isEnabled()) instance.dragPan.enable();
      if (!instance.scrollZoom.isEnabled()) instance.scrollZoom.enable();
      if (!instance.boxZoom.isEnabled()) instance.boxZoom.enable();
      if (!instance.doubleClickZoom.isEnabled()) instance.doubleClickZoom.enable();
      if (!instance.touchZoomRotate.isEnabled()) instance.touchZoomRotate.enable();
    }
  }, [drawStep, mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const canvas = map.current.getCanvas();
    if (drawStep === 'pick_center') {
      canvas.style.cursor = 'crosshair';
      return;
    }
    if (drawStep === 'draw_radius') {
      canvas.style.cursor = 'crosshair';
      return;
    }
    canvas.style.cursor = 'grab';
  }, [drawStep, mapLoaded]);

  useEffect(() => {
    if (!map.current || !mapLoaded) return;
    const sourceId = 'circle-source';
    const fillId = 'circle-fill';
    const outlineId = 'circle-outline';
    const activeRadius = drawStep === 'draw_radius' ? circleDraftRadiusKm : circleRadiusKm;

    const removeCircleLayers = () => {
      if (map.current?.getLayer(fillId)) map.current.removeLayer(fillId);
      if (map.current?.getLayer(outlineId)) map.current.removeLayer(outlineId);
      if (map.current?.getSource(sourceId)) map.current.removeSource(sourceId);
    };

    if (!circleCenter || activeRadius <= 0) {
      removeCircleLayers();
      return;
    }

    const data = circleFeature(circleCenter.lng, circleCenter.lat, activeRadius);
    const existingSource = map.current.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
    if (existingSource) {
      existingSource.setData(data as any);
    } else {
      map.current.addSource(sourceId, { type: 'geojson', data: data as any });
      map.current.addLayer({
        id: fillId,
        type: 'fill',
        source: sourceId,
        paint: { 'fill-color': '#3b82f6', 'fill-opacity': 0.14 },
      });
      map.current.addLayer({
        id: outlineId,
        type: 'line',
        source: sourceId,
        paint: { 'line-color': '#3b82f6', 'line-width': 2, 'line-opacity': 0.8 },
      });
    }

    return () => {
      // keep last circle on screen; cleanup handled by unmount or explicit clear
    };
  }, [drawStep, circleCenter, circleDraftRadiusKm, circleRadiusKm, mapLoaded]);

  const startCircleDraw = () => {
    setDrawStep('pick_center');
    setCircleCenter(null);
    setCircleRadiusKm(0);
    setCircleDraftRadiusKm(0);
    setIsPointerDown(false);
  };

  const clearCircle = () => {
    setDrawStep('idle');
    setCircleCenter(null);
    setCircleRadiusKm(0);
    setCircleDraftRadiusKm(0);
    setIsPointerDown(false);
    if (centerMarkerRef.current) {
      centerMarkerRef.current.remove();
      centerMarkerRef.current = null;
    }
    onCircleClear?.();
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
          style={{ minHeight: mapMinHeight }}
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
            onClick={drawStep === 'idle' ? startCircleDraw : clearCircle}
            size="sm"
            variant={drawStep === 'idle' ? 'secondary' : 'default'}
            className="gap-2 shadow-lg w-full"
          >
            <Circle className="w-4 h-4" />
            {drawStep === 'idle' ? 'Circle Search' : 'Cancel Circle'}
          </Button>
          {drawStep === 'idle' && circleCenter && circleRadiusKm > 0 && (
            <Button onClick={clearCircle} size="sm" variant="secondary" className="gap-2 shadow-lg w-full">
              <X className="w-4 h-4" />
              Clear Region
            </Button>
          )}
        </div>

        {/* Info Panel */}
        <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur p-4 rounded-lg shadow-lg max-w-sm">
          <h3 className="font-bold text-sm text-foreground mb-2">Map View</h3>
          <ul className="text-xs text-foreground/70 space-y-1">
            <li>• Numbered markers show trip order</li>
            <li>• Blue line connects all destinations</li>
            <li>• Click markers for location details</li>
            <li>• {locations.length} destinations on this trip</li>
            {drawStep === 'pick_center' && <li>• Step 2: tap map to set center (map is movable)</li>}
            {drawStep === 'draw_radius' && <li>• Step 3: press-drag-release to draw radius (map is locked)</li>}
            {drawStep === 'idle' && circleCenter && circleRadiusKm > 0 && (
              <li>• Circle radius: {circleRadiusKm.toFixed(2)} km</li>
            )}
          </ul>
        </div>
      </div>
    </Card>
  );
}
