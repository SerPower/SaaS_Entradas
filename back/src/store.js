// store.js — Capa de datos del SaaS. DOBLE MODO (regla de oro del CLAUDE.md):
//   • Con DATABASE_URL  → PostgreSQL (db.js). Persiste de verdad.
//   • Sin DATABASE_URL  → MEMORIA. Modo demostración sin base de datos externa.
// Toda la API es ASÍNCRONA (devuelve promesas) para que el server no sepa qué modo hay.
import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { getPool, query, EVENTOS_SEED } from "./db.js";

const usaPg = () => !!config.databaseUrl;

// ---------------------------------------------------------------------------
// MODO MEMORIA (fallback). Se siembra con el mismo catálogo que Postgres.
// ---------------------------------------------------------------------------
const memUsuarios = [];
const memEventos = EVENTOS_SEED.map((e) => ({ id: randomUUID(), organizador_id: null, ...e }));
const memEntradas = []; // { id, evento_id, comprador_email, titular_nombre, titular_email, codigo, precio, qr_data_url, validada, validada_en, comprada_en }
const memStripeEventos = new Map();

const nuevoCodigo = () => "ENT-" + randomUUID().replace(/-/g, "").toUpperCase();

// En Postgres los ids son UUID. Un id viejo (p. ej. "evt-4" cacheado en el navegador) NO es
// un UUID válido y Postgres lo rechaza. Esto evita que una petición con un id basura tumbe el
// servidor: si no es UUID, lo tratamos como "no existe" (sin tocar la BD).
const esUuid = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// ===========================================================================
// USUARIOS / AUTH
// ===========================================================================
export async function crearUsuario({ nombre, email, password, rol }) {
  email = email.toLowerCase().trim();
  if (usaPg()) {
    const { rows } = await query(
      `INSERT INTO usuarios (nombre,email,password,rol) VALUES ($1,$2,$3,$4)
       RETURNING id,nombre,email,rol`,
      [nombre, email, password, rol]
    );
    return rows[0];
  }
  if (memUsuarios.some((u) => u.email === email)) { const e = new Error("email-existe"); e.code = "DUP"; throw e; }
  const u = { id: randomUUID(), nombre, email, password, rol, creado_en: new Date().toISOString() };
  memUsuarios.push(u);
  return { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol };
}
export async function getUsuarioPorEmail(email) {
  email = (email || "").toLowerCase().trim();
  if (usaPg()) {
    const { rows } = await query(`SELECT * FROM usuarios WHERE email=$1`, [email]);
    return rows[0] || null;
  }
  return memUsuarios.find((u) => u.email === email) || null;
}
export async function getUsuarioPorId(id) {
  if (usaPg()) {
    if (!esUuid(id)) return null;
    const { rows } = await query(`SELECT id,nombre,email,rol FROM usuarios WHERE id=$1`, [id]);
    return rows[0] || null;
  }
  const u = memUsuarios.find((x) => x.id === id);
  return u ? { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol } : null;
}

// ===========================================================================
// EVENTOS
// ===========================================================================
// Búsqueda multifiltro: texto (nombre), categoría/tipo, provincia, precio min/max, fecha.
export async function buscarEventos(f = {}, organizadorId = null) {
  if (usaPg()) {
    const cond = [], vals = [];
    const add = (sql, v) => { vals.push(v); cond.push(sql.replace("?", "$" + vals.length)); };
    if (f.texto)     add("LOWER(nombre) LIKE ?", `%${f.texto.toLowerCase()}%`);
    if (f.categoria && f.categoria !== "Todas") add("categoria = ?", f.categoria);
    if (f.tipo)      add("tipo = ?", f.tipo);
    if (f.provincia) add("provincia = ?", f.provincia);
    if (f.precioMin != null && f.precioMin !== "") add("precio >= ?", Number(f.precioMin));
    if (f.precioMax != null && f.precioMax !== "") add("precio <= ?", Number(f.precioMax));
    if (f.fecha)     add("fecha >= ?", f.fecha);
    if (organizadorId) add("organizador_id = ?", organizadorId);
    const where = cond.length ? "WHERE " + cond.join(" AND ") : "";
    const { rows } = await query(`SELECT * FROM eventos ${where} ORDER BY fecha ASC`, vals);
    return Promise.all(rows.map(conContadores));
  }
  let lista = memEventos.slice();
  if (organizadorId) lista = lista.filter((e) => e.organizador_id === organizadorId);
  if (f.texto)     lista = lista.filter((e) => e.nombre.toLowerCase().includes(f.texto.toLowerCase()));
  if (f.categoria && f.categoria !== "Todas") lista = lista.filter((e) => e.categoria === f.categoria);
  if (f.tipo)      lista = lista.filter((e) => e.tipo === f.tipo);
  if (f.provincia) lista = lista.filter((e) => e.provincia === f.provincia);
  if (f.precioMin != null && f.precioMin !== "") lista = lista.filter((e) => e.precio >= Number(f.precioMin));
  if (f.precioMax != null && f.precioMax !== "") lista = lista.filter((e) => e.precio <= Number(f.precioMax));
  if (f.fecha)     lista = lista.filter((e) => e.fecha >= f.fecha);
  lista.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  return Promise.all(lista.map(conContadores));
}

