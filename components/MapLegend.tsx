'use client';

import React from 'react';

interface MapLegendProps {
  onHover?: (label: string | null) => void;
}

const MapLegend = ({ onHover }: MapLegendProps) => {
  const legendItems = [
    { color: '#4ADE80', label: 'Mangrove Cover' },
    { color: '#F87171', label: 'High Erosion' },
    { color: '#FB923C', label: 'Risk Zones' },
  ];

  return (
    <div className="bg-slate-900/70 backdrop-blur-md border border-slate-700/60 p-4 rounded-xl shadow-2xl w-full">
      <h3 className="text-[10px] font-bold text-slate-400 mb-3 uppercase tracking-[0.22em] font-sans">
        Map Legend
      </h3>
      <div className="space-y-2.5">
        {legendItems.map((item) => (
          <div 
            key={item.label} 
            className="flex items-center gap-3 group cursor-pointer"
            onMouseEnter={() => onHover?.(item.label)}
            onMouseLeave={() => onHover?.(null)}
          >
            <div 
              className="w-2.5 h-2.5 rounded-full shadow-[0_0_10px_rgba(2,6,23,0.8)] ring-1 ring-white/10 transition-transform group-hover:scale-110" 
              style={{ backgroundColor: item.color }} 
            />
            <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MapLegend;
