// MisEntradas.jsx — Entradas del usuario logueado: QR (su pase) e historial.
// Ya no pide email: usa la sesión. Ruta protegida (requiere login).
// El QR se genera de forma ASÍNCRONA (cola + worker), así que justo tras comprar puede tardar
// un instante. Mientras alguna entrada no tenga QR, refrescamos sola cada 2s hasta tenerlos.
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { fmtFecha } from "../fmt.js";

export default function MisEntradas() {
  const { usuario } = useAuth();
  const [entradas, setEntradas] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    let timer = null;

    const cargar = async () => {
      const lista = await api.misEntradas();
      if (!activo) return;
      setEntradas(lista);
      setCargando(false);
      // ¿Falta algún QR? Si sí, vuelve a consultar en 2s (el worker lo está generando).
      const faltanQr = lista.some((t) => !t.qr_data_url);
      if (faltanQr) timer = setTimeout(cargar, 2000);
    };

    cargar();
    return () => { activo = false; if (timer) clearTimeout(timer); };
  }, []);

  return (
    <div>
      <h1>Mis entradas</h1>
      <p className="meta">Cuenta: {usuario.email}</p>
      {cargando && <p className="vacio">Cargando…</p>}
      <div className="cards">
        {entradas.map((t) => (
          <div key={t.id} className="entrada-card">
            {t.qr_data_url
              ? <img src={t.qr_data_url} alt="QR" className="qr" />
              : <div className="qr generando">Generando QR…</div>}
            <div>
              <h3>{t.evento?.nombre}</h3>
              <p className="meta">{fmtFecha(t.evento?.fecha)} · {t.evento?.lugar}</p>
              {t.titular_nombre && <p className="meta">A nombre de: {t.titular_nombre}</p>}
              <p className="codigo">{t.codigo}</p>
              <span className={t.validada ? "agotado" : "disp"}>{t.validada ? "Ya validada" : "Válida"}</span>
            </div>
          </div>
        ))}
        {!cargando && entradas.length === 0 && <p className="vacio">Aún no has comprado entradas. ¡Echa un ojo al catálogo!</p>}
      </div>
    </div>
  );
}
