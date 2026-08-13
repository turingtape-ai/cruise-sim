// Builds the globe's surface once at startup: a stylized equirectangular canvas
// painted from world-atlas land polygons (bundled at build time, no runtime fetch).

import * as THREE from 'three';
import { feature } from 'topojson-client';
import landTopoJson from 'world-atlas/land-110m.json';
import type { Topology } from 'topojson-specification';
import type { FeatureCollection, Geometry, Polygon, MultiPolygon } from 'geojson';

const W = 2048;
const H = 1024;

const OCEAN_TOP = '#1c5078';
const OCEAN_BOTTOM = '#143a5c';
const LAND_FILL = '#a3c585';
const LAND_STROKE = '#7d9f60';
const GRATICULE = 'rgba(245, 233, 212, 0.05)';

export function buildGlobeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const ocean = ctx.createLinearGradient(0, 0, 0, H);
  ocean.addColorStop(0, OCEAN_TOP);
  ocean.addColorStop(0.5, OCEAN_BOTTOM);
  ocean.addColorStop(1, OCEAN_TOP);
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = GRATICULE;
  ctx.lineWidth = 1;
  for (let lon = -150; lon <= 150; lon += 30) {
    const x = ((lon + 180) / 360) * W;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = ((90 - lat) / 180) * H;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  const topo = landTopoJson as unknown as Topology;
  const land = feature(topo, topo.objects.land!) as unknown as FeatureCollection<Geometry>;

  ctx.fillStyle = LAND_FILL;
  ctx.strokeStyle = LAND_STROKE;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';

  for (const f of land.features) {
    const polygons =
      f.geometry.type === 'Polygon'
        ? [(f.geometry as Polygon).coordinates]
        : f.geometry.type === 'MultiPolygon'
          ? (f.geometry as MultiPolygon).coordinates
          : [];
    for (const rings of polygons) {
      ctx.beginPath();
      for (const ring of rings) {
        ring.forEach(([lon, lat], i) => {
          const x = ((lon! + 180) / 360) * W;
          const y = ((90 - lat!) / 180) * H;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
      ctx.fill('evenodd');
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
