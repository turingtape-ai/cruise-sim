// Semi-realistic sea routing, fully offline: the world-atlas land polygons
// (already bundled for the globe texture) are rasterized into a 0.5° ocean
// grid, A* finds a water-only path between ports, and a line-of-sight pass
// smooths the staircase. Ships round Cuba instead of sailing through it.
//
// Pure TS — no renderer imports. The grid builds lazily on first use and
// routes are memoized, so repeated calls (render, summaries, ticks) are cheap.

import { feature } from 'topojson-client';
import landTopoJson from 'world-atlas/land-110m.json';
import type { Topology } from 'topojson-specification';
import type { FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';
import { greatCirclePoint, haversineNm, type LatLon } from './geo';
import { SEA_GRID_DEG, SEA_LOS_SAMPLE_NM, SEA_SNAP_MAX_CELLS } from './constants';

const COLS = Math.round(360 / SEA_GRID_DEG);
const ROWS = Math.round(180 / SEA_GRID_DEG);

export interface SeaRoute {
  /** Waypoints from exact origin to exact destination. */
  points: LatLon[];
  nm: number;
}

// ---------------------------------------------------------------------------
// Water mask
// ---------------------------------------------------------------------------

let waterMask: Uint8Array | null = null;

/**
 * Straits and channels narrower than one grid cell rasterize shut, sealing
 * whole seas (Øresund closes the Baltic; Juan de Fuca seals Puget Sound).
 * Real marine routing networks hand-carve these; so do we. Each polyline is
 * sampled and its cells forced to water. Panama/Suez/Bosphorus are omitted
 * until routes need to cross them (see GAME_RULES open questions).
 */
const STRAIT_CORRIDORS: ReadonlyArray<{ name: string; points: ReadonlyArray<[number, number]> }> = [
  {
    name: 'strait-of-gibraltar',
    points: [
      [36.0, -6.5],
      [35.95, -5.75],
      [36.05, -4.8],
    ],
  },
  {
    name: 'oresund', // Baltic ↔ Kattegat past Copenhagen
    points: [
      [54.9, 13.0],
      [55.4, 12.8],
      [55.9, 12.7],
      [56.5, 12.3],
      [57.3, 11.5],
    ],
  },
  {
    name: 'dover-strait',
    points: [
      [50.3, 0.0],
      [50.9, 1.2],
      [51.3, 2.2],
      [52.0, 3.0],
    ],
  },
  {
    name: 'strait-of-juan-de-fuca', // Pacific ↔ Salish Sea junction
    points: [
      [48.4, -125.5],
      [48.3, -124.0],
      [48.25, -123.2],
    ],
  },
  {
    name: 'puget-sound', // Admiralty Inlet down to Seattle
    points: [
      [48.2, -123.0],
      [48.1, -122.6],
      [47.9, -122.4],
      [47.6, -122.4],
    ],
  },
  {
    name: 'strait-of-georgia', // Haro Strait up to Vancouver
    points: [
      [48.25, -123.15],
      [48.7, -123.25],
      [49.0, -123.5],
      [49.29, -123.3],
    ],
  },
  {
    name: 'icy-strait', // Cross Sound → Icy Strait → Chatham junction
    points: [
      [58.2, -136.6],
      [58.25, -135.5],
      [58.1, -135.0],
      [58.3, -134.6],
    ],
  },
  {
    name: 'lynn-canal', // Chatham junction up to Skagway, past Juneau
    points: [
      [58.3, -134.9],
      [58.8, -135.1],
      [59.2, -135.3],
      [59.45, -135.3],
    ],
  },
  {
    name: 'ketchikan-approach', // Dixon Entrance up Tongass Narrows
    points: [
      [54.4, -132.0],
      [55.0, -131.7],
      [55.34, -131.7],
    ],
  },
];

function carveCorridors(mask: Uint8Array): void {
  for (const corridor of STRAIT_CORRIDORS) {
    for (let i = 0; i + 1 < corridor.points.length; i++) {
      const [lat1, lon1] = corridor.points[i]!;
      const [lat2, lon2] = corridor.points[i + 1]!;
      const a = { lat: lat1, lon: lon1 };
      const b = { lat: lat2, lon: lon2 };
      const n = Math.max(2, Math.ceil(haversineNm(a, b) / 10));
      for (let k = 0; k <= n; k++) {
        const p = greatCirclePoint(a, b, k / n);
        const { r, c } = cellOf(p.lat, p.lon);
        mask[r * COLS + c] = 1;
      }
    }
  }
}

function cellOf(lat: number, lon: number): { r: number; c: number } {
  const r = Math.min(ROWS - 1, Math.max(0, Math.floor((90 - lat) / SEA_GRID_DEG)));
  const c = ((Math.floor((lon + 180) / SEA_GRID_DEG) % COLS) + COLS) % COLS;
  return { r, c };
}

function cellCenter(r: number, c: number): LatLon {
  return { lat: 90 - (r + 0.5) * SEA_GRID_DEG, lon: -180 + (c + 0.5) * SEA_GRID_DEG };
}

/** Scanline-rasterize every land polygon into the mask (even-odd fill). */
function buildWaterMask(): Uint8Array {
  const mask = new Uint8Array(ROWS * COLS).fill(1); // 1 = water
  const topo = landTopoJson as unknown as Topology;
  const land = feature(topo, topo.objects.land!) as unknown as FeatureCollection<Geometry>;

  const polygons: number[][][][] = [];
  for (const f of land.features) {
    if (f.geometry.type === 'Polygon') polygons.push((f.geometry as Polygon).coordinates);
    else if (f.geometry.type === 'MultiPolygon')
      polygons.push(...(f.geometry as MultiPolygon).coordinates);
  }

  for (let r = 0; r < ROWS; r++) {
    const phi = 90 - (r + 0.5) * SEA_GRID_DEG;
    for (const rings of polygons) {
      const xs: number[] = [];
      for (const ring of rings) {
        for (let i = 0; i < ring.length - 1; i++) {
          const [lon1, lat1] = ring[i]!;
          const [lon2, lat2] = ring[i + 1]!;
          if (lat1! > phi !== lat2! > phi) {
            xs.push(lon1! + ((phi - lat1!) * (lon2! - lon1!)) / (lat2! - lat1!));
          }
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.ceil((xs[k]! + 180) / SEA_GRID_DEG - 0.5);
        const c1 = Math.floor((xs[k + 1]! + 180) / SEA_GRID_DEG - 0.5);
        for (let c = Math.max(0, c0); c <= Math.min(COLS - 1, c1); c++) mask[r * COLS + c] = 0;
      }
    }
  }
  carveCorridors(mask);
  return mask;
}

function mask_(): Uint8Array {
  if (!waterMask) waterMask = buildWaterMask();
  return waterMask;
}

/** Is the grid cell containing this point open water? (0.5° resolution.) */
export function isWater(lat: number, lon: number): boolean {
  const { r, c } = cellOf(lat, lon);
  return mask_()[r * COLS + c] === 1;
}

/** Nearest water cell to a point (ports sit on coastlines, often in land cells). */
function snapToWater(p: LatLon): { r: number; c: number } | null {
  const m = mask_();
  const { r, c } = cellOf(p.lat, p.lon);
  if (m[r * COLS + c] === 1) return { r, c };
  for (let radius = 1; radius <= SEA_SNAP_MAX_CELLS; radius++) {
    let best: { r: number; c: number } | null = null;
    let bestD = Infinity;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
        const rr = r + dr;
        if (rr < 0 || rr >= ROWS) continue;
        const cc = (((c + dc) % COLS) + COLS) % COLS;
        if (m[rr * COLS + cc] !== 1) continue;
        const d = haversineNm(p, cellCenter(rr, cc));
        if (d < bestD) {
          bestD = d;
          best = { r: rr, c: cc };
        }
      }
    }
    if (best) return best;
  }
  return null;
}

