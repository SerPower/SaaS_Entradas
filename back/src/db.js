// db.js — Conexión a PostgreSQL + esquema + datos de ejemplo (seed).
//
// La app arranca sin claves obligatorias. Si no hay DATABASE_URL, el store
// degrada a memoria (ver store.js) y este módulo no se usa. Con DATABASE_URL, usamos
// Postgres de verdad (docker compose levanta uno en local).
import { config } from "./config.js";
import { logger } from "./logger.js";

let pool = null;

// Carga perezosa de 'pg' para no obligar a tenerlo si se arranca en modo memoria.
export async function getPool() {
  if (pool) return pool;
  if (!config.databaseUrl) return null;
  const { Pool } = await import("pg");
  pool = new Pool({ connectionString: config.databaseUrl });
  return pool;
}

export async function query(text, params) {
  const p = await getPool();
  if (!p) throw new Error("Sin DATABASE_URL: PostgreSQL no disponible.");
  return p.query(text, params);
}

// Crea las tablas si no existen y siembra eventos de ejemplo la primera vez.
export async function initDb() {
  const p = await getPool();
  if (!p) {
    logger.warn("DATABASE_URL no configurada → store en MEMORIA (demo). Datos no persisten.");
    return false;
  }
  await p.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre      TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      password    TEXT NOT NULL,
      rol         TEXT NOT NULL DEFAULT 'usuario',   -- 'usuario' | 'organizador'
      creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS eventos (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nombre      TEXT NOT NULL,
      categoria   TEXT NOT NULL,
      tipo        TEXT,
      provincia   TEXT,
      fecha       DATE NOT NULL,
      hora        TEXT,
      lugar       TEXT,
      precio      NUMERIC(10,2) NOT NULL DEFAULT 0,
      aforo       INTEGER NOT NULL DEFAULT 100,
      descripcion TEXT,
      imagen      TEXT,
      organizador_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
      creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS entradas (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      evento_id     UUID NOT NULL REFERENCES eventos(id) ON DELETE CASCADE,
      comprador_email TEXT NOT NULL,           -- email de la cuenta que compró
      titular_nombre  TEXT,                    -- nombre de la persona que asiste
      titular_email   TEXT,                    -- email de la persona que asiste
      codigo        TEXT UNIQUE NOT NULL,
      precio        NUMERIC(10,2) NOT NULL DEFAULT 0,
      qr_data_url   TEXT,
      validada      BOOLEAN NOT NULL DEFAULT false,
      validada_en   TIMESTAMPTZ,
      comprada_en   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      event_id      TEXT PRIMARY KEY,
      ticket_ids    JSONB NOT NULL DEFAULT '[]'::jsonb,
      processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE stripe_webhook_events
      ADD COLUMN IF NOT EXISTS ticket_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
    CREATE INDEX IF NOT EXISTS idx_entradas_evento ON entradas(evento_id);
    CREATE INDEX IF NOT EXISTS idx_entradas_comprador ON entradas(comprador_email);
  `);

  // Seed: solo si la tabla de eventos está vacía.
  const { rows } = await p.query("SELECT COUNT(*)::int AS n FROM eventos");
  if (rows[0].n === 0) {
    logger.info("Sembrando eventos de ejemplo en PostgreSQL…");
    for (const e of EVENTOS_SEED) {
      await p.query(
        `INSERT INTO eventos (nombre,categoria,tipo,provincia,fecha,hora,lugar,precio,aforo,descripcion,imagen)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [e.nombre, e.categoria, e.tipo, e.provincia, e.fecha, e.hora, e.lugar, e.precio, e.aforo, e.descripcion, e.imagen]
      );
    }
  }
  logger.info("PostgreSQL listo (tablas + seed).");
  return true;
}

