import * as baileys from "baileys"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import fsp from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createRequire } from "node:module"
import type * as types from "../types/types.js"

const NEKOS_BEST_BASE_URL = "https://nekos.best/api/v2"
const USER_AGENT = "zeta-ts/1.0 (https://github.com/lucashokage/zeta-ts)"
const IMAGE_CATEGORIES = new Set(["husbando", "kitsune", "neko", "waifu"])
const require = createRequire(import.meta.url)

type CaptionBuilder = (actorName: string, targetName?: string) => string

type AnimeReactionOptions = {
  category: string
  selfCaption: CaptionBuilder
  targetCaption?: CaptionBuilder
}

type ParticipantLike = {
  id?: string
  jid?: string
  lid?: string
  phoneNumber?: string
  name?: string
  notify?: string
  verifiedName?: string
  pushName?: string
}

const normalizeJid = (jid?: string | null): string => {
  if (!jid) return ""
  try {
    return baileys.jidNormalizedUser(jid)
  } catch {
    return String(jid)
  }
}

const jidNumber = (jid?: string | null): string =>
  String(jid || "")
    .split(":")[0]
    .split("@")[0]
    .replace(/[^0-9]/g, "")

const sameJid = (a?: string | null, b?: string | null): boolean => {
  const na = normalizeJid(a)
  const nb = normalizeJid(b)
  if (!na || !nb) return false

  const an = jidNumber(na)
  const bn = jidNumber(nb)

  return na === nb || Boolean(an && bn && an === bn)
}

const mentionFromJid = (jid?: string | null): string => {
  const user = jidNumber(normalizeJid(jid)) || normalizeJid(jid).split("@")[0]
  return user ? `@${user}` : ""
}

const cleanNick = (name?: string | null, fallback = ""): string => {
  const value = String(name || "")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim()

  if (!value || value === "~") return fallback
  if (/^(usuario|user|unknown|desconocido)$/i.test(value)) return fallback
  if (/^@?\d{5,}($|\D)/.test(value)) return fallback
  if (/@(s\.whatsapp\.net|lid|g\.us)$/i.test(value)) return fallback

  return value
}

const getParticipantJids = (participant?: ParticipantLike | null): string[] => {
  const values = [participant?.id, participant?.jid, participant?.lid, participant?.phoneNumber]
  return Array.from(new Set(values.map((v) => normalizeJid(v)).filter(Boolean)))
}

const findParticipant = (
  groupMetadata: types.CommandExecuteContext["groupMetadata"] | null | undefined,
  jid?: string | null,
): ParticipantLike | null => {
  if (!jid || !groupMetadata?.participants?.length) return null

  const target = normalizeJid(jid)
  return (
    (groupMetadata.participants as ParticipantLike[]).find((participant) =>
      getParticipantJids(participant).some((candidate) => sameJid(candidate, target)),
    ) || null
  )
}

const getParticipantNick = (
  groupMetadata: types.CommandExecuteContext["groupMetadata"] | null | undefined,
  jid: string,
): string | null => {
  const participant = findParticipant(groupMetadata, jid)
  return cleanNick(participant?.name || participant?.notify || participant?.verifiedName || participant?.pushName, "") || null
}

const getBestMentionJid = (
  groupMetadata: types.CommandExecuteContext["groupMetadata"] | null | undefined,
  jid?: string | null,
): string => {
  const normalized = normalizeJid(jid)
  const participant = findParticipant(groupMetadata, normalized)
  const candidates = getParticipantJids(participant)


  const lid = candidates.find((candidate) => candidate.endsWith("@lid"))
  const pn = candidates.find((candidate) => candidate.endsWith("@s.whatsapp.net"))

  return lid || normalized || pn || ""
}

const getWhatsAppNick = async (
  wss: types.WASocket,
  ectx: types.CommandExecuteContext,
  jid: string,
): Promise<string> => {
  const { mctx, groupMetadata } = ectx
  const mention = mentionFromJid(jid)

  if (sameJid(jid, mctx.sender.jid)) {
    return cleanNick(mctx.sender.name || ectx.user?.name, mention) || mention
  }

  if (sameJid(jid, mctx.me.jids.lid) || sameJid(jid, mctx.me.jids.pn)) {
    return cleanNick(mctx.me.name, "Bot") || "Bot"
  }

  if (mctx.quoted && sameJid(jid, mctx.quoted.sender.jid)) {
    return cleanNick(mctx.quoted.sender.name, mention) || mention
  }

  const groupNick = getParticipantNick(groupMetadata, jid)
  if (groupNick) return groupNick

  const participant = findParticipant(groupMetadata, jid)
  for (const candidate of [jid, ...getParticipantJids(participant)]) {
    const socketName = await wss.getName(candidate).catch(() => "")
    const cleanSocketName = cleanNick(socketName, "")
    if (cleanSocketName) return cleanSocketName
  }

  return mention || "@0"
}

