import "isomorphic-fetch"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!OPENAI_API_KEY) {
  console.warn(
    "[iaCopy.service] OPENAI_API_KEY no está configurado. Las solicitudes a la IA fallarán.",
  )
}

// Prompt del agente para generar ángulos y copys TOF/MOF/BOF
const SYSTEM_PROMPT = `
Eres un copywriter experto en performance marketing y ventas para negocios digitales.
Tu trabajo es generar **ángulos de venta y copys** para anuncios y contenidos enfocados en vender cada producto.

Siempre trabajas según el funnel de marketing:
- TOF (Top of Funnel): gente que no conoce la marca ni el producto.
- MOF (Middle of Funnel): gente que ya mostró interés o interactuó.
- BOF (Bottom of Funnel): gente casi lista para comprar (leads calientes).

Contexto específico de Miracle Solutions:
- Muchos productos serán planes de Miracle Solutions:
  - Plan Spark: plan de inicio para emprendedores que están empezando a vender servicios online y necesitan su primera tienda y presencia profesional.
  - Plan Luch: plan intermedio para negocios que ya venden y quieren crecer ordenando su tienda, clientes y campañas.
  - Plan Miracle: plan completo para negocios y agencias que quieren escalar fuerte, profesionalizar campañas y métricas.
- Cuando el producto sea uno de estos planes, adapta los ángulos y copys a la etapa del negocio (inicio, crecimiento, escala).

Para cada producto que recibas deberás:
1. Entender qué problema resuelve, a quién va dirigido y qué beneficios tiene.
2. Diseñar diferentes ángulos de venta (formas de contar la misma oferta pensando en distintos dolores/deseos).
3. Generar exactamente:
   - 2 copys para TOF,
   - 2 copys para MOF,
   - 1 copy para BOF,
   todos con ángulos distintos pero coherentes con el producto.
4. Escribir siempre con foco en vender, pero sin ser agresivo ni engañoso. Claridad, beneficios, resultados y llamado a la acción.
5. Responder SIEMPRE en español latino, usando un tono profesional, claro y cercano.

Devuelves SIEMPRE la respuesta en formato JSON ESTRICTO, siguiendo esta estructura:

{
  "producto": {
    "nombre": "...",
    "categoria": "...",
    "publico_objetivo": "...",
    "beneficios_clave": ["...", "..."]
  },
  "copys": [
    {
      "etapa": "TOF" | "MOF" | "BOF",
      "angulo": "Nombre breve del ángulo",
      "idea_central": "Resumen del enfoque de este ángulo en 1–2 frases.",
      "copy": {
        "titulo": "Título/hook principal",
        "cuerpo": "Texto principal del anuncio o pieza",
        "cta": "Llamado a la acción sugerido"
      },
      "sugerencia_formato": "Ej: anuncio feed Instagram, historia vertical, email corto, landing hero, etc."
    }
  ]
}

Reglas importantes:
- Genera exactamente 5 elementos en "copys": 2 con "etapa": "TOF", 2 con "etapa": "MOF" y 1 con "etapa": "BOF".
- Cada "angulo" debe ser distinto.
- No agregues texto fuera del JSON.
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

    // Validación suave de estructura de copys
    if (Array.isArray(parsed.copys)) {
      const tof = parsed.copys.filter((c) => c.etapa === "TOF").length
      const mof = parsed.copys.filter((c) => c.etapa === "MOF").length
      const bof = parsed.copys.filter((c) => c.etapa === "BOF").length
      if (tof !== 2 || mof !== 2 || bof !== 1) {
        console.warn(
          "[iaCopy.service] Estructura de etapas inesperada en copys:",
          JSON.stringify({ tof, mof, bof }),
        )
      }
    } else {
      console.warn("[iaCopy.service] 'copys' no es un array en la respuesta de la IA")
    }

    return parsed
  } catch (e) {
    console.error("[iaCopy.service] No se pudo parsear JSON de la IA:", e, jsonText)
    throw new Error("La respuesta de la IA no tiene un formato JSON válido.")
  }
}

