'use client';

import React, { useState, useEffect, useRef } from 'react';
import Map, { Source, Layer, MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { motion, AnimatePresence } from 'framer-motion';
import MapLegend from './MapLegend';

interface MapComponentProps {
  year: number;
  analysisData: Record<string, unknown> | null;
  isLoading?: boolean;
  selectedVillage?: string | null;
  onAoiChange?: (geojson: { type: 'Polygon'; coordinates: PolygonCoordinates } | null) => void;
}

// Color source of truth
const COLORS = {
  mangrove: '#4ADE80',
  erosion: '#F87171',
  risk: '#FB923C',
  villageHigh: '#FF4B4B',
  villageModerate: '#FFB347',
  villageLow: '#4ADE80',
};

type LngLat = [number, number];
type PolygonCoordinates = LngLat[][];
type VillageRisk = 'High' | 'Moderate' | 'Low';
type VillageFeature = {
  type: 'Feature';
  properties: { name: string; risk: VillageRisk };
  geometry: { type: 'Polygon'; coordinates: PolygonCoordinates };
};
type VillageFeatureCollection = { type: 'FeatureCollection'; features: VillageFeature[] };
type AoiPolygon = { type: 'Polygon'; coordinates: PolygonCoordinates };

const VILLAGE_DATA: VillageFeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Satkhira', risk: 'High' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [89.08, 22.18], [89.13, 22.18], [89.13, 22.23], [89.08, 22.23], [89.08, 22.18]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'Gosaba', risk: 'Moderate' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [88.78, 22.14], [88.83, 22.14], [88.83, 22.19], [88.78, 22.19], [88.78, 22.14]
        ]]
      }
    },
    {
      type: 'Feature',
      properties: { name: 'Kultali', risk: 'Low' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [88.56, 22.06], [88.61, 22.06], [88.61, 22.11], [88.56, 22.11], [88.56, 22.06]
        ]]
      }
    }
  ]
};

