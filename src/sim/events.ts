// Typed event bus + the Incident design stub (Phase 6 implements behavior).

export type IncidentKind = 'storm' | 'norovirus' | 'engine-failure' | 'medical';

/** Design stub: no system emits Incidents yet. Phase 6 will publish them on the bus. */
export interface Incident {
  id: string;
  kind: IncidentKind;
  /** 1 (nuisance) – 5 (crisis). */
  severity: 1 | 2 | 3 | 4 | 5;
  startedAtTick: number;
  resolvedAtTick: number | null;
}

export interface SimEventMap {
  'ship:departed': { tick: number; fromPortId: string; toPortId: string; nmTotal: number };
  'ship:arrived': { tick: number; portId: string };
  'incident:started': Incident;
  'incident:resolved': Incident;
}

export type SimEvent = {
  [K in keyof SimEventMap]: { type: K; payload: SimEventMap[K] };
}[keyof SimEventMap];

type Handler<K extends keyof SimEventMap> = (payload: SimEventMap[K]) => void;

export class EventBus {
  private handlers = new Map<keyof SimEventMap, Set<Handler<never>>>();

  on<K extends keyof SimEventMap>(type: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof SimEventMap>(type: K, payload: SimEventMap[K]): void {
    this.handlers.get(type)?.forEach((h) => (h as Handler<K>)(payload));
  }

  /** Publish a batch of events produced by a pure sim step. */
  emitAll(events: SimEvent[]): void {
    for (const e of events) this.emit(e.type, e.payload);
  }
}
