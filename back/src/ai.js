// ai.js — Integración con IA para el organizador (descripción del evento + email a asistentes).
// Usa Gemini (gratis). Sin GEMINI_API_KEY, devuelve una plantilla de respaldo para la demo.
import { config } from "./config.js";
import { logger } from "./logger.js";

// gemini-flash-latest: alias estable que apunta siempre al Gemini Flash vigente.
const MODEL = "gemini-flash-latest";

async function pedirAGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${config.geminiApiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error("Gemini error: " + (await res.text()));
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

export async function generarDescripcion({ nombre, categoria, lugar, fecha }) {
  const prompt = `Eres copy de marketing de eventos. Escribe una descripción atractiva
(2-3 frases, español de España, tono cercano) para este evento:
Nombre: ${nombre}. Categoría: ${categoria}. Lugar: ${lugar}.${fecha ? ` Fecha: ${fecha}.` : ""}
Devuelve solo la descripción, sin comillas.`;
  if (!config.geminiApiKey) {
    logger.warn("IA en modo respaldo (sin GEMINI_API_KEY).");
    const cuando = fecha ? ` Te esperamos el ${fecha} para vivirlo juntos.` : " ¡Te esperamos!";
    return `No te pierdas ${nombre}, una cita imprescindible de ${categoria.toLowerCase()} en ${lugar}.${cuando}`;
  }
  return pedirAGemini(prompt);
}

export async function generarEmailAsistentes({ nombre, fecha, lugar }) {
  const prompt = `Redacta un email breve (español de España, cercano) para avisar a los
asistentes del evento "${nombre}"${fecha ? ` (${fecha}, ${lugar})` : ` (${lugar})`}: recuérdales la fecha, el lugar y
que lleven su QR. Devuelve asunto y cuerpo.`;
  if (!config.geminiApiKey) {
    const cuando = fecha ? `es el ${fecha} en ${lugar}` : `se celebra en ${lugar}`;
    return `Asunto: ¡Nos vemos en ${nombre}!\n\nHola 👋 Te recordamos que ${nombre} ${cuando}. No olvides llevar tu código QR para acceder. ¡Te esperamos!`;
  }
  return pedirAGemini(prompt);
}
