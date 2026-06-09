export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-App-Token");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Metodo no permitido" });
  }
  const appToken = req.headers["x-app-token"];
  if (!process.env.APP_TOKEN || appToken !== process.env.APP_TOKEN) {
    return res.status(401).json({ error: "No autorizado" });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Servidor sin clave configurada" });
  }
  try {
    const { prompt, photo, quality } = req.body || {};
    if (!prompt) {
      return res.status(400).json({ error: "Falta el texto de la simulacion" });
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
    if (b64) {
      return res.status(200).json({ image: "data:image/png;base64," + b64 });
    }
    if (data.data && data.data[0] && data.data[0].url) {
      return res.status(200).json({ image: data.data[0].url });
    }
    return res.status(500).json({ error: "Respuesta inesperada de OpenAI" });
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
