// Registro de nuevos usuarios para MMR · Gestión
import { sql, ensureTables, hashPassword, newSessionToken, setCors } from "./_lib/db.js";

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  try {
    await ensureTables();
    const { email, password, nombre } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: "Faltan el email o la contraseña." });
    }
    const emailLimpio = String(email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLimpio)) {
      return res.status(400).json({ error: "El email no tiene un formato válido." });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    }

    const existe = await sql`SELECT id FROM usuarios WHERE email = ${emailLimpio} LIMIT 1`;
    if (existe.length > 0) {
      return res.status(409).json({ error: "Ya existe una cuenta con ese email." });
    }

    const passHash = hashPassword(String(password));
    const filas = await sql`
      INSERT INTO usuarios (email, password_hash, nombre, plan)
      VALUES (${emailLimpio}, ${passHash}, ${nombre || null}, 'gratis')
      RETURNING id, email, nombre, plan
    `;
    const usuario = filas[0];

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
