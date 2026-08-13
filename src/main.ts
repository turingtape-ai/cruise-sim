import './style.css';
import { loadGameData } from './sim/data/load';
import { EventBus } from './sim/events';
import { TICKS_PER_REAL_SECOND } from './sim/constants';
import { createGameStore } from './store';
import { GlobeScene } from './render/globe/GlobeScene';
import { initHud } from './ui/hud';

const AUTOSAVE_MS = 60_000;

function boot(): void {
  const globeEl = document.getElementById('globe')!;
  const hudEl = document.getElementById('hud')!;

  const data = loadGameData();
  const bus = new EventBus();
  const store = createGameStore(data, bus);
  const hud = initHud(hudEl, store, data);
  const globe = new GlobeScene(globeEl, data, {
    onPortClick: (portId) => store.getState().addPortToRoute(portId),
    onPortHover: (portId, x, y) => hud.showHoverCard(portId, x, y),
  });

  store.subscribe((s) => {
    hud.update(s.game);
    globe.setRoute(s.game.routePortIds);
    globe.setShip(s.game.ship.position);
  });
  globe.setRoute(store.getState().game.routePortIds);
  globe.setShip(store.getState().game.ship.position);

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
    globe.render(dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  setInterval(() => store.getState().save(), AUTOSAVE_MS);
  window.addEventListener('pagehide', () => store.getState().save());

  // Debug/console handle (also used by smoke tests). Not part of the game API.
  (window as unknown as Record<string, unknown>).__harborHorizon = { store, data, bus };
}

try {
  boot();
} catch (err) {
  const el = document.createElement('div');
  el.className = 'fatal-error';
  el.textContent = `Failed to start Harbor & Horizon:\n${err instanceof Error ? err.message : String(err)}`;
  document.body.appendChild(el);
  throw err;
}
