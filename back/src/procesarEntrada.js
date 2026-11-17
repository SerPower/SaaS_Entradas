// procesarEntrada.js — La lógica que ejecuta el worker (paso 7): generar QR + enviar email.
// Está aparte para poder usarla tanto desde el worker (con Redis) como en el fallback local.
import { getEntrada, getEvento, setQr } from "./store.js";
import { generarQr } from "./qr.js";
import { enviarEmail, emailEntradaHtml } from "./email.js";
import { logger } from "./logger.js";

export async function procesarEntrada(entradaId) {
  const entrada = await getEntrada(entradaId);
  if (!entrada) throw new Error("Entrada no encontrada: " + entradaId);
  const evento = await getEvento(entrada.evento_id);

  // 1) Lo ESENCIAL: el QR. Si esto falla, sí queremos que el job falle y se reintente.
  const qrDataUrl = await generarQr(entrada.codigo);   // QR único
  await setQr(entradaId, qrDataUrl);

  // 2) Si el proveedor de email falla, el worker reintenta el job; el QR ya queda disponible
  //    en "Mis entradas" mientras se recupera el servicio.
  try {
    const qrBase64 = qrDataUrl.split(",")[1];
    if (!qrBase64) throw new Error("No se pudo preparar la imagen QR para el email.");
    await enviarEmail({
      to: entrada.titular_email || entrada.comprador_email,
      subject: `Tu entrada para ${evento.nombre}`,
      html: emailEntradaHtml({ evento, entrada, qrDataUrl }),
      attachments: [{
        filename: `entrada-${entrada.codigo}.png`,
        content: qrBase64,
      }],
    });
  } catch (err) {
    logger.warn({ entradaId, err: err.message }, "✉️ No se pudo enviar el email; se reintentará");
    throw err;
  }

  logger.info({ entradaId, email: entrada.titular_email || entrada.comprador_email }, "🎟️ Entrada procesada (QR listo)");
  return { ok: true };
}
