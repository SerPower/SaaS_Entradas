// server.js — Backend del SaaS de eventos. Integra API REST, autenticación, tiempo real y panel de control.
import http from "node:http";
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";

import { config } from "./config.js";
import { logger } from "./logger.js";
import { initSentry, capturar, metricasTexto } from "./observability.js";
import { initDb } from "./db.js";
import { crearSocketServer, emitirCheckin, emitirVenta } from "./sockets.js";
import { initQueue, encolarEntrada } from "./queue.js";
import {
  buscarEventos, getEvento, getCategorias, getProvincias, getTipos, getEntradasPorEmail,
  crearEntradas, crearEvento, getEventosOrganizador, esEventoDeOrganizador,
  validarEntrada, statsEvento, actualizarDescripcion, metricasGlobales,
} from "./store.js";
import { crearCheckout, construirEvento } from "./payments.js";
import { generarDescripcion, generarEmailAsistentes } from "./ai.js";
import { adjuntarUsuario, requireAuth, requireOrganizador, registrar, login } from "./auth.js";

await initSentry();
await initDb();

const app = express();
app.use(cors({ origin: config.frontUrl }));

// ⚠️ El webhook de Stripe necesita el body CRUDO (para verificar la firma). Va ANTES de express.json.
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const evt = await construirEvento(req.body, req.headers["stripe-signature"]);
    if (evt.type === "checkout.session.completed") {
      const m = evt.data.object.metadata;
      await emitirEntradas({
        eventoId: m.eventoId, compradorEmail: m.compradorEmail,
        cantidad: Number(m.cantidad || 1), titularNombre: m.titularNombre, titularEmail: m.titularEmail,
        stripeEventId: evt.id,
      });
      logger.info({ eventoId: m.eventoId }, "✅ pago confirmado, entradas encoladas");
    }
    res.json({ recibido: true });
  } catch (err) {
    logger.error({ err }, "webhook error");
    const status = err.type === "StripeSignatureVerificationError" ? 400 : 500;
    res.status(status).send(err.message);
  }
});

app.use(express.json());
app.use(pinoHttp({ logger }));
app.use(adjuntarUsuario); // deja req.usuario disponible (o null) en todas las rutas

// --- Monitorización ---
app.get("/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));
app.get("/metrics", (req, res) => res.type("text/plain").send(metricasTexto()));

// --- AUTH ---
app.post("/api/auth/register", async (req, res) => {
  try { res.json(await registrar(req.body)); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});
app.post("/api/auth/login", async (req, res) => {
  try { res.json(await login(req.body)); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});
app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: req.usuario }));

// --- API ASISTENTE (pública: cualquiera puede mirar el catálogo) ---
app.get("/api/categorias", async (req, res) => res.json(await getCategorias()));
app.get("/api/provincias", async (req, res) => res.json(await getProvincias()));
app.get("/api/tipos", async (req, res) => res.json(await getTipos()));
app.get("/api/eventos", async (req, res) => res.json(await buscarEventos(req.query))); // catálogo + búsqueda multifiltro
app.get("/api/eventos/:id", async (req, res) => {
  const e = await getEvento(req.params.id); return e ? res.json(e) : res.status(404).json({ error: "No existe" });
});

app.get("/api/organizador/eventos", requireOrganizador, async (req, res) =>
  res.json(await getEventosOrganizador(req.usuario.id)));

app.post("/api/organizador/eventos", requireOrganizador, async (req, res) => {
  const datos = validarDatosEvento(req.body);
  if (datos.error) return res.status(400).json({ error: datos.error });
  res.status(201).json(await crearEvento(datos.evento, req.usuario.id));
});

// "Mis entradas": SOLO con sesión. Devuelve las entradas de la cuenta logueada.
app.get("/api/mis-entradas", requireAuth, async (req, res) =>
  res.json(await getEntradasPorEmail(req.usuario.email)));

// Iniciar compra (paso 2-3). SOLO con sesión. Devuelve URL de Stripe o señala compra simulada.
app.post("/api/checkout", requireAuth, async (req, res) => {
  const { eventoId, cantidad = 1, titularNombre, titularEmail } = req.body;
  if (config.isProduction && !config.stripeWebhookSecret) {
    return res.status(503).json({ error: "El webhook de Stripe aún no está configurado." });
  }
  const evento = await getEvento(eventoId);
  if (!evento) return res.status(404).json({ error: "Evento no existe" });
  const n = Math.max(1, Math.min(10, Number(cantidad) || 1));
  if (evento.disponibles < n) return res.status(409).json({ error: "No hay tantas entradas disponibles" });
  const sesion = await crearCheckout({
    evento, compradorEmail: req.usuario.email, cantidad: n, titularNombre, titularEmail,
  });
  if (sesion) return res.json({ url: sesion.url });
  if (config.isProduction) return res.status(503).json({ error: "El pago no está disponible en este momento." });
  return res.json({ simulado: true }); // sin Stripe configurado
});

