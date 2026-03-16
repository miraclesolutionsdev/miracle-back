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
 * Descarga una imagen desde URL y retorna { mimeType, base64Data }.
 */
async function descargarImagenComoBase64(imageUrl) {
  const imgResponse = await fetch(imageUrl)
  if (!imgResponse.ok) {
    throw new Error(`No se pudo descargar la imagen: ${imgResponse.status} - ${imageUrl}`)
  }
  const arrayBuffer = await imgResponse.arrayBuffer()
  const base64Data = Buffer.from(arrayBuffer).toString("base64")
  const contentType = imgResponse.headers.get("content-type") || "image/jpeg"
  const mimeType = contentType.split(";")[0].trim()
  return { mimeType, base64Data }
}

/**
 * Genera una imagen usando Gemini 2.5 Flash con múltiples imágenes de referencia del producto.
 * @param {string} prompt
 * @param {Array<{ url: string }>} imagenesProducto
 * @returns {Promise<{ imageBase64: string }>}
 */
async function generarImagenConReferencia(prompt, imagenesProducto) {
  const imagenes = Array.isArray(imagenesProducto) ? imagenesProducto : [imagenesProducto]
  const urls = imagenes.map((i) => i?.url).filter(Boolean)
  if (urls.length === 0) throw new Error("Las imágenes del producto no tienen URLs válidas.")

  // Máximo 5 imágenes para no sobrecargar el request
  const urlsAUsar = urls.slice(0, 5)

  // Descargar todas en paralelo
  const imagenesDescargadas = await Promise.all(
    urlsAUsar.map((url) => descargarImagenComoBase64(url).catch(() => null))
  )
  const imagenesValidas = imagenesDescargadas.filter(Boolean)
  if (imagenesValidas.length === 0) throw new Error("No se pudo descargar ninguna imagen del producto.")

  const contextoParts = imagenesValidas.map(({ mimeType, base64Data }) => ({
    inlineData: { mimeType, data: base64Data },
  }))

  const referenciaTexto = imagenesValidas.length > 1
    ? `Te proporciono ${imagenesValidas.length} imágenes del mismo producto desde distintos ángulos y perspectivas. Úsalas todas como referencia visual para entender completamente el producto: su forma, colores, detalles y características.`
    : `Te proporciono una imagen del producto como referencia visual.`

  const url = `${BASE_URL}/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`
  const body = {
    contents: [
      {
        parts: [
          ...contextoParts,
          {
            text: `Eres un director de arte experto en publicidad. ${referenciaTexto}

REGLA CRÍTICA: El producto que aparece en las imágenes de referencia es el producto REAL del cliente. Debes reproducirlo con total fidelidad visual: mismos colores exactos, mismo diseño, mismos estampados, misma forma y silueta. NUNCA inventes ni sustituyas el producto por uno diferente aunque sea similar.

Genera una fotografía publicitaria de alta calidad basándote en esta descripción de escena:
"${prompt}"

REGLAS ADICIONALES:
- El producto en la imagen generada debe ser IDÉNTICO al de las fotos de referencia
- La imagen DEBE estar COMPLETAMENTE LIBRE DE TEXTO: sin letras, palabras, tipografía, marcas de agua ni logos
- Estilo fotorrealista, iluminación profesional, composición publicitaria para redes sociales (1:1)`,
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
      return await generarImagenConReferencia(prompt, imagenesProducto)
    } catch (e) {
      console.warn("[iaImagen.service] Falló generación con referencia, usando text-to-image:", e.message)
    }
  }

  const url = `${BASE_URL}/models/${IMAGEN_MODEL}:predict?key=${encodeURIComponent(
    GEMINI_API_KEY,
  )}`

  const enhancedPrompt = `Eres un director de arte experto. Crea una fotografía publicitaria fotorrealista de alta calidad orientada a producto y muy profesional. Usa la siguiente descripción y copys para contextualizar la escena: "${prompt.trim()}". REGLA CRÍTICA Y ESTRICTA: La imagen DEBE ESTAR COMPLETAMENTE ESTRICTAMENTE LIBRE DE TEXTO (text-free). NO incluyas letras, palabras, tipografía, marcas de agua ni logos. Céntrate en la belleza visual, iluminación de estudio y composición publicitaria.`;

  const body = {
    instances: [{ prompt: enhancedPrompt }],
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