// RutaProtegida.jsx — Envuelve rutas que necesitan sesión o rol concreto.
//   <RutaProtegida> ...            → requiere estar logueado
//   <RutaProtegida rol="organizador"> ... → requiere ser organizador
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

export default function RutaProtegida({ children, rol }) {
  const { usuario, cargando } = useAuth();
  const loc = useLocation();

  if (cargando) return <p className="vacio">Cargando…</p>;
  if (!usuario) return <Navigate to="/login" state={{ desde: loc.pathname }} replace />;
  if (rol && usuario.rol !== rol) return <Navigate to="/" replace />;
  return children;
}
