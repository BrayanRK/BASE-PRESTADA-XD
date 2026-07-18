import { randomUUID } from "node:crypto"
import { spawn } from "node:child_process"
import { promises as fsPromises } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import { getConnection } from "../database/connect.js"
import type * as types from "../types/types.js"
import { downloadMediaBuffer } from "./media.js"

const require = createRequire(import.meta.url)
const ffmpegStatic = require("ffmpeg-static") as string | null
const ffmpegBin = ffmpegStatic || "ffmpeg"

type StickerMeta = {
  packname: string
  author: string
}

type ParsedStickerArgs = {
  url?: string
  packname?: string
  author?: string
}

const MAX_META_LENGTH = 80

const normalizeMeta = (value: unknown, fallback: string): string => {
  const normalized = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  return (normalized || fallback).slice(0, MAX_META_LENGTH)
}

const sqliteRun = (sql: string, params: unknown[] = []): Promise<void> => {
  return new Promise((resolve, reject) => {
    getConnection().run(sql, params, (err) => (err ? reject(err) : resolve()))
  })
}

const sqliteGet = <T = any>(sql: string, params: unknown[] = []): Promise<T | undefined> => {
  return new Promise((resolve, reject) => {
    getConnection().get(sql, params, (err, row: T) => (err ? reject(err) : resolve(row)))
  })
}

let stickerMetaColumnsReady: Promise<void> | null = null

export const ensureStickerMetaColumns = async (): Promise<void> => {
  if (!stickerMetaColumnsReady) {
    stickerMetaColumnsReady = (async () => {
      await sqliteRun("ALTER TABLE users ADD COLUMN sticker_pack TEXT DEFAULT NULL").catch(() => {})
      await sqliteRun("ALTER TABLE users ADD COLUMN sticker_author TEXT DEFAULT NULL").catch(() => {})
    })()
  }
  return stickerMetaColumnsReady
}

export const getSenderNick = (mctx: types.MessageContext, user?: Partial<types.UserDocument>): string => {
  return normalizeMeta(mctx.sender.name && mctx.sender.name !== "~" ? mctx.sender.name : user?.name, "Usuario")
}

export const getDefaultStickerMeta = (
  mctx: types.MessageContext,
  bot: Partial<types.BotDocument>,
  user?: Partial<types.UserDocument>,
): StickerMeta => {
  return {
    packname: normalizeMeta(bot.name, "ZETA BASE"),
    author: getSenderNick(mctx, user),
  }
}

export const getSavedStickerMeta = async (
  jid: string,
  fallback: StickerMeta,
): Promise<StickerMeta> => {
  await ensureStickerMetaColumns()

  const row = await sqliteGet<{ sticker_pack?: string | null; sticker_author?: string | null }>(
    "SELECT sticker_pack, sticker_author FROM users WHERE user_jid = ?",
    [jid],
  ).catch(() => undefined)

  return {
    packname: normalizeMeta(row?.sticker_pack, fallback.packname),
    author: normalizeMeta(row?.sticker_author, fallback.author),
  }
}

export const saveStickerMeta = async (
  jid: string,
  name: string,
  packname: string,
  author: string,
): Promise<StickerMeta> => {
  await ensureStickerMetaColumns()

  const meta = {
    packname: normalizeMeta(packname, "ZETA BOT"),
    author: normalizeMeta(author, "Usuario"),
  }

  await sqliteRun(
    `INSERT INTO users (user_jid, name, sticker_pack, sticker_author)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_jid) DO UPDATE SET
       name = COALESCE(NULLIF(excluded.name, ''), users.name),
       sticker_pack = excluded.sticker_pack,
       sticker_author = excluded.sticker_author,
       updated_at = CURRENT_TIMESTAMP`,
    [jid, normalizeMeta(name, "Usuario"), meta.packname, meta.author],
  )

  return meta
}

export const parseStickerArgs = (args: string[]): ParsedStickerArgs => {
  const text = args.join(" ").trim()
  if (!text) return {}

  const urlMatch = text.match(/https?:\/\/\S+/i)
  const url = urlMatch?.[0]
  const metaText = (url ? text.replace(url, "") : text).trim()

  if (!metaText) return { url }

  const [packRaw, ...authorParts] = metaText.split("|")
  const authorRaw = authorParts.join("|")

  return {
    url,
    packname: packRaw.trim() || undefined,
    author: authorRaw.trim() || undefined,
  }
}

export const mergeStickerMeta = (base: StickerMeta, parsed: ParsedStickerArgs): StickerMeta => {
  return {
    packname: normalizeMeta(parsed.packname, base.packname),
    author: normalizeMeta(parsed.author, base.author),
  }
}

export const isStickerMedia = (mime: string): boolean => {
  const cleanMime = String(mime || "").toLowerCase()

  return (
    cleanMime.startsWith("image/") ||
    cleanMime.startsWith("video/") ||
    cleanMime.includes("webp") ||
    cleanMime.includes("gif") ||
    cleanMime.includes("octet-stream")
  )
}

const isWebpBuffer = (buffer: Buffer): boolean => {
  return buffer.length > 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP"
}

const isGifBuffer = (buffer: Buffer): boolean => {
  return buffer.length > 6 && buffer.subarray(0, 3).toString("ascii") === "GIF"
}

const isMp4Buffer = (buffer: Buffer): boolean => {
  return buffer.length > 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp"
}

