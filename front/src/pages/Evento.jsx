// Evento.jsx — Detalle del evento + compra: cantidad, datos del asistente y pago.
// Mirar el evento es público; COMPRAR requiere sesión (si no, manda a /login).
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { fmtEur, fmtFecha } from "../fmt.js";

export default function Evento() {
  const { id } = useParams();
  const nav = useNavigate();
  const { usuario } = useAuth();

  const [e, setE] = useState(null);
  const [cantidad, setCantidad] = useState(1);
  const [paraOtro, setParaOtro] = useState(false);
  const [titularNombre, setTitularNombre] = useState("");
  const [titularEmail, setTitularEmail] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { api.evento(id).then(setE); }, [id]);
  if (!e) return <p className="vacio">Cargando…</p>;

  const total = e.precio * cantidad;

  async function comprar() {
    setError("");
    if (!usuario) return nav("/login", { state: { desde: `/evento/${id}` } });
    if (paraOtro && (!titularNombre || !titularEmail)) return setError("Rellena el nombre y el email de la persona que asiste.");
    setCargando(true);
    const datos = {
      eventoId: e.id,
      cantidad,
      titularNombre: paraOtro ? titularNombre : usuario.nombre,
      titularEmail: paraOtro ? titularEmail : usuario.email,
    };
    try {
      const r = await api.checkout(datos);
      if (r.url) { window.location.href = r.url; return; }   // Stripe Checkout hospedado
      await api.comprarSimulado(datos);                       // demo sin Stripe
      nav("/mis-entradas");
    } catch (err) { setError(err.message); setCargando(false); }
  }

  return (
    <div className="detalle">
      {e.imagen
        ? <img src={e.imagen} alt={e.nombre} className="hero" />
        : <div className="hero hero-placeholder" role="img" aria-label={e.nombre}>🎟️</div>}
      <span className="badge">{e.categoria}</span>
      <h1>{e.nombre}</h1>
      <p className="meta">{fmtFecha(e.fecha)} · {e.hora} · {e.lugar} · {e.provincia}</p>
      <p className="descripcion">{e.descripcion}</p>

      <div className="compra">
        <div className="compra-cab">
          <span className="precio">{fmtEur(e.precio)}</span>
          <span className={e.disponibles > 0 ? "disp" : "agotado"}>{e.disponibles} disponibles</span>
        </div>

        {!usuario && <p className="aviso">🔒 Inicia sesión para comprar. Puedes ver el evento, pero la compra necesita cuenta.</p>}

        <label className="campo">Número de entradas
          <input type="number" min="1" max={Math.min(10, e.disponibles)} value={cantidad}
            onChange={(ev) => setCantidad(Math.max(1, Math.min(10, Number(ev.target.value) || 1)))} />
        </label>

        <label className="check">
          <input type="checkbox" checked={paraOtro} onChange={(ev) => setParaOtro(ev.target.checked)} />
          La entrada es para otra persona (no para mí)
        </label>
        {paraOtro && (
          <div className="titular">
            <input placeholder="Nombre del asistente" value={titularNombre} onChange={(ev) => setTitularNombre(ev.target.value)} />
            <input type="email" placeholder="Email del asistente" value={titularEmail} onChange={(ev) => setTitularEmail(ev.target.value)} />
          </div>
        )}

        {error && <p className="err">{error}</p>}
        <div className="compra-total">
          <span>Total: <strong>{fmtEur(total)}</strong></span>
          <button disabled={e.disponibles <= 0 || cargando} onClick={comprar}>
            {cargando ? "Procesando…" : usuario ? `Comprar ${cantidad} entrada${cantidad > 1 ? "s" : ""}` : "Iniciar sesión para comprar"}
          </button>
        </div>
      </div>
    </div>
  );
}
