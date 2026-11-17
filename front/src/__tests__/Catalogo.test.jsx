// Catalogo.test.jsx — Test de render con Vitest + Testing Library (mock de fetch).
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Catalogo from "../pages/Catalogo.jsx";

beforeEach(() => {
  global.fetch = vi.fn((url) => {
    const u = String(url);
    const cuerpo =
      u.includes("categorias") ? ["Todas", "Concierto"] :
      u.includes("provincias") ? ["Madrid"] :
      u.includes("tipos") ? ["Música"] :
      [{ id: "evt-1", nombre: "Los Planetas", categoria: "Concierto", fecha: "2026-07-12",
         lugar: "Madrid", precio: 39, disponibles: 10, imagen: "x" }];
    return Promise.resolve({ ok: true, json: () => Promise.resolve(cuerpo) });
  });
});

test("el catálogo muestra los eventos que llegan del backend", async () => {
  render(<MemoryRouter><Catalogo /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText("Los Planetas")).toBeDefined());
});
