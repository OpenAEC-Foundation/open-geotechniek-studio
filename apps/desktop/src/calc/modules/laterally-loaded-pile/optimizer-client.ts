// Start de optimalisatie in een web worker; lukt dat niet (geen Worker, of de
// worker start niet), dan rekent hij op de hoofddraad in stukjes van één
// generatie, met tussendoor ruimte voor de interface.
import type { LateralInput } from './compute';
import { runOptimizer, type OptimizerProgress, type OptimizerResult, type OptimizerSettings } from './optimizer';
import type { FromWorker, ToWorker } from './optimizer.worker';

export interface OptimizerRun {
  mode: 'worker' | 'main';
  result: Promise<OptimizerResult>;
  stop: () => void;
}

const idle = () => new Promise<void>((resolve) => {
  const w = globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(() => resolve(), { timeout: 50 });
  else setTimeout(resolve, 0);
});

function onMainThread(base: LateralInput, settings: OptimizerSettings, onProgress: (p: OptimizerProgress) => void): OptimizerRun {
  let stopped = false;
  return { mode: 'main', stop: () => { stopped = true; }, result: runOptimizer(base, settings, { onProgress, shouldStop: () => stopped, pause: idle }) };
}

export function startOptimizer(input: LateralInput, settings: OptimizerSettings, onProgress: (p: OptimizerProgress) => void, lng?: string, forceMain = false): OptimizerRun {
  const { variants: _v, pileTable: _t, ...base } = input;
  if (forceMain || typeof Worker === 'undefined') return onMainThread(base as LateralInput, settings, onProgress);
  let worker: Worker;
  try { worker = new Worker(new URL('./optimizer.worker.ts', import.meta.url), { type: 'module' }); } catch { return onMainThread(base as LateralInput, settings, onProgress); }
  let fallback: OptimizerRun | null = null, started = false;
  const result = new Promise<OptimizerResult>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data; started = true;
      if (m.type === 'progress') onProgress(m.progress);
      else if (m.type === 'done') { worker.terminate(); resolve(m.result); }
      else { worker.terminate(); reject(new Error(m.message)); }
    };
    // De worker start niet (bv. een omgeving zonder module-workers): dan op de hoofddraad.
    worker.onerror = (e) => {
      worker.terminate();
      if (started) { reject(new Error(e.message || 'worker')); return; }
      e.preventDefault?.();
      fallback = onMainThread(base as LateralInput, settings, onProgress);
      fallback.result.then(resolve, reject);
    };
  });
  const msg: ToWorker = { type: 'start', base: base as LateralInput, settings, lng };
  worker.postMessage(msg);
  return {
    get mode() { return fallback ? 'main' as const : 'worker' as const; }, result,
    stop: () => { if (fallback) fallback.stop(); else worker.postMessage({ type: 'stop' } satisfies ToWorker); },
  };
}
