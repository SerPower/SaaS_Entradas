// store.test.js — Tests de la lógica de negocio (Jest). Modo memoria (sin DATABASE_URL).
import {
  buscarEventos, crearEntrada, validarEntrada, getEntradasPorEmail,
  crearUsuario, getUsuarioPorEmail, metricasGlobales, memEventos,
  crearEvento, crearEntradas, getEventosOrganizador,
} from "../store.js";

const primerEventoId = () => memEventos[0].id;

test("buscarEventos filtra por categoría", async () => {
  const conciertos = await buscarEventos({ categoria: "Concierto" });
  expect(conciertos.length).toBeGreaterThan(0);
  expect(conciertos.every((e) => e.categoria === "Concierto")).toBe(true);
});

test("buscarEventos filtra por provincia y precio máximo", async () => {
  const baratos = await buscarEventos({ provincia: "Madrid", precioMax: 40 });
  expect(baratos.every((e) => e.provincia === "Madrid" && e.precio <= 40)).toBe(true);
});

test("comprar crea entrada y aparece en 'mis entradas' del comprador", async () => {
  const entrada = await crearEntrada({ eventoId: primerEventoId(), compradorEmail: "ana@test.com", titularNombre: "Ana", precio: 39 });
  expect(entrada.codigo).toMatch(/^ENT-/);
  const mias = await getEntradasPorEmail("ana@test.com");
  expect(mias.some((t) => t.id === entrada.id)).toBe(true);
});

test("validar entrada: ok la 1ª vez, ya-validada la 2ª, y sube el contador", async () => {
  const entrada = await crearEntrada({ eventoId: memEventos[1].id, compradorEmail: "leo@test.com", precio: 10 });
  const r1 = await validarEntrada(entrada.codigo);
  expect(r1.ok).toBe(true);
  expect(r1.stats.validadas).toBeGreaterThanOrEqual(1);
  const r2 = await validarEntrada(entrada.codigo);
  expect(r2.ok).toBe(false);
  expect(r2.motivo).toBe("ya-validada");
});

test("validar código inexistente devuelve no-existe", async () => {
  const r = await validarEntrada("NOPE");
  expect(r.motivo).toBe("no-existe");
});

test("usuarios: no se puede duplicar el email", async () => {
  await crearUsuario({ nombre: "U1", email: "dup@test.com", password: "x", rol: "usuario" });
  await expect(crearUsuario({ nombre: "U2", email: "dup@test.com", password: "y", rol: "usuario" })).rejects.toThrow();
  const u = await getUsuarioPorEmail("dup@test.com");
  expect(u.nombre).toBe("U1");
});

test("metricasGlobales devuelve los KPIs esperados", async () => {
  const m = await metricasGlobales();
  expect(m).toHaveProperty("ingresosTotales");
  expect(m).toHaveProperty("tasaAsistencia");
  expect(m.entradasVendidas).toBeGreaterThanOrEqual(1);
  expect(Array.isArray(m.porEvento)).toBe(true);
});

test("los eventos y métricas del organizador se limitan a sus propios eventos", async () => {
  const datos = {
    nombre: "Evento privado", categoria: "Prueba", fecha: "2027-01-15",
    lugar: "Madrid", precio: 12, aforo: 20,
  };
  const propio = await crearEvento(datos, "organizador-a");
  await crearEvento({ ...datos, nombre: "Evento ajeno" }, "organizador-b");
  await crearEntrada({ eventoId: propio.id, compradorEmail: "asistente@test.com", precio: 12 });

  const eventos = await getEventosOrganizador("organizador-a");
  const metricas = await metricasGlobales("organizador-a");
  expect(eventos.map((e) => e.id)).toEqual([propio.id]);
  expect(metricas.totalEventos).toBe(1);
  expect(metricas.entradasVendidas).toBe(1);
});

test("un organizador no puede validar entradas de eventos ajenos", async () => {
  const evento = await crearEvento({
    nombre: "Acceso privado", categoria: "Prueba", fecha: "2027-01-15",
    lugar: "Madrid", precio: 12, aforo: 20,
  }, "organizador-a");
  const entrada = await crearEntrada({
    eventoId: evento.id, compradorEmail: "asistente@test.com", precio: 12,
  });

  expect((await validarEntrada(entrada.codigo, "organizador-b")).motivo).toBe("no-existe");
  expect((await validarEntrada(entrada.codigo, "organizador-a")).ok).toBe(true);
});

test("no se venden más entradas que el aforo, incluso con compras simultáneas", async () => {
  const evento = await crearEvento({
    nombre: "Aforo limitado", categoria: "Prueba", fecha: "2027-01-15",
    lugar: "Madrid", precio: 12, aforo: 1,
  }, "organizador-aforo");
  const resultados = await Promise.allSettled([
    crearEntradas({ eventoId: evento.id, compradorEmail: "uno@test.com", cantidad: 1 }),
    crearEntradas({ eventoId: evento.id, compradorEmail: "dos@test.com", cantidad: 1 }),
  ]);

  expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await metricasGlobales("organizador-aforo")).entradasVendidas).toBe(1);
});

test("procesar dos veces el mismo webhook de Stripe no duplica entradas", async () => {
  const evento = await crearEvento({
    nombre: "Pago idempotente", categoria: "Prueba", fecha: "2027-01-15",
    lugar: "Madrid", precio: 12, aforo: 10,
  }, "organizador-stripe");
  const compra = {
    eventoId: evento.id, compradorEmail: "stripe@test.com", precio: 12, cantidad: 2,
    stripeEventId: "evt_test_reintento",
  };

  const primera = await crearEntradas(compra);
  const reintentada = await crearEntradas(compra);
  expect(primera).toHaveLength(2);
  expect(reintentada.map((entrada) => entrada.id)).toEqual(primera.map((entrada) => entrada.id));
  expect((await metricasGlobales("organizador-stripe")).entradasVendidas).toBe(2);
});
