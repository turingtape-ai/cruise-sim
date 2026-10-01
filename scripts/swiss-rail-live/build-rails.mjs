// Builds public/swiss-rail-live/rails.json: the Swiss railway network as compact polylines,
// so the live train map can route every train along real tracks.
//
// Source: OpenStreetMap via the Overpass API (© OpenStreetMap contributors, ODbL).
// Runs in GitHub Actions (see .github/workflows/rails-data.yml); needs Node 22+.

import { writeFile, mkdir } from 'node:fs/promises';

const BBOX = '45.70,5.80,47.95,10.60'; // south,west,north,east — Switzerland plus the cross-border stretches
const QUERY = `[out:json][timeout:600][maxsize:1073741824];
(
  way["railway"~"^(rail|narrow_gauge|light_rail|rack)$"]["service"!~"."](${BBOX});
);
out geom;`;
const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const SIMPLIFY_DEG = 0.00012; // ≈ 12 m perpendicular tolerance
const MAX_SEGMENT_M = 300; // densify long straights so stations can snap close to the line
const SCALE = 100000;
const OUT = 'public/swiss-rail-live/rails.json';

async function fetchOverpass() {
  let lastErr;
  for (const url of MIRRORS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Overpass: ${url} (attempt ${attempt})`);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(QUERY),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json.elements || !json.elements.length) throw new Error('empty result');
        return json;
      } catch (e) {
        lastErr = e;
        console.warn(`  failed: ${e.message}`);
        await new Promise((r) => setTimeout(r, 15000));
      }
    }
  }
  throw lastErr;
}

function perpDistance(p, a, b, cosLat) {
  const ax = a[0] * cosLat,
    ay = a[1],
    bx = b[0] * cosLat,
    by = b[1],
    px = p[0] * cosLat,
    py = p[1];
  const dx = bx - ax,
    dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// Douglas–Peucker that never drops a point flagged keep[] (junction nodes).
function simplify(pts, keep, tol) {
  const n = pts.length;
  const cosLat = Math.cos((pts[0][1] * Math.PI) / 180);
  const out = new Array(n).fill(false);
  out[0] = out[n - 1] = true;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    if (e - s < 2) continue;
    let maxD = -1,
      idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = keep[i] ? Infinity : perpDistance(pts[i], pts[s], pts[e], cosLat);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol) {
      out[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => out[i]);
}

function haversine(a, b) {
  const R = 6371000,
    toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR,
    dLon = (b[0] - a[0]) * toR;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function densify(pts, maxM) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1],
      b = pts[i];
    const d = haversine(a, b);
    const k = Math.ceil(d / maxM);
    for (let j = 1; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
    out.push(b);
  }
  return out;
}

function encode(pts) {
  const flat = [];
  let px = 0,
    py = 0;
  pts.forEach((p, i) => {
    const x = Math.round(p[0] * SCALE),
      y = Math.round(p[1] * SCALE);
    if (i === 0) flat.push(x, y);
    else flat.push(x - px, y - py);
    px = x;
    py = y;
  });
  return flat;
}

const data = await fetchOverpass();
const ways = data.elements.filter((e) => e.type === 'way' && e.geometry && e.geometry.length > 1);
console.log(`ways: ${ways.length}`);

// Nodes shared by two or more ways are junctions; they must survive simplification.
const nodeUse = new Map();
for (const w of ways) for (const id of w.nodes) nodeUse.set(id, (nodeUse.get(id) || 0) + 1);

const lines = [];
let rawPts = 0,
  outPts = 0;
for (const w of ways) {
  const pts = w.geometry.map((g) => [g.lon, g.lat]);
  const keep = w.nodes.map((id) => nodeUse.get(id) > 1);
  rawPts += pts.length;
  const simp = densify(simplify(pts, keep, SIMPLIFY_DEG), MAX_SEGMENT_M);
  outPts += simp.length;
  lines.push(encode(simp));
}
console.log(`points: ${rawPts} → ${outPts}`);

const out = {
  v: 1,
  source: 'OpenStreetMap contributors (ODbL)',
  built: new Date().toISOString().slice(0, 10),
  scale: SCALE,
  lines,
};
await mkdir('public/swiss-rail-live', { recursive: true });
const json = JSON.stringify(out);
await writeFile(OUT, json);
console.log(`${OUT}: ${(json.length / 1048576).toFixed(2)} MB, ${lines.length} lines`);
