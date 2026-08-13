// DOM overlay HUD: money, date, speed controls, route panel, ship's log,
// and the port hover card. Reads sim state via the store; never runs game rules.

import type { GameStoreApi } from '../store';
import type { GameData } from '../sim/data/load';
import type { GameState, SpeedSetting } from '../sim/types';
import { formatTick } from '../sim/time';
import { summarizeRoute } from '../sim/route';
import { PORT_STAY_HOURS } from '../sim/constants';

const REGION_LABELS: Record<string, string> = {
  caribbean: 'Caribbean',
  mediterranean: 'Mediterranean',
  alaska: 'Alaska',
  'northern-europe': 'Northern Europe',
};

export interface Hud {
  update(game: GameState): void;
  showHoverCard(portId: string | null, clientX: number, clientY: number): void;
}

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function initHud(root: HTMLElement, store: GameStoreApi, data: GameData): Hud {
  root.innerHTML = `
    <header class="hud-top">
      <div class="brand">Harbor &amp; Horizon</div>
      <div class="stat money" title="Treasury"></div>
      <div class="stat date"></div>
      <div class="speed-controls" role="group" aria-label="Time controls">
        <button data-speed="0" title="Pause">⏸</button>
        <button data-speed="1">1×</button>
        <button data-speed="2">2×</button>
        <button data-speed="4">4×</button>
      </div>
      <div class="sys-controls">
        <button data-action="save">Save</button>
        <button data-action="load">Load</button>
        <button data-action="new">New game</button>
      </div>
    </header>
    <aside class="panel route-panel">
      <h2>Route</h2>
      <div class="ship-status"></div>
      <ol class="route-list"></ol>
      <div class="route-summary"></div>
      <button class="clear-route" data-action="clear" hidden>Clear route</button>
      <p class="hint">Click ports on the globe to chain a round trip, then press 1×.</p>
    </aside>
    <aside class="panel log-panel">
      <h2>Ship’s log</h2>
      <ul class="log-list"></ul>
    </aside>
    <div class="hover-card" hidden></div>
  `;

  const q = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const moneyEl = q('.money');
  const dateEl = q('.date');
  const statusEl = q('.ship-status');
  const routeListEl = q<HTMLOListElement>('.route-list');
  const routeSummaryEl = q('.route-summary');
  const clearBtn = q<HTMLButtonElement>('.clear-route');
  const hintEl = q('.hint');
  const logListEl = q<HTMLUListElement>('.log-list');
  const hoverCard = q('.hover-card');
  const speedButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-speed]')];

  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button');
    if (!btn) return;
    const s = store.getState();
    if (btn.dataset.speed !== undefined) s.setSpeed(Number(btn.dataset.speed) as SpeedSetting);
    else if (btn.dataset.action === 'save') s.save();
    else if (btn.dataset.action === 'load') s.load();
    else if (btn.dataset.action === 'new') {
      if (confirm('Start a new game? The current save will be overwritten.')) s.newGame();
    } else if (btn.dataset.action === 'clear') s.clearRoute();
    else if (btn.dataset.action === 'remove-stop') {
      s.removeRouteStop(Number(btn.dataset.index));
    }
  });

  function shipStatusText(game: GameState): string {
    const pos = game.ship.position;
    if (pos.kind === 'docked') {
      const port = data.portsById.get(pos.portId);
      const name = port?.name ?? pos.portId;
      if (pos.departAtTick === null) return `⚓ ${game.ship.name} docked at ${name}`;
      const hrs = Math.max(0, pos.departAtTick - game.tick);
      return `⚓ ${game.ship.name} at ${name} — departs in ${hrs}h`;
    }
    const from = data.portsById.get(pos.fromPortId)?.name ?? pos.fromPortId;
    const to = data.portsById.get(pos.toPortId)?.name ?? pos.toPortId;
    const pct = Math.round((pos.nmDone / pos.nmTotal) * 100);
    return `🚢 Sailing ${from} → ${to} — ${pct}%`;
  }

  function update(game: GameState): void {
    moneyEl.textContent = fmtMoney(game.money);
    dateEl.textContent = formatTick(game.tick);
    statusEl.textContent = shipStatusText(game);
    for (const b of speedButtons)
      b.classList.toggle('active', Number(b.dataset.speed) === game.speed);

    routeListEl.innerHTML = game.routePortIds
      .map((id, i) => {
        const name = data.portsById.get(id)?.name ?? id;
        return `<li><span class="stop-num">${i + 1}</span> ${name}
          <button class="remove" data-action="remove-stop" data-index="${i}" title="Remove stop">✕</button></li>`;
      })
      .join('');
    clearBtn.hidden = game.routePortIds.length === 0;
    hintEl.hidden = game.routePortIds.length >= 2;

    const summary = summarizeRoute(game.routePortIds, data.portsById, game.ship.shipClass);
    routeSummaryEl.innerHTML = summary
      ? `<span>${Math.round(summary.totalNm).toLocaleString('en-US')} nm round trip</span>
         <span>≈ ${summary.totalDays.toFixed(1)} days (${PORT_STAY_HOURS}h per port)</span>
         <span>fuel ≈ ${fmtMoney(summary.fuelCost)}</span>`
      : game.routePortIds.length === 1
        ? '<span>Add at least one more port…</span>'
        : '';

    logListEl.innerHTML = [...game.log]
      .slice(-12)
      .reverse()
      .map((entry) => `<li>${entry.message}</li>`)
      .join('');
  }

  const coarsePointer = window.matchMedia('(pointer: coarse)');

  function showHoverCard(portId: string | null, clientX: number, clientY: number): void {
    if (!portId) {
      hoverCard.hidden = true;
      return;
    }
    const port = data.portsById.get(portId);
    if (!port) return;
    const cta = coarsePointer.matches ? 'Tap again to add to route' : 'Click to add to route';
    hoverCard.innerHTML = `
      <h3>${port.name}</h3>
      <p class="meta">${port.country} · ${REGION_LABELS[port.region] ?? port.region} · ${'⚓'.repeat(port.sizeTier)}</p>
      <ul>${port.attractions.map((a) => `<li>${a.name} <span class="kind">${a.kind}</span></li>`).join('')}</ul>
      <p class="cta">${cta}</p>
    `;
    hoverCard.hidden = false;
    // Touch: dock the card (CSS); mouse: follow the cursor.
    hoverCard.classList.toggle('docked', coarsePointer.matches);
    if (coarsePointer.matches) {
      hoverCard.style.transform = '';
      return;
    }
    const pad = 14;
    const rect = hoverCard.getBoundingClientRect();
    const x = Math.min(clientX + pad, window.innerWidth - rect.width - pad);
    const y = Math.min(clientY + pad, window.innerHeight - rect.height - pad);
    hoverCard.style.transform = `translate(${x}px, ${y}px)`;
  }

  // Panels collapse via their headers; the log starts collapsed on phones.
  for (const panel of root.querySelectorAll<HTMLElement>('.panel')) {
    panel.querySelector('h2')?.addEventListener('click', () => panel.classList.toggle('collapsed'));
  }
  if (window.matchMedia('(max-width: 720px)').matches) {
    root.querySelector('.log-panel')?.classList.add('collapsed');
  }

  update(store.getState().game);
  return { update, showHoverCard };
}
