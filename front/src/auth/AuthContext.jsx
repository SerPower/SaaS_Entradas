// AuthContext.jsx — Estado de sesión global (usuario + token) para toda la app.
import { createContext, useContext, useEffect, useState } from "react";
import { api, setToken, getToken } from "../api.js";

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Al arrancar, si hay token guardado, recuperamos el usuario.
  useEffect(() => {
    if (!getToken()) { setCargando(false); return; }
    api.me().then((r) => setUsuario(r.user)).catch(() => setToken(null)).finally(() => setCargando(false));
  }, []);

  async function login(email, password) {
    const r = await api.login({ email, password });
    setToken(r.token); setUsuario(r.user); return r.user;
  }
  async function registrar(datos) {
    const r = await api.register(datos);
    setToken(r.token); setUsuario(r.user); return r.user;
  }
  function logout() { setToken(null); setUsuario(null); }

  return (
    <Ctx.Provider value={{ usuario, cargando, login, registrar, logout }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
