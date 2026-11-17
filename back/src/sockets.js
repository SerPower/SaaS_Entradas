// sockets.js — Check-in en tiempo real (paso 8). Cada evento tiene su SALA (room):
// cuando se valida una entrada, el contador "X/Y validados" sube en todas las pantallas.
import { Server } from "socket.io";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { esEventoDeOrganizador, getEvento, statsEvento } from "./store.js";
import { verificarToken } from "./auth.js";
import { getUsuarioPorId } from "./store.js";

let ioRef = null;

export function crearSocketServer(httpServer) {
  const io = new Server(httpServer, { cors: { origin: config.frontUrl, methods: ["GET", "POST"] } });
  ioRef = io;
  io.use(async (socket, next) => {
    try {
      const payload = verificarToken(socket.handshake.auth?.token);
      const usuario = payload ? await getUsuarioPorId(payload.id) : null;
      if (!usuario || usuario.rol !== "organizador") return next(new Error("Acceso solo para organizadores."));
      socket.data.usuario = usuario;
      next();
    } catch (err) { next(err); }
  });
  io.on("connection", (socket) => {
    logger.info({ id: socket.id }, "cliente conectado");
    const organizadorId = socket.data.usuario.id;
    socket.join(`organizador:${organizadorId}`);
    socket.on("ver-evento", async (eventoId) => {
      try {
        if (!await esEventoDeOrganizador(eventoId, organizadorId)) {
          socket.emit("socket-error", "No tienes acceso a este evento.");
          return;
        }
        socket.join(`evento:${eventoId}`);
        socket.emit("checkin-stats", await statsEvento(eventoId));
      } catch (err) {
        logger.error({ err, eventoId }, "no se pudo suscribir al evento");
        socket.emit("socket-error", "No se pudieron cargar las estadísticas del evento.");
      }
    });
    socket.on("disconnect", () => logger.info({ id: socket.id }, "cliente desconectado"));
  });
  return io;
}

// Se llama tras validar un QR: empuja el nuevo contador solo a la sala de ese evento.
export function emitirCheckin(eventoId, entrada, stats) {
  if (!ioRef) return;
  ioRef.to(`evento:${eventoId}`).emit("checkin", { entrada, stats });
  ioRef.to(`evento:${eventoId}`).emit("checkin-stats", stats);
  emitirActualizacionMetricas(eventoId);
}

export async function emitirVenta(eventoId) {
  return emitirActualizacionMetricas(eventoId);
}

async function emitirActualizacionMetricas(eventoId) {
  if (!ioRef) return;
  try {
    const evento = await getEvento(eventoId);
    if (evento?.organizador_id) ioRef.to(`organizador:${evento.organizador_id}`).emit("metricas-actualizadas");
  } catch (err) {
    logger.error({ err, eventoId }, "no se pudo notificar la actualización del dashboard");
  }
}
