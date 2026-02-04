"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";

// Leafletのデフォルトアイコンの修正
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = defaultIcon;

interface MapProps {
  center: [number, number];
  marker: [number, number] | null;
  flyTo?: { center: [number, number]; zoom: number } | null;
  onMapClick: (lat: number, lng: number) => void;
}

function MapEvents({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  const map = useMap();

  useEffect(() => {
    const handler = (e: L.LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    };
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [map, onMapClick]);

  return null;
}

function FlyTo({ center, zoom = 16 }: { center: [number, number]; zoom?: number }) {
  const map = useMap();

  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1.5 });
  }, [map, center, zoom]);

  return null;
}

export default function Map({ center, marker, flyTo, onMapClick }: MapProps) {
  return (
    <MapContainer center={center} zoom={12} className="h-full w-full rounded-lg">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapEvents onMapClick={onMapClick} />
      {flyTo && !marker && (
        <FlyTo center={flyTo.center} zoom={flyTo.zoom} />
      )}
      {marker && (
        <>
          <FlyTo center={marker} zoom={17} />
          <Marker position={marker}>
            <Popup>
              {marker[0].toFixed(6)}, {marker[1].toFixed(6)}
            </Popup>
          </Marker>
        </>
      )}
    </MapContainer>
  );
}
