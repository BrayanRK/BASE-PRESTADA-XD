import type * as types from "../types/types.js"
import { freeFireHeader, mentionTag, parseTimeInput, shuffle, type FreeFireCommandContext } from "./freefire.js"

export type FreeFireVsMode = {
  raw: string
  teamSize: number
  label: string
}

type InscripcionSession = {
  groupJid: string
  chatName: string
  messageId: string
  mode: FreeFireVsMode
  required: number
  rawTime: string
  organizerJid: string
  participants: Map<string, true>
  finished: boolean
  timeout: ReturnType<typeof setTimeout>
}

const sessions = new Map<string, InscripcionSession>()
const INSCRIPCION_TTL_MS = 10 * 60 * 1000
const MAX_TEAM_SIZE = 24

export const parseVsMode = (raw: string): FreeFireVsMode | null => {
  const input = String(raw || "").trim().toLowerCase().replace(/\s+/g, "")
  const match = input.match(/^(\d{1,2})(?:vs|v|x)(\d{1,2})$/)
  if (!match) return null

  const a = Number(match[1])
  const b = Number(match[2])
  if (!Number.isFinite(a) || !Number.isFinite(b) || a !== b) return null
  if (a < 1 || a > MAX_TEAM_SIZE) return null

  return { raw: `${a}vs${a}`, teamSize: a, label: `${a} vs ${a}` }
}

const formatTime = (rawTime: string): string => parseTimeInput(rawTime)?.normalized || rawTime

const renderInscritos = (session: InscripcionSession): string => {
  if (!session.participants.size) return "╎ sin inscritos aún"
  return Array.from(session.participants.keys())
    .map((jid, index) => `╎ ${index + 1}. ${mentionTag(jid)}`)
    .join("\n")
}

const buildInscripcionText = (session: InscripcionSession): string => {
  let text = freeFireHeader("Inscripción Free Fire", [
    `Modalidad 》 ${session.mode.label}`,
    `Grupo 》 ${session.chatName || "grupo"}`,
    `Hora 》 ${formatTime(session.rawTime)}`,
    `Organizador 》 ${mentionTag(session.organizerJid)}`,
  ])

  text += `\n\n⟡ Cómo participar\n╎ Responde a este mensaje para anotarte.`
  text += `\n\n⟡ Inscritos (${session.participants.size}/${session.required})\n${renderInscritos(session)}`

  return text
}

const buildResultText = (session: InscripcionSession): { text: string; mentions: string[] } => {
  const picked = shuffle(Array.from(session.participants.keys()))
  const size = session.mode.teamSize
  const teamA = picked.slice(0, size)
  const teamB = picked.slice(size, size * 2)

  let text = freeFireHeader("Free Fire armado", [
    `Modalidad 》 ${session.mode.label}`,
    `Grupo 》 ${session.chatName || "grupo"}`,
    `Hora 》 ${formatTime(session.rawTime)}`,
  ])

  text += `\n\n「◈」 Escuadra 1\n${teamA.map((jid) => `╎ ⚔️ ${mentionTag(jid)}`).join("\n")}`
  text += `\n\n「◈」 Escuadra 2\n${teamB.map((jid) => `╎ ⚔️ ${mentionTag(jid)}`).join("\n")}`
  text += `\n\n╎ Organizado por 》 ${mentionTag(session.organizerJid)}`

  return { text, mentions: Array.from(new Set([...teamA, ...teamB, session.organizerJid])) }
}

const clearSessionTimer = (groupJid: string): void => {
  const session = sessions.get(groupJid)
  if (!session) return
  clearTimeout(session.timeout)
  sessions.delete(groupJid)
}

