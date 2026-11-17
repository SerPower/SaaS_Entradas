// queue.js — Cola de "generar QR + email". BullMQ sobre Redis.
import { config } from "./config.js";
import { logger } from "./logger.js";

let entradasQueue = null;

export async function initQueue() {
  if (!config.redisUrl) {
    logger.warn("Cola desactivada (sin REDIS_URL). Sin Redis, el QR/email se procesa al momento.");
    return null;
  }
  const { Queue } = await import("bullmq");
  const { default: Redis } = await import("ioredis");
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  entradasQueue = new Queue("entradas", { connection });
  logger.info("Cola 'entradas' conectada a Redis.");
  return entradasQueue;
}

// Encolar = devolver al instante; el worker genera QR + email en segundo plano.
export async function encolarEntrada(entradaId) {
  if (!entradasQueue) {
    // Fallback sin Redis: procesar en el momento para que la demo funcione igual.
    const { procesarEntrada } = await import("./procesarEntrada.js");
    return procesarEntrada(entradaId);
  }
  return entradasQueue.add("generar", { entradaId }, {
    jobId: entradaId,
    attempts: 5,
    backoff: { type: "exponential", delay: 1000 },
  });
}