// ---------------------------------------------------------------------------
// A* over the water grid
// ---------------------------------------------------------------------------

/** Binary min-heap over node ids scored by f-cost. */
class MinHeap {
  private ids: number[] = [];
  constructor(private f: Float64Array) {}
  get size(): number {
    return this.ids.length;
  }
  push(id: number): void {
    const ids = this.ids;
    ids.push(id);
    let i = ids.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.f[ids[parent]!]! <= this.f[ids[i]!]!) break;
      [ids[parent], ids[i]] = [ids[i]!, ids[parent]!];
      i = parent;
    }
  }
  pop(): number {
    const ids = this.ids;
    const top = ids[0]!;
    const last = ids.pop()!;
    if (ids.length > 0) {
      ids[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < ids.length && this.f[ids[l]!]! < this.f[ids[m]!]!) m = l;
        if (r < ids.length && this.f[ids[r]!]! < this.f[ids[m]!]!) m = r;
        if (m === i) break;
        [ids[m], ids[i]] = [ids[i]!, ids[m]!];
        i = m;
      }
    }
    return top;
  }
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

function astar(start: { r: number; c: number }, goal: { r: number; c: number }): LatLon[] | null {
  const m = mask_();
  const goalCenter = cellCenter(goal.r, goal.c);
  const startId = start.r * COLS + start.c;
  const goalId = goal.r * COLS + goal.c;

  const g = new Float64Array(ROWS * COLS).fill(Infinity);
  const f = new Float64Array(ROWS * COLS).fill(Infinity);
  const cameFrom = new Int32Array(ROWS * COLS).fill(-1);
  const closed = new Uint8Array(ROWS * COLS);

  g[startId] = 0;
  f[startId] = haversineNm(cellCenter(start.r, start.c), goalCenter);
  const open = new MinHeap(f);
  open.push(startId);

  while (open.size > 0) {
    const id = open.pop();
    if (closed[id]) continue;
    closed[id] = 1;
    if (id === goalId) {
      const path: LatLon[] = [];
      for (let cur = id; cur !== -1; cur = cameFrom[cur]!) {
        path.push(cellCenter(Math.floor(cur / COLS), cur % COLS));
      }
      return path.reverse();
    }
    const r = Math.floor(id / COLS);
    const c = id % COLS;
    const here = cellCenter(r, c);
    for (const [dr, dc] of DIRS) {
      const rr = r + dr;
      if (rr < 0 || rr >= ROWS) continue;
      const cc = (((c + dc) % COLS) + COLS) % COLS;
      const nid = rr * COLS + cc;
      if (closed[nid] || m[nid] !== 1) continue;
      // Diagonals must not cut a land corner.
      if (dr !== 0 && dc !== 0) {
        const orthoA = r * COLS + cc;
        const orthoB = rr * COLS + c;
        if (m[orthoA] !== 1 || m[orthoB] !== 1) continue;
      }
      const next = cellCenter(rr, cc);
      const tentative = g[id]! + haversineNm(here, next);
      if (tentative < g[nid]!) {
        g[nid] = tentative;
        f[nid] = tentative + haversineNm(next, goalCenter);
        cameFrom[nid] = id;
        open.push(nid);
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Smoothing + public API
// ---------------------------------------------------------------------------

/** Every interior sample of the great-circle segment a→b lies on water. */
function segmentIsWater(a: LatLon, b: LatLon): boolean {
  const nm = haversineNm(a, b);
  const n = Math.max(2, Math.ceil(nm / SEA_LOS_SAMPLE_NM));
  for (let k = 1; k < n; k++) {
    const p = greatCirclePoint(a, b, k / n);
    if (!isWater(p.lat, p.lon)) return false;
  }
  return true;
}

/** Greedy line-of-sight string pulling; keeps exact endpoints. */
function smooth(points: LatLon[]): LatLon[] {
  if (points.length <= 2) return points;
  const out: LatLon[] = [points[0]!];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    while (j > i + 1 && !segmentIsWater(points[i]!, points[j]!)) j--;
    out.push(points[j]!);
    i = j;
  }
  return out;
}

export function pathLengthNm(points: LatLon[]): number {
  let nm = 0;
  for (let i = 0; i + 1 < points.length; i++) nm += haversineNm(points[i]!, points[i + 1]!);
  return nm;
}

/** Position after sailing `nm` along a waypoint path (clamped to the ends). */
export function pointAlongPath(points: LatLon[], nm: number): LatLon {
  if (points.length === 0) throw new Error('empty path');
  if (nm <= 0) return { ...points[0]! };
  let remaining = nm;
  for (let i = 0; i + 1 < points.length; i++) {
    const seg = haversineNm(points[i]!, points[i + 1]!);
    if (remaining <= seg && seg > 0) {
      return greatCirclePoint(points[i]!, points[i + 1]!, remaining / seg);
    }
    remaining -= seg;
  }
  return { ...points[points.length - 1]! };
}

const routeCache = new Map<string, SeaRoute>();

/**
 * Water-only route between two points. Falls back to the direct great circle
 * if no grid path exists (should not happen between real seaports).
 */
export function seaRoute(from: LatLon, to: LatLon): SeaRoute {
  const key = `${from.lat},${from.lon}:${to.lat},${to.lon}`;
  const cached = routeCache.get(key);
  if (cached) return cached;

  let points: LatLon[];
  const start = snapToWater(from);
  const goal = snapToWater(to);
  if (segmentIsWater(from, to)) {
    points = [from, to];
  } else if (start && goal) {
    const cells = astar(start, goal);
    points = cells ? smooth([from, ...cells, to]) : [from, to];
  } else {
    points = [from, to];
  }

  const route: SeaRoute = { points, nm: pathLengthNm(points) };
  routeCache.set(key, route);
  return route;
}
