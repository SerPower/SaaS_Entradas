// useCheckin.js — Tiempo real del check-in. Se une a la sala del evento y
// recibe el contador X/Y de asistencia actualizado en vivo.
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { BASE, getToken } from "../api.js";

export function useCheckin(eventoId) {
  const [stats, setStats] = useState(null);
  const [ultimo, setUltimo] = useState(null);
  const [actualizacion, setActualizacion] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!eventoId) return;
    const socket = io(BASE, { auth: { token: getToken() } });
    socket.on("connect", () => { setError(""); socket.emit("ver-evento", eventoId); });
    socket.on("checkin-stats", setStats);
    socket.on("checkin", ({ entrada }) => setUltimo(entrada));
    socket.on("metricas-actualizadas", () => setActualizacion((n) => n + 1));
    socket.on("socket-error", setError);
    socket.on("connect_error", (err) => setError(err.message));
    return () => socket.close();
  }, [eventoId]);
  return { stats, ultimo, actualizacion, error };
}
