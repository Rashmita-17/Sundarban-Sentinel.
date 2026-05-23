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
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-[720px] z-30">
      <div className="bg-slate-950/70 backdrop-blur-xl border border-white/12 px-6 py-5 rounded-2xl shadow-[0_0_55px_rgba(2,6,23,0.9)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="p-2.5 bg-emerald-500 hover:bg-emerald-600 rounded-full text-slate-900 transition-colors shadow-lg shadow-emerald-500/20 ring-1 ring-white/10"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </button>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-white tabular-nums tracking-tight">{currentYear}</span>
              <span className="hidden sm:inline text-[11px] text-slate-400 font-semibold uppercase tracking-[0.22em]">Temporal Analysis</span>
            </div>
          </div>

          <div className="flex gap-1">
            <button
              onClick={() => {
                const idx = YEARS.indexOf(currentYear);
                if (idx > 0) onYearChange(YEARS[idx - 1]);
              }}
              className="p-1.5 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                const idx = YEARS.indexOf(currentYear);
                if (idx < YEARS.length - 1) onYearChange(YEARS[idx + 1]);
              }}
              className="p-1.5 text-slate-400 hover:text-white transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="mt-5">
          <div className="relative h-2.5 rounded-full bg-slate-800/70 border border-white/8 overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500/55 via-emerald-400/35 to-emerald-300/10"
              initial={false}
              animate={{
                width: `${(YEARS.indexOf(currentYear) / (YEARS.length - 1)) * 100}%`,
              }}
            />
            <div className="absolute inset-0 flex justify-between px-2">
              {YEARS.map((y) => (
                <div key={y} className="h-full w-px bg-white/10" />
              ))}
            </div>
          </div>

          <div className="mt-3 flex justify-between gap-2">
            {YEARS.map((year) => {
              const active = year === currentYear;
              return (
                <button
                  key={year}
                  onClick={() => onYearChange(year)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold tabular-nums transition-colors ${
                    active
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : 'bg-slate-900/30 border-white/8 text-slate-300 hover:border-white/14 hover:bg-slate-900/45'
                  }`}
                >
                  {year}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemporalSlider;
