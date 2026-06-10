// Generación de imágenes para MMR · Gestión (con cuentas y límite de uso)
// Esconde la clave de OpenAI y exige que el usuario haya iniciado sesión.
import { sql, ensureTables, getUsuarioFromRequest, setCors } from "./_lib/db.js";

// Límite de seguridad anti-abuso: máximo de imágenes por hora y por usuario.
const LIMITE_POR_HORA = 10;

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  // Capa 1: el token compartido de la app (evita uso desde fuera de la app).
  const appToken = req.headers["x-app-token"];
  if (!process.env.APP_TOKEN || appToken !== process.env.APP_TOKEN) {
    return res.status(401).json({ error: "No autorizado" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Servidor sin clave configurada" });
  }

  try {
    await ensureTables();

    // Capa 2: el usuario debe haber iniciado sesión (token de sesión válido).
    const usuario = await getUsuarioFromRequest(req);
    if (!usuario) {
      return res.status(401).json({ error: "Debes iniciar sesión para generar imágenes." });
    }

    // Límite anti-abuso: contar las imágenes de la última hora de ESTE usuario.
    const cuenta = await sql`
      SELECT count(*)::int AS n FROM uso
      WHERE usuario_id = ${usuario.id} AND momento > now() - interval '1 hour'
    `;
    const usadasUltimaHora = cuenta[0]?.n || 0;
    if (usadasUltimaHora >= LIMITE_POR_HORA) {
      return res.status(429).json({
        error: "Has alcanzado el límite de " + LIMITE_POR_HORA + " imágenes por hora. Inténtalo más tarde.",
      });
    }

    const { prompt, photo, quality } = req.body || {};
    if (!prompt) {
      return res.status(400).json({ error: "Falta el texto de la simulación" });
    }
    const q = quality || "medium";

    let openaiRes;
    if (photo) {
      const blob = dataURLtoBlob(photo);
      const form = new FormData();
      form.append("model", "gpt-image-2");
      form.append("prompt", prompt);
      form.append("n", "1");
      form.append("size", "1024x1024");
      form.append("quality", q);
      form.append("image", blob, "foto.jpg");
      openaiRes = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: { Authorization: "Bearer " + apiKey },
        body: form,
      });
    } else {
      openaiRes = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-image-2",
          prompt: prompt,
          n: 1,
          size: "1024x1024",
          quality: q,
        }),
      });
    }

    if (!openaiRes.ok) {
      let msg = "Error " + openaiRes.status;
      try {
        const j = await openaiRes.json();
        msg = (j.error && j.error.message) || msg;
      } catch (e) {}
      return res.status(openaiRes.status).json({ error: msg });
    }

    const data = await openaiRes.json();
    const b64 = data.data && data.data[0] && data.data[0].b64_json;
    let imagen = null;
    if (b64) imagen = "data:image/png;base64," + b64;
    else if (data.data && data.data[0] && data.data[0].url) imagen = data.data[0].url;

    if (!imagen) {
      return res.status(500).json({ error: "Respuesta inesperada de OpenAI" });
    }

    // Registrar el uso (solo si la imagen salió bien, para no penalizar errores)
    await sql`INSERT INTO uso (usuario_id, tipo) VALUES (${usuario.id}, ${photo ? "simulacion" : "generacion"})`;

    return res.status(200).json({
      image: imagen,
      restantesHora: Math.max(0, LIMITE_POR_HORA - usadasUltimaHora - 1),
    });
  } catch (e) {
    return res.status(500).json({ error: "Error del servidor: " + (e.message || "desconocido") });
  }
}

function dataURLtoBlob(dataURL) {
  const parts = dataURL.split(",");
  const meta = parts[0];
  const b64 = parts[1];
  const contentType = (meta.match(/data:(.*?);/) || [])[1] || "image/jpeg";
  const byteChars = atob(b64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: contentType });
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};
