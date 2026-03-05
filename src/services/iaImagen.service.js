/**
 * Servicio para generar imágenes con Google Imagen (Gemini).
 * Formato según Postman: generativelanguage.googleapis.com predict.
 */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY

if (!GEMINI_API_KEY) {
  console.warn(
    "[iaImagen.service] GEMINI_API_KEY no está configurado. La generación de imágenes fallará.",
  )
}

const IMAGEN_MODEL = "imagen-4.0-fast-generate-001"
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

/**
 * Genera una imagen a partir de un prompt (Google Imagen / Gemini).
 * @param {string} prompt - Descripción para generar la imagen.
 * @param {string} [aspectRatio='1:1'] - Relación de aspecto.
 * @returns {Promise<{ imageBase64: string }>}
 */
export async function generarImagenDesdePrompt(prompt, aspectRatio = "1:1") {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY no configurada en el backend")
  }
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("Se requiere un 'prompt' no vacío para generar la imagen")
  }

  const url = `${BASE_URL}/models/${IMAGEN_MODEL}:predict?key=${encodeURIComponent(
    GEMINI_API_KEY,
  )}`

  const body = {
    instances: [{ prompt: prompt.trim() }],
    parameters: {
      sampleCount: 1,
      aspectRatio: aspectRatio || "1:1",
    },
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(
      `Error al llamar a Google Imagen: ${response.status} - ${errText}`,
    )
  }

  const data = await response.json()

  const predictions = data.predictions
  if (!Array.isArray(predictions) || predictions.length === 0) {
    console.error("[iaImagen.service] Respuesta sin predictions:", data)
    throw new Error("La API de Imagen no devolvió ninguna imagen.")
  }

  const first = predictions[0]
  const imageBase64 =
    first.bytesBase64Encoded ??
    first.image?.imageBytes ??
    first.imageBytes

  if (!imageBase64) {
    console.error("[iaImagen.service] Estructura inesperada:", first)
    throw new Error("No se encontró la imagen en la respuesta de la API.")
  }

  return { imageBase64 }
}
