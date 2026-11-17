// fmt.js — Formateadores compartidos (precio y fecha) para mostrar bonito en el front.

export const fmtEur = (n) =>
  Number(n) === 0 ? "Gratis" : Number(n).toLocaleString("es-ES", { style: "currency", currency: "EUR" });

// Postgres devuelve la fecha como "2026-06-28T22:00:00.000Z"; memoria como "2026-06-28".
// Mostramos siempre algo legible: "28 jun 2026".
export const fmtFecha = (valor) => {
  if (!valor) return "";
  const d = new Date(valor);
  if (isNaN(d)) return String(valor);
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
};
