import { spawn } from "node:child_process"
import { promises as fs, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const ffmpegStatic = require("ffmpeg-static") as string | null

const ffmpegBin = ffmpegStatic || "ffmpeg"

const TMP_PREFIX = "zeta-"

type FfmpegResult = {
  data: Buffer
  filename: string
}

const ensureExt = (ext?: string): string => {
  const clean = String(ext || "bin").replace(/^\./, "").trim().toLowerCase()
  return clean || "bin"
}

const assertBuffer = (buffer: Buffer): void => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error("El archivo descargado llegó vacío o inválido.")
  }
}

export const cleanTmpFiles = (): void => {
  try {
    const dir = tmpdir()
    const files = readdirSync(dir).filter((f) => f.startsWith(TMP_PREFIX))
    for (const f of files) {
      try {
        rmSync(path.join(dir, f), { force: true })
      } catch {}
    }
    if (files.length > 0) {
      console.log(`[converter] Limpiados ${files.length} temporales huérfanos de /tmp`)
    }
  } catch {}
}

cleanTmpFiles()

const runFfmpeg = async (
  buffer: Buffer,
  beforeInputArgs: string[] = [],
  afterInputArgs: string[] = [],
  ext = "bin",
  ext2 = "bin",
): Promise<FfmpegResult> => {
  assertBuffer(buffer)

  const inputExt = ensureExt(ext)
  const outputExt = ensureExt(ext2)
  const id = `${Date.now()}-${randomUUID()}`
  const tmpInput = path.join(tmpdir(), `${TMP_PREFIX}${id}.${inputExt}`)
  const tmpOutput = path.join(tmpdir(), `${TMP_PREFIX}${id}.${outputExt}`)

  const cleanup = async () => {
    await fs.rm(tmpInput, { force: true }).catch(() => {})
    await fs.rm(tmpOutput, { force: true }).catch(() => {})
  }

  await fs.writeFile(tmpInput, buffer)

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBin, [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      ...beforeInputArgs,
      "-i",
      tmpInput,
      ...afterInputArgs,
      tmpOutput,
    ])

    let errorText = ""

    child.stderr.on("data", (chunk) => {
      errorText += chunk.toString()
    })

    child.on("error", async (error) => {
      await cleanup()
      reject(error)
    })

    child.on("close", async (code) => {
      try {
        await fs.rm(tmpInput, { force: true }).catch(() => {})

        if (code !== 0) {
          await fs.rm(tmpOutput, { force: true }).catch(() => {})
          return reject(new Error(errorText || `ffmpeg terminó con código ${code}`))
        }

        const data = await fs.readFile(tmpOutput)
        await fs.rm(tmpOutput, { force: true }).catch(() => {})

        if (!data.length) {
          return reject(new Error("ffmpeg no generó salida."))
        }

        resolve({ data, filename: tmpOutput })
      } catch (error) {
        await cleanup()
        reject(error)
      }
    })
  })
}

export const ffmpeg = async (
  buffer: Buffer,
  args: string[] = [],
  ext = "bin",
  ext2 = "bin",
): Promise<FfmpegResult> => {
  return runFfmpeg(buffer, [], args, ext, ext2)
}

export const ffmpegWithInputArgs = async (
  buffer: Buffer,
  inputArgs: string[] = [],
  outputArgs: string[] = [],
  ext = "bin",
  ext2 = "bin",
): Promise<FfmpegResult> => {
  return runFfmpeg(buffer, inputArgs, outputArgs, ext, ext2)
}

export const mimeToExt = (mime?: string): string => {
  const clean = String(mime || "").toLowerCase()

  if (clean.includes("webp")) return "webp"
  if (clean.includes("png")) return "png"
  if (clean.includes("jpg") || clean.includes("jpeg")) return "jpg"
  if (clean.includes("gif")) return "gif"
  if (clean.includes("mp4")) return "mp4"
  if (clean.includes("mpeg") || clean.includes("mp3")) return "mp3"
  if (clean.includes("ogg") || clean.includes("opus")) return "ogg"
  if (clean.includes("wav")) return "wav"
  if (clean.includes("m4a")) return "m4a"
  if (clean.includes("webm")) return "webm"

  return "bin"
}

export const toPTT = async (buffer: Buffer, ext = "mp4"): Promise<Buffer> => {
  const out = await ffmpeg(
    buffer,
    [
      "-vn",
      "-c:a",
      "libopus",
      "-b:a",
      "128k",
      "-vbr",
      "on",
      "-compression_level",
      "10",
    ],
    ext,
    "ogg",
  )

  return out.data
}

export const toAudio = async (buffer: Buffer, ext = "mp4"): Promise<Buffer> => {
  const out = await ffmpeg(
    buffer,
    [
      "-vn",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      "-ar",
      "44100",
      "-map_metadata",
      "-1",
      "-f",
      "mp3",
    ],
    ext,
    "mp3",
  )

  return out.data
}

export const toVideo = async (buffer: Buffer, ext = "webp"): Promise<Buffer> => {
  const out = await ffmpeg(
    buffer,
    [
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-vf",
      "fps=15,scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-an",
    ],
    ext,
    "mp4",
  )

  return out.data
}
