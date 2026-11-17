// api.js — Cliente del backend para interactuar con la API REST de la aplicación.
const apiUrl = import.meta.env.VITE_API_URL;
if (import.meta.env.PROD && !apiUrl) {
  throw new Error("Falta configurar VITE_API_URL con la URL HTTPS del backend.");
}
const BASE = (apiUrl || "http://localhost:4100").replace(/\/$/, "");

// El token JWT vive en memoria + localStorage (para sobrevivir recargas).
let token = typeof localStorage === "undefined" ? null : localStorage.getItem("saas_token") || null;
export function setToken(t) {
  token = t;
  if (typeof localStorage !== "undefined") {
    if (t) localStorage.setItem("saas_token", t);
    else localStorage.removeItem("saas_token");
  }
}
export function getToken() { return token; }

async function req(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

export const api = {
  // Auth
  register: (body) => req("/api/auth/register", { method: "POST", body }),
  login: (body) => req("/api/auth/login", { method: "POST", body }),
  me: () => req("/api/auth/me"),
  // Catálogo + búsqueda
  categorias: () => req("/api/categorias"),
  provincias: () => req("/api/provincias"),
  tipos: () => req("/api/tipos"),
  eventos: (q = {}) => {
    const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== "" && v != null));
    return req(`/api/eventos?${p}`);
  },
  evento: (id) => req(`/api/eventos/${id}`),
  // Compra (requiere sesión)
  misEntradas: () => req("/api/mis-entradas"),
  checkout: (body) => req("/api/checkout", { method: "POST", body }),
  comprarSimulado: (body) => req("/api/comprar-simulado", { method: "POST", body }),
  // Organizador
  misEventos: () => req("/api/organizador/eventos"),
  crearEvento: (body) => req("/api/organizador/eventos", { method: "POST", body }),
  checkin: (codigo) => req("/api/checkin", { method: "POST", body: { codigo } }),
  metricas: () => req("/api/organizador/metricas"),
  iaDescripcion: (body) => req("/api/ia/descripcion", { method: "POST", body }),
  iaEmail: (body) => req("/api/ia/email", { method: "POST", body }),
};
export { BASE };
