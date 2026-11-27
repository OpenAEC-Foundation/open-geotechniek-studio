// Web worker voor de optimalisatie: de niet-lineaire berekening gebruikt geen
// DOM, dus het genetisch algoritme draait hier buiten de hoofddraad.
// Berichten: in {type:'start', base, settings} en {type:'stop'};
// uit {type:'progress'}, {type:'done'} en {type:'error'}.
import i18next from 'i18next';
import { runOptimizer, type OptimizerProgress, type OptimizerResult, type OptimizerSettings } from './optimizer';
import type { LateralInput } from './compute';

export type ToWorker = { type: 'start'; base: LateralInput; settings: OptimizerSettings; lng?: string } | { type: 'stop' };
export type FromWorker = { type: 'progress'; progress: OptimizerProgress } | { type: 'done'; result: OptimizerResult } | { type: 'error'; message: string };

const scope = self as unknown as { onmessage: ((e: MessageEvent<ToWorker>) => void) | null; postMessage: (m: FromWorker) => void };
let stop = false;
scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'stop') { stop = true; return; }
  if (msg.type !== 'start') return;
  stop = false;
  // Geen vertalingen in de worker: meldingen in de Nederlandse brontekst; de interface vertaalt de toetsnamen zelf.
  const ready = i18next.isInitialized ? Promise.resolve() : i18next.init({ lng: msg.lng ?? 'nl', resources: {} }).then(() => undefined);
  ready.then(() => runOptimizer(msg.base, msg.settings, {
    onProgress: (progress) => scope.postMessage({ type: 'progress', progress }),
    shouldStop: () => stop,
    pause: () => new Promise((resolve) => setTimeout(resolve, 0)),
  })).then((result) => scope.postMessage({ type: 'done', result }))
    .catch((err) => scope.postMessage({ type: 'error', message: err instanceof Error ? err.message : String(err) }));
};
