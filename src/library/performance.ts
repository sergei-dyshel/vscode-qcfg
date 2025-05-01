import { assert, assertNotNull } from "@sergei-dyshel/typescript/error";
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

export function perfTimerifyMethod(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  target: any,
  property: string,
  descriptor?: PropertyDescriptor,
) {
  assertNotNull(descriptor);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const func = descriptor.value;
  assert(typeof func === "function");
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const className: string = target.constructor.name;
  const methodName = property;
  const histogram = nodejs.perf_hooks.createHistogram();
  histograms[`${className}.${methodName}`] = histogram;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  descriptor.value = nodejs.perf_hooks.performance.timerify(func, {
    histogram,
  });
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
      count: histogram.count,
      avg: histogram.mean,
      min: histogram.min,
      p50: histogram.percentile(50),
      p90: histogram.percentile(90),
      p99: histogram.percentile(99),
      p100: histogram.max,
    } as const)
      .map(([key, value]) =>
        key === "count"
          ? `${key} ${value}`
          : `${key} ${(value / 1000000).toFixed(2)} ms`,
      )
      .join(", ");
    log.info(`${name}: ${data}`);
  }
}

export function resetPerfHistograms() {
  for (const histogram of Object.values(histograms)) {
    histogram.reset();
  }
}
