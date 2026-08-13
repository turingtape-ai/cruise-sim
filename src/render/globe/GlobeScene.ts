// Three.js is used for this scene ONLY (see ARCHITECTURE.md). The globe renders
// the world sphere, port pins, route arcs, and the sailing ship dot. It reads
// sim types/math but never mutates game state — interactions go through callbacks.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { GameData } from '../../sim/data/load';
import type { ShipPosition } from '../../sim/types';
import { greatCirclePoints, haversineNm, type LatLon } from '../../sim/geo';
import { pointAlongPath, seaRoute } from '../../sim/searoute';
import { buildGlobeTexture } from './mapTexture';

const DEG = Math.PI / 180;
const PIN_COLOR = 0xff7f66; // coral
const PIN_ROUTE_COLOR = 0x7fd8c8; // seafoam
const ARC_COLOR = 0xffb39e; // warm coral-cream
const SHIP_COLOR = 0xfff7ec;

export interface GlobeCallbacks {
  onPortClick(portId: string): void;
  onPortHover(portId: string | null, clientX: number, clientY: number): void;
}

function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * DEG;
  const theta = (lon + 180) * DEG;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta),
  );
}

export class GlobeScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private globe: THREE.Mesh;
  private pins = new THREE.Group();
  private pinByPortId = new Map<string, THREE.Mesh>();
  private routeGroup = new THREE.Group();
  private ship: THREE.Mesh;
  private shipTarget = new THREE.Vector3();
  private shipVisible = false;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerDown: { x: number; y: number } | null = null;
  private hoveredPortId: string | null = null;
  private pendingTouchPortId: string | null = null;

  constructor(
    private container: HTMLElement,
    private data: GameData,
    private callbacks: GlobeCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x0b1d33);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    // Start looking at the Caribbean, where the default ship is docked.
    this.camera.position.copy(latLonToVec3(25, -80, 2.8));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.45;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.45;
    this.controls.maxDistance = 4.2;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.25;
    this.controls.addEventListener('start', () => (this.controls.autoRotate = false));

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.15));
    const sun = new THREE.DirectionalLight(0xfff3dd, 1.6);
    sun.position.set(3, 2, 2);
    this.scene.add(sun);

    this.globe = new THREE.Mesh(
      new THREE.SphereGeometry(1, 96, 96),
      new THREE.MeshStandardMaterial({ map: buildGlobeTexture(), roughness: 0.85, metalness: 0 }),
    );
    this.scene.add(this.globe);

    // Soft rim "atmosphere" for the cozy look.
    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.045, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0x7fd8c8,
        transparent: true,
        opacity: 0.07,
        side: THREE.BackSide,
      }),
    );
    this.scene.add(atmosphere);

    this.buildPins();
    this.scene.add(this.pins);
    this.scene.add(this.routeGroup);

    this.ship = new THREE.Mesh(
      new THREE.SphereGeometry(0.016, 16, 16),
      new THREE.MeshBasicMaterial({ color: SHIP_COLOR }),
    );
    this.ship.visible = false;
    this.scene.add(this.ship);

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (e) => this.onPointerMove(e));
    el.addEventListener('pointerdown', (e) => (this.pointerDown = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => this.onPointerUp(e));
    el.addEventListener('pointerleave', () => this.setHovered(null, 0, 0));

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  private buildPins(): void {
    for (const port of this.data.ports) {
      const radius = 0.009 + port.sizeTier * 0.0022;
      const pin = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 12, 12),
        new THREE.MeshBasicMaterial({ color: PIN_COLOR }),
      );
      pin.position.copy(latLonToVec3(port.lat, port.lon, 1.008));
      pin.userData.portId = port.id;
      this.pins.add(pin);
      this.pinByPortId.set(port.id, pin);
    }
  }

  /** Redraw route arcs and pin highlights. Call whenever the route changes. */
  setRoute(routePortIds: string[]): void {
    for (const child of this.routeGroup.children) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.routeGroup.clear();

    for (const [portId, pin] of this.pinByPortId) {
      (pin.material as THREE.MeshBasicMaterial).color.setHex(
        routePortIds.includes(portId) ? PIN_ROUTE_COLOR : PIN_COLOR,
      );
    }

    if (routePortIds.length < 2) return;
    for (let i = 0; i < routePortIds.length; i++) {
      const from = this.data.portsById.get(routePortIds[i]!);
      const to = this.data.portsById.get(routePortIds[(i + 1) % routePortIds.length]!);
      if (!from || !to || from.id === to.id) continue;
      const isClosingLeg = i === routePortIds.length - 1;
      this.routeGroup.add(this.buildArc(from, to, isClosingLeg));
    }
  }

  // Tubes, not lines: WebGL lines are always 1px, too faint over the ocean.
  // Arcs trace the sea route (around land), not the direct great circle.
  private buildArc(from: LatLon, to: LatLon, dim: boolean): THREE.Mesh {
    const route = seaRoute(from, to);
    const lift = 0.012 + Math.min(0.06, (route.nm / 6000) * 0.1);
    const waypoints: LatLon[] = [];
    for (let i = 0; i + 1 < route.points.length; i++) {
      const a = route.points[i]!;
      const b = route.points[i + 1]!;
      const n = Math.max(1, Math.ceil(haversineNm(a, b) / 30));
      const seg = greatCirclePoints(a, b, n);
      waypoints.push(...(i === 0 ? seg : seg.slice(1)));
    }
    const pts = waypoints.map((p, i, arr) => {
      const t = arr.length > 1 ? i / (arr.length - 1) : 0;
      return latLonToVec3(p.lat, p.lon, 1.008 + Math.sin(t * Math.PI) * lift);
    });
    return new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(pts),
        Math.max(64, pts.length * 2),
        0.0035,
        6,
      ),
      new THREE.MeshBasicMaterial({
        color: ARC_COLOR,
        transparent: true,
        opacity: dim ? 0.4 : 0.95,
      }),
    );
  }

  /** Position the ship dot from sim state. Call on every state change. */
  setShip(position: ShipPosition): void {
    let at: LatLon | null = null;
    if (position.kind === 'docked') {
      at = this.data.portsById.get(position.portId) ?? null;
    } else {
      const from = this.data.portsById.get(position.fromPortId);
      const to = this.data.portsById.get(position.toPortId);
      if (from && to) {
        at = pointAlongPath(seaRoute(from, to).points, position.nmDone);
      }
    }
    if (!at) {
      this.shipVisible = false;
      return;
    }
    this.shipTarget.copy(latLonToVec3(at.lat, at.lon, 1.02));
    if (!this.shipVisible) {
      this.ship.position.copy(this.shipTarget);
      this.shipVisible = true;
    }
  }

  private raycastPort(clientX: number, clientY: number): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([this.globe, ...this.pins.children], false);
    const first = hits[0];
    return first && first.object !== this.globe ? (first.object.userData.portId as string) : null;
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerType === 'touch') return; // touch selects on tap, not hover
    this.setHovered(this.raycastPort(e.clientX, e.clientY), e.clientX, e.clientY);
  }

  private setHovered(portId: string | null, x: number, y: number): void {
    if (portId !== this.hoveredPortId) {
      if (this.hoveredPortId) this.pinByPortId.get(this.hoveredPortId)?.scale.setScalar(1);
      if (portId) this.pinByPortId.get(portId)?.scale.setScalar(1.6);
      this.hoveredPortId = portId;
      this.renderer.domElement.style.cursor = portId ? 'pointer' : 'grab';
    }
    this.callbacks.onPortHover(portId, x, y);
  }

  private onPointerUp(e: PointerEvent): void {
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down) return;
    // A click/tap, not a drag: pointer travelled less than a few pixels.
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;

    if (e.pointerType === 'touch') {
      // Touch has no hover, so the first tap previews a port (card), and a
      // second tap on the same pin adds it to the route.
      const portId = this.raycastPort(e.clientX, e.clientY);
      if (portId && portId === this.pendingTouchPortId) {
        this.callbacks.onPortClick(portId);
        this.pendingTouchPortId = null;
        this.setHovered(null, 0, 0);
      } else {
        this.pendingTouchPortId = portId;
        this.setHovered(portId, e.clientX, e.clientY);
      }
      return;
    }

    if (this.hoveredPortId) this.callbacks.onPortClick(this.hoveredPortId);
  }

  resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(dtMs: number): void {
    this.controls.update();
    if (this.shipVisible) {
      this.ship.visible = true;
      // Ease toward the sim position so per-tick jumps read as smooth motion.
      const k = 1 - Math.exp(-dtMs * 0.008);
      this.ship.position.lerp(this.shipTarget, k);
    } else {
      this.ship.visible = false;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
