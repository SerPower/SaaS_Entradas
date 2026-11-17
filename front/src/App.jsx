import { BrowserRouter, Routes, Route, NavLink, Link, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext.jsx";
import RutaProtegida from "./auth/RutaProtegida.jsx";
import Catalogo from "./pages/Catalogo.jsx";
import Evento from "./pages/Evento.jsx";
import MisEntradas from "./pages/MisEntradas.jsx";
import Organizador from "./pages/Organizador.jsx";
import Login from "./pages/Login.jsx";

function Header() {
  const { usuario, logout } = useAuth();
  const nav = useNavigate();
  return (
    <header className="nav">
      <Link to="/" className="brand"><span className="logo">🎟️</span><strong>SaaS Entradas</strong></Link>
      <nav>
        <NavLink to="/">Catálogo</NavLink>
        <NavLink to="/mis-entradas">Mis entradas</NavLink>
        {usuario?.rol === "organizador" && <NavLink to="/organizador">Organizador</NavLink>}
        {usuario
          ? (
            <span className="sesion">
              <span className="hola">Hola, {usuario.nombre.split(" ")[0]}</span>
              <button className="link" onClick={() => { logout(); nav("/"); }}>Salir</button>
            </span>
          )
          : <NavLink to="/login" className="cta">Entrar</NavLink>}
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Header />
        <main className="app">
          <Routes>
            <Route path="/" element={<Catalogo />} />
            <Route path="/evento/:id" element={<Evento />} />
            <Route path="/login" element={<Login />} />
            <Route path="/mis-entradas" element={<RutaProtegida><MisEntradas /></RutaProtegida>} />
            <Route path="/organizador" element={<RutaProtegida rol="organizador"><Organizador /></RutaProtegida>} />
          </Routes>
        </main>
      </BrowserRouter>
    </AuthProvider>
  );
}
