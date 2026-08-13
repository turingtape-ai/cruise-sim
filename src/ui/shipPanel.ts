// Deck-editor side panel: ship stats, module palette (buy), sell bar.
// Pure DOM; placement itself happens by tapping the Pixi deck grid.

import type { GameStoreApi } from '../store';
import type { GameData } from '../sim/data/load';
import type { GameState } from '../sim/types';
import type { ModuleCategory } from '../sim/data/schemas';
import { layoutStats } from '../sim/ship';
import { MODULE_SELL_REFUND } from '../sim/constants';

const CATEGORY_LABELS: Record<ModuleCategory, string> = {
  cabin: 'Cabins',
  dining: 'Dining & Bars',
  entertainment: 'Entertainment',
  wellness: 'Wellness',
  family: 'Family',
  crew: 'Crew',
  operations: 'Operations',
};

export interface ShipPanel {
  update(game: GameState): void;
  /** Currently selected palette module id, or null. */
  readonly selectedModuleId: string | null;
  /** Called by main when a placed module is tapped in the Pixi scene. */
  showSellBar(placedId: number): void;
  /** Notify the panel that placement mode should end (e.g. after Esc). */
  clearSelection(): void;
  onSelectionChange(cb: (moduleId: string | null) => void): void;
}

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

const ZONE_HINTS: Record<string, string> = {
  top: 'top decks',
  cabins: 'mid decks',
  venues: 'lower decks',
  service: 'below decks',
};

export function initShipPanel(root: HTMLElement, store: GameStoreApi, data: GameData): ShipPanel {
  let selectedModuleId: string | null = null;
  let selectionCb: (id: string | null) => void = () => {};

  const categories = [...new Set(data.modules.map((m) => m.category))];
  root.innerHTML = `
    <h2>Ship builder</h2>
    <div class="ship-stats"></div>
    <div class="sell-bar" hidden></div>
    <div class="build-hint"></div>
    <div class="palette">
      ${categories
        .map(
          (cat) => `
        <h3>${CATEGORY_LABELS[cat]}</h3>
        <div class="palette-group">
          ${data.modules
            .filter((m) => m.category === cat)
            .map(
              (m) => `
            <button class="palette-item" data-module="${m.id}">
              <span class="pi-name">${m.name}</span>
              <span class="pi-meta">${m.w}×${m.h} · ${fmt(m.cost)} · ${fmt(m.upkeepPerDay)}/day${
                m.capacity > 0 ? ` · ${m.capacity} pax` : ''
              }</span>
              <span class="pi-zone">${m.zones.map((z) => ZONE_HINTS[z] ?? z).join(' / ')}${
                m.view === 'oceanview' || m.view === 'balcony' ? ' · hull side' : ''
              }</span>
            </button>`,
            )
            .join('')}
        </div>`,
        )
        .join('')}
    </div>
  `;

  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const statsEl = q('.ship-stats');
  const sellBar = q('.sell-bar');
  const hintEl = q('.build-hint');

  function setSelection(id: string | null): void {
    selectedModuleId = id;
    for (const b of root.querySelectorAll<HTMLButtonElement>('.palette-item')) {
      b.classList.toggle('selected', b.dataset.module === id);
    }
    const module = id ? data.modulesById.get(id) : null;
    hintEl.textContent = module
      ? `Placing ${module.name} — tap a free spot on the ship. Tap the button again to stop.`
      : '';
    sellBar.hidden = true;
    selectionCb(id);
  }

  root.addEventListener('click', (e) => {
    const item = (e.target as HTMLElement).closest<HTMLButtonElement>('.palette-item');
    if (item) {
      setSelection(item.dataset.module === selectedModuleId ? null : (item.dataset.module ?? null));
      return;
    }
    const sell = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-sell]');
    if (sell) {
      store.getState().sellModule(Number(sell.dataset.sell));
      sellBar.hidden = true;
      return;
    }
    if ((e.target as HTMLElement).closest('[data-cancel-sell]')) sellBar.hidden = true;
  });

  function showSellBar(placedId: number): void {
    const game = store.getState().game;
    const placed = game.ship.layout.placed.find((p) => p.id === placedId);
    const module = placed ? data.modulesById.get(placed.moduleId) : null;
    if (!placed || !module) return;
    setSelection(null);
    sellBar.innerHTML = `
      <span>${module.name}</span>
      <button data-sell="${placedId}">Sell for ${fmt(module.cost * MODULE_SELL_REFUND)}</button>
      <button data-cancel-sell class="ghost-btn">Keep</button>
    `;
    sellBar.hidden = false;
  }

  function update(game: GameState): void {
    const stats = layoutStats(game.ship.layout, data.modulesById);
    statsEl.innerHTML = `
      <span>🛏 ${stats.passengerCapacity} guests</span>
      <span>👥 ${stats.crewCapacity} crew</span>
      <span>🔧 ${fmt(stats.upkeepPerDay)}/day upkeep</span>
    `;
    // Affordability shading
    for (const b of root.querySelectorAll<HTMLButtonElement>('.palette-item')) {
      const module = data.modulesById.get(b.dataset.module ?? '');
      b.classList.toggle('unaffordable', !!module && module.cost > game.money);
    }
  }

  update(store.getState().game);

  return {
    update,
    get selectedModuleId() {
      return selectedModuleId;
    },
    showSellBar,
    clearSelection: () => setSelection(null),
    onSelectionChange: (cb) => (selectionCb = cb),
  };
}
