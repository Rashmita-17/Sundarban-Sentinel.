'use client';

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import {
  Brain,
  Calculator,
  Cpu,
  Download,
  FileText,
  Gauge,
  Globe,
  LayoutDashboard,
  Map as MapIcon,
  ScanSearch,
  User,
} from 'lucide-react';

type NodeId =
  | 'n1-user'
  | 'n2-select'
  | 'n3-gee'
  | 'n4-fastapi'
  | 'n5-fetcher'
  | 'n6-siamese'
  | 'n7-carbon'
  | 'n8-dashboard'
  | 'n9-pdf';

type EdgeId =
  | 'e2to4'
  | 'e3to4'
  | 'e4to5'
  | 'e5to6'
  | 'e6to7'
  | 'e7to8'
  | 'e7to9'
  | 'e4to8';

type StageId = 'REQUEST' | 'FETCH' | 'PROCESS' | 'QUANTIFY' | 'OUTPUT';

type DiagramNode = {
  id: NodeId;
  stage: StageId;
  title: string;
  subtitle: string;
  details: string[];
  Icon: React.ComponentType<{ className?: string }>;
  accent: 'emerald' | 'cyan' | 'violet' | 'amber' | 'rose';
};

type Edge = {
  id: EdgeId;
  from: NodeId;
  to: NodeId;
  label?: string;
  variant?: 'default' | 'loopback';
};

type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

function bezierPoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

function round(n: number) {
  return Math.round(n * 10) / 10;
}

function anchorFor(from: Rect, to: Rect): { from: Point; to: Point } {
  const fromCenter: Point = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCenter: Point = { x: to.x + to.width / 2, y: to.y + to.height / 2 };

  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return {
        from: { x: from.x + from.width, y: from.y + from.height / 2 },
        to: { x: to.x, y: to.y + to.height / 2 },
      };
    }
    return {
      from: { x: from.x, y: from.y + from.height / 2 },
      to: { x: to.x + to.width, y: to.y + to.height / 2 },
    };
  }

  if (dy >= 0) {
    return {
      from: { x: from.x + from.width / 2, y: from.y + from.height },
      to: { x: to.x + to.width / 2, y: to.y },
    };
  }

  return {
    from: { x: from.x + from.width / 2, y: from.y },
    to: { x: to.x + to.width / 2, y: to.y + to.height },
  };
}

function pathForEdge(from: Rect, to: Rect, variant: Edge['variant']): { d: string; p0: Point; p1: Point; p2: Point; p3: Point } {
  const anchors = anchorFor(from, to);
  const p0 = anchors.from;
  const p3 = anchors.to;

  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;

  const curvature = Math.min(180, Math.max(80, Math.abs(dx) * 0.55));
  const verticalCurvature = Math.min(180, Math.max(80, Math.abs(dy) * 0.55));

  const isMostlyHorizontal = Math.abs(dx) >= Math.abs(dy);

  let p1: Point;
  let p2: Point;

  if (variant === 'loopback') {
    const lift = 150;
    p1 = { x: p0.x + curvature, y: p0.y - lift };
    p2 = { x: p3.x - curvature, y: p3.y - lift };
  } else if (isMostlyHorizontal) {
    p1 = { x: p0.x + (dx >= 0 ? curvature : -curvature), y: p0.y };
    p2 = { x: p3.x - (dx >= 0 ? curvature : -curvature), y: p3.y };
  } else {
    p1 = { x: p0.x, y: p0.y + (dy >= 0 ? verticalCurvature : -verticalCurvature) };
    p2 = { x: p3.x, y: p3.y - (dy >= 0 ? verticalCurvature : -verticalCurvature) };
  }

  const d = `M ${round(p0.x)} ${round(p0.y)} C ${round(p1.x)} ${round(p1.y)}, ${round(p2.x)} ${round(p2.y)}, ${round(p3.x)} ${round(p3.y)}`;
  return { d, p0, p1, p2, p3 };
}