export async function getEventosOrganizador(organizadorId) {
  return buscarEventos({}, organizadorId);
}

export async function crearEvento(datos, organizadorId) {
  const evento = {
    ...datos,
    tipo: datos.tipo || null,
    provincia: datos.provincia || null,
    hora: datos.hora || null,
    lugar: datos.lugar || null,
    descripcion: datos.descripcion || "",
    imagen: datos.imagen || null,
  };
  if (usaPg()) {
    const { rows } = await query(
      `INSERT INTO eventos
       (nombre,categoria,tipo,provincia,fecha,hora,lugar,precio,aforo,descripcion,imagen,organizador_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [evento.nombre, evento.categoria, evento.tipo, evento.provincia, evento.fecha, evento.hora,
        evento.lugar, evento.precio, evento.aforo, evento.descripcion, evento.imagen, organizadorId]
    );
    return conContadores(rows[0]);
  }
  const creado = { id: randomUUID(), organizador_id: organizadorId, ...evento };
  memEventos.push(creado);
  return conContadores(creado);
}

export async function esEventoDeOrganizador(eventoId, organizadorId) {
  if (usaPg()) {
    if (!esUuid(eventoId)) return false;
    const { rows } = await query(
      "SELECT 1 FROM eventos WHERE id=$1 AND organizador_id=$2",
      [eventoId, organizadorId]
    );
    return rows.length > 0;
  }
  return memEventos.some((e) => e.id === eventoId && e.organizador_id === organizadorId);
}

export async function getEvento(id) {
  if (usaPg()) {
    if (!esUuid(id)) return null;
    const { rows } = await query(`SELECT * FROM eventos WHERE id=$1`, [id]);
    return rows[0] ? conContadores(rows[0]) : null;
  }
  const e = memEventos.find((x) => x.id === id);
  return e ? conContadores(e) : null;
}

async function conContadores(e) {
  const vendidas = await contarVendidas(e.id);
  const validadas = await contarValidadas(e.id);
  return { ...e, precio: Number(e.precio), vendidas, validadas, disponibles: e.aforo - vendidas };
}

export async function getCategorias() {
  if (usaPg()) {
    const { rows } = await query(`SELECT DISTINCT categoria FROM eventos ORDER BY categoria`);
    return ["Todas", ...rows.map((r) => r.categoria)];
  }
  return ["Todas", ...new Set(memEventos.map((e) => e.categoria))];
}
export async function getProvincias() {
  if (usaPg()) {
    const { rows } = await query(`SELECT DISTINCT provincia FROM eventos WHERE provincia IS NOT NULL ORDER BY provincia`);
    return rows.map((r) => r.provincia);
  }
  return [...new Set(memEventos.map((e) => e.provincia).filter(Boolean))];
}
export async function getTipos() {
  if (usaPg()) {
    const { rows } = await query(`SELECT DISTINCT tipo FROM eventos WHERE tipo IS NOT NULL ORDER BY tipo`);
    return rows.map((r) => r.tipo);
  }
  return [...new Set(memEventos.map((e) => e.tipo).filter(Boolean))];
}

export async function actualizarDescripcion(id, descripcion) {
  if (usaPg()) { if (!esUuid(id)) return; await query(`UPDATE eventos SET descripcion=$1 WHERE id=$2`, [descripcion, id]); return; }
  const e = memEventos.find((x) => x.id === id); if (e) e.descripcion = descripcion;
}

async function contarVendidas(eventoId) {
  if (usaPg()) { if (!esUuid(eventoId)) return 0; const { rows } = await query(`SELECT COUNT(*)::int n FROM entradas WHERE evento_id=$1`, [eventoId]); return rows[0].n; }
  return memEntradas.filter((t) => t.evento_id === eventoId).length;
}
async function contarValidadas(eventoId) {
  if (usaPg()) { if (!esUuid(eventoId)) return 0; const { rows } = await query(`SELECT COUNT(*)::int n FROM entradas WHERE evento_id=$1 AND validada`, [eventoId]); return rows[0].n; }
  return memEntradas.filter((t) => t.evento_id === eventoId && t.validada).length;
}

// ===========================================================================
// ENTRADAS
// ===========================================================================
// Crea UNA entrada (paso 5). titular = quien asiste; comprador = la cuenta que pagó.
export async function crearEntrada({ eventoId, compradorEmail, titularNombre, titularEmail, precio = 0 }) {
  const [entrada] = await crearEntradas({
    eventoId, compradorEmail, titularNombre, titularEmail, precio, cantidad: 1,
  });
  return entrada;
}

export async function crearEntradas({
  eventoId, compradorEmail, titularNombre, titularEmail, precio = 0, cantidad, stripeEventId = null,
}) {
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    const error = new Error("La cantidad de entradas no es válida.");
    error.status = 400;
    throw error;
  }
  if (usaPg()) {
    const pool = await getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (stripeEventId) {
        const { rows } = await client.query(
          `INSERT INTO stripe_webhook_events (event_id) VALUES ($1)
           ON CONFLICT (event_id) DO NOTHING RETURNING event_id`,
          [stripeEventId]
        );
        if (!rows.length) {
          const previo = await client.query(
            "SELECT ticket_ids FROM stripe_webhook_events WHERE event_id=$1",
            [stripeEventId]
          );
          const ids = previo.rows[0]?.ticket_ids || [];
          const entradas = ids.length
            ? (await client.query("SELECT * FROM entradas WHERE id=ANY($1::uuid[])", [ids])).rows
            : [];
          await client.query("COMMIT");
          return entradas;
        }
      }
      const { rows: eventos } = await client.query(
        "SELECT aforo FROM eventos WHERE id=$1 FOR UPDATE",
        [eventoId]
      );
      if (!eventos[0]) {
        const error = new Error("Evento no existe");
        error.status = 404;
        throw error;
      }
      const { rows: ventas } = await client.query(
        "SELECT COUNT(*)::int AS n FROM entradas WHERE evento_id=$1",
        [eventoId]
      );
      if (eventos[0].aforo - ventas[0].n < cantidad) {
        const error = new Error("No hay tantas entradas disponibles");
        error.status = 409;
        throw error;
      }
      const entradas = [];
      for (let i = 0; i < cantidad; i++) {
        const { rows } = await client.query(
          `INSERT INTO entradas (evento_id,comprador_email,titular_nombre,titular_email,codigo,precio)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [eventoId, compradorEmail, titularNombre || null, titularEmail || compradorEmail, nuevoCodigo(), precio]
        );
        entradas.push(rows[0]);
      }
      if (stripeEventId) {
        await client.query(
          "UPDATE stripe_webhook_events SET ticket_ids=$2::jsonb WHERE event_id=$1",
          [stripeEventId, JSON.stringify(entradas.map((entrada) => entrada.id))]
        );
      }
      await client.query("COMMIT");
      return entradas;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  const evento = memEventos.find((e) => e.id === eventoId);
  if (stripeEventId && memStripeEventos.has(stripeEventId)) return memStripeEventos.get(stripeEventId);
  if (!evento) {
    const error = new Error("Evento no existe");
    error.status = 404;
    throw error;
  }
  const vendidas = memEntradas.filter((t) => t.evento_id === eventoId).length;
  if (evento.aforo - vendidas < cantidad) {
    const error = new Error("No hay tantas entradas disponibles");
    error.status = 409;
    throw error;
  }
  const entradas = Array.from({ length: cantidad }, () => ({
    id: randomUUID(), evento_id: eventoId, comprador_email: compradorEmail,
    titular_nombre: titularNombre || null, titular_email: titularEmail || compradorEmail,
    codigo: nuevoCodigo(), precio: Number(precio), qr_data_url: null, validada: false,
    validada_en: null, comprada_en: new Date().toISOString(),
  }));
  memEntradas.push(...entradas);
  if (stripeEventId) memStripeEventos.set(stripeEventId, entradas);
  return entradas;
}
export async function setQr(entradaId, qrDataUrl) {
  if (usaPg()) { if (!esUuid(entradaId)) return; await query(`UPDATE entradas SET qr_data_url=$1 WHERE id=$2`, [qrDataUrl, entradaId]); return; }
  const t = memEntradas.find((x) => x.id === entradaId); if (t) t.qr_data_url = qrDataUrl;
}
export async function getEntrada(id) {
  if (usaPg()) { if (!esUuid(id)) return null; const { rows } = await query(`SELECT * FROM entradas WHERE id=$1`, [id]); return rows[0] || null; }
  return memEntradas.find((x) => x.id === id) || null;
}
// Entradas de un comprador (su cuenta), con el evento embebido.
export async function getEntradasPorEmail(email) {
  email = (email || "").toLowerCase().trim();
  if (usaPg()) {
    const { rows } = await query(
      `SELECT t.*, row_to_json(e) AS evento FROM entradas t
       JOIN eventos e ON e.id = t.evento_id
       WHERE LOWER(t.comprador_email)=$1 ORDER BY t.comprada_en DESC`,
      [email]
    );
    return rows;
  }
  return memEntradas
    .filter((t) => t.comprador_email.toLowerCase() === email)
    .map((t) => ({ ...t, evento: memEventos.find((e) => e.id === t.evento_id) }))
    .sort((a, b) => (a.comprada_en < b.comprada_en ? 1 : -1));
}

