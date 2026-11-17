// auth.js — Registro, login y control de acceso por ROL.
// Sin dependencias externas: hash con scrypt (nativo) y JWT firmado con HMAC (nativo).
// Así el login funciona "out of the box" para grabar, sin instalar bcrypt/jsonwebtoken.
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from "node:crypto";
import { config } from "./config.js";
import { crearUsuario, getUsuarioPorEmail, getUsuarioPorId } from "./store.js";

// --- Contraseñas (scrypt: lento a propósito, sal por usuario) ---
export function hashPassword(plano) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(plano, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
export function verificarPassword(plano, guardado) {
  const [salt, hash] = guardado.split(":");
  const calc = scryptSync(plano, salt, 64);
  const orig = Buffer.from(hash, "hex");
  return calc.length === orig.length && timingSafeEqual(calc, orig);
}

// --- JWT minimalista (header.payload.signature, HMAC-SHA256) ---
const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
export function firmarToken(payload, dias = 7) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ ...payload, exp: Date.now() + dias * 864e5 });
  const firma = createHmac("sha256", config.jwtSecret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${firma}`;
}
export function verificarToken(token) {
  if (!token) return null;
  const [head, body, firma] = token.split(".");
  if (!head || !body || !firma) return null;
  const esperado = createHmac("sha256", config.jwtSecret).update(`${head}.${body}`).digest("base64url");
  if (firma !== esperado) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString());
  if (payload.exp && Date.now() > payload.exp) return null;
  return payload;
}

// --- Casos de uso ---
export async function registrar({ nombre, email, password, rol }) {
  if (!nombre || !email || !password) throw httpErr(400, "Faltan datos (nombre, email, password).");
  if (password.length < 6) throw httpErr(400, "La contraseña debe tener al menos 6 caracteres.");
  rol = rol === "organizador" ? "organizador" : "usuario";
  if (await getUsuarioPorEmail(email)) throw httpErr(409, "Ya existe una cuenta con ese email.");
  let user;
  try { user = await crearUsuario({ nombre, email, password: hashPassword(password), rol }); }
  catch (e) { if (e.code === "DUP") throw httpErr(409, "Ya existe una cuenta con ese email."); throw e; }
  return { user, token: firmarToken({ id: user.id, rol: user.rol, email: user.email }) };
}
export async function login({ email, password }) {
  const u = await getUsuarioPorEmail(email);
  if (!u || !verificarPassword(password, u.password)) throw httpErr(401, "Email o contraseña incorrectos.");
  const user = { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol };
  return { user, token: firmarToken({ id: user.id, rol: user.rol, email: user.email }) };
}

// --- Middlewares ---
export async function adjuntarUsuario(req, _res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const payload = verificarToken(token);
  req.usuario = payload ? await getUsuarioPorId(payload.id) : null;
  next();
}
export function requireAuth(req, res, next) {
  if (!req.usuario) return res.status(401).json({ error: "Inicia sesión para continuar." });
  next();
}
export function requireOrganizador(req, res, next) {
  if (!req.usuario) return res.status(401).json({ error: "Inicia sesión para continuar." });
  if (req.usuario.rol !== "organizador") return res.status(403).json({ error: "Solo organizadores pueden acceder aquí." });
  next();
}

function httpErr(status, msg) { const e = new Error(msg); e.status = status; return e; }
