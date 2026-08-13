import { EPOCH_ISO, TICK_HOURS } from './constants';

const EPOCH_MS = Date.parse(EPOCH_ISO);
const MS_PER_TICK = TICK_HOURS * 3_600_000;

/** Sim date (UTC) at a given tick. Deterministic — derived from EPOCH_ISO only. */
export function tickToDate(tick: number): Date {
  return new Date(EPOCH_MS + tick * MS_PER_TICK);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** e.g. "Jan 3, 2030 · 14:00" */
export function formatTick(tick: number): string {
  const d = tickToDate(tick);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} · ${hh}:00`;
}

/** e.g. "Jan 3" — compact form for log lines. */
export function formatTickShort(tick: number): string {
  const d = tickToDate(tick);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${hh}:00`;
}
