// PixiJS side-cutaway ship view ("ant farm"): stacked decks, room modules as
// rounded tiles, ghost preview while placing. Pixi is used for all 2D game
// rendering (see ARCHITECTURE.md); this scene never mutates game state.

import { Application, Container, Graphics, Text } from 'pixi.js';
import type { GameData } from '../../sim/data/load';
import type { ShipLayout } from '../../sim/types';
import type { ModuleCategory, ShipModule } from '../../sim/data/schemas';
import { canPlace, moduleCells } from '../../sim/ship';

const CELL = 34;
const DECK_GAP = 4;
const HULL_PAD = 26;

const CATEGORY_COLORS: Record<ModuleCategory, number> = {
  cabin: 0x8fb8de,
  dining: 0xf2a65a,
  entertainment: 0xc98bdb,
  wellness: 0x7fd8c8,
  family: 0xf7d060,
  crew: 0xa9b4c2,
  operations: 0x8d99ae,
};

const CATEGORY_ICONS: Record<ModuleCategory, string> = {
  cabin: '🛏',
  dining: '🍽',
  entertainment: '🎭',
  wellness: '🏊',
  family: '🎈',
  crew: '👥',
  operations: '⚙️',
};

export interface ShipSceneCallbacks {
  onCellTap(deck: number, x: number): void;
  onModuleTap(placedId: number): void;
}

export class ShipScene {
  private app!: Application;
  private world = new Container();
  private hullLayer = new Graphics();
  private gridLayer = new Graphics();
  private moduleLayer = new Container();
  private ghostLayer = new Graphics();
  private layout: ShipLayout | null = null;
  private ghostModule: ShipModule | null = null;
  private ghostCell: { deck: number; x: number } | null = null;

  private constructor(
    private container: HTMLElement,
    private data: GameData,
    private callbacks: ShipSceneCallbacks,
  ) {}

