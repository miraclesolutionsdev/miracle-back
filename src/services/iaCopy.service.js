import "isomorphic-fetch"

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!OPENAI_API_KEY) {
  console.warn(
    "[iaCopy.service] OPENAI_API_KEY no está configurado. Las solicitudes a la IA fallarán.",
  )
}

function ensureJson(content) {
  const trimmed = content.trim()
  const codeBlockMatch = trimmed.match(/```(?:json)?([\s\S]*?)```/i)
  const jsonText = codeBlockMatch ? codeBlockMatch[1].trim() : trimmed
  return jsonText
}

// 1) Generar SOLO ángulos para un producto
export async function generarAngulosParaProducto(producto, historial = []) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY no configurada en el backend")
  }

  const SYSTEM_PROMPT_ANGULOS = `
Eres un copywriter experto en marketing y ventas.
Tu tarea es generar ÁNGULOS DE VENTA para un producto o servicio específico.

Recibirás un JSON con la información del producto, por ejemplo:
{
  "nombre": "Nombre del producto",
  "categoria": "Categoría general (ej. zapatillas, software, servicio, etc.)",
  "descripcion": "Descripción del producto o servicio",
  "usos": ["uso 1", "uso 2"],
  "caracteristicas": ["característica 1", "característica 2"],
  "objetivo": "Objetivo de marketing / canal principal (opcional)"
}

No inventes datos: usa SOLO lo que venga en ese JSON y tu criterio profesional.
Basa los ángulos en los usos, características y descripción reales del producto.

Debes devolver EXACTAMENTE 5 ángulos de venta, todos claramente distintos entre sí.

FORMATO DE RESPUESTA (JSON ESTRICTO):
{
  "producto": {
    "nombre": "...",
    "categoria": "...",
    "descripcion": "...",
    "usos": ["..."],
    "caracteristicas": ["..."]
  },
  "angulos": [
    {
      "nombre": "Nombre breve del ángulo",
      "descripcion": "Explicación del enfoque en 1–2 frases."
    }
  ]
}

Reglas:
- Genera EXACTAMENTE 5 elementos en "angulos".
- No generes copys en este modo.
- No agregues texto fuera del JSON ni comentarios adicionales.
`

  const mensajes = [
    { role: "system", content: SYSTEM_PROMPT_ANGULOS },
    ...[]
      .concat(historial || [])
      .slice(-6)
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
      temperature: 0.8,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Error al llamar a OpenAI (ángulos): ${response.status} - ${errText}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || "{}"
  const jsonText = ensureJson(content)

  try {
    const parsed = JSON.parse(jsonText)

    if (!Array.isArray(parsed.angulos)) {
      console.warn("[iaCopy.service] 'angulos' no es un array en la respuesta de ángulos")
    } else if (parsed.angulos.length !== 5) {
      console.warn(
        "[iaCopy.service] Cantidad de ángulos inesperada (ángulos):",
        parsed.angulos.length,
      )
    }

    return parsed
  } catch (e) {
    console.error(
      "[iaCopy.service] No se pudo parsear JSON de la IA (ángulos):",
      e,
      jsonText,
    )
    throw new Error("La respuesta de la IA (ángulos) no tiene un formato JSON válido.")
  }
}

