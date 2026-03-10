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
 * Genera una imagen usando Gemini 2.0 Flash con una imagen de referencia del producto.
 * @param {string} prompt
 * @param {{ url: string }} imagenProducto
 * @returns {Promise<{ imageBase64: string }>}
 */
async function generarImagenConReferencia(prompt, imagenProducto) {
  const imageUrl = imagenProducto?.url
  if (!imageUrl) throw new Error("La imagen del producto no tiene URL.")

  const imgResponse = await fetch(imageUrl)
  if (!imgResponse.ok) {
    throw new Error(`No se pudo descargar la imagen del producto: ${imgResponse.status}`)
  }
  const arrayBuffer = await imgResponse.arrayBuffer()
  const base64Data = Buffer.from(arrayBuffer).toString("base64")

  const contentType = imgResponse.headers.get("content-type") || "image/jpeg"
  const mimeType = contentType.split(";")[0].trim()

  const url = `${BASE_URL}/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`

  const body = {
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          {
            text: `Basándote en la imagen del producto, crea una imagen publicitaria profesional. ${prompt}`,
          },
        ],
      },
    ],
    generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Error al llamar a Gemini imagen con referencia: ${response.status} - ${errText}`)
  }

  const data = await response.json()
  const parts = data?.candidates?.[0]?.content?.parts || []
  const imagePart = parts.find((p) => p.inlineData?.data)
  if (!imagePart) {
    console.error("[iaImagen.service] Respuesta sin imagen en parts:", JSON.stringify(data).slice(0, 500))
    throw new Error("Gemini no devolvió imagen en la respuesta multimodal.")
  }

  return { imageBase64: imagePart.inlineData.data }
}

/**
 * Genera una imagen a partir de un prompt (Google Imagen / Gemini).
 * Si se pasan imágenes del producto, usa Gemini 2.0 Flash con entrada multimodal.
 * @param {string} prompt - Descripción para generar la imagen.
 * @param {string} [aspectRatio='1:1'] - Relación de aspecto.
 * @param {Array<{ url: string }>} [imagenesProducto=[]] - Imágenes reales del producto.
 * @returns {Promise<{ imageBase64: string }>}
 */
export async function generarImagenDesdePrompt(prompt, aspectRatio = "1:1", imagenesProducto = []) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY no configurada en el backend")
  }
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("Se requiere un 'prompt' no vacío para generar la imagen")
  }

  if (Array.isArray(imagenesProducto) && imagenesProducto.length > 0) {
    try {
      return await generarImagenConReferencia(prompt, imagenesProducto[0])
    } catch (e) {
      console.warn("[iaImagen.service] Falló generación con referencia, usando text-to-image:", e.message)
    }
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
