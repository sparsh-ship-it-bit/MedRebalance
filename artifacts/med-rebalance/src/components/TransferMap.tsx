import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Hospital, StockoutRequest, Transfer } from '@/lib/types';

interface Props {
  hospitals: Hospital[];
  transfers: Transfer[];
  stockouts: StockoutRequest[];
}

export default function TransferMap({ hospitals, transfers, stockouts }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Center on Mumbai metro cluster
    const map = L.map(containerRef.current, {
      center: [19.10, 72.90],
      zoom: 11,
      zoomControl: true,
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear previous layers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) {
        map.removeLayer(layer);
      }
    });

    const stockoutHospitalIds = new Set(stockouts.map((s) => s.hospital_id));

    // Hospital markers
    hospitals.forEach((h) => {
      const hasStockout = stockoutHospitalIds.has(h.id);
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `
          <div style="
            width: 28px; height: 28px; border-radius: 50%;
            background: ${hasStockout ? '#64748b' : '#0f766e'};
            border: 3px solid white;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex; align-items: center; justify-content: center;
            font-size: 14px; color: white; font-weight: bold;
          ">${hasStockout ? '!' : '+'}</div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([h.lat, h.lng], { icon }).addTo(map);
      marker.bindPopup(`
        <div style="font-family: system-ui, sans-serif; min-width: 160px;">
          <div style="font-weight: 600; font-size: 14px; color: #1e293b; margin-bottom: 4px;">${h.name}</div>
          <div style="font-size: 12px; color: #64748b;">${h.address}</div>
          ${hasStockout ? '<div style="font-size: 11px; color: #64748b; margin-top: 4px; font-weight: 500;">Active stockout</div>' : ''}
        </div>
      `);
    });

    // Transfer lines
    transfers.forEach((t) => {
      const from = hospitals.find((h) => h.id === t.from_hospital_id);
      const to = hospitals.find((h) => h.id === t.to_hospital_id);
      if (!from || !to) return;

      const latlngs: L.LatLngExpression[] = [
        [from.lat, from.lng],
        [to.lat, to.lng],
      ];

      // Curved line with arrow
      const line = L.polyline(latlngs, {
        color: '#0d9488',
        weight: 3,
        opacity: 0.7,
        dashArray: '8,6',
      }).addTo(map);

      // Arrow at midpoint
      const midLat = (from.lat + to.lat) / 2;
      const midLng = (from.lng + to.lng) / 2;
      const angle = (Math.atan2(to.lat - from.lat, to.lng - from.lng) * 180) / Math.PI;
      const arrowIcon = L.divIcon({
        className: 'arrow-marker',
        html: `<div style="transform: rotate(${-angle}deg); font-size: 18px; color: #0d9488; line-height: 1;">➤</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });
      L.marker([midLat, midLng], { icon: arrowIcon }).addTo(map);

      line.bindPopup(`
        <div style="font-family: system-ui, sans-serif; min-width: 180px;">
          <div style="font-weight: 600; font-size: 13px; color: #1e293b;">Transfer: ${t.quantity} units</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">${from.name} → ${to.name}</div>
          <div style="font-size: 12px; color: #64748b;">Distance: ${t.distance_km} km · Cost: ₹${t.transfer_cost.toLocaleString('en-IN')}</div>
        </div>
      `);
    });
  }, [hospitals, transfers, stockouts]);

  return <div ref={containerRef} className="w-full h-[420px] rounded-b-2xl" />;
}