const isWebmBuffer = (buffer: Buffer): boolean => {
  return buffer.length > 4 && buffer.subarray(0, 4).toString("hex") === "1a45dfa3"
}

const isAnimatedSource = (buffer: Buffer): boolean => {
  return isGifBuffer(buffer) || isMp4Buffer(buffer) || isWebmBuffer(buffer)
}

const convertAnimatedToWebp = async (buffer: Buffer, ext: string): Promise<Buffer> => {
  const id = `${Date.now()}-${randomUUID()}`
  const dir = path.join(tmpdir(), `zeta-stk-${id}`)
  await fsPromises.mkdir(dir, { recursive: true })

  const inputPath = path.join(dir, `input.${ext}`)
  const outputPath = path.join(dir, "output.webp")

  const cleanup = async () => {
    await fsPromises.rm(dir, { recursive: true, force: true }).catch(() => {})
  }

  try {
    await fsPromises.writeFile(inputPath, buffer)

    await new Promise<void>((resolve, reject) => {
      const child = spawn(ffmpegBin, [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        inputPath,
        "-t",
        "10",
        "-vf",
        "fps=12,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=00000000",
        "-c:v",
        "libwebp",
        "-lossless",
        "0",
        "-q:v",
        "60",
        "-compression_level",
        "6",
        "-loop",
        "0",
        "-preset",
        "default",
        "-an",
        "-vsync",
        "0",
        outputPath,
      ])

      let errorText = ""
      child.stderr.on("data", (chunk) => {
        errorText += chunk.toString()
      })
      child.on("error", reject)
      child.on("close", (code) => {
        if (code !== 0) return reject(new Error(errorText || `ffmpeg terminó con código ${code}`))
        resolve()
      })
    })

    const data = await fsPromises.readFile(outputPath)
    if (!data.length) throw new Error("ffmpeg no generó el sticker animado.")
    return data
  } finally {
    await cleanup()
  }
}

const guessAnimatedExt = (buffer: Buffer): string => {
  if (isGifBuffer(buffer)) return "gif"
  if (isMp4Buffer(buffer)) return "mp4"
  if (isWebmBuffer(buffer)) return "webm"
  return "mp4"
}

const buildStickerExif = (meta: StickerMeta): Buffer => {
  const json = Buffer.from(
    JSON.stringify({
      "sticker-pack-id": `zeta-ts-${randomUUID()}`,
      "sticker-pack-name": meta.packname,
      "sticker-pack-publisher": meta.author,
      emojis: ["🤖"],
      "android-app-store-link": "",
      "ios-app-store-link": "",
    }),
    "utf-8",
  )

  const header = Buffer.from([
    0x49, 0x49, 0x2a, 0x00,
    0x08, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x41, 0x57,
    0x07, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x16, 0x00,
    0x00, 0x00,
  ])

  header.writeUIntLE(json.length, 14, 4)
  return Buffer.concat([header, json])
}

const applyStickerMetaToWebp = async (buffer: Buffer, meta: StickerMeta): Promise<Buffer> => {
  const webpmux: any = await import("node-webpmux")
  const WebpImage = webpmux.Image ?? webpmux.default?.Image

  if (!WebpImage) throw new Error("No pude cargar node-webpmux para aplicar el pack.")

  const image = new WebpImage()
  await image.load(buffer)
  image.exif = buildStickerExif(meta)

  return image.save(null)
}

export const downloadStickerBuffer = async (mctx: types.MessageContext, url?: string): Promise<Buffer> => {
  if (url) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 ZetaTS/StickerMaker",
      },
    })

    if (!response.ok) {
      throw new Error(`No pude descargar la URL (${response.status}).`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    if (!buffer.length) throw new Error("La URL descargó vacío.")
    return buffer
  }

  return downloadMediaBuffer(mctx, "archivo")
}

export const createSticker = async (buffer: Buffer, meta: StickerMeta): Promise<Buffer> => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error("El archivo llegó vacío.")
  }

  if (isWebpBuffer(buffer)) {
    return applyStickerMetaToWebp(buffer, meta)
  }

  if (isAnimatedSource(buffer)) {
    try {
      const webp = await convertAnimatedToWebp(buffer, guessAnimatedExt(buffer))
      return applyStickerMetaToWebp(webp, meta)
    } catch (error) {
      console.error(
        "[Sticker] Conversión directa con ffmpeg falló, usando wa-sticker-formatter como respaldo:",
        error instanceof Error ? error.message : error,
      )
    }
  }

  const stickerPkg: any = await import("wa-sticker-formatter")
  const Sticker = stickerPkg.Sticker ?? stickerPkg.default?.Sticker
  const StickerTypes = stickerPkg.StickerTypes ?? stickerPkg.default?.StickerTypes

  if (!Sticker) throw new Error("No pude cargar wa-sticker-formatter.")

  const sticker = new Sticker(buffer, {
    pack: meta.packname,
    author: meta.author,
    type: StickerTypes?.FULL || "full",
    quality: 100,
    background: "transparent",
    categories: ["🤖"],
  })

  const webp = await sticker.toBuffer()
  return isWebpBuffer(webp) ? applyStickerMetaToWebp(webp, meta) : webp
}

export const getStickerUsage = (prefix = "/"): string => {
  return `*｢✧｣* Responde a una imagen, video, GIF o sticker.`
}
