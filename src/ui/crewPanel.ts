// Crew management panel: roster with morale bars, weekly hiring pool.
// Pure DOM; all rules live in the sim/store.

import type { GameStoreApi } from '../store';
import type { GameData } from '../sim/data/load';
import type { GameState } from '../sim/types';
import { layoutStats } from '../sim/ship';
import { weekOfTick } from '../sim/crew';

const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const stars = (skill: number) => '★'.repeat(skill) + '☆'.repeat(5 - skill);

export interface CrewPanel {
  update(game: GameState): void;
}

export function initCrewPanel(
  root: HTMLElement,
  store: GameStoreApi,
  data: GameData,
  toast: (msg: string) => void,
): CrewPanel {
  root.innerHTML = `
    <h2>Crew</h2>
    <div class="crew-berths"></div>
    <ul class="crew-list"></ul>
    <h2 class="pool-header">This week’s applicants</h2>
    <ul class="candidate-list"></ul>
  `;

  const berthsEl = root.querySelector<HTMLElement>('.crew-berths')!;
  const crewListEl = root.querySelector<HTMLUListElement>('.crew-list')!;
  const candidateListEl = root.querySelector<HTMLUListElement>('.candidate-list')!;

  root.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!btn) return;
    if (btn.dataset.hire !== undefined) {
      const error = store.getState().hire(Number(btn.dataset.hire));
      if (error) toast(error);
    } else if (btn.dataset.dismiss !== undefined) {
      const member = store.getState().game.crew.find((c) => c.id === Number(btn.dataset.dismiss));
      if (member && confirm(`Dismiss ${member.name}?`)) {
        store.getState().dismiss(member.id);
      }
    }
  });

  let lastKey = '';

  function update(game: GameState): void {
    const berths = layoutStats(game.ship.layout, data.modulesById).crewCapacity;
    // Cheap change detection: morale moves every tick; round it for the key.
    const key = JSON.stringify([
      game.crew.map((c) => [c.id, Math.round(c.morale)]),
      weekOfTick(game.tick),
      game.hiredCandidates,
      berths,
    ]);
    if (key === lastKey) return;
    lastKey = key;

    berthsEl.textContent = `Berths: ${game.crew.length} / ${berths}`;

    crewListEl.innerHTML = game.crew
      .map((c) => {
        const role = data.crewRolesById.get(c.roleId);
        return `<li class="crew-card">
          <div class="cc-top"><strong>${c.name}</strong>
            <button class="remove" data-dismiss="${c.id}" title="Dismiss">✕</button></div>
          <div class="cc-meta">${role?.label ?? c.roleId} · <span class="skill">${stars(c.skill)}</span> · ${fmt(c.wagePerDay)}/day</div>
          <div class="morale-bar" title="Morale ${Math.round(c.morale)}%">
            <div class="morale-fill" style="width:${Math.round(c.morale)}%"></div>
          </div>
        </li>`;
      })
      .join('');

    candidateListEl.innerHTML = store
      .getState()
      .candidates()
      .map((c, i) => {
        const role = data.crewRolesById.get(c.roleId);
        return `<li class="crew-card candidate ${c.hired ? 'hired' : ''}">
          <div class="cc-top"><strong>${c.name}</strong>
            ${c.hired ? '<span class="hired-tag">Hired</span>' : `<button data-hire="${i}">Hire</button>`}</div>
          <div class="cc-meta">${role?.label ?? c.roleId} · <span class="skill">${stars(c.skill)}</span> · ${fmt(c.wagePerDay)}/day</div>
        </li>`;
      })
      .join('');
  }

  update(store.getState().game);
  return { update };
}
