// Login.jsx — Pantalla de entrar / registrarse. Lógica sencilla, look cuidado.
import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";

export default function Login() {
  const { login, registrar } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const destino = loc.state?.desde || "/";

  const [modo, setModo] = useState("login"); // 'login' | 'registro'
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState("usuario");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError(""); setCargando(true);
    try {
      if (modo === "login") await login(email, password);
      else await registrar({ nombre, email, password, rol });
      nav(destino, { replace: true });
    } catch (err) { setError(err.message); }
    finally { setCargando(false); }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-tabs">
          <button className={modo === "login" ? "on" : ""} onClick={() => setModo("login")}>Iniciar sesión</button>
          <button className={modo === "registro" ? "on" : ""} onClick={() => setModo("registro")}>Crear cuenta</button>
        </div>

        <form onSubmit={enviar} className="auth-form">
          {modo === "registro" && (
            <label>Nombre
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre" required />
            </label>
          )}
          <label>Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" required />
          </label>
          <label>Contraseña
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required />
          </label>

          {modo === "registro" && (
            <div className="rol-pick">
              <span>Quiero entrar como:</span>
              <div className="rol-opts">
                <button type="button" className={rol === "usuario" ? "on" : ""} onClick={() => setRol("usuario")}>
                  🎫 Comprar entradas
                </button>
                <button type="button" className={rol === "organizador" ? "on" : ""} onClick={() => setRol("organizador")}>
                  📊 Organizar eventos
                </button>
              </div>
            </div>
          )}

          {error && <p className="err">{error}</p>}
          <button className="btn-grande" disabled={cargando}>
            {cargando ? "Un momento…" : modo === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>

        <p className="auth-pie">
          {modo === "login"
            ? <>¿No tienes cuenta? <Link onClick={() => setModo("registro")} to="#">Regístrate</Link></>
            : <>¿Ya tienes cuenta? <Link onClick={() => setModo("login")} to="#">Inicia sesión</Link></>}
        </p>
      </div>
    </div>
  );
}