// Check-in (paso 8): validar por código (el código es texto, no UUID).
export async function validarEntrada(codigo, organizadorId = null) {
  if (usaPg()) {
    const { rows } = organizadorId
      ? await query(
        `SELECT t.* FROM entradas t JOIN eventos e ON e.id=t.evento_id
         WHERE t.codigo=$1 AND e.organizador_id=$2`,
        [codigo, organizadorId]
      )
      : await query(`SELECT * FROM entradas WHERE codigo=$1`, [codigo]);
    const t = rows[0];
    if (!t) return { ok: false, motivo: "no-existe" };
    if (t.validada) return { ok: false, motivo: "ya-validada", entrada: t, stats: await statsEvento(t.evento_id) };
    const actualizada = await query(
      `UPDATE entradas SET validada=true, validada_en=now() WHERE id=$1 AND validada=false RETURNING *`,
      [t.id]
    );
    if (!actualizada.rows[0]) {
      return { ok: false, motivo: "ya-validada", entrada: t, stats: await statsEvento(t.evento_id) };
    }
    return { ok: true, entrada: actualizada.rows[0], stats: await statsEvento(t.evento_id) };
  }
  const t = memEntradas.find((x) => x.codigo === codigo);
  if (!t || (organizadorId && !memEventos.some((e) => e.id === t.evento_id && e.organizador_id === organizadorId))) {
    return { ok: false, motivo: "no-existe" };
  }
  if (t.validada) return { ok: false, motivo: "ya-validada", entrada: t, stats: await statsEvento(t.evento_id) };
  t.validada = true; t.validada_en = new Date().toISOString();
  return { ok: true, entrada: t, stats: await statsEvento(t.evento_id) };
}

