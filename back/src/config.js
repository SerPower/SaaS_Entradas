// config.js — Configuración por entorno. Todo con defaults para arrancar SIN claves.
const esProduccion = process.env.NODE_ENV === "production";
if (esProduccion) {
  const requeridas = [
    "DATABASE_URL", "JWT_SECRET", "STRIPE_SECRET_KEY", "RESEND_API_KEY", "FRONT_URL",
  ];
  const ausentes = requeridas.filter((clave) => !process.env[clave]);
  if (ausentes.length) {
    throw new Error(`Faltan variables obligatorias en producción: ${ausentes.join(", ")}`);
  }
}

const port = Number(process.env.PORT || 4100);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT debe ser un puerto TCP válido.");
}

export const config = {
  isProduction: esProduccion,
  port,
  frontUrl: process.env.FRONT_URL || "http://localhost:5174",
  // PostgreSQL: sin DATABASE_URL, el store degrada a MEMORIA (demo). Con docker compose up -d:
  databaseUrl: process.env.DATABASE_URL || null,
  redisUrl: process.env.REDIS_URL || null,            // Cola QR/email
  sentryDsn: process.env.SENTRY_DSN || null,
  // Secreto para firmar los JWT del login. En prod, ponlo en el .env.
  jwtSecret: process.env.JWT_SECRET || "saas-entradas-default-dev-secret-key",
  // Stripe: si no hay clave, se usa la "compra simulada" para la demo.
  stripeSecret: process.env.STRIPE_SECRET_KEY || null,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null,
  // Email (Resend): sin clave, el email sale por consola.
  resendApiKey: process.env.RESEND_API_KEY || null,
  // IA: Gemini (gratis). Sin clave, la IA usa una plantilla de respaldo.
  geminiApiKey: process.env.GEMINI_API_KEY || null,
};