const MapComponent = ({ year, analysisData, isLoading, selectedVillage, onAoiChange }: MapComponentProps) => {
  const mapRef = useRef<MapRef>(null);
  const [mode, setMode] = useState<'natural' | 'ndvi'>('natural');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [hoveredLayer, setHoveredLayer] = useState<string | null>(null);
  const [isDrawingAoi, setIsDrawingAoi] = useState(false);
  const [draftPoints, setDraftPoints] = useState<LngLat[]>([]);
  const [cursorPoint, setCursorPoint] = useState<LngLat | null>(null);
  const [aoi, setAoi] = useState<AoiPolygon | null>(null);
  const [viewState, setViewState] = useState({
    longitude: 88.85, // Sundarbans longitude
    latitude: 21.9, // Sundarbans latitude
    zoom: 9
  });

  // Stadia Maps - Open Source Token-Free Style
  const styleUrl = `https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json`;

  // Update tiles when year or mode changes
  useEffect(() => {
    // Safety check 1: Ref must exist
    if (!mapRef.current) return;

    // Safety check 2: Get the underlying MapLibre instance
    const map = mapRef.current.getMap();
    if (!map) return;

    // Safety check 3: Wait until style is fully loaded
    if (!mapLoaded || !map.isStyleLoaded()) {
      console.log("Map or style not ready yet, skipping tile update");
      return;
    }

    const refreshTiles = async () => {
      try {
        console.log(`Frontend requesting tiles for year: ${year}, mode: ${mode}`);
        // Add cache-busting version parameter
        const response = await fetch(`http://localhost:8000/api/tiles?year=${year}&mode=${mode}&v=${Date.now()}`);

        if (!response.ok) {
          throw new Error(`Failed to fetch tiles: ${response.statusText}`);
        }

        const data = await response.json();
        const tileUrl = data.url;

        if (!tileUrl) {
          console.error("No tile URL returned from backend");
          return;
        }

        // Nuclear Option: Remove existing layer and source to force refresh
        if (map.getLayer('satellite-layer')) {
          map.removeLayer('satellite-layer');
        }
        if (map.getSource('satellite-source')) {
          map.removeSource('satellite-source');
        }

        // Re-add source with new dynamic URL
        map.addSource('satellite-source', {
          type: 'raster',
          tiles: [tileUrl],
          tileSize: 256
        });

        // Re-add layer at the bottom (before erosion layer if it exists)
        map.addLayer({
          id: 'satellite-layer',
          type: 'raster',
          source: 'satellite-source',
          paint: { 'raster-opacity': 0.8 }
        }, map.getLayer('erosion-layer') ? 'erosion-layer' : undefined);

        console.log(`Successfully updated map tiles for year ${year}`);
        map.fire('yearchange', { year });
      } catch (err) {
        console.error("Error refreshing map data:", err);
      }
    };

    refreshTiles();
  }, [year, mode, mapLoaded]);

  // Handle flyTo when village is selected
  useEffect(() => {
    if (selectedVillage && mapRef.current) {
      const village = VILLAGE_DATA.features.find(f => f.properties?.name === selectedVillage);
      if (village && village.geometry.type === 'Polygon') {
        const coords = village.geometry.coordinates[0][0];
        mapRef.current.flyTo({
          center: [coords[0], coords[1]],
          zoom: 12,
          duration: 2000
        });
      }
    }
  }, [selectedVillage]);

  const closeRing = (points: LngLat[]) => {
    if (points.length < 3) return points;
    const first = points[0];
    const last = points[points.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) return points;
    return [...points, first];
  };

  const startDrawing = () => {
    setIsDrawingAoi(true);
    setDraftPoints([]);
    setCursorPoint(null);
    setAoi(null);
    onAoiChange?.(null);
  };

  const cancelDrawing = () => {
    setIsDrawingAoi(false);
    setDraftPoints([]);
    setCursorPoint(null);
  };

  const finishDrawing = () => {
    if (draftPoints.length < 3) return;
    const ring = closeRing(draftPoints);
    const geojson: AoiPolygon = { type: 'Polygon', coordinates: [ring] };
    setAoi(geojson);
    setIsDrawingAoi(false);
    setDraftPoints([]);
    setCursorPoint(null);
    onAoiChange?.(geojson);
  };

  const clearAoi = () => {
    setAoi(null);
    setDraftPoints([]);
    setCursorPoint(null);
    setIsDrawingAoi(false);
    onAoiChange?.(null);
  };

  // Helper to get opacity based on hover state
  const getOpacity = (layerId: string) => {
    if (!hoveredLayer) return 0.5;
    return hoveredLayer === layerId ? 1.0 : 0.1;
  };

  const draftLine = draftPoints.length
    ? {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: [...draftPoints, ...(cursorPoint ? [cursorPoint] : [])],
        },
        properties: {},
      }
    : null;

  const aoiFeature = aoi
    ? {
        type: 'Feature' as const,
        geometry: aoi,
        properties: {},
      }
    : null;

  const onMapClick = (evt: { lngLat: { lng: number; lat: number } }) => {
    if (!isDrawingAoi) return;
    const p: LngLat = [evt.lngLat.lng, evt.lngLat.lat];
    setDraftPoints((prev) => [...prev, p]);
  };

  const onMapMove = (evt: { lngLat: { lng: number; lat: number } }) => {
    if (!isDrawingAoi) return;
    if (!draftPoints.length) return;
    setCursorPoint([evt.lngLat.lng, evt.lngLat.lat]);
  };

  return (
    <div className="relative w-full h-full">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        onClick={onMapClick}
        onMouseMove={onMapMove}
        onDblClick={() => {
          if (isDrawingAoi) finishDrawing();
        }}
        doubleClickZoom={!isDrawingAoi}
        onLoad={() => setMapLoaded(true)}
        onStyleData={() => {
          // Additional safety to ensure style-dependent operations are possible
          const map = mapRef.current?.getMap();
          if (map?.isStyleLoaded()) setMapLoaded(true);
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={styleUrl}
      >
        {draftLine && (
          <Source id="aoi-draft" type="geojson" data={draftLine}>
            <Layer
              id="aoi-draft-line"
              type="line"
              paint={{
                'line-color': '#22c55e',
                'line-width': 2,
                'line-dasharray': [1.5, 1.5],
              }}
            />
          </Source>
        )}

        {aoiFeature && (
          <Source id="aoi-final" type="geojson" data={aoiFeature}>
            <Layer
              id="aoi-fill"
              type="fill"
              paint={{
                'fill-color': '#22c55e',
                'fill-opacity': 0.14,
              }}
            />
            <Layer
              id="aoi-outline"
              type="line"
              paint={{
                'line-color': '#22c55e',
                'line-width': 2.5,
                'line-opacity': 0.9,
              }}
            />
          </Source>
        )}

        {/* Render analysis data if available */}
        {analysisData && (
          <>
            {/* Mangrove Cover Layer */}
            <Source id="mangrove-data" type="geojson" data={{
              type: 'Feature',
              geometry: {
                type: 'Polygon',
                coordinates: [[[88.5, 21.6], [89.2, 21.6], [89.2, 22.0], [88.5, 22.0], [88.5, 21.6]]]
              },
              properties: {}
            }}>
              <Layer
                id="mangrove-layer"
                type="fill"
                paint={{
                  'fill-color': COLORS.mangrove,
                  'fill-opacity': getOpacity('Mangrove Cover'),
                  'fill-outline-color': '#fff'
                }}
              />
            </Source>

            {/* High Erosion Layer */}
             <Source id="erosion-data" type="geojson" data={{
               type: 'Feature',
               geometry: {
                 type: 'Polygon',
                 coordinates: [[[88.5, 21.5], [89.2, 21.5], [89.2, 22.2], [88.5, 22.2], [88.5, 21.5]]]
               },
               properties: {}
             }}>
               <Layer
                 id="erosion-layer"
                 type="fill"
                 paint={{
                   'fill-color': COLORS.erosion,
                   'fill-opacity': getOpacity('High Erosion'),
                   'fill-outline-color': '#fff'
                 }}
               />
             </Source>

             {/* Risk Zones Layer */}
             <Source id="risk-data" type="geojson" data={{
               type: 'Feature',
               geometry: {
                 type: 'Polygon',
                 coordinates: [[[88.6, 21.6], [89.1, 21.6], [89.1, 22.1], [88.6, 22.1], [88.6, 21.6]]]
               },
               properties: {}
             }}>
               <Layer
                 id="risk-layer"
                 type="fill"
                 paint={{
                   'fill-color': COLORS.risk,
                   'fill-opacity': getOpacity('Risk Zones'),
                   'fill-outline-color': '#fff'
                 }}
               />
             </Source>
          </>
        )}

        {/* Village Boundary Layer */}
        <Source id="village-data" type="geojson" data={VILLAGE_DATA}>
          <Layer
            id="village-fill"
            type="fill"
            paint={{
              'fill-color': [
                'match',
                ['get', 'risk'],
                'High', COLORS.villageHigh,
                'Moderate', COLORS.villageModerate,
                'Low', COLORS.villageLow,
                '#ccc'
              ],
              'fill-opacity': 0.4
            }}
          />
          <Layer
            id="village-outline"
            type="line"
            paint={{
              'line-color': [
                'case',
                ['==', ['get', 'name'], selectedVillage || ''],
                '#ffffff',
                'rgba(255,255,255,0.3)'
              ],
              'line-width': [
                'case',
                ['==', ['get', 'name'], selectedVillage || ''],
                3,
                1
              ],
              'line-blur': [
                'case',
                ['==', ['get', 'name'], selectedVillage || ''],
                2,
                0
              ]
            }}
          />
        </Source>
      </Map>

      <div className="absolute top-6 right-6 bottom-56 z-20 flex w-56 flex-col gap-4 overflow-y-auto pr-1 pointer-events-auto">
        <div className="flex bg-slate-900/60 backdrop-blur-md p-1 rounded-lg border border-white/10 shadow-2xl shrink-0">
          <button
            onClick={() => setMode('natural')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${mode === 'natural'
              ? 'bg-emerald-500 text-white shadow-lg'
              : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            Natural
          </button>
          <button
            onClick={() => setMode('ndvi')}
            className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${mode === 'ndvi'
              ? 'bg-emerald-500 text-white shadow-lg'
              : 'text-slate-400 hover:text-slate-200'
              }`}
          >
            NDVI
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={year}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-slate-900/80 backdrop-blur-md border border-slate-700 p-4 rounded-xl shadow-2xl shrink-0"
          >
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Observation Year</div>
            <div className="text-3xl font-bold text-white tracking-tight">{year}</div>
            <div className="mt-2 text-[10px] text-slate-500 font-mono">
              {viewState.latitude.toFixed(4)}°N, {viewState.longitude.toFixed(4)}°E
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="shrink-0">
          <MapLegend onHover={setHoveredLayer} />
        </div>

        <div className="bg-slate-900/80 backdrop-blur-md border border-slate-700 p-4 rounded-xl shadow-2xl shrink-0">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-2">Area of Interest</div>
          <div className="flex flex-col gap-2">
            {!isDrawingAoi ? (
              <button
                type="button"
                onClick={startDrawing}
                className="w-full rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold py-2 transition-colors"
              >
                Draw AOI
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={finishDrawing}
                  disabled={draftPoints.length < 3}
                  className="rounded-lg bg-emerald-500 disabled:bg-emerald-900 disabled:text-slate-500 hover:bg-emerald-600 text-white text-xs font-bold py-2 transition-colors"
                >
                  Finish
                </button>
                <button
                  type="button"
                  onClick={cancelDrawing}
                  className="rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold py-2 transition-colors border border-white/10"
                >
                  Cancel
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={clearAoi}
              className="w-full rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold py-2 transition-colors border border-white/10"
            >
              Clear AOI
            </button>
          </div>
          {isDrawingAoi ? (
            <div className="mt-3 text-[11px] leading-snug text-slate-400">
              Click to add vertices. Double-click or press Finish to close the polygon.
            </div>
          ) : (
            <div className="mt-3 text-[11px] leading-snug text-slate-500">
              {aoi ? 'AOI locked. Analysis uses this polygon.' : 'No AOI set yet.'}
            </div>
          )}
        </div>
      </div>

      {/* Loading Overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] z-50 flex items-center justify-center pointer-events-none"
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest bg-slate-900/80 px-4 py-2 rounded-lg border border-emerald-500/20">
                Updating Satellite Layer: {year}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MapComponent;
