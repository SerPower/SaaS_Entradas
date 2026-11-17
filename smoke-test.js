/**
 * smoke-test.js
 * Comprobaciones rápidas post-despliegue para verificar el estado de salud de la aplicación.
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4100';

async function checkFrontend() {
  console.log(`🔍 Probando Frontend en: ${FRONTEND_URL}...`);
  const res = await fetch(FRONTEND_URL);
  if (!res.ok) {
    throw new Error(`Frontend devolvió un código de estado inválido: ${res.status}`);
  }
  const text = await res.text();
  if (!text.includes('<html') && !text.includes('<!DOCTYPE html>')) {
    throw new Error('El frontend no parece haber cargado una página HTML válida.');
  }
  console.log('✅ Frontend responde correctamente con HTML.');
}

async function checkBackendHealth() {
  const url = `${BACKEND_URL}/health`;
  console.log(`🔍 Probando Backend Health en: ${url}...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Backend Health devolvió un código de estado inválido: ${res.status}`);
  }
  const data = await res.json();
  if (data.status !== 'ok') {
    throw new Error(`El estado del backend no es "ok": ${JSON.stringify(data)}`);
  }
  console.log('✅ Backend Health responde correctamente (status: ok).');
}

async function checkBackendCatalog() {
  const url = `${BACKEND_URL}/api/eventos`;
  console.log(`🔍 Probando API del Catálogo en: ${url}...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`El catálogo de la API devolvió un código de estado inválido: ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error('El catálogo de eventos no devolvió un array válido.');
  }
  console.log(`✅ Catálogo de la API responde correctamente con ${data.length} eventos.`);
}

async function run() {
  const isCI = process.env.GITHUB_ACTIONS === 'true';
  const isLocalhost = FRONTEND_URL.includes('localhost') || FRONTEND_URL.includes('127.0.0.1') ||
                      BACKEND_URL.includes('localhost') || BACKEND_URL.includes('127.0.0.1');

  if (isCI && isLocalhost) {
    console.error('❌ Configura PROD_FRONTEND_URL y PROD_BACKEND_URL para ejecutar smoke tests reales en CI.');
    process.exitCode = 1;
    return;
  }

  try {
    await checkFrontend();
    await checkBackendHealth();
    await checkBackendCatalog();
    console.log('🎉 ¡Todos los smoke tests han pasado con éxito!');
  } catch (error) {
    console.error('❌ ERROR: Uno de los smoke tests ha fallado:', error.message);
    process.exitCode = 1;
  }
}

run();