// 2) Generar COPYS para un ÁNGULO concreto de un producto
export async function generarCopysParaProducto(producto, angulo, historial = []) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY no configurada en el backend")
  }

  const SYSTEM_PROMPT_COPYS = `
Eres un copywriter experto en performance marketing.
Ahora trabajarás SOLO sobre UN ÁNGULO concreto de un producto.

Recibirás un JSON:
{
  "producto": {
    "nombre": "...",
    "categoria": "...",
    "descripcion": "...",
    "usos": ["uso 1", "uso 2"],
    "caracteristicas": ["característica 1", "característica 2"]
  },
  "angulo": {
    "nombre": "...",
    "descripcion": "..."
  }
}

Basa los copys en los usos, características y descripción reales del producto.
No inventes datos: usa SOLO lo que venga en ese JSON y tu criterio profesional.

Debes generar EXACTAMENTE 5 copys distintos para este ángulo, cubriendo el funnel:
- 2 copys TOF (Top of Funnel)
- 2 copys MOF (Middle of Funnel)
- 1 copy BOF (Bottom of Funnel)

FORMATO DE RESPUESTA (JSON ESTRICTO):
{
  "producto": { ... },
  "angulo": {
    "nombre": "...",
    "descripcion": "..."
  },
  "copys": [
    {
      "etapa": "TOF" | "MOF" | "BOF",
      "idea_central": "Resumen breve (1–2 frases).",
      "copy": {
        "titulo": "Título / hook principal",
        "cuerpo": "Texto principal (máx ~220 caracteres).",
        "cta": "Llamado a la acción."
      },
      "sugerencia_formato": "Ej: anuncio feed, story vertical, anuncio Google, email, etc."
    }
  ]
}

Reglas:
- Genera EXACTAMENTE 5 elementos en "copys".
- Asegúrate de que haya 2 TOF, 2 MOF y 1 BOF.
- Escribe en español latino, tono profesional, claro y cercano.
- No agregues texto fuera del JSON ni comentarios adicionales.
`

  const mensajes = [
    { role: "system", content: SYSTEM_PROMPT_COPYS },
    ...[]
      .concat(historial || [])
      .slice(-6)
      .map((m) => ({
        role: m.rol === "assistant" ? "assistant" : "user",
        content: m.contenido,
      })),
    {
      role: "user",
      content: JSON.stringify({ producto, angulo }),
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
    throw new Error(`Error al llamar a OpenAI (copys): ${response.status} - ${errText}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || "{}"
  const jsonText = ensureJson(content)

  try {
    const parsed = JSON.parse(jsonText)

    if (!Array.isArray(parsed.copys)) {
      console.warn("[iaCopy.service] 'copys' no es un array en la respuesta de copys")
      return parsed
    }

    const tof = parsed.copys.filter((c) => c.etapa === "TOF").length
    const mof = parsed.copys.filter((c) => c.etapa === "MOF").length
    const bof = parsed.copys.filter((c) => c.etapa === "BOF").length

    if (tof !== 2 || mof !== 2 || bof !== 1) {
      console.warn("[iaCopy.service] Estructura de funnel inesperada:", {
        tof,
        mof,
        bof,
      })
    }

    return parsed
  } catch (e) {
    console.error(
      "[iaCopy.service] No se pudo parsear JSON de la IA (copys):",
      e,
      jsonText,
    )
    throw new Error("La respuesta de la IA (copys) no tiene un formato JSON válido.")
  }
}

// 3) Generar guion y copy audiovisual a partir de una imagen + copy base
export async function generarGuionDesdeImagen(payload, historial = []) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY no configurada en el backend")
  }

  const SYSTEM_PROMPT_IMAGEN = `
Eres un creativo senior de contenido audiovisual para redes sociales (TikTok, Reels, Shorts, Ads).

Tu tarea: a partir de una PIEZA GRÁFICA (imagen) y del copy base asociado,
debes proponer un guion corto y copy para un VIDEO publicitario.

Recibirás un JSON como:
{
  "producto": { "nombre": "...", "categoria": "...", "descripcion": "..." },
  "angulo": { "nombre": "...", "descripcion": "..." },
  "copy_base": {
    "etapa": "TOF|MOF|BOF",
    "titulo": "...",
    "cuerpo": "...",
    "cta": "...",
    "idea_central": "..."
  },
  "imagen": {
    "url": "https://...",
    "descripcion_manual": "Breve descripción textual de lo que muestra la imagen (opcional)"
  },
  "contexto_pieza": {
    "tipo": "video" | "story" | "short",
    "plataforma": "TikTok" | "Reels" | "Meta" | "YouTube",
    "duracion_objetivo_seg": 30
  }
}

NO puedes ver la imagen realmente, pero debes suponer que la imagen representa visualmente
el ángulo y el copy_base indicados. Usa esa info como referencia visual.

Debes devolver un JSON ESTRICTO con este formato:

{
  "pieza": {
    "tipo": "video",
    "plataforma": "TikTok",
    "duracion_sugerida": 30
  },
  "copy_plataforma": {
    "titulo": "Título corto para el video",
    "descripcion": "Descripción optimizada para la plataforma, en español latino, con 1 CTA claro.",
    "hashtags": ["#ejemplo", "#producto", "#marca"]
  },
  "idea_creativa": "Resumen en 2-3 frases de la idea visual del video.",
  "guion": {
    "estructura": [
      { "segundos": "0-3", "descripcion": "..." },
      { "segundos": "3-10", "descripcion": "..." }
    ],
    "texto_sugerido": [
      "Frase 1 de guion hablado o subtítulos",
      "Frase 2...",
      "Frase 3..."
    ]
  }
}

Reglas:
- Escribe SIEMPRE en español latino, profesional pero cercano.
- No agregues texto fuera del JSON.
- Respeta el funnel según etapa (TOF/MOF/BOF) al definir el enfoque.
`

  const mensajes = [
    { role: "system", content: SYSTEM_PROMPT_IMAGEN },
    ...[]
      .concat(historial || [])
      .slice(-4)
      .map((m) => ({
        role: m.rol === "assistant" ? "assistant" : "user",
        content: m.contenido,
      })),
    {
      role: "user",
      content: JSON.stringify(payload),
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
    throw new Error(
      `Error al llamar a OpenAI (guion imagen): ${response.status} - ${errText}`,
    )
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || "{}"
  const jsonText = ensureJson(content)

  try {
    return JSON.parse(jsonText)
  } catch (e) {
    console.error(
      "[iaCopy.service] No se pudo parsear JSON de la IA (guion imagen):",
      e,
      jsonText,
    )
    throw new Error(
      "La respuesta de la IA (guion imagen) no tiene un formato JSON válido.",
    )
  }
}

// 4) Generar COPY directo a partir de una IMAGEN (visión)
export async function generarCopyDesdeImagen(
  imagenDataUrl,
  contexto = {},
  historial = [],
  imagenesProducto = [],
  copyBase = null,
) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY no configurada en el backend")
  }

  if (!imagenDataUrl) {
    throw new Error("Falta 'imagenDataUrl' para generar el copy desde la imagen")
  }

  const SYSTEM_PROMPT_COPY_IMAGEN = `
Eres un director creativo experto en publicidad audiovisual para redes sociales y un especialista
en generar prompts para motores de video IA como Runway Gen4.

Tu tarea: analizar la imagen recibida y generar un PROMPT CINEMATOGRÁFICO DIRECTO para Runway
que describa exactamente el video de 10 segundos que debe generarse, más el copy del post.

ANÁLISIS VISUAL OBLIGATORIO:
- Observa qué hay exactamente en la imagen: ¿solo producto? ¿ambiente? ¿colores? ¿texturas?
- Describe solo lo que VES. No asumas personas si no aparecen.
- El producto en el video debe verse IDÉNTICO al de la imagen — mismos colores, formas y detalles.

FORMATO DE RESPUESTA (JSON ESTRICTO):
{
  "runway_prompt": "PROMPT DIRECTO EN INGLÉS para Runway Gen4. Este es el prompt completo que se enviará directamente al motor de video — debe ser autocontenido y ejecutable. ESTRUCTURA OBLIGATORIA: [1] Descripción exacta del producto visible en la imagen (colores, materiales, forma, detalles). [2] Secuencia de planos en orden temporal: plano 1 (0-3s) → plano 2 (3-7s) → plano 3 (7-10s), cada uno con movimiento de cámara específico y acción visible. [3] Ambiente, iluminación y atmósfera. [4] Estilo visual y ritmo. TIPOS DE MOVIMIENTO por producto: vehículos/acción → 'accelerating forward, wheels spinning, dust cloud rising, low-angle tracking shot'; ropa/textiles → 'fabric gently flowing in breeze, texture close-up with soft light, slow dolly push-in'; alimentos/bebidas → 'liquid pouring in slow motion, steam rising, product glistening under studio light'; electrónicos → 'product rotating on reflective surface, light streaks moving across screen, slow orbit'; joyería/accesorios → 'sparkling reflections, macro close-up of details, slow 360 rotation'; general → 'slow cinematic orbit around product, ambient particles floating, camera pushing in'. REGLAS: verbos en presente continuo (spinning, flowing, rising, orbiting, pushing, tracking, revealing), sin personas ni modelos humanos, máx 900 chars, inglés fluido y cinematográfico.",
  "guion_voz": [
    "Frase 1 para locución — hook de impacto (0-3 segundos).",
    "Frase 2 — beneficio principal del producto (3-7 segundos).",
    "Frase 3 — CTA claro y directo (7-10 segundos)."
  ],
  "copy_post": {
    "titulo": "Título corto y llamativo para el anuncio/post.",
    "cuerpo": "Texto persuasivo (máx 150 caracteres).",
    "cta": "Llamado a la acción específico."
  }
}

Reglas:
- El runway_prompt es lo más importante — debe ser un prompt completo, preciso y ejecutable.
- guion_voz en español latino, 3 frases cortas que narran el video de 10 segundos.
- copy_post en español latino, tono profesional y cercano.
- NUNCA menciones personas, modelos, mujeres u hombres en el runway_prompt si no hay personas en la imagen.
- Usa SIEMPRE verbos de acción en presente continuo en el runway_prompt.
- No inventes elementos que no estén en la imagen o en la ficha del producto.
- No agregues texto fuera del JSON ni comentarios adicionales.
`

  // Construir contexto completo del producto
  const partesFicha = []
  if (contexto.nombre) partesFicha.push(`Nombre: ${contexto.nombre}`)
  if (contexto.tipo) partesFicha.push(`Tipo: ${contexto.tipo}`)
  if (contexto.descripcion) partesFicha.push(`Descripción: ${contexto.descripcion}`)
  if (Array.isArray(contexto.usos) && contexto.usos.length)
    partesFicha.push(`Usos: ${contexto.usos.join(', ')}`)
  if (Array.isArray(contexto.caracteristicas) && contexto.caracteristicas.length)
    partesFicha.push(`Características: ${contexto.caracteristicas.join(', ')}`)
  if (contexto.angulo) partesFicha.push(`Ángulo de campaña: ${contexto.angulo}`)
  if (contexto.anguloDescripcion) partesFicha.push(`Enfoque del ángulo: ${contexto.anguloDescripcion}`)
  const fichaProducto = partesFicha.length ? partesFicha.join('\n') : ''

  const copyBaseTexto = copyBase
    ? `\nCOPY BASE DEL ÁNGULO (mantén coherencia de mensaje y tono con este copy):\n- Etapa: ${copyBase.etapa || ''}\n- Idea central: ${copyBase.idea_central || ''}\n- Título: ${copyBase.titulo || ''}\n- Cuerpo: ${copyBase.cuerpo || ''}\n- CTA: ${copyBase.cta || ''}`
    : ""

  // Construir el contenido del mensaje de usuario con imágenes reales del producto primero
  const contenidoUsuario = []

  const textoIntro = [
    "Genera el mejor copy posible para este producto siguiendo el formato JSON indicado.",
    fichaProducto ? `\nFICHA DEL PRODUCTO:\n${fichaProducto}` : "",
    copyBaseTexto,
    "\nIMPORTANTE: Las imágenes a continuación son fotos REALES del producto. Analiza visualmente lo que ves — colores exactos, diseño, patrones, ambiente — y úsalos como base para las escenas, el runway_prompt y las instrucciones del video. No describas elementos que no estén presentes en las imágenes.",
  ].filter(Boolean).join('')

  contenidoUsuario.push({ type: "text", text: textoIntro })

  // Incluir imágenes reales del producto (máximo 3 para no exceder límites)
  const imagenesReales = Array.isArray(imagenesProducto) ? imagenesProducto.slice(0, 3) : []
  for (const url of imagenesReales) {
    if (url && typeof url === "string") {
      contenidoUsuario.push({ type: "image_url", image_url: { url, detail: "low" } })
    }
  }

  // Incluir también la imagen AI-generada del copy si existe
  if (imagenDataUrl && typeof imagenDataUrl === "string") {
    contenidoUsuario.push({
      type: "text",
      text: "Esta es la imagen creativa AI generada para el copy (úsala como referencia de escena y ambiente):",
    })
    contenidoUsuario.push({ type: "image_url", image_url: { url: imagenDataUrl, detail: "high" } })
  }

  const mensajes = [
    { role: "system", content: SYSTEM_PROMPT_COPY_IMAGEN },
    ...[]
      .concat(historial || [])
      .slice(-4)
      .map((m) => ({
        role: m.rol === "assistant" ? "assistant" : "user",
        content: m.contenido,
      })),
    {
      role: "user",
      content: contenidoUsuario,
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
    throw new Error(
      `Error al llamar a OpenAI (copy desde imagen): ${response.status} - ${errText}`,
    )
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content || "{}"
  const jsonText = ensureJson(content)

  try {
    const parsed = JSON.parse(jsonText)
    return parsed
  } catch (e) {
    console.error(
      "[iaCopy.service] No se pudo parsear JSON de la IA (copy imagen):",
      e,
      jsonText,
    )
    throw new Error(
      "La respuesta de la IA (copy imagen) no tiene un formato JSON válido.",
    )
  }
}



