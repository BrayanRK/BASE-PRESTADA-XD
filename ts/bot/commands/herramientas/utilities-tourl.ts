import type * as types from "../../../types/types.js"
import {
  dvyerImgBB, dvyerMediaUrl,
  evogbUpload, evogbMediaUrl,
  findFirstUrl, toDataUrl,
} from "../../../libs/downloads.js"

const uploadQuAx = async (buffer: Buffer, filename: string): Promise<string> => {
  const form = new FormData()
  form.append("files[]", new Blob([buffer]), filename)

  const res = await fetch("https://qu.ax/upload.php", { method: "POST", body: form })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data: any = await res.json()
  const url = data?.files?.[0]?.url || data?.url
  if (!url || !/^https?:\/\//i.test(url)) throw new Error("Respuesta inválida de qu.ax")
  return url
}

const uploadCatbox = async (buffer: Buffer, filename: string): Promise<string> => {
  const form = new FormData()
  form.append("reqtype", "fileupload")
  form.append("fileToUpload", new Blob([buffer]), filename)

  const res = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: form })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const url = (await res.text()).trim()
  if (!/^https?:\/\//i.test(url)) throw new Error("Respuesta inválida de catbox")
  return url
}

const mimeToExt = (mime: string): string => {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
    "image/webp": "webp", "video/mp4": "mp4", "video/webm": "webm",
    "audio/mpeg": "mp3", "audio/ogg": "ogg", "audio/mp4": "m4a",
    "application/pdf": "pdf",
  }
  return map[mime.split(";")[0].trim().toLowerCase()] ?? "bin"
}

const isImage = (mime: string, url: string): boolean =>
  /^image\//i.test(mime) || /\.(jpe?g|png|webp|gif)([\?#]|$)/i.test(url)

type Input =
  | { kind: "url"; url: string }
  | { kind: "buffer"; buffer: Buffer; mime: string; filename: string }

const resolve = async (mctx: types.MessageContext, argsText: string): Promise<Input | null> => {
  const url =
    findFirstUrl(argsText) ||
    findFirstUrl(mctx.quoted?.message?.text || "") ||
    findFirstUrl(mctx.message.text || "")

  if (url) return { kind: "url", url }

  const source = mctx.quoted?.download ? mctx.quoted : mctx.download ? mctx : null
  if (!source?.download) return null

  const buffer = await source.download().buffer()
  if (!buffer?.length) throw new Error("No se pudo descargar el archivo.")

  const mime = source.message?.mimetype || "application/octet-stream"
  const filename = `upload.${mimeToExt(mime)}`
  return { kind: "buffer", buffer, mime, filename }
}

const tryUpload = async (inp: Input): Promise<string> => {
  const errors: string[] = []

  if (inp.kind === "url") {
    try {
      const data = await dvyerImgBB(inp.url)
      const d = data as any
      const url = d.display_url || d.direct_url || d.url || dvyerMediaUrl(data)
      if (url && /^https?:\/\//i.test(url)) return url
    } catch (e) {
      errors.push(`dvyer-imgbb: ${e instanceof Error ? e.message : e}`)
    }

    try {
      const data = await evogbUpload(inp.url, "auto", "url")
      const url = evogbMediaUrl(data)
      if (url && /^https?:\/\//i.test(url)) return url
    } catch (e) {
      errors.push(`evogb: ${e instanceof Error ? e.message : e}`)
    }

    try {
      const res = await fetch(inp.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buffer = Buffer.from(await res.arrayBuffer())
      const mime = res.headers.get("content-type") || "application/octet-stream"
      const filename = `upload.${mimeToExt(mime)}`
      return await tryUploadBuffer(buffer, mime, filename, errors)
    } catch (e) {
      errors.push(`fetch-url: ${e instanceof Error ? e.message : e}`)
    }
  } else {
    if (isImage(inp.mime, inp.filename)) {
      try {
        const dataUrl = toDataUrl(inp.buffer, inp.mime)
        const data = await dvyerImgBB(dataUrl)
        const d = data as any
        const url = d.display_url || d.direct_url || d.url || dvyerMediaUrl(data)
        if (url && /^https?:\/\//i.test(url)) return url
      } catch (e) {
        errors.push(`dvyer-imgbb: ${e instanceof Error ? e.message : e}`)
      }
    }

    return await tryUploadBuffer(inp.buffer, inp.mime, inp.filename, errors)
  }

  throw new Error(errors.join(" | "))
}

const tryUploadBuffer = async (buffer: Buffer, mime: string, filename: string, errors: string[]): Promise<string> => {
  try {
    const dataUrl = toDataUrl(buffer, mime)
    const data = await evogbUpload(dataUrl, "auto", "base64")
    const url = evogbMediaUrl(data)
    if (url && /^https?:\/\//i.test(url)) return url
  } catch (e) {
    errors.push(`evogb: ${e instanceof Error ? e.message : e}`)
  }

  try {
    return await uploadQuAx(buffer, filename)
  } catch (e) {
    errors.push(`qu.ax: ${e instanceof Error ? e.message : e}`)
  }

  try {
    return await uploadCatbox(buffer, filename)
  } catch (e) {
    errors.push(`catbox: ${e instanceof Error ? e.message : e}`)
  }

  throw new Error(errors.join(" | "))
}

export default {
  name: "tourl",
  alias: ["url", "upload", "subir"],
  description: "Sube archivos y devuelve una URL directa.",
  category: "downloaders",
  using: "<url | responder archivo>",
  flags: ["all.chats"],
  requires: [],
  hidden: false,

  execute: async (_wss, { mctx, args }) => {
    let inp: Input | null = null

    try {
      inp = await resolve(mctx, args.join(" ").trim())
    } catch (e) {
      await mctx.react("❌")
      await mctx.reply(`「✖」 ${e instanceof Error ? e.message : "No se pudo leer el archivo."}`)
      return
    }

    if (!inp) {
      await mctx.react("⚠️")
      await mctx.reply("「⚠」 Responde a una imagen/video/audio/documento o envía una URL.")
      return
    }

    await mctx.react("⏳")

    try {
      const url = await tryUpload(inp)
      await mctx.reply(`「◈」 *URL generada*\n✦ Link › ${url}`)
      await mctx.react("✅")
    } catch (e) {
      console.error("[tourl] Todos los servicios fallaron:", e instanceof Error ? e.message : e)
      await mctx.react("❌")
      await mctx.reply("「✖」 No se pudo subir el archivo. Todos los servicios fallaron.")
    }
  },
} as types.Command
        
