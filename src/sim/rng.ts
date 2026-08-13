// Deterministic RNG (mulberry32). The sim never calls Math.random — candidate
// pools and cohort mixes must replay identically from a saved seed.

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, n). */
export function rngInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** Mix two 32-bit values into a new seed (order-sensitive). */
export function mixSeed(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ b, 2654435761) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 2246822519) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}
