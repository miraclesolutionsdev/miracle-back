import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const bucket = process.env.S3_BUCKET
const region = process.env.AWS_REGION || "us-east-1"

const s3Client = new S3Client({
  region,
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
})

function getBaseUrl() {
  return process.env.S3_PUBLIC_URL
    ? process.env.S3_PUBLIC_URL.replace(/\/$/, "")
    : `https://${bucket}.s3.${region}.amazonaws.com`
}

/**
 * Genera una key S3 a partir del nombre de archivo: {carpeta}/{nombre-sanitizado}.
 * Si dos archivos tienen el mismo nombre, generan la misma key (evita duplicados).
 */
function keyDesdeNombre(originalname, carpeta = "productos") {
  const base = (originalname || "").replace(/^.*[/\\]/, "").trim().toLowerCase() || "archivo"
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : ".bin"
  const sinExt = base.slice(0, base.length - ext.length) || "archivo"
  const sanitized = sinExt.replace(/[^a-z0-9._-]/g, "_").slice(0, 100) || "archivo"
  return `${carpeta}/${sanitized}${ext}`
}

/**
 * Comprueba si existe un objeto en S3 con la key dada.
 */
async function existeEnS3(key) {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (err) {
    if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) return false
    throw err
  }
}

/**
 * Sube un buffer (imagen) a S3 y devuelve la URL pública del objeto.
 * @param {Buffer} buffer - Contenido del archivo
 * @param {string} contentType - ej. "image/jpeg"
 * @param {string} key - Ruta en el bucket, ej. "productos/abc123/0.jpg"
 * @returns {Promise<string>} URL pública
 */
export async function subirImagen(buffer, contentType, key) {
  if (!bucket) throw new Error("S3_BUCKET no está configurado en .env")
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || "image/jpeg",
    })
  )
  return `${getBaseUrl()}/${key}`
}

/**
 * Sube la imagen solo si no existe ya en S3 una con la misma key (por nombre de archivo).
 * Evita duplicados: mismo nombre de archivo → misma key → se reutiliza la URL existente.
 * @param {Buffer} buffer - Contenido del archivo
 * @param {string} contentType - ej. "image/jpeg"
 * @param {string} originalname - Nombre original del archivo (ej. "foto.jpg")
 * @returns {Promise<string>} URL pública (existente o nueva)
 */
export async function subirImagenEvitandoDuplicado(buffer, contentType, originalname) {
  if (!bucket) throw new Error("S3_BUCKET no está configurado en .env")
  const key = keyDesdeNombre(originalname, "productos")
  if (await existeEnS3(key)) {
    return `${getBaseUrl()}/${key}`
  }
  return subirImagen(buffer, contentType, key)
}

/**
 * Sube un archivo (video o imagen) a S3 en la carpeta audiovisuales.
 * Evita duplicados por nombre de archivo.
 */
export async function subirArchivoAudiovisualEvitandoDuplicado(buffer, contentType, originalname) {
  if (!bucket) throw new Error("S3_BUCKET no está configurado en .env")
  const key = keyDesdeNombre(originalname, "audiovisuales")
  if (await existeEnS3(key)) {
    return `${getBaseUrl()}/${key}`
  }
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    })
  )
  return `${getBaseUrl()}/${key}`
}

/**
 * Genera una key única para audiovisuales (evita sobrescribir).
 */
function keyAudiovisualUnica(originalname) {
  const base = (originalname || "").replace(/^.*[/\\]/, "").trim().toLowerCase() || "archivo"
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : ".bin"
  const sinExt = base.slice(0, base.length - ext.length) || "archivo"
  const sanitized = sinExt.replace(/[^a-z0-9._-]/g, "_").slice(0, 80) || "archivo"
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `audiovisuales/${uniq}_${sanitized}${ext}`
}

/**
 * Obtiene una URL firmada (presigned) para que el cliente suba el archivo directo a S3.
 * Permite archivos hasta 1GB sin pasar por el servidor.
 */
export async function obtenerPresignedPutAudiovisual(originalname, contentType) {
  if (!bucket) throw new Error("S3_BUCKET no está configurado en .env")
  const key = keyAudiovisualUnica(originalname)
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType || "application/octet-stream",
  })
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 })
  const publicUrl = `${getBaseUrl()}/${key}`
  return { uploadUrl, key, publicUrl }
}
