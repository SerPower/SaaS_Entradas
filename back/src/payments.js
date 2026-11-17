// payments.js — Integración con Stripe. Carga Stripe de forma opcional.
// Sin STRIPE_SECRET_KEY, el frontend usa la "compra simulada" para desarrollo o demo local.
import { config } from "./config.js";

let stripe = null;
export async function getStripe() {
  if (stripe) return stripe;
  if (!config.stripeSecret) return null;
  const Stripe = (await import("stripe")).default;
  stripe = new Stripe(config.stripeSecret);
  return stripe;
}

// Paso 3: crear la sesión de pago (Stripe Checkout hospedado). Soporta CANTIDAD.
// Los datos del titular viajan en metadata para reconstruir las entradas en el webhook.
export async function crearCheckout({ evento, compradorEmail, cantidad, titularNombre, titularEmail }) {
  const s = await getStripe();
  if (!s) return null; // sin Stripe -> el caller usará compra simulada
  return s.checkout.sessions.create({
    mode: "payment",
    customer_email: compradorEmail,
    line_items: [{
      quantity: cantidad,
      price_data: {
        currency: "eur",
        unit_amount: Math.round(evento.precio * 100),
        product_data: { name: `Entrada · ${evento.nombre}` },
      },
    }],
    metadata: {
      eventoId: evento.id,
      compradorEmail,
      cantidad: String(cantidad),
      titularNombre: titularNombre || "",
      titularEmail: titularEmail || compradorEmail,
    },
    success_url: `${config.frontUrl}/mis-entradas?email=${encodeURIComponent(compradorEmail)}`,
    cancel_url: `${config.frontUrl}/evento/${evento.id}`,
  });
}

// Paso 4: verificar la firma del webhook (seguridad: que viene de Stripe de verdad).
export async function construirEvento(rawBody, signature) {
  const s = await getStripe();
  if (!s || !config.stripeWebhookSecret) throw new Error("Stripe/webhook no configurado");
  return s.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret);
}
