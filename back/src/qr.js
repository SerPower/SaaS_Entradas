// qr.js — Genera el QR único de la entrada como imagen (data URL) para email y web.
import QRCode from "qrcode";

export async function generarQr(texto) {
  return QRCode.toDataURL(texto, { width: 320, margin: 1, color: { dark: "#0e0e16", light: "#ffffff" } });
}
