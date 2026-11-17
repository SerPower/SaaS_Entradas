// logger.js — Logger estructurado con Pino.
// En vez de console.log sueltos, logs (en JSON en producción) que puedes buscar y filtrar.
import pino from "pino";
import { createRequire } from "node:module";

// En desarrollo se ve coloreado SI tienes pino-pretty (`npm i -D pino-pretty`).
// Si no está instalado, salen en JSON puro (lo ideal para producción).
const require = createRequire(import.meta.url);
let transport;
try {
  require.resolve("pino-pretty");
  if (process.env.NODE_ENV !== "production") {
    transport = { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } };
  }
} catch { /* sin pino-pretty: JSON */ }

export const logger = pino({ level: process.env.LOG_LEVEL || "info", transport });