const getTargetJid = (mctx: types.MessageContext): string | null => {
  const mentioned = [...(mctx.message.mentioned || []), ...(mctx.message.mentionedJid || [])].find(Boolean)
  if (mentioned) return normalizeJid(mentioned)

  if (mctx.quoted?.sender?.jid) return normalizeJid(mctx.quoted.sender.jid)

  const quotedSender = (mctx.message as any)?.quoted?.sender
  if (quotedSender) return normalizeJid(quotedSender)

  return null
}

const getNekosBestUrl = async (category: string): Promise<string> => {
  const response = await fetch(`${NEKOS_BEST_BASE_URL}/${category}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  })

  if (!response.ok) throw new Error(`Nekos.best ${category} respondió ${response.status}`)

  const data = (await response.json()) as { results?: Array<{ url?: string }> }
  const url = data.results?.[0]?.url
  if (!url) throw new Error(`Nekos.best no devolvió URL para ${category}`)

  return url
}

const getFfmpegPath = (): string => {
  try {
    return require("ffmpeg-static") || "ffmpeg"
  } catch {
    return "ffmpeg"
  }
}

const runFfmpeg = (args: string[]): Promise<void> => {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(getFfmpegPath(), args, { stdio: ["ignore", "ignore", "pipe"] })
    let stderr = ""

    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })

    ffmpeg.on("error", reject)
    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr || `ffmpeg terminó con código ${code}`))
    })
  })
}

const gifUrlToMp4Buffer = async (url: string): Promise<Buffer> => {
  const id = randomUUID()
  const input = path.join(os.tmpdir(), `zeta-anime-${id}.gif`)
  const output = path.join(os.tmpdir(), `zeta-anime-${id}.mp4`)

  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } })
    if (!response.ok) throw new Error(`No se pudo descargar GIF: ${response.status}`)

    await fsp.writeFile(input, Buffer.from(await response.arrayBuffer()))
    await runFfmpeg([
      "-y",
      "-i",
      input,
      "-movflags",
      "+faststart",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      output,
    ])

    return await fsp.readFile(output)
  } finally {
    await Promise.allSettled([fsp.rm(input, { force: true }), fsp.rm(output, { force: true })])
  }
}

const getVideoPayload = async (url: string): Promise<Buffer | { url: string }> => {
  const cleanUrl = url.split("?")[0].toLowerCase()
  if (!cleanUrl.endsWith(".gif")) return { url }

  try {
    return await gifUrlToMp4Buffer(url)
  } catch (error) {
    console.error("[Anime] No se pudo convertir GIF a MP4, se enviará la URL directa:", error)
    return { url }
  }
}

export const sendAnimeReaction = async (
  wss: types.WASocket,
  ectx: types.CommandExecuteContext,
  options: AnimeReactionOptions,
): Promise<void> => {
  const { mctx, groupMetadata } = ectx
  const targetJid = options.targetCaption ? getTargetJid(mctx) : null
  const actorMentionJid = getBestMentionJid(groupMetadata, mctx.sender.jid)
  const targetMentionJid = targetJid ? getBestMentionJid(groupMetadata, targetJid) : null
  const actorName = await getWhatsAppNick(wss, ectx, actorMentionJid || mctx.sender.jid)
  const targetName = targetMentionJid ? await getWhatsAppNick(wss, ectx, targetMentionJid) : undefined
  const caption = targetMentionJid && targetName
    ? options.targetCaption?.(actorName, targetName) || options.selfCaption(actorName)
    : options.selfCaption(actorName)
  const mentions = Array.from(
    new Set([actorMentionJid || mctx.sender.jid, ...(targetMentionJid ? [targetMentionJid] : [])].filter(Boolean)),
  )

  try {
    const url = await getNekosBestUrl(options.category)
    const isImage = IMAGE_CATEGORIES.has(options.category) || /\.(png|jpe?g|webp)$/i.test(url.split("?")[0])
    const quoted = mctx.message.original as baileys.WAMessage

    if (isImage) {
      await wss.sendMessage(
        mctx.chat.jid,
        { image: { url }, caption, mentions } as any,
        { quoted },
      )
      return
    }

    await wss.sendMessage(
      mctx.chat.jid,
      { video: await getVideoPayload(url), mimetype: "video/mp4", caption, mentions, gifPlayback: true } as any,
      { quoted },
    )
  } catch (error) {
    console.error(`[Anime:${options.category}]`, error)
    await mctx.reply(`*｢❌｣* Error al enviar la reacción ${options.category}. Inténtalo otra vez.`)
  }
}
