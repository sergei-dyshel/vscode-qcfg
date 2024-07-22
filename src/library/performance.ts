import { log } from "./logging";
import * as nodejs from "./nodejs";
import type { AnyFunction } from "./templateTypes";

const histograms: Record<string, nodejs.perf_hooks.RecordableHistogram> = {};

export function perfTimerify<T extends AnyFunction>(fn: T): T {
  // eslint-disable-next-line @typescript-eslint/ban-types
  const func = fn as Function;
  const histogram = nodejs.perf_hooks.createHistogram();
  histograms[func.name] = histogram;
  return nodejs.perf_hooks.performance.timerify(fn, { histogram });
}

export function startPerfObserver() {
  log.info("Starting performance observer");
  const obs = new nodejs.perf_hooks.PerformanceObserver((list) => {
    const entry = list.getEntries()[0];
    log.debug(`Function "${entry.name}" took ${entry.duration.toFixed(2)} ms`);
  });
  obs.observe({ entryTypes: ["function"] });
}

export function dumpPerfHistograms() {
  // eslint-disable-next-line guard-for-in
  for (const name in histograms) {
    const histogram = histograms[name];
    const data = Object.entries({
      p50: histogram.mean,
      p90: histogram.percentile(90),
      p99: histogram.percentile(99),
      p100: histogram.max,
    } as const)
      .map(([key, value]) => `${key} ${(value / 1000000).toFixed(2)} ms`)
      .join(", ");
    log.info(`${name}: ${data}`);
  }
}