export async function statsEvento(eventoId) {
  const vendidas = await contarVendidas(eventoId);
  const validadas = await contarValidadas(eventoId);
  return { vendidas, validadas, restantes: vendidas - validadas };
}

// ===========================================================================
// MÉTRICAS DEL ORGANIZADOR (dashboard de KPIs)
// ===========================================================================
export async function metricasGlobales(organizadorId = null) {
  if (usaPg()) {
    const params = organizadorId ? [organizadorId] : [];
    const filtroEvento = organizadorId ? " WHERE organizador_id=$1" : "";
    const filtroEntrada = organizadorId ? " WHERE e.organizador_id=$1" : "";
    const ev = (await query(`SELECT COUNT(*)::int n FROM eventos${filtroEvento}`, params)).rows[0].n;
    const ag = (await query(
      `SELECT COUNT(*)::int vendidas,
              COUNT(*) FILTER (WHERE validada)::int validadas,
              COALESCE(SUM(precio),0)::float ingresos
       FROM entradas t JOIN eventos e ON e.id=t.evento_id${filtroEntrada}`, params)).rows[0];
    const porEvento = (await query(
      `SELECT e.id, e.nombre, e.fecha, e.aforo, e.precio::float precio,
              COUNT(t.id)::int vendidas,
              COUNT(t.id) FILTER (WHERE t.validada)::int validadas,
              COALESCE(SUM(t.precio),0)::float ingresos
       FROM eventos e LEFT JOIN entradas t ON t.evento_id=e.id
       ${organizadorId ? "WHERE e.organizador_id=$1" : ""}
       GROUP BY e.id ORDER BY ingresos DESC`, params)).rows;
    const recientes = (await query(
      `SELECT t.codigo, t.comprador_email, t.titular_nombre, t.precio::float precio,
              t.comprada_en, e.nombre AS evento
       FROM entradas t JOIN eventos e ON e.id=t.evento_id
       ${filtroEntrada}
       ORDER BY t.comprada_en DESC LIMIT 8`)).rows;
    return armarMetricas(ev, ag.vendidas, ag.validadas, ag.ingresos, porEvento, recientes);
  }
  const eventos = organizadorId
    ? memEventos.filter((e) => e.organizador_id === organizadorId)
    : memEventos;
  const eventoIds = new Set(eventos.map((e) => e.id));
  const entradas = organizadorId ? memEntradas.filter((t) => eventoIds.has(t.evento_id)) : memEntradas;
  const vendidas = entradas.length;
  const validadas = entradas.filter((t) => t.validada).length;
  const ingresos = entradas.reduce((s, t) => s + Number(t.precio), 0);
  const porEvento = eventos.map((e) => {
    const ts = entradas.filter((t) => t.evento_id === e.id);
    return { id: e.id, nombre: e.nombre, fecha: e.fecha, aforo: e.aforo, precio: Number(e.precio),
      vendidas: ts.length, validadas: ts.filter((t) => t.validada).length,
      ingresos: ts.reduce((s, t) => s + Number(t.precio), 0) };
  }).sort((a, b) => b.ingresos - a.ingresos);
  const recientes = entradas.slice(-8).reverse().map((t) => ({
    codigo: t.codigo, comprador_email: t.comprador_email, titular_nombre: t.titular_nombre,
    precio: Number(t.precio), comprada_en: t.comprada_en,
    evento: memEventos.find((e) => e.id === t.evento_id)?.nombre,
  }));
  return armarMetricas(eventos.length, vendidas, validadas, ingresos, porEvento, recientes);
}

function armarMetricas(totalEventos, vendidas, validadas, ingresos, porEvento, recientes) {
  const aforoTotal = porEvento.reduce((s, e) => s + e.aforo, 0);
  return {
    totalEventos,
    entradasVendidas: vendidas,
    entradasValidadas: validadas,
    ingresosTotales: Math.round(ingresos * 100) / 100,
    ticketMedio: vendidas ? Math.round((ingresos / vendidas) * 100) / 100 : 0,
    tasaAsistencia: vendidas ? Math.round((validadas / vendidas) * 100) : 0,
    ocupacionMedia: aforoTotal ? Math.round((vendidas / aforoTotal) * 100) : 0,
    porEvento,
    recientes,
  };
}

export { memEventos, memEntradas, memUsuarios };