// Compra SIMULADA (modo demo local): procesa la creación de entradas de inmediato sin Stripe. SOLO con sesión.
app.post("/api/comprar-simulado", requireAuth, async (req, res) => {
  if (config.isProduction) return res.status(403).json({ error: "Las compras simuladas están desactivadas." });
  const { eventoId, cantidad = 1, titularNombre, titularEmail } = req.body;
  const evento = await getEvento(eventoId);
  if (!evento) return res.status(404).json({ error: "Evento no existe" });
  const n = Math.max(1, Math.min(10, Number(cantidad) || 1));
  if (evento.disponibles < n) return res.status(409).json({ error: "No hay tantas entradas disponibles" });
  const ids = await emitirEntradas({
    eventoId, compradorEmail: req.usuario.email, cantidad: n, titularNombre, titularEmail,
  });
  res.json({ ok: true, entradaIds: ids });
});

// Crea N entradas (paso 5) y encola QR+email de cada una (paso 6 -> worker paso 7).
async function emitirEntradas({
  eventoId, compradorEmail, cantidad, titularNombre, titularEmail, stripeEventId = null,
}) {
  const evento = await getEvento(eventoId);
  if (!evento) {
    const error = new Error("Evento no existe");
    error.status = 404;
    throw error;
  }
  const entradas = await crearEntradas({
    eventoId, compradorEmail, cantidad, titularNombre, titularEmail, precio: evento.precio, stripeEventId,
  });
  for (const entrada of entradas) {
    await encolarEntrada(entrada.id);
  }
  await emitirVenta(eventoId);
  return entradas.map((entrada) => entrada.id);
}

// --- CHECK-IN (paso 8): validar QR en la puerta. SOLO organizador. ---
app.post("/api/checkin", requireOrganizador, async (req, res) => {
  const r = await validarEntrada(req.body.codigo, req.usuario.id);
  if (r.ok) emitirCheckin(r.entrada.evento_id, r.entrada, r.stats);
  res.json(r);
});
app.get("/api/eventos/:id/stats", async (req, res) => res.json(await statsEvento(req.params.id)));

// --- DASHBOARD DE MÉTRICAS. SOLO organizador. ---
app.get("/api/organizador/metricas", requireOrganizador, async (req, res) =>
  res.json(await metricasGlobales(req.usuario.id)));

// --- IA del organizador. SOLO organizador. ---
app.post("/api/ia/descripcion", requireOrganizador, async (req, res) => {
  try {
    if (req.body.eventoId && !await esEventoDeOrganizador(req.body.eventoId, req.usuario.id)) {
      return res.status(404).json({ error: "Evento no existe." });
    }
    const texto = await generarDescripcion(req.body);
    if (req.body.eventoId) await actualizarDescripcion(req.body.eventoId, texto);
    res.json({ texto });
  } catch (err) { capturar(err); res.status(500).json({ error: err.message }); }
});
app.post("/api/ia/email", requireOrganizador, async (req, res) => {
  try { res.json({ texto: await generarEmailAsistentes(req.body) }); }
  catch (err) { capturar(err); res.status(500).json({ error: err.message }); }
});

app.use((err, req, res, next) => { capturar(err); logger.error({ err }, "error"); res.status(500).json({ error: err.message }); });

const httpServer = http.createServer(app);
crearSocketServer(httpServer);
httpServer.listen(config.port, async () => {
  logger.info(`🚀 Backend SaaS en http://localhost:${config.port}`);
  await initQueue();
  if (!config.databaseUrl) logger.warn("Sin DATABASE_URL → datos en memoria (demo). 'docker compose up -d' para Postgres real.");
  if (!config.stripeSecret) logger.warn("Stripe no configurado → usa /api/comprar-simulado para la demo.");
});

function validarDatosEvento(body = {}) {
  if (!body || typeof body !== "object") body = {};
  const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
  const categoria = typeof body.categoria === "string" ? body.categoria.trim() : "";
  const fecha = typeof body.fecha === "string" ? body.fecha : "";
  const lugar = typeof body.lugar === "string" ? body.lugar.trim() : "";
  const precio = Number(body.precio);
  const aforo = Number(body.aforo);
  if (!nombre || !categoria || !fecha || !lugar) {
    return { error: "Nombre, categoría, fecha y lugar son obligatorios." };
  }
  if (nombre.length > 120 || categoria.length > 60 || lugar.length > 180) {
    return { error: "El nombre, la categoría o el lugar superan la longitud permitida." };
  }
  const fechaParseada = new Date(`${fecha}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(fechaParseada.getTime()) ||
    fechaParseada.toISOString().slice(0, 10) !== fecha) {
    return { error: "La fecha debe tener el formato AAAA-MM-DD." };
  }
  if (!Number.isFinite(precio) || precio < 0 || precio > 100000) {
    return { error: "El precio debe ser un importe entre 0 y 100000 euros." };
  }
  if (!Number.isInteger(aforo) || aforo < 1 || aforo > 1000000) {
    return { error: "El aforo debe ser un número entero entre 1 y 1000000." };
  }
  const imagen = typeof body.imagen === "string" && body.imagen.trim() ? body.imagen.trim() : null;
  if (imagen && !/^https?:\/\//i.test(imagen)) {
    return { error: "La imagen debe ser una URL HTTP o HTTPS." };
  }
  return {
    evento: {
      nombre, categoria, fecha, lugar, precio, aforo,
      tipo: typeof body.tipo === "string" ? body.tipo.trim() : "",
      provincia: typeof body.provincia === "string" ? body.provincia.trim() : "",
      hora: typeof body.hora === "string" ? body.hora.trim() : "",
      descripcion: typeof body.descripcion === "string" ? body.descripcion.trim().slice(0, 5000) : "",
      imagen,
    },
  };
}