// Catálogo de ejemplo, compartido por Postgres (seed) y por el modo memoria (store.js).
export const EVENTOS_SEED = [
  { nombre: "Los Planetas · 30 Aniversario", categoria: "Concierto", tipo: "Música", provincia: "Madrid",
    fecha: "2026-07-12", hora: "21:00", lugar: "WiZink Center, Madrid", precio: 39, aforo: 200,
    descripcion: "Una noche irrepetible celebrando tres décadas de la banda granadina.", imagen: "https://picsum.photos/seed/planetas/800/400" },
  { nombre: "SpainTech Summit 2026", categoria: "Tecnología", tipo: "Conferencia", provincia: "Madrid",
    fecha: "2026-09-03", hora: "09:30", lugar: "La Nave, Madrid", precio: 149, aforo: 150,
    descripcion: "El mayor encuentro de desarrollo e IA del país.", imagen: "https://picsum.photos/seed/spaintech/800/400" },
  { nombre: "Noche de Flamenco", categoria: "Concierto", tipo: "Música", provincia: "Madrid",
    fecha: "2026-06-28", hora: "20:00", lugar: "Teatro Real, Madrid", precio: 45, aforo: 120,
    descripcion: "Lo mejor del flamenco contemporáneo.", imagen: "https://picsum.photos/seed/flamenco/800/400" },
  { nombre: "Workshop: IA para devs", categoria: "Formación", tipo: "Taller", provincia: "Online",
    fecha: "2026-07-01", hora: "17:00", lugar: "Online", precio: 0, aforo: 500,
    descripcion: "Taller práctico de IA aplicada al desarrollo.", imagen: "https://picsum.photos/seed/workshop/800/400" },
  { nombre: "Final Liga ACB", categoria: "Deporte", tipo: "Baloncesto", provincia: "Barcelona",
    fecha: "2026-06-30", hora: "19:00", lugar: "Palau Blaugrana, Barcelona", precio: 65, aforo: 300,
    descripcion: "La gran final del baloncesto español, en directo.", imagen: "https://picsum.photos/seed/acb/800/400" },
  { nombre: "Feria del Vino de Rioja", categoria: "Gastronomía", tipo: "Feria", provincia: "La Rioja",
    fecha: "2026-08-15", hora: "12:00", lugar: "Recinto Ferial, Logroño", precio: 25, aforo: 400,
    descripcion: "Catas, bodegas y la mejor gastronomía riojana.", imagen: "https://picsum.photos/seed/rioja/800/400" },
  { nombre: "Festival Indie Costa", categoria: "Concierto", tipo: "Festival", provincia: "Valencia",
    fecha: "2026-07-25", hora: "18:00", lugar: "Marina de Valencia", precio: 55, aforo: 600,
    descripcion: "Dos días de música indie frente al mar.", imagen: "https://picsum.photos/seed/indie/800/400" },
  { nombre: "Teatro: La Casa de Bernarda Alba", categoria: "Teatro", tipo: "Obra", provincia: "Sevilla",
    fecha: "2026-09-10", hora: "20:30", lugar: "Teatro Lope de Vega, Sevilla", precio: 32, aforo: 180,
    descripcion: "El clásico de Lorca en una puesta en escena renovada.", imagen: "https://picsum.photos/seed/lorca/800/400" },
  { nombre: "Maratón de Málaga", categoria: "Deporte", tipo: "Running", provincia: "Málaga",
    fecha: "2026-12-06", hora: "08:00", lugar: "Paseo del Parque, Málaga", precio: 35, aforo: 1000,
    descripcion: "42 km recorriendo la ciudad de punta a punta.", imagen: "https://picsum.photos/seed/maraton/800/400" },
  { nombre: "Comic Con Norte", categoria: "Cultura", tipo: "Feria", provincia: "Bilbao",
    fecha: "2026-10-18", hora: "10:00", lugar: "BEC, Bilbao", precio: 28, aforo: 800,
    descripcion: "Cómic, videojuegos, cosplay e invitados internacionales.", imagen: "https://picsum.photos/seed/comic/800/400" },
  { nombre: "Stand-up Comedy Night", categoria: "Humor", tipo: "Monólogo", provincia: "Madrid",
    fecha: "2026-07-05", hora: "22:00", lugar: "Teatro Flumen, Madrid", precio: 22, aforo: 150,
    descripcion: "Los mejores monologuistas del momento en una noche de risas.", imagen: "https://picsum.photos/seed/standup/800/400" },
  { nombre: "Ópera: La Traviata", categoria: "Música", tipo: "Ópera", provincia: "Barcelona",
    fecha: "2026-11-22", hora: "19:30", lugar: "Gran Teatre del Liceu, Barcelona", precio: 89, aforo: 250,
    descripcion: "La obra maestra de Verdi en el Liceu.", imagen: "https://picsum.photos/seed/traviata/800/400" },
];
