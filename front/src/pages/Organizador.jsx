// Organizador.jsx — Panel del organizador (ruta protegida por rol):
//   • Dashboard de KPIs (ingresos, vendidas, validadas, asistencia, ocupación…)
//   • Desglose por evento + ventas recientes
//   • Check-in EN TIEMPO REAL (Socket.io)
//   • Asistente de IA (descripción + email)
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useCheckin } from "../hooks/useCheckin.js";
import LectorQr from "../components/LectorQr.jsx";

const eur = (n) => (n ?? 0).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

export default function Organizador() {
  const [m, setM] = useState(null);
  const [eventos, setEventos] = useState([]);
  const [eventoId, setEventoId] = useState("");
  const evento = eventos.find((e) => e.id === eventoId);
  const { stats, ultimo, actualizacion, error: errorSocket } = useCheckin(eventoId);

  const [codigo, setCodigo] = useState("");
  const [resultado, setResultado] = useState(null);
  const [ia, setIa] = useState("");
  const [iaCargando, setIaCargando] = useState(false);
  const [error, setError] = useState("");
  const [formulario, setFormulario] = useState({
    nombre: "", categoria: "", tipo: "", provincia: "", fecha: "", hora: "",
    lugar: "", precio: "0", aforo: "100", descripcion: "", imagen: "",
  });
  const [publicando, setPublicando] = useState(false);

  const cargarMetricas = () => api.metricas().then(setM).catch((err) => setError(err.message));
  useEffect(() => {
    cargarMetricas();
    api.misEventos().then((evs) => { setEventos(evs); setEventoId(evs[0]?.id || ""); })
      .catch((err) => setError(err.message));
  }, []);
  useEffect(() => { if (actualizacion) cargarMetricas(); }, [actualizacion]);

  async function validar(codigoAValidar = codigo) {
    try {
      const r = await api.checkin(codigoAValidar);
      setResultado(r); setCodigo(""); cargarMetricas();
    } catch (err) { setResultado({ ok: false, motivo: "error", error: err.message }); }
  }
  async function generar(tipo) {
    if (!evento) return;
    setIaCargando(true); setIa("");
    try {
      const fn = tipo === "desc" ? api.iaDescripcion : api.iaEmail;
      const r = await fn({ eventoId: evento.id, nombre: evento.nombre, categoria: evento.categoria, lugar: evento.lugar, fecha: evento.fecha });
      setIa(r.texto);
    } catch (err) { setIa(`No se pudo generar el texto: ${err.message}`); }
    finally { setIaCargando(false); }
  }
  async function publicar(e) {
    e.preventDefault();
    setError("");
    setPublicando(true);
    try {
      const creado = await api.crearEvento(formulario);
      setEventos((actuales) => [...actuales, creado].sort((a, b) => a.fecha.localeCompare(b.fecha)));
      setEventoId(creado.id);
      setFormulario({
        nombre: "", categoria: "", tipo: "", provincia: "", fecha: "", hora: "",
        lugar: "", precio: "0", aforo: "100", descripcion: "", imagen: "",
      });
      cargarMetricas();
    } catch (err) { setError(err.message); }
    finally { setPublicando(false); }
  }

  return (
    <div>
      <h1>Panel del organizador</h1>
      {error && <p className="err" role="alert">{error}</p>}

      <form className="card evento-form" onSubmit={publicar}>
        <h3>Publicar un evento</h3>
        <div className="evento-form-grid">
          <label>Nombre<input required maxLength="120" value={formulario.nombre} onChange={(e) => setFormulario({ ...formulario, nombre: e.target.value })} /></label>
          <label>Categoría<input required maxLength="60" value={formulario.categoria} onChange={(e) => setFormulario({ ...formulario, categoria: e.target.value })} /></label>
          <label>Tipo<input value={formulario.tipo} onChange={(e) => setFormulario({ ...formulario, tipo: e.target.value })} /></label>
          <label>Provincia<input value={formulario.provincia} onChange={(e) => setFormulario({ ...formulario, provincia: e.target.value })} /></label>
          <label>Fecha<input type="date" required value={formulario.fecha} onChange={(e) => setFormulario({ ...formulario, fecha: e.target.value })} /></label>
          <label>Hora<input type="time" value={formulario.hora} onChange={(e) => setFormulario({ ...formulario, hora: e.target.value })} /></label>
          <label>Lugar<input required value={formulario.lugar} onChange={(e) => setFormulario({ ...formulario, lugar: e.target.value })} /></label>
          <label>Precio (€)<input type="number" min="0" max="100000" step="0.01" required value={formulario.precio} onChange={(e) => setFormulario({ ...formulario, precio: e.target.value })} /></label>
          <label>Aforo<input type="number" min="1" max="1000000" step="1" required value={formulario.aforo} onChange={(e) => setFormulario({ ...formulario, aforo: e.target.value })} /></label>
          <label className="evento-form-wide">Imagen (URL)<input type="url" value={formulario.imagen} onChange={(e) => setFormulario({ ...formulario, imagen: e.target.value })} /></label>
          <label className="evento-form-wide">Descripción<textarea maxLength="5000" value={formulario.descripcion} onChange={(e) => setFormulario({ ...formulario, descripcion: e.target.value })} /></label>
        </div>
        <button disabled={publicando}>{publicando ? "Publicando…" : "Publicar evento"}</button>
      </form>

      {/* DASHBOARD DE KPIs */}
      <div className="kpis">
        <Kpi label="Ingresos totales" valor={eur(m?.ingresosTotales)} acento />
        <Kpi label="Entradas vendidas" valor={m?.entradasVendidas ?? 0} />
        <Kpi label="Validadas (check-in)" valor={m?.entradasValidadas ?? 0} />
        <Kpi label="Tasa de asistencia" valor={(m?.tasaAsistencia ?? 0) + "%"} />
        <Kpi label="Ticket medio" valor={eur(m?.ticketMedio)} />
        <Kpi label="Ocupación media" valor={(m?.ocupacionMedia ?? 0) + "%"} />
        <Kpi label="Eventos activos" valor={m?.totalEventos ?? 0} />
      </div>

      <div className="org-grid">
        {/* Desglose por evento */}
        <div className="card ancho">
          <h3>Ventas por evento</h3>
          <table className="tabla">
            <thead><tr><th>Evento</th><th>Vendidas</th><th>Validadas</th><th>Aforo</th><th>Ingresos</th></tr></thead>
            <tbody>
              {(m?.porEvento || []).map((e) => (
                <tr key={e.id}>
                  <td>{e.nombre}</td>
                  <td>{e.vendidas}</td>
                  <td>{e.validadas}</td>
                  <td>{e.aforo}</td>
                  <td>{eur(e.ingresos)}</td>
                </tr>
              ))}
              {!(m?.porEvento || []).length && <tr><td colSpan="5" className="meta">Publica tu primer evento para empezar a vender.</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Ventas recientes */}
        <div className="card">
          <h3>Ventas recientes</h3>
          {(m?.recientes || []).length === 0 && <p className="meta">Aún no hay ventas.</p>}
          <ul className="recientes">
            {(m?.recientes || []).map((r) => (
              <li key={r.codigo}>
                <span>{r.evento}</span>
                <small>{r.titular_nombre || r.comprador_email} · {eur(r.precio)}</small>
              </li>
            ))}
          </ul>
        </div>

        {/* Check-in en tiempo real */}
        <div className="card">
          <h3>Check-in en tiempo real</h3>
          <select value={eventoId} onChange={(e) => setEventoId(e.target.value)} className="full">
            {eventos.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
          <div className="contador">
            <div><span className="big">{stats?.validadas ?? 0}</span><small>validadas</small></div>
            <div><span className="big">{stats?.vendidas ?? 0}</span><small>vendidas</small></div>
            <div><span className="big">{stats?.restantes ?? 0}</span><small>por entrar</small></div>
          </div>
          {errorSocket && <p className="err" role="status">{errorSocket}</p>}
          {ultimo && <p className="ok">✅ Última: {ultimo.codigo}</p>}
          <LectorQr onCodigo={(valor) => { setCodigo(valor); validar(valor); }} />
          <div className="filtros">
            <input aria-label="Código de entrada" placeholder="Código QR (ENT-...)" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            <button onClick={validar} disabled={!codigo.trim()}>Validar</button>
          </div>
          {resultado && (
            <p className={resultado.ok ? "ok" : "err"}>
              {resultado.ok ? "✅ Acceso permitido" : resultado.motivo === "ya-validada" ? "⚠️ Entrada ya utilizada" : resultado.motivo === "error" ? resultado.error : "❌ Código no válido"}
            </p>
          )}
        </div>

        {/* Asistente de IA */}
        <div className="card">
          <h3>Asistente de IA</h3>
          <p className="meta">Genera textos a partir de los datos del evento seleccionado arriba.</p>
          <div className="filtros">
            <button onClick={() => generar("desc")}>Descripción del evento</button>
            <button onClick={() => generar("email")}>Email a asistentes</button>
          </div>
          <textarea className="ia-out" value={iaCargando ? "Generando…" : ia} readOnly placeholder="El texto generado aparecerá aquí…" />
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, valor, acento }) {
  return (
    <div className={"kpi" + (acento ? " kpi-acento" : "")}>
      <span className="kpi-valor">{valor}</span>
      <span className="kpi-label">{label}</span>
    </div>
  );
}