const expireSession = async (wss: types.WASocket, groupJid: string): Promise<void> => {
  const session = sessions.get(groupJid)
  if (!session || session.finished) return
  session.finished = true
  clearSessionTimer(groupJid)

  const text =
    freeFireHeader("Inscripción cancelada", [
      `Modalidad 》 ${session.mode.label}`,
      `Cupos alcanzados 》 ${session.participants.size}/${session.required}`,
    ]) + `\n\n╎ No se llenaron los cupos a tiempo.`

  await wss
    .sendMessage(groupJid, {
      text,
      edit: { remoteJid: groupJid, id: session.messageId, fromMe: true },
    })
    .catch(() => {})
}

const finalizeSession = async (wss: types.WASocket, session: InscripcionSession): Promise<void> => {
  session.finished = true
  clearSessionTimer(session.groupJid)

  const { text, mentions } = buildResultText(session)
  await wss.sendMessage(session.groupJid, { text, mentions }).catch(() => {})
}

const addParticipant = async (wss: types.WASocket, session: InscripcionSession, jid: string): Promise<boolean> => {
  if (session.finished) return false
  if (session.participants.has(jid)) return false

  session.participants.set(jid, true)

  const text = buildInscripcionText(session)
  await wss
    .sendMessage(session.groupJid, {
      text,
      mentions: Array.from(session.participants.keys()),
      edit: { remoteJid: session.groupJid, id: session.messageId, fromMe: true },
    })
    .catch(() => {})

  if (session.participants.size >= session.required) await finalizeSession(wss, session)

  return true
}

export const hasActiveInscripcion = (groupJid: string): boolean => sessions.has(groupJid)

export const startInscripcion = async (
  wss: types.WASocket,
  ctx: FreeFireCommandContext,
  mode: FreeFireVsMode,
  rawTime: string,
): Promise<void> => {
  const groupJid = ctx.mctx.chat.jid

  if (sessions.has(groupJid)) {
    const active = sessions.get(groupJid)!
    await ctx.mctx.reply(
      freeFireHeader("Ya hay una inscripción activa", [`Modalidad 》 ${active.mode.label}`]) +
        `\n\n╎ Espera a que se complete o se cancele antes de abrir otra.`,
    )
    return
  }

  const required = mode.teamSize * 2
  const organizerJid = ctx.mctx.sender.jid
  const chatName = ctx.mctx.chat.name || "grupo"

  const placeholder =
    freeFireHeader("Inscripción Free Fire", [
      `Modalidad 》 ${mode.label}`,
      `Grupo 》 ${chatName}`,
      `Hora 》 ${formatTime(rawTime)}`,
      `Organizador 》 ${mentionTag(organizerJid)}`,
    ]) +
    `\n\n⟡ Cómo participar\n╎ Responde a este mensaje para anotarte.` +
    `\n\n⟡ Inscritos (0/${required})\n╎ sin inscritos aún`

  const sent = await wss.sendMessage(
    groupJid,
    { text: placeholder, mentions: [organizerJid] },
    { quoted: ctx.mctx.message.original },
  )

  const messageId = sent?.key?.id
  if (!messageId) {
    await ctx.mctx.reply("⚠ No se pudo iniciar la inscripción, intenta de nuevo.")
    return
  }

  sessions.set(groupJid, {
    groupJid,
    chatName,
    messageId,
    mode,
    required,
    rawTime,
    organizerJid,
    participants: new Map(),
    finished: false,
    timeout: setTimeout(() => {
      expireSession(wss, groupJid).catch(() => {})
    }, INSCRIPCION_TTL_MS),
  })
}

export const handleInscripcionReply = async (wss: types.WASocket, mctx: types.MessageContext): Promise<void> => {
  if (!sessions.size) return
  if (!mctx.is_group || mctx.message.from_me) return

  const session = sessions.get(mctx.chat.jid)
  if (!session || session.finished) return

  const quotedId = mctx.quoted?.message?.id
  if (!quotedId || quotedId !== session.messageId) return

  const jid = mctx.sender.jid
  if (session.participants.has(jid)) {
    await mctx.react("🔁").catch(() => {})
    return
  }

  const added = await addParticipant(wss, session, jid)
  if (added) await mctx.react("✅").catch(() => {})
}
