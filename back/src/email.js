// email.js — Envío de emails (la entrada con QR). Resend si hay clave; consola si no.
import { config } from "./config.js";
import { logger } from "./logger.js";

export async function enviarEmail({ to, subject, html, attachments = [] }) {
  if (!config.resendApiKey) {
    logger.info({ to, subject }, "📧 (modo local) Email simulado — revisa la página 'Mis entradas'");
    return { simulado: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "SaaS Entradas <onboarding@resend.dev>",
      to,
      subject,
      html,
      ...(attachments.length ? { attachments } : {}),
    }),
  });
  if (!res.ok) throw new Error("Resend error: " + (await res.text()));
  logger.info({ to, subject }, "📧 Email enviado por Resend");
  return await res.json();
}

export function emailEntradaHtml({ evento, entrada, qrDataUrl }) {
  const titular = entrada.titular_nombre
    ? `<p><b>A nombre de:</b> ${escaparHtml(entrada.titular_nombre)}</p>`
    : "";
  return `
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h1>🎟️ Tu entrada para ${escaparHtml(evento.nombre)}</h1>
      <p><b>Fecha:</b> ${escaparHtml(evento.fecha)} ${escaparHtml(evento.hora || "")}<br/><b>Lugar:</b> ${escaparHtml(evento.lugar || "")}</p>
      ${titular}
      <p>Enseña el código QR adjunto en la puerta:</p>
      <img src="${qrDataUrl}" alt="QR de entrada" width="240" />
      <p style="color:#666">Código: ${escaparHtml(entrada.codigo)}</p>
    </div>`;
}

function escaparHtml(valor) {
  return String(valor).replace(/[&<>"']/g, (caracter) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[caracter]);
}
