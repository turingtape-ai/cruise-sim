import type { CrewMember } from './types';

/** Daily wage bill for a crew list (helper shared by tick tests). */
export function crewCost(crew: CrewMember[]): number {
  return crew.reduce((s, c) => s + c.wagePerDay, 0);
}
