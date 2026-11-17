// Catalogo.jsx — Asistente: catálogo de eventos con BUSCADOR MULTIFILTRO
// (nombre, categoría, tipo, provincia, precio, fecha). El catálogo es público.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { fmtEur, fmtFecha } from "../fmt.js";

export default function Catalogo() {
  const [eventos, setEventos] = useState([]);
  const [categorias, setCategorias] = useState(["Todas"]);
  const [provincias, setProvincias] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [f, setF] = useState({ texto: "", categoria: "Todas", provincia: "", tipo: "", precioMax: "", fecha: "" });

  useEffect(() => {
    api.categorias().then(setCategorias);
    api.provincias().then(setProvincias);
    api.tipos().then(setTipos);
  }, []);

  // Búsqueda reactiva con pequeño debounce para el texto.
  useEffect(() => {
    const t = setTimeout(() => api.eventos(f).then(setEventos), 250);
    return () => clearTimeout(t);
  }, [f]);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const limpiar = () => setF({ texto: "", categoria: "Todas", provincia: "", tipo: "", precioMax: "", fecha: "" });

  return (
    <div>
      <div className="hero-cat">
        <h1>Encuentra tu próximo evento</h1>
        <p className="sub">Conciertos, deporte, teatro, tecnología y mucho más.</p>
        <input className="buscador" type="search" placeholder="🔎 Busca por nombre…" value={f.texto} onChange={set("texto")} />
      </div>

      <div className="filtros">
        <select value={f.categoria} onChange={set("categoria")}>
          {categorias.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={f.provincia} onChange={set("provincia")}>
          <option value="">Toda España</option>
          {provincias.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={f.tipo} onChange={set("tipo")}>
          <option value="">Cualquier tipo</option>
          {tipos.map((t) => <option key={t}>{t}</option>)}
        </select>
        <input type="number" min="0" placeholder="€ máx." value={f.precioMax} onChange={set("precioMax")} className="precio-in" />
        <input type="date" value={f.fecha} onChange={set("fecha")} />
        <button className="link" onClick={limpiar}>Limpiar</button>
      </div>

      <p className="conteo">{eventos.length} evento{eventos.length !== 1 ? "s" : ""}</p>
      <div className="cards">
        {eventos.map((e) => (
          <Link to={`/evento/${e.id}`} key={e.id} className="evento-card">
            {e.imagen
              ? <img src={e.imagen} alt={e.nombre} />
              : <div className="evento-img-placeholder" aria-hidden="true">🎟️</div>}
            <div className="evento-body">
              <span className="badge">{e.categoria}</span>
              <h3>{e.nombre}</h3>
              <p className="meta">{fmtFecha(e.fecha)} · {e.lugar}</p>
              <div className="evento-foot">
                <strong>{fmtEur(e.precio)}</strong>
                <span className={e.disponibles > 0 ? "disp" : "agotado"}>
                  {e.disponibles > 0 ? `${e.disponibles} disponibles` : "Agotado"}
                </span>
              </div>
            </div>
          </Link>
        ))}
        {eventos.length === 0 && <p className="vacio">No hay eventos con esos filtros.</p>}
      </div>
    </div>
  );
}