function accentClasses(accent: DiagramNode['accent']) {
  switch (accent) {
    case 'emerald':
      return { ring: 'ring-emerald-500/25', glow: 'shadow-[0_0_30px_rgba(16,185,129,0.18)]', icon: 'text-emerald-400' };
    case 'cyan':
      return { ring: 'ring-cyan-500/25', glow: 'shadow-[0_0_30px_rgba(34,211,238,0.16)]', icon: 'text-cyan-400' };
    case 'violet':
      return { ring: 'ring-violet-500/25', glow: 'shadow-[0_0_30px_rgba(139,92,246,0.16)]', icon: 'text-violet-400' };
    case 'amber':
      return { ring: 'ring-amber-500/25', glow: 'shadow-[0_0_30px_rgba(251,146,60,0.14)]', icon: 'text-amber-400' };
    case 'rose':
      return { ring: 'ring-rose-500/25', glow: 'shadow-[0_0_30px_rgba(244,63,94,0.14)]', icon: 'text-rose-400' };
  }
}

function StagePill({ label }: { label: StageId }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold tracking-[0.28em] text-slate-500">{label}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-slate-800 to-transparent" />
    </div>
  );
}

function NodeCard({
  node,
  active,
  onClick,
  setRef,
}: {
  node: DiagramNode;
  active: boolean;
  onClick: () => void;
  setRef: (el: HTMLDivElement | null) => void;
}) {
  const a = accentClasses(node.accent);
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={clsx(
        'text-left w-full rounded-2xl border border-white/8 bg-slate-900/35 backdrop-blur-md',
        'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50',
        active ? clsx('ring-2', a.ring, a.glow) : 'hover:border-white/14',
      )}
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <div ref={setRef} className="p-4">
        <div className="flex items-start gap-3">
          <div className={clsx('mt-0.5 rounded-xl border border-white/10 bg-slate-950/40 p-2', active && a.glow)}>
            <node.Icon className={clsx('h-5 w-5', a.icon)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">{node.title}</h3>
              {active && <span className="text-[10px] font-semibold tracking-widest text-emerald-400">ACTIVE</span>}
            </div>
            <p className="mt-0.5 text-xs text-slate-400">{node.subtitle}</p>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {node.details.map((line) => (
            <div key={line} className="text-[11px] leading-snug text-slate-300/90">
              {line}
            </div>
          ))}
        </div>
      </div>
    </motion.button>
  );
}