  static async create(
    container: HTMLElement,
    data: GameData,
    callbacks: ShipSceneCallbacks,
  ): Promise<ShipScene> {
    const scene = new ShipScene(container, data, callbacks);
    scene.app = new Application();
    await scene.app.init({
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio, 2),
      autoDensity: true,
      resizeTo: container,
    });
    container.appendChild(scene.app.canvas);
    scene.world.addChild(scene.hullLayer, scene.gridLayer, scene.moduleLayer, scene.ghostLayer);
    scene.app.stage.addChild(scene.world);
    scene.app.stage.eventMode = 'static';
    scene.app.stage.hitArea = { contains: () => true };
    scene.app.stage.on('pointertap', (e) => scene.onTap(e.global.x, e.global.y));
    scene.app.stage.on('pointermove', (e) => scene.onMove(e.global.x, e.global.y));
    scene.app.renderer.on('resize', () => scene.fit());
    return scene;
  }

  setActive(active: boolean): void {
    if (active) {
      this.app.ticker.start();
      // The container may have been display:none when Pixi initialized (or on
      // earlier switches), leaving a stale canvas size. Resize now it's visible.
      this.app.resize();
      this.fit();
    } else {
      this.app.ticker.stop();
    }
  }

  /** Redraw from sim state. Called on every store change while visible. */
  setLayout(layout: ShipLayout): void {
    this.layout = layout;
    this.drawHull();
    this.drawGrid();
    this.drawModules();
    this.drawGhost();
    this.fit();
  }

  /** Module being placed (ghost preview), or null to leave placement mode. */
  setGhostModule(module: ShipModule | null): void {
    this.ghostModule = module;
    if (!module) this.ghostCell = null;
    this.drawGhost();
  }

  private gridWidth(): number {
    return (this.layout?.cols ?? 0) * CELL;
  }

  private gridHeight(): number {
    const layout = this.layout;
    return layout ? layout.decks * (CELL + DECK_GAP) - DECK_GAP : 0;
  }

  private cellPos(deck: number, x: number): { px: number; py: number } {
    return { px: x * CELL, py: deck * (CELL + DECK_GAP) };
  }

  private drawHull(): void {
    const g = this.hullLayer;
    g.clear();
    if (!this.layout) return;
    const w = this.gridWidth();
    const h = this.gridHeight();
    // Stylized hull: rounded stern (left), wedge bow (right), keel band below.
    g.roundRect(-HULL_PAD, -HULL_PAD, w + HULL_PAD * 1.2, h + HULL_PAD * 2, 24)
      .fill(0x10294a)
      .stroke({ width: 3, color: 0x2b4a77 });
    g.moveTo(w + HULL_PAD * 0.2, -HULL_PAD)
      .lineTo(w + HULL_PAD * 2.4, h * 0.55)
      .lineTo(w + HULL_PAD * 0.2, h + HULL_PAD)
      .closePath()
      .fill(0x10294a)
      .stroke({ width: 3, color: 0x2b4a77 });
    // Waterline
    g.roundRect(-HULL_PAD - 8, h + HULL_PAD - 6, w + HULL_PAD * 2.2 + 16, 14, 7).fill(0x1c5078);
  }

  private drawGrid(): void {
    const g = this.gridLayer;
    g.clear();
    if (!this.layout) return;
    for (let d = 0; d < this.layout.decks; d++) {
      for (let c = 0; c < this.layout.cols; c++) {
        const { px, py } = this.cellPos(d, c);
        g.roundRect(px + 1, py + 1, CELL - 2, CELL - 2, 4).stroke({
          width: 1,
          color: 0xf5e9d4,
          alpha: 0.1,
        });
      }
    }
  }

  private drawModules(): void {
    this.moduleLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (!this.layout) return;
    for (const placed of this.layout.placed) {
      const module = this.data.modulesById.get(placed.moduleId);
      if (!module) continue;
      const { px, py } = this.cellPos(placed.deck, placed.x);
      const w = module.w * CELL - 4;
      const h = module.h * CELL + (module.h - 1) * DECK_GAP - 4;
      const tile = new Container();
      tile.position.set(px + 2, py + 2);
      const bg = new Graphics();
      bg.roundRect(0, 0, w, h, 8)
        .fill({ color: CATEGORY_COLORS[module.category], alpha: 0.92 })
        .stroke({ width: 2, color: 0x0b1d33, alpha: 0.35 });
      tile.addChild(bg);
      const label = new Text({
        text:
          module.w >= 2
            ? `${CATEGORY_ICONS[module.category]} ${module.name}`
            : CATEGORY_ICONS[module.category],
        style: {
          fontFamily: 'system-ui, sans-serif',
          fontSize: module.w >= 2 ? 11 : 14,
          fontWeight: '700',
          fill: 0x0b1d33,
          wordWrap: true,
          wordWrapWidth: w - 8,
          align: 'center',
        },
      });
      label.anchor.set(0.5);
      label.position.set(w / 2, h / 2);
      tile.addChild(label);
      tile.eventMode = 'static';
      tile.cursor = 'pointer';
      tile.on('pointertap', (e) => {
        e.stopPropagation();
        this.callbacks.onModuleTap(placed.id);
      });
      this.moduleLayer.addChild(tile);
    }
  }

  private drawGhost(): void {
    const g = this.ghostLayer;
    g.clear();
    if (!this.layout || !this.ghostModule || !this.ghostCell) return;
    const { deck, x } = this.ghostCell;
    const ok = canPlace(this.layout, this.data.modulesById, this.ghostModule, deck, x).ok;
    for (const cell of moduleCells(this.ghostModule, deck, x)) {
      if (cell.deck >= this.layout.decks || cell.x >= this.layout.cols) continue;
      const { px, py } = this.cellPos(cell.deck, cell.x);
      g.roundRect(px + 2, py + 2, CELL - 4, CELL - 4, 6).fill({
        color: ok ? 0x7fd8c8 : 0xff7f66,
        alpha: 0.45,
      });
    }
  }

  private toCell(globalX: number, globalY: number): { deck: number; x: number } | null {
    if (!this.layout) return null;
    const local = this.world.toLocal({ x: globalX, y: globalY });
    const x = Math.floor(local.x / CELL);
    const deck = Math.floor(local.y / (CELL + DECK_GAP));
    if (deck < 0 || deck >= this.layout.decks || x < 0 || x >= this.layout.cols) return null;
    return { deck, x };
  }

  private onMove(gx: number, gy: number): void {
    if (!this.ghostModule) return;
    const cell = this.toCell(gx, gy);
    const changed = JSON.stringify(cell) !== JSON.stringify(this.ghostCell);
    this.ghostCell = cell;
    if (changed) this.drawGhost();
  }

  private onTap(gx: number, gy: number): void {
    const cell = this.toCell(gx, gy);
    if (!cell) return;
    if (this.ghostModule) {
      this.ghostCell = cell;
      this.drawGhost();
    }
    this.callbacks.onCellTap(cell.deck, cell.x);
  }

  private fit(): void {
    if (!this.layout) return;
    const full = this.container.clientWidth || 1;
    // Desktop keeps the builder palette on the right; don't center under it.
    const w = full >= 900 ? full - 320 : full;
    const h = this.container.clientHeight || 1;
    const worldW = this.gridWidth() + HULL_PAD * 3.6;
    const worldH = this.gridHeight() + HULL_PAD * 2.5;
    const scale = Math.min((w * 0.92) / worldW, (h * 0.78) / worldH, 1.4);
    this.world.scale.set(scale);
    this.world.position.set(
      (w - this.gridWidth() * scale) / 2,
      (h - this.gridHeight() * scale) / 2.3,
    );
  }
}
