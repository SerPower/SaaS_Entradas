// worker.js — Worker de la cola 'entradas' (proceso aparte: npm run worker).
import { Worker } from "bullmq";
import Redis from "ioredis";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { procesarEntrada } from "./procesarEntrada.js";

if (!config.redisUrl) { logger.error("Sin REDIS_URL. Arranca Redis antes del worker."); process.exit(1); }

const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
const worker = new Worker("entradas", async (job) => procesarEntrada(job.data.entradaId), { connection });
worker.on("completed", (job) => logger.info({ jobId: job.id }, "worker: entrada lista ✅"));
worker.on("failed", (job, err) => logger.error({ jobId: job?.id, err }, "worker: fallo ❌"));
logger.info("Worker de entradas escuchando la cola...");
