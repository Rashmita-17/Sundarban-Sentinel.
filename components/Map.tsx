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

const VILLAGE_DATA: any = {
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

const MapComponent = ({ year, analysisData, isLoading, selectedVillage }: MapComponentProps) => {
  const mapRef = useRef<MapRef>(null);
  const [mode, setMode] = useState<'natural' | 'ndvi'>('natural');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [hoveredLayer, setHoveredLayer] = useState<string | null>(null);
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
        const coords = (village.geometry as any).coordinates[0][0];
        mapRef.current.flyTo({
          center: [coords[0], coords[1]],
          zoom: 12,
          duration: 2000
        });
      }
    }
  }, [selectedVillage]);

  // Helper to get opacity based on hover state
  const getOpacity = (layerId: string) => {
    if (!hoveredLayer) return 0.5;
    return hoveredLayer === layerId ? 1.0 : 0.1;
  };

  return (
    <div className="relative w-full h-full">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        onLoad={() => setMapLoaded(true)}
        onStyleData={() => {
          // Additional safety to ensure style-dependent operations are possible
          const map = mapRef.current?.getMap();
          if (map?.isStyleLoaded()) setMapLoaded(true);
        }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={styleUrl}
      >
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

      {/* Mode Toggle Overlay */}
      <div className="absolute top-6 right-6 z-10 flex flex-col gap-4 pointer-events-auto">
        <div className="flex bg-slate-900/60 backdrop-blur-md p-1 rounded-lg border border-white/10 shadow-2xl">
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

        {/* Observation Year Panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={year}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-slate-900/80 backdrop-blur-md border border-slate-700 p-4 rounded-xl shadow-2xl min-w-[180px]"
          >
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Observation Year</div>
            <div className="text-3xl font-bold text-white tracking-tight">{year}</div>
            <div className="mt-2 text-[10px] text-slate-500 font-mono">
              {viewState.latitude.toFixed(4)}°N, {viewState.longitude.toFixed(4)}°E
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Map Legend Component */}
        <MapLegend onHover={setHoveredLayer} />
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
