// Inicio de sesión (login) para MMR · Gestión
import { sql, ensureTables, verifyPassword, newSessionToken, setCors } from "./_lib/db.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  try {
    await ensureTables();
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Faltan el email o la contraseña." });
    }
    const emailLimpio = String(email).trim().toLowerCase();

    const filas = await sql`
      SELECT id, email, nombre, plan, password_hash
      FROM usuarios WHERE email = ${emailLimpio} LIMIT 1
    `;
    const usuario = filas[0];

    if (!usuario || !verifyPassword(String(password), usuario.password_hash)) {
      return res.status(401).json({ error: "Email o contraseña incorrectos." });
    }

    const token = newSessionToken();
    await sql`
      INSERT INTO sesiones (token, usuario_id, expira)
      VALUES (${token}, ${usuario.id}, now() + interval '30 days')
    `;

    return res.status(200).json({
      token,
      usuario: { email: usuario.email, nombre: usuario.nombre, plan: usuario.plan },
    });
  } catch (e) {
    return res.status(500).json({ error: "Error del servidor: " + (e.message || "desconocido") });
  }
}
