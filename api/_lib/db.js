// Utilidades compartidas del proxy MMR · Gestión
// Conexión a la base de datos (Neon), cifrado de contraseñas y sesiones.

import { neon } from "@neondatabase/serverless";
import crypto from "crypto";

// Conexión a la base de datos usando la variable que Vercel creó automáticamente.
export const sql = neon(process.env.DATABASE_URL);

// --- Crear las tablas la primera vez (se llama al inicio de cada endpoint) ---
let initialized = false;
export async function ensureTables() {
  if (initialized) return;
  await sql`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nombre TEXT,
      plan TEXT NOT NULL DEFAULT 'gratis',
      creado TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sesiones (
      token TEXT PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      creada TIMESTAMPTZ NOT NULL DEFAULT now(),
      expira TIMESTAMPTZ NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS uso (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      tipo TEXT NOT NULL,
      momento TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  initialized = true;
}

// --- Cifrado de contraseñas con scrypt (nativo de Node, sin librerías externas) ---
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return salt + ":" + hash;
}

export function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(":");
    const test = crypto.scryptSync(password, salt, 64).toString("hex");
    const a = Buffer.from(test, "hex");
    const b = Buffer.from(hash, "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (e) {
    return false;
  }
}

// --- Sesiones (el "carné" digital que la app guarda tras hacer login) ---
export function newSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

export async function getUsuarioFromRequest(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const filas = await sql`
    SELECT u.id, u.email, u.nombre, u.plan
    FROM sesiones s
    JOIN usuarios u ON u.id = s.usuario_id
    WHERE s.token = ${token} AND s.expira > now()
    LIMIT 1
  `;
  return filas[0] || null;
}

// --- Cabeceras CORS comunes (permitir que la app en github.io llame al proxy) ---
export function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-App-Token");
}
