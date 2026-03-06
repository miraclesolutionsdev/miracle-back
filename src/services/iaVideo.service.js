import "isomorphic-fetch"

const XAI_API_KEY = process.env.XAI_API_KEY

if (!XAI_API_KEY) {
  console.warn(
    "[iaVideo.service] XAI_API_KEY no está configurada. Las solicitudes de video fallarán.",
  )
}

const GROK_VIDEO_ENDPOINT = "https://api.x.ai/v1/videos/generations"

/**
 * Inicia la generación de un video en Grok a partir de un prompt y una imagen.
 * @param {object} payload
 * @param {string} payload.prompt - Descripción detallada del video (usaremos el copy generado).
 * @param {string} payload.imageUrl - URL o data URL de la imagen base.
 * @param {number} [payload.duration=5] - Duración aproximada en segundos.
 */
export async function iniciarVideoGrok({ prompt, imageUrl, duration = 5 }) {
  if (!XAI_API_KEY) {
    throw new Error("XAI_API_KEY no configurada en el backend")
  }

  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("Se requiere un 'prompt' no vacío para generar el video")
  }

  if (!imageUrl || typeof imageUrl !== "string" || !imageUrl.trim()) {
    throw new Error("Se requiere 'imageUrl' para generar el video")
  }

  const body = {
    model: "grok-imagine-video",
    prompt: prompt.trim(),
    image_url: imageUrl.trim(),
    duration,
  }

  const response = await fetch(GROK_VIDEO_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${XAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(
      `Error al llamar a Grok (video): ${response.status} - ${errText}`,
    )
  }

  // Devolvemos la respuesta tal cual para que el frontend decida qué mostrar (id, url, etc.)
  return response.json()
}

