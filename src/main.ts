import './style.css';
import { loadGameData } from './sim/data/load';
import { EventBus } from './sim/events';
import { TICKS_PER_REAL_SECOND } from './sim/constants';
import { createGameStore } from './store';
import { GlobeScene } from './render/globe/GlobeScene';
import { ShipScene } from './render/ship/ShipScene';
import { initHud, type HudView } from './ui/hud';
import { initShipPanel } from './ui/shipPanel';
import { initCrewPanel } from './ui/crewPanel';

const AUTOSAVE_MS = 60_000;

async function boot(): Promise<void> {
  const globeEl = document.getElementById('globe')!;
  const shipEl = document.getElementById('ship')!;
  const hudEl = document.getElementById('hud')!;
  document.body.dataset.view = 'globe';

  const data = loadGameData();
  const bus = new EventBus();
  const store = createGameStore(data, bus);

  let activeView: HudView = 'globe';
  const hud = initHud(hudEl, store, data, {
    onViewChange: (view) => {
      activeView = view;
      shipScene.setActive(view === 'ship');
    },
  });
  const crewPanel = initCrewPanel(
    hudEl.querySelector<HTMLElement>('.crew-panel')!,
    store,
    data,
    (msg) => hud.toast(msg),
  );
  const globe = new GlobeScene(globeEl, data, {
    onPortClick: (portId) => store.getState().addPortToRoute(portId),
    onPortHover: (portId, x, y) => hud.showHoverCard(portId, x, y),
  });
  const shipPanel = initShipPanel(hudEl.querySelector<HTMLElement>('.ship-panel')!, store, data);
  const shipScene = await ShipScene.create(shipEl, data, {
    onCellTap: (deck, x) => {
      const moduleId = shipPanel.selectedModuleId;
      if (!moduleId) return;
      const error = store.getState().buyModule(moduleId, deck, x);
      if (error) hud.toast(error);
    },
    onModuleTap: (placedId) => shipPanel.showSellBar(placedId),
  });
  shipPanel.onSelectionChange((moduleId) =>
    shipScene.setGhostModule(moduleId ? (data.modulesById.get(moduleId) ?? null) : null),
  );
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') shipPanel.clearSelection();
  });

  let lastLayout = store.getState().game.ship.layout;
  store.subscribe((s) => {
    hud.update(s.game);
    globe.setRoute(s.game.routePortIds);
    globe.setShip(s.game.ship.position);
    shipPanel.update(s.game);
    crewPanel.update(s.game);
    if (s.game.ship.layout !== lastLayout) {
      lastLayout = s.game.ship.layout;
      shipScene.setLayout(s.game.ship.layout);
    }
  });
  globe.setRoute(store.getState().game.routePortIds);
  globe.setShip(store.getState().game.ship.position);
  shipScene.setLayout(lastLayout);
  shipScene.setActive(false);

  // Main loop: accumulate real time into whole sim ticks, then draw.
  let last = performance.now();
  let tickAccumulator = 0;
  function frame(now: number): void {
    const dt = Math.min(now - last, 250); // clamp long tab-hidden gaps
    last = now;
    const speed = store.getState().game.speed;
    tickAccumulator += (dt / 1000) * TICKS_PER_REAL_SECOND * speed;
    const whole = Math.floor(tickAccumulator);
    if (whole > 0) {
      tickAccumulator -= whole;
      store.getState().advance(whole);
    }
    if (activeView !== 'ship') globe.render(dt); // globe stays live behind the crew panel
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  setInterval(() => store.getState().save(), AUTOSAVE_MS);
  window.addEventListener('pagehide', () => store.getState().save());

  // Debug/console handle (also used by smoke tests). Not part of the game API.
  (window as unknown as Record<string, unknown>).__harborHorizon = { store, data, bus, hud };
}

boot().catch((err: unknown) => {
  const el = document.createElement('div');
  el.className = 'fatal-error';
  el.textContent = `Failed to start Harbor & Horizon:\n${err instanceof Error ? err.message : String(err)}`;
  document.body.appendChild(el);
  throw err;
});
