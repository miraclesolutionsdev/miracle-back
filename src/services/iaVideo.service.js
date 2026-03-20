import RunwayML from "@runwayml/sdk"

const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY

if (!RUNWAY_API_KEY) {
  console.warn(
    "[iaVideo.service] RUNWAY_API_KEY no está configurada. Las solicitudes de video con Runway fallarán.",
  )
}

/**
 * Inicia la generación de un video en RunwayML (image-to-video).
 * Devuelve el task ID inmediatamente para que el frontend pueda hacer polling.
 * @param {object} payload
 * @param {string} payload.promptText - Descripción del video a generar.
 * @param {string} payload.imageUrl   - URL pública de la imagen de referencia.
 * @param {string} [payload.ratio]    - Proporción: "1280:720" | "720:1280" | "1:1". Default: "1280:720".
 * @param {number} [payload.duration] - Duración en segundos: 5 | 10. Default: 5.
 */
// El copyTexto que llega ya es el runway_prompt generado directamente por la IA en inglés.
// Solo necesitamos limpiar referencias a personas por si acaso y truncar al límite de Runway.
const PERSONA_REGEX = /\b(wearing|a woman|a man|a girl|a boy|a person|the model|person wearing|someone wearing)\b/gi

function construirPromptRunway(copyTexto) {
  const limpio = copyTexto
    .replace(PERSONA_REGEX, 'the product')
    .trim()
  return limpio.slice(0, 999)
}

export async function iniciarVideoRunway({ copyTexto, imageUrl, ratio = "720:1280", duration = 10 }) {
  if (!RUNWAY_API_KEY) throw new Error("RUNWAY_API_KEY no configurada en el backend")
  if (!copyTexto?.trim()) throw new Error("Se requiere 'copyTexto' para generar el video con Runway")
  if (!imageUrl?.trim()) throw new Error("Se requiere 'imageUrl' para generar el video con Runway")

  const client = new RunwayML({ apiKey: RUNWAY_API_KEY })
  const promptFinal = construirPromptRunway(copyTexto)

  const task = await client.imageToVideo.create({
    model: "gen4_turbo",
    promptImage: imageUrl.trim(),
    promptText: promptFinal,
    ratio,
    duration,
  })

  return { id: task.id, status: task.status }
}

/**
 * Consulta el estado de un task de RunwayML.
 * El frontend debe hacer polling cada ~5s hasta que status sea "SUCCEEDED" o "FAILED".
 * @param {string} taskId
 */
export async function generarVozRunway({ texto, voiceId = "Maya" }) {
  if (!RUNWAY_API_KEY) throw new Error("RUNWAY_API_KEY no configurada en el backend")
  if (!texto?.trim()) throw new Error("Se requiere 'texto' para generar la voz")

  const client = new RunwayML({ apiKey: RUNWAY_API_KEY })
  const task = await client.textToSpeech.create({
    model: "eleven_multilingual_v2",
    promptText: texto.trim().slice(0, 1000),
    voice: { type: "runway-preset", presetId: voiceId },
  })
  return { id: task.id, status: task.status }
}

export async function obtenerEstadoVozRunway(taskId) {
  if (!RUNWAY_API_KEY) throw new Error("RUNWAY_API_KEY no configurada en el backend")
  if (!taskId?.trim()) throw new Error("Se requiere 'taskId' para consultar la voz")

  const client = new RunwayML({ apiKey: RUNWAY_API_KEY })
  const task = await client.tasks.retrieve(taskId.trim())
  return {
    id: task.id,
    status: task.status,
    url: task.output?.[0] ?? null,
    error: task.failure ?? null,
  }
}

export async function obtenerEstadoVideoRunway(taskId) {
  if (!RUNWAY_API_KEY) throw new Error("RUNWAY_API_KEY no configurada en el backend")
  if (!taskId?.trim()) throw new Error("Se requiere 'taskId' para consultar el video de Runway")

  const client = new RunwayML({ apiKey: RUNWAY_API_KEY })
  const task = await client.tasks.retrieve(taskId.trim())

  // Cuando termina, task.output contiene la URL del video
  return {
    id: task.id,
    status: task.status,
    url: task.output?.[0] ?? null,
    error: task.failure ?? null,
  }
}


