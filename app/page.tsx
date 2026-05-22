'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import Map from '@/components/Map';
import TemporalSlider from '@/components/TemporalSlider';

export default function Dashboard() {
  const [currentYear, setCurrentYear] = useState(2022);
  const [analysisData, setAnalysisData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedVillage, setSelectedVillage] = useState<string | null>(null);
  const [aoiGeojson, setAoiGeojson] = useState<{ type: 'Polygon'; coordinates: Array<Array<[number, number]>> } | null>(null);

  // Trigger analysis when year changes
  useEffect(() => {
    const runAnalysis = async () => {
      if (!aoiGeojson) {
        setAnalysisData(null);
        return;
      }

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 60000);

      setLoading(true);
      try {
        const response = await fetch('http://localhost:8000/api/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            geojson: aoiGeojson,
            date_range: [`${currentYear}-01-01`, `${currentYear}-12-31`]
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Backend error ${response.status}: ${text}`);
        }

        const data = await response.json();
        if (data.status === 'success') {
          setAnalysisData(data.analysis_results);
        } else {
          throw new Error(data?.message || 'Analysis failed');
        }
      } catch (error) {
        setAnalysisData(null);
        console.error('Analysis failed:', error);
      } finally {
        window.clearTimeout(timeout);
        setLoading(false);
      }
    };

    runAnalysis();
  }, [currentYear, aoiGeojson]);

  return (
    <main className="flex h-screen w-full overflow-hidden bg-slate-950">
      {/* Sidebar - Fixed width */}
      <Sidebar 
        analysisData={analysisData} 
        currentYear={currentYear} 
        selectedVillage={selectedVillage}
        onVillageSelect={setSelectedVillage}
      />

      {/* Main Content - Flexible width */}
      <div className="relative flex-1 h-full">
        {/* Full-screen Map Component */}
        <Map 
          year={currentYear} 
          analysisData={analysisData} 
          isLoading={loading}
          selectedVillage={selectedVillage}
          onAoiChange={setAoiGeojson}
        />

        {/* Loading Indicator */}
        {loading && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20">
            <div className="bg-emerald-500/20 backdrop-blur-md border border-emerald-500/30 px-4 py-2 rounded-full flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Processing Satellite Data...</span>
            </div>
          </div>
        )}

        {/* Temporal Slider at the bottom */}
        <TemporalSlider
          currentYear={currentYear}
          onYearChange={setCurrentYear}
        />

        {/* Top Header Overlay */}
        <div className="absolute top-6 left-6 z-10 pointer-events-none">
          <div className="flex items-center gap-3 bg-slate-900/40 backdrop-blur-sm px-4 py-2 rounded-lg border border-white/5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-widest">
              Live Satellite Feed
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
