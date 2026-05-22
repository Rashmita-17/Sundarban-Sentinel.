'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';

interface TemporalSliderProps {
  currentYear: number;
  onYearChange: (year: number) => void;
}

const YEARS = [2022, 2023, 2024, 2025, 2026];

const TemporalSlider = ({ currentYear, onYearChange }: TemporalSliderProps) => {
  const [isPlaying, setIsPlaying] = React.useState(false);

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        const currentIndex = YEARS.indexOf(currentYear);
        const nextIndex = (currentIndex + 1) % YEARS.length;
        onYearChange(YEARS[nextIndex]);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentYear, onYearChange]);

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-[600px] z-10">
      <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 p-6 rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2 bg-emerald-500 hover:bg-emerald-600 rounded-full text-slate-900 transition-colors shadow-lg shadow-emerald-500/20"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-white tabular-nums">{currentYear}</span>
              <span className="text-xs text-slate-500 font-medium uppercase tracking-widest">Temporal Analysis</span>
            </div>
          </div>

          <div className="flex gap-1">
            <button
              onClick={() => {
                const idx = YEARS.indexOf(currentYear);
                if (idx > 0) onYearChange(YEARS[idx - 1]);
              }}
              className="p-1 text-slate-500 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                const idx = YEARS.indexOf(currentYear);
                if (idx < YEARS.length - 1) onYearChange(YEARS[idx + 1]);
              }}
              className="p-1 text-slate-500 hover:text-white transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Slider Track */}
        <div className="relative h-2 bg-slate-800 rounded-full mb-8">
          <div className="absolute inset-0 flex justify-between px-1">
            {YEARS.map((year) => (
              <button
                key={year}
                onClick={() => onYearChange(year)}
                className="relative flex flex-col items-center group -top-1"
              >
                <div className={`w-4 h-4 rounded-full border-2 transition-all ${year === currentYear
                    ? 'bg-emerald-500 border-emerald-400 scale-125'
                    : 'bg-slate-700 border-slate-600 group-hover:bg-slate-500'
                  }`} />
                <span className={`absolute top-6 text-[10px] font-bold transition-colors ${year === currentYear ? 'text-emerald-400' : 'text-slate-500'
                  }`}>
                  {year}
                </span>
              </button>
            ))}
          </div>
          <motion.div
            className="absolute h-full bg-emerald-500/30 rounded-full left-0"
            initial={false}
            animate={{
              width: `${(YEARS.indexOf(currentYear) / (YEARS.length - 1)) * 100}%`
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default TemporalSlider;
