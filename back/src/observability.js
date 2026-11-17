// observability.js — Monitorización y Sentry.
// El código lo carga de forma opcional: si no está instalado o no hay DSN, la app funciona igual sin Sentry.
import { config } from "./config.js";
import { logger } from "./logger.js";

let Sentry = null;

export async function initSentry() {
  if (!config.sentryDsn) {
    logger.info("Sentry desactivado (sin SENTRY_DSN). En producción pondrías el DSN.");
    return false;
  }
  try {
    Sentry = await import("@sentry/node");
    Sentry.init({ dsn: config.sentryDsn, tracesSampleRate: 0.1 });
    logger.info("Sentry activado.");
    return true;
  } catch {
    logger.warn("@sentry/node no instalado. Instálalo si deseas activarlo: npm i @sentry/node");
    return false;
  }
}

export function capturar(err) {
  if (Sentry) Sentry.captureException(err);
}

// Métricas tipo Prometheus para el endpoint /metrics.
export function metricasTexto(extra = {}) {
  const m = process.memoryUsage();
  return [
    `# HELP proceso_memoria_bytes Memoria usada por el proceso`,
    `proceso_memoria_bytes ${m.rss}`,
    `# HELP uptime_segundos Tiempo que lleva el servidor en marcha`,
    `uptime_segundos ${Math.round(process.uptime())}`,
    ...Object.entries(extra).map(([k, v]) => `${k} ${v}`),
  ].join("\n") + "\n";
}
