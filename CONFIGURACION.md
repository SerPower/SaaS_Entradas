# Guía de Configuración de Servicios

Esta guía explica cómo configurar las claves y servicios externos para el funcionamiento del SaaS de Entradas.

Por defecto, la aplicación arranca en **modo demostración (demo)** con base de datos en memoria, simulando las compras, la generación de códigos QR y enviando las alertas de email a la consola del sistema. Para habilitar el entorno real de base de datos, pagos, envíos de correo e inteligencia artificial, sigue los pasos de configuración detallados a continuación.

Todas las credenciales se configuran mediante variables de entorno en el archivo `back/.env`.

---

## 0. Archivo de Entorno Inicial

Crea tu archivo `.env` a partir de la plantilla:

```bash
cd back
cp .env.example .env
```

Abre el archivo `back/.env` y descomenta o configura las variables según el servicio que desees habilitar.

---

## 1. Base de Datos (PostgreSQL)

Para persistir los datos de usuarios, eventos y compras reales:

1. Asegúrate de tener **Docker Desktop** iniciado y ejecuta el siguiente comando en la raíz del proyecto para levantar los servicios locales (PostgreSQL y Redis):
   ```bash
   docker compose up -d
   ```
2. En `back/.env`, descomenta y configura la variable `DATABASE_URL`:
   ```env
   DATABASE_URL=postgres://saasuser:saaspassword@localhost:5432/saasentradas
   ```
3. Configura una clave secreta segura para firmar las sesiones de usuario (`JWT_SECRET`):
   ```env
   JWT_SECRET=tu-clave-secreta-larga-y-segura
   ```
4. Reinicia el backend (`npm run dev`). Las tablas se crearán automáticamente y se sembrará el catálogo inicial.

---

## 2. Pasarela de Pagos (Stripe)

La aplicación utiliza **Stripe Checkout** para procesar los pagos de forma segura.

1. Regístrate en [Stripe](https://dashboard.stripe.com/register).
2. Asegúrate de que la cuenta está en **Modo de prueba** (Test mode).
3. Obtén la **Secret key** (empieza por `sk_test_...`) en la sección *Developers > API keys*.
4. Configúrala en tu archivo `back/.env`:
   ```env
   STRIPE_SECRET_KEY=sk_test_tu_clave
   ```
5. Para recibir confirmaciones de pago automáticas en tu entorno local (webhooks), instala y autentica la herramienta de consola **Stripe CLI**:
   ```bash
   stripe login
   ```
6. Redirige los webhooks a tu backend local ejecutando:
   ```bash
   stripe listen --forward-to localhost:4100/api/stripe/webhook
   ```
7. Copia el secreto de firma del webhook (`whsec_...`) generado por la consola y añádelo en `back/.env`:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_tu_secreto
   ```

---

## 3. Proveedor de Correo Electrónico (Resend)

Para el envío real de las entradas en formato de correo electrónico con su respectivo código QR.

1. Regístrate en [Resend](https://resend.com).
2. Crea una API Key desde el panel de control.
3. Agrégala a `back/.env`:
   ```env
   RESEND_API_KEY=re_tu_clave_de_resend
   ```

*Nota: Las cuentas gratuitas de Resend permiten enviar correos únicamente a la dirección de correo con la que te has registrado (remitente de pruebas).*

---

## 4. Inteligencia Artificial (Gemini API)

Habilita el asistente del panel del organizador para la redacción de emails automáticos a los asistentes y descripciones dinámicas para nuevos eventos.

1. Consigue una API Key gratuita en [Google AI Studio](https://aistudio.google.com/apikey).
2. Configúrala en `back/.env`:
   ```env
   GEMINI_API_KEY=tu_clave_de_gemini
   ```

---

## 5. Colas de Procesamiento en Segundo Plano (Redis + BullMQ)

Para evitar retrasos al usuario durante la compra, la generación del QR y el envío del email se encolan. Si deseas habilitar este flujo asíncrono real en lugar de procesarlo inmediatamente en el hilo principal:

1. Levanta el contenedor de Redis mediante `docker compose up -d` (puerto `6379`).
2. Configura la URL en `back/.env`:
   ```env
   REDIS_URL=redis://localhost:6379
   ```
3. Ejecuta el servidor del backend y el worker en dos terminales independientes:
   * **Terminal 1 (API Server):**
     ```bash
     cd back
     npm run dev
     ```
   * **Terminal 2 (Worker de colas):**
     ```bash
     cd back
     npm run worker
     ```