export default function SundarbansSentinelWorkflow() {
  const nodes = useMemo<DiagramNode[]>(
    () => [
      {
        id: 'n1-user',
        stage: 'REQUEST',
        title: 'User',
        subtitle: 'Initiates an observation request',
        details: ['Chooses an AOI + observation year', 'Consumes final metrics + map overlay'],
        Icon: User,
        accent: 'emerald',
      },
      {
        id: 'n2-select',
        stage: 'REQUEST',
        title: 'Select Area / Observation Year',
        subtitle: 'components/Map.tsx → GeoJSON mask to backend',
        details: ['Emits GeoJSON polygon coordinates', 'Submits year context for imagery filtering'],
        Icon: MapIcon,
        accent: 'cyan',
      },
      {
        id: 'n3-gee',
        stage: 'FETCH',
        title: 'Google Earth Engine (GEE)',
        subtitle: 'Sentinel-2 L2A (COPERNICUS/S2_SR_HARMONIZED)',
        details: ['Filters by AOI + date', 'Builds cloud-mitigated median composite'],
        Icon: Globe,
        accent: 'violet',
      },
      {
        id: 'n4-fastapi',
        stage: 'FETCH',
        title: 'backend/main.py (FastAPI)',
        subtitle: 'Central orchestration node',
        details: ['Receives GeoJSON + date_range', 'Runs AI + carbon engine', 'Returns final JSON response'],
        Icon: Brain,
        accent: 'emerald',
      },
      {
        id: 'n5-fetcher',
        stage: 'PROCESS',
        title: 'ml/data_fetcher.py',
        subtitle: 'Multi-temporal datacube builder',
        details: ['Constructs T1 & T2 cube: (Time, Channels, H, W)', 'Channels: R, G, B, NIR as NumPy arrays'],
        Icon: ScanSearch,
        accent: 'cyan',
      },
      {
        id: 'n6-siamese',
        stage: 'PROCESS',
        title: 'predict.py (Siamese UNet)',
        subtitle: 'PyTorch inference for change detection',
        details: ['Normalizes 0–10000 → 0–1', 'Outputs binary change mask (erosion / water encroachment)'],
        Icon: Cpu,
        accent: 'violet',
      },
      {
        id: 'n7-carbon',
        stage: 'QUANTIFY',
        title: 'backend/utils/carbon_engine.py',
        subtitle: 'Impact quantification',
        details: ['Area = count × 0.01 hectares', 'Carbon = 0.0043 × e^(11.726 × NDVI)'],
        Icon: Calculator,
        accent: 'amber',
      },
      {
        id: 'n8-dashboard',
        stage: 'OUTPUT',
        title: 'Visualization Dashboard',
        subtitle: 'Counters + erosion overlay',
        details: ['Framer Motion counters for metrics', 'High-res GeoJSON erosion overlay on map'],
        Icon: LayoutDashboard,
        accent: 'emerald',
      },
      {
        id: 'n9-pdf',
        stage: 'OUTPUT',
        title: 'Download PDF Report',
        subtitle: 'FPDF report generator in main.py',
        details: ['Triggered after analysis completes', 'Returns a streamed PDF attachment'],
        Icon: FileText,
        accent: 'rose',
      },
    ],
    [],
  );

  const edges = useMemo<Edge[]>(
    () => [
      { id: 'e2to4', from: 'n2-select', to: 'n4-fastapi', label: 'GeoJSON coords & Year' },
      { id: 'e3to4', from: 'n3-gee', to: 'n4-fastapi', label: 'Sentinel-2 L2A imagery' },
      { id: 'e4to5', from: 'n4-fastapi', to: 'n5-fetcher', label: 'Fetch + assemble cube' },
      { id: 'e5to6', from: 'n5-fetcher', to: 'n6-siamese', label: 'NumPy cube → tensors' },
      { id: 'e6to7', from: 'n6-siamese', to: 'n7-carbon', label: 'Binary mask + NDVI' },
      { id: 'e7to8', from: 'n7-carbon', to: 'n8-dashboard', label: 'Impact metrics' },
      { id: 'e7to9', from: 'n7-carbon', to: 'n9-pdf', label: 'Report payload' },
      { id: 'e4to8', from: 'n4-fastapi', to: 'n8-dashboard', label: 'Final JSON Response', variant: 'loopback' },
    ],
    [],
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const nodeEls = useRef<Record<NodeId, HTMLDivElement | null>>({
    'n1-user': null,
    'n2-select': null,
    'n3-gee': null,
    'n4-fastapi': null,
    'n5-fetcher': null,
    'n6-siamese': null,
    'n7-carbon': null,
    'n8-dashboard': null,
    'n9-pdf': null,
  });

  const [activeNode, setActiveNode] = useState<NodeId>('n4-fastapi');
  const [hoverNode, setHoverNode] = useState<NodeId | null>(null);
  const [rects, setRects] = useState<Record<NodeId, Rect> | null>(null);

  const setNodeRef = useCallback((id: NodeId) => {
    return (el: HTMLDivElement | null) => {
      nodeEls.current[id] = el;
    };
  }, []);

  const recalc = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const next: Record<NodeId, Rect> = {} as Record<NodeId, Rect>;

    (Object.keys(nodeEls.current) as NodeId[]).forEach((id) => {
      const el = nodeEls.current[id];
      if (!el) return;
      const r = el.getBoundingClientRect();
      next[id] = {
        x: r.left - containerRect.left,
        y: r.top - containerRect.top,
        width: r.width,
        height: r.height,
      };
    });

    setRects(next);
  }, []);

  useLayoutEffect(() => {
    recalc();
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => recalc());
    ro.observe(container);

    const onResize = () => recalc();
    window.addEventListener('resize', onResize);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [recalc, activeNode]);

  const active = useMemo(() => new Set<NodeId>([activeNode, ...(hoverNode ? [hoverNode] : [])]), [activeNode, hoverNode]);

  const edgesWithGeometry = useMemo(() => {
    if (!rects) return [];
    return edges
      .map((e) => {
        const from = rects[e.from];
        const to = rects[e.to];
        if (!from || !to) return null;
        const { d, p0, p1, p2, p3 } = pathForEdge(from, to, e.variant);
        const labelPoint = bezierPoint(p0, p1, p2, p3, 0.5);
        return { ...e, d, labelPoint };
      })
      .filter(Boolean) as Array<Edge & { d: string; labelPoint: Point }>;
  }, [edges, rects]);

  const nodeById = useMemo(() => {
    const map = new Map<NodeId, DiagramNode>();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  const activeNodeData = nodeById.get(activeNode);

  return (
    <div className="h-screen w-full bg-slate-950 text-slate-100">
      <div className="flex h-full w-full overflow-hidden">
        <aside className="w-72 shrink-0 border-r border-white/8 bg-slate-950/60">
          <div className="p-6">
            <div className="text-xs font-semibold tracking-[0.32em] text-slate-500">PRODUCT</div>
            <div className="mt-2 text-lg font-bold text-white">Sundarbans Sentinel</div>
            <div className="mt-1 text-xs text-slate-400">System Workflow Overview</div>
          </div>
          <div className="px-6">
            <div className="rounded-2xl border border-white/8 bg-slate-900/30 p-4">
              <div className="text-xs font-semibold tracking-widest text-slate-400">ACCESS</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-white/16 hover:bg-slate-950/55"
                >
                  Login
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600"
                >
                  Register
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 px-6">
            <div className="rounded-2xl border border-white/8 bg-slate-900/30 p-4">
              <div className="text-xs font-semibold tracking-widest text-slate-400">SELECTED NODE</div>
              <div className="mt-3">
                {activeNodeData ? (
                  <>
                    <div className="flex items-center gap-2">
                      <activeNodeData.Icon className="h-4 w-4 text-emerald-400" />
                      <div className="text-sm font-semibold text-white">{activeNodeData.title}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">{activeNodeData.subtitle}</div>
                    <div className="mt-3 space-y-1.5 text-[11px] leading-snug text-slate-300/90">
                      {activeNodeData.details.map((d) => (
                        <div key={d}>{d}</div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-slate-400">Select a node to inspect details.</div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-6 px-6">
            <div className="rounded-2xl border border-white/8 bg-slate-900/20 p-4">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold tracking-widest text-slate-400">EXPORT</div>
                <Download className="h-4 w-4 text-slate-500" />
              </div>
              <div className="mt-2 text-xs text-slate-400">Use the PDF endpoint for official reporting output.</div>
              <div className="mt-3 text-xs font-semibold text-emerald-400">POST /api/report</div>
            </div>
          </div>
        </aside>

        <div className="relative flex-1 overflow-auto">
          <div className="relative min-w-[1200px] px-8 py-10">
            <div className="mb-8 flex items-end justify-between gap-6">
              <div>
                <div className="text-xs font-semibold tracking-[0.32em] text-slate-500">SUNDARBANS SENTINEL SYSTEM WORKFLOW</div>
                <h1 className="mt-2 text-2xl font-bold text-white">Request → Inference → Quantification → Reporting</h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-400">
                  Click any node to inspect data contracts (GeoJSON, NumPy cubes, masks) and the exact execution path from frontend selection to final deliverables.
                </p>
              </div>
              <div className="hidden items-center gap-2 rounded-full border border-white/8 bg-slate-900/30 px-4 py-2 text-xs text-slate-300 md:flex">
                <Cpu className="h-4 w-4 text-violet-400" />
                <span className="font-semibold text-white">AI Pipeline</span>
                <span className="text-slate-500">•</span>
                <span>PyTorch Siamese UNet</span>
              </div>
            </div>

            <div ref={containerRef} className="relative rounded-3xl border border-white/8 bg-slate-950/40 p-8">
              <div className="pointer-events-none absolute inset-0">
                <svg width="100%" height="100%" className="h-full w-full">
                  <defs>
                    <marker id="arrowHead" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto" markerUnits="strokeWidth">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(148,163,184,0.95)" />
                    </marker>
                    <linearGradient id="edgeGlow" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="rgba(16,185,129,0.10)" />
                      <stop offset="50%" stopColor="rgba(34,211,238,0.10)" />
                      <stop offset="100%" stopColor="rgba(139,92,246,0.10)" />
                    </linearGradient>
                  </defs>

                  {edgesWithGeometry.map((e) => {
                    const isHot = active.has(e.from) || active.has(e.to);
                    return (
                      <g key={e.id}>
                        <path
                          d={e.d}
                          fill="none"
                          stroke={isHot ? 'rgba(148,163,184,0.95)' : 'rgba(148,163,184,0.40)'}
                          strokeWidth={isHot ? 2.2 : 1.6}
                          markerEnd="url(#arrowHead)"
                        />
                        <path d={e.d} fill="none" stroke="url(#edgeGlow)" strokeWidth={isHot ? 8 : 0} opacity={isHot ? 0.65 : 0} />
                      </g>
                    );
                  })}
                </svg>
              </div>

              {edgesWithGeometry
                .filter((e) => e.label)
                .map((e) => {
                  const isHot = active.has(e.from) || active.has(e.to);
                  return (
                    <div
                      key={`${e.id}-label`}
                      className={clsx(
                        'absolute -translate-x-1/2 -translate-y-1/2 rounded-full border px-3 py-1 text-[10px] font-semibold tracking-widest',
                        isHot
                          ? 'border-white/14 bg-slate-950/70 text-slate-100'
                          : 'border-white/8 bg-slate-950/50 text-slate-400',
                      )}
                      style={{ left: e.labelPoint.x, top: e.labelPoint.y }}
                    >
                      {e.label}
                    </div>
                  );
                })}

              <div className="grid grid-cols-5 gap-7">
                <div className="space-y-4">
                  <StagePill label="REQUEST" />
                  <div
                    onMouseEnter={() => setHoverNode('n1-user')}
                    onMouseLeave={() => setHoverNode(null)}
                  >
                    <NodeCard node={nodeById.get('n1-user')!} active={activeNode === 'n1-user'} onClick={() => setActiveNode('n1-user')} setRef={setNodeRef('n1-user')} />
                  </div>
                  <div
                    onMouseEnter={() => setHoverNode('n2-select')}
                    onMouseLeave={() => setHoverNode(null)}
                  >
                    <NodeCard
                      node={nodeById.get('n2-select')!}
                      active={activeNode === 'n2-select'}
                      onClick={() => setActiveNode('n2-select')}
                      setRef={setNodeRef('n2-select')}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <StagePill label="FETCH" />
                  <div
                    onMouseEnter={() => setHoverNode('n3-gee')}
                    onMouseLeave={() => setHoverNode(null)}
                  >
                    <NodeCard node={nodeById.get('n3-gee')!} active={activeNode === 'n3-gee'} onClick={() => setActiveNode('n3-gee')} setRef={setNodeRef('n3-gee')} />
                  </div>
                  <div
                    onMouseEnter={() => setHoverNode('n4-fastapi')}
                    onMouseLeave={() => setHoverNode(null)}
                  >
                    <NodeCard
                      node={nodeById.get('n4-fastapi')!}
                      active={activeNode === 'n4-fastapi'}
                      onClick={() => setActiveNode('n4-fastapi')}
                      setRef={setNodeRef('n4-fastapi')}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <StagePill label="PROCESS" />
                  <div className="rounded-3xl border border-white/10 bg-slate-900/20 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-xs font-semibold tracking-widest text-slate-300">AI Pipeline (PyTorch)</div>
                      <div className="flex items-center gap-2 text-[10px] font-semibold tracking-widest text-slate-500">
                        <Cpu className="h-3.5 w-3.5 text-violet-400" />
                        <span>SIAMESE UNET</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div
                        onMouseEnter={() => setHoverNode('n5-fetcher')}
                        onMouseLeave={() => setHoverNode(null)}
                      >
                        <NodeCard
                          node={nodeById.get('n5-fetcher')!}
                          active={activeNode === 'n5-fetcher'}
                          onClick={() => setActiveNode('n5-fetcher')}
                          setRef={setNodeRef('n5-fetcher')}
                        />
                      </div>
                      <div
                        onMouseEnter={() => setHoverNode('n6-siamese')}
                        onMouseLeave={() => setHoverNode(null)}
                      >
                        <NodeCard
                          node={nodeById.get('n6-siamese')!}
                          active={activeNode === 'n6-siamese'}
                          onClick={() => setActiveNode('n6-siamese')}
                          setRef={setNodeRef('n6-siamese')}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <StagePill label="QUANTIFY" />
                  <div
                    onMouseEnter={() => setHoverNode('n7-carbon')}
                    onMouseLeave={() => setHoverNode(null)}
                  >
                    <NodeCard
                      node={nodeById.get('n7-carbon')!}
                      active={activeNode === 'n7-carbon'}
                      onClick={() => setActiveNode('n7-carbon')}
                      setRef={setNodeRef('n7-carbon')}
                    />
                  </div>
                  <div className="rounded-2xl border border-white/8 bg-slate-900/20 px-4 py-3 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <Calculator className="h-4 w-4 text-amber-400" />
                      <span className="font-semibold text-slate-200">Area + carbon stock</span>
                    </div>
                    <div className="mt-2">Mask pixels → hectares → Blue Carbon estimate using NDVI from T2.</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <StagePill label="OUTPUT" />
                  <div className="rounded-3xl border border-white/10 bg-slate-900/20 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-xs font-semibold tracking-widest text-slate-300">Final Deliverables</div>
                      <div className="flex items-center gap-2 text-[10px] font-semibold tracking-widest text-slate-500">
                        <Gauge className="h-3.5 w-3.5 text-emerald-400" />
                        <span>UI + REPORT</span>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div
                        onMouseEnter={() => setHoverNode('n8-dashboard')}
                        onMouseLeave={() => setHoverNode(null)}
                      >
                        <NodeCard
                          node={nodeById.get('n8-dashboard')!}
                          active={activeNode === 'n8-dashboard'}
                          onClick={() => setActiveNode('n8-dashboard')}
                          setRef={setNodeRef('n8-dashboard')}
                        />
                      </div>
                      <div
                        onMouseEnter={() => setHoverNode('n9-pdf')}
                        onMouseLeave={() => setHoverNode(null)}
                      >
                        <NodeCard node={nodeById.get('n9-pdf')!} active={activeNode === 'n9-pdf'} onClick={() => setActiveNode('n9-pdf')} setRef={setNodeRef('n9-pdf')} />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/8 bg-slate-900/20 px-4 py-3 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-rose-400" />
                      <span className="font-semibold text-slate-200">Response loop closure</span>
                    </div>
                    <div className="mt-2">FastAPI returns JSON to the dashboard while the same results can be rendered into a downloadable PDF.</div>
                  </div>
                </div>
              </div>

              <div className="mt-8 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/8 bg-slate-900/20 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-slate-300">
                    <MapIcon className="h-4 w-4 text-cyan-400" />
                    <span>DATA CONTRACT</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">Frontend emits GeoJSON AOI, backend produces a binary mask and scalar metrics.</div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-slate-900/20 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-slate-300">
                    <Cpu className="h-4 w-4 text-violet-400" />
                    <span>NUMPY → TORCH</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">Cube: (2, 4, 256, 256) NumPy → tensors → Siamese UNet → mask.</div>
                </div>
                <div className="rounded-2xl border border-white/8 bg-slate-900/20 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-slate-300">
                    <Calculator className="h-4 w-4 text-amber-400" />
                    <span>IMPACT</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">Mask pixel counts convert to hectares (10m×10m). NDVI drives carbon stock estimation.</div>
                </div>
              </div>
            </div>

            <div className="mt-6 text-xs text-slate-500">
              Tip: hover a node to highlight its inbound/outbound links; click to pin details in the sidebar.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
