import "isomorphic-fetch"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!OPENAI_API_KEY) {
  console.warn(
    "[iaCopy.service] OPENAI_API_KEY no está configurado. Las solicitudes a la IA fallarán.",
  )
}

// Prompt del agente para generar ángulos y copys por producto (agnóstico del tipo de producto)
const SYSTEM_PROMPT = `
Eres un copywriter experto en performance marketing y ventas para negocios digitales.
Tu trabajo es generar ÁNGULOS DE VENTA y COPYS para anuncios y contenidos enfocados en vender un producto o servicio específico.

Recibirás SIEMPRE, en el mensaje del usuario, un JSON con la información del producto, por ejemplo:

{
  "nombre": "Nombre del producto",
  "categoria": "Categoría general (ej. zapatillas, software, servicio de coaching, etc.)",
  "publico_objetivo": "Descripción del público ideal",
  "beneficios_clave": ["beneficio 1", "beneficio 2", "beneficio 3"],
  "objetivo": "Objetivo de marketing / canal principal (opcional)"
}

No inventes datos del producto: usa SOLO lo que venga en ese JSON.

Debes trabajar generando ÁNGULOS y, dentro de cada ángulo, varios copys:

- Un ÁNGULO es una forma específica de contar la oferta (ej. "Dolor de X", "Resultados rápidos", "Oferta limitada", "Autoridad/experiencia", "Prueba social", etc.).
- Un COPY es una pieza concreta de texto (título + cuerpo + CTA) lista para usarse en un anuncio o contenido.

PARA CADA PRODUCTO que recibas:

1. Entiende qué problema resuelve, a quién va dirigido y qué beneficios tiene.
2. Diseña EXACTAMENTE 5 ÁNGULOS DISTINTOS de venta.
3. Para CADA ÁNGULO, genera EXACTAMENTE 5 COPYS diferentes.
4. Escribe SIEMPRE en español latino, con tono profesional, claro y cercano.
5. Cada copy debe tener un hook fuerte, explicar brevemente el beneficio y terminar con un CTA claro.

FORMATO DE RESPUESTA (JSON ESTRICTO):

{
  "producto": {
    "nombre": "...",
    "categoria": "...",
    "publico_objetivo": "...",
    "beneficios_clave": ["...", "..."]
  },
  "angulos": [
    {
      "nombre": "Nombre del ángulo 1",
      "descripcion": "Explicación breve del enfoque de este ángulo (1–2 frases).",
      "copys": [
        {
          "idea_central": "Resumen breve del copy (1–2 frases).",
          "copy": {
            "titulo": "Título / hook principal",
            "cuerpo": "Texto principal del anuncio o pieza (máx ~220 caracteres, orientado a ventas).",
            "cta": "Llamado a la acción sugerido (ej. 'Conoce más', 'Compra ahora', 'Agenda tu demo')."
          },
          "sugerencia_formato": "Ej: anuncio feed Instagram, story vertical, anuncio Google, email corto, landing hero, etc."
        }
      ]
    }
  ]
}

REGLAS IMPORTANTES:
- Genera EXACTAMENTE 5 elementos en "angulos".
- Dentro de CADA "angulo", genera EXACTAMENTE 5 elementos en "copys".
- Todos los "angulos" deben ser claramente diferentes entre sí.
- Los copys dentro de un mismo ángulo deben ser variaciones del mismo enfoque (cambiando el wording, el CTA, el punto de énfasis, etc.).
- NO agregues texto fuera del JSON ni comentarios adicionales.
`

function ensureJson(content) {
  // A veces los modelos envuelven el JSON en ```; intentamos extraerlo.
  const trimmed = content.trim()
  const codeBlockMatch = trimmed.match(/```(?:json)?([\s\S]*?)```/i)
  const jsonText = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed
  return jsonText
}

export async function generarCopysParaProducto(producto, historial = []) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY no configurada en el backend")
  }

  const mensajes = [
    { role: "system", content: SYSTEM_PROMPT },
    // historial opcional [{ rol: 'user'|'assistant', contenido: '...' }]
    ...[]
      .concat(historial || [])
      .slice(-6) // solo los últimos mensajes
      .map((m) => ({
        role: m.rol === "assistant" ? "assistant" : "user",
        content: m.contenido,
      })),
    {
      role: "user",
      content: JSON.stringify(producto),
    },
  ]

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      messages: mensajes,
      temperature: 0.9,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Error al llamar a OpenAI: ${response.status} - ${errText}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || "{}"
  const jsonText = ensureJson(content)

  try {
    const parsed = JSON.parse(jsonText)

    // Validación suave de estructura de ángulos y copys
    if (Array.isArray(parsed.angulos)) {
      if (parsed.angulos.length !== 5) {
        console.warn(
          "[iaCopy.service] Cantidad de ángulos inesperada:",
          parsed.angulos.length,
        )
      }
      parsed.angulos.forEach((a, idx) => {
        if (!Array.isArray(a.copys)) {
          console.warn(
            `[iaCopy.service] El ángulo ${idx} no tiene 'copys' como array.`,
          )
          return
        }
        if (a.copys.length !== 5) {
          console.warn(
            `[iaCopy.service] Cantidad de copys inesperada en ángulo ${idx}:`,
            a.copys.length,
          )
        }
      })
    } else {
      console.warn("[iaCopy.service] 'angulos' no es un array en la respuesta de la IA")
    }

    return parsed
  } catch (e) {
    console.error("[iaCopy.service] No se pudo parsear JSON de la IA:", e, jsonText)
    throw new Error("La respuesta de la IA no tiene un formato JSON válido.")
  }
}

