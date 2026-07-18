import type * as baileys from "baileys"
import type * as types from "../types/types.js"

const clean = (value: unknown): string => String(value ?? "").replace(/\s+/g, " ").trim()
const stripDevice = (jid?: unknown): string => clean(jid).split(":")[0].toLowerCase()

const isRawUserJid = (value?: unknown): boolean => /@(lid|s\.whatsapp\.net)$/i.test(stripDevice(value))
const isLidJid = (value?: unknown): boolean => /@lid$/i.test(stripDevice(value))
const isPhoneJid = (value?: unknown): boolean => /@s\.whatsapp\.net$/i.test(stripDevice(value))

export const jidDigits = (value?: unknown): string => stripDevice(value).split("@")[0].replace(/[^0-9]/g, "")

export const isValidPhoneNumber = (digits?: unknown): boolean => /^\d{8,15}$/.test(String(digits || ""))

export const normalizeUserJid = (value?: unknown): string => {
  const raw = stripDevice(value)
  if (!raw) return ""
  if (isRawUserJid(raw)) return raw

  const digits = jidDigits(raw)
  return isValidPhoneNumber(digits) ? `${digits}@s.whatsapp.net` : ""
}

export const extractPhoneNumber = (text?: unknown): string => {
  const raw = clean(text)
  const match = raw.match(/\+?\d[\d\s().-]{7,20}\d/)
  const digits = (match?.[0] || "").replace(/\D/g, "")
  return isValidPhoneNumber(digits) ? digits : ""
}

const phoneDigitsFromValue = (value?: unknown): string => {
  const raw = stripDevice(value)
  if (!raw) return ""

  if (isPhoneJid(raw)) return jidDigits(raw)

  if (!raw.includes("@")) {
    const digits = jidDigits(raw)
    return isValidPhoneNumber(digits) ? digits : ""
  }

  return ""
}

const jidValuesFromParticipant = (participant: any): string[] => {
  const values: unknown[] = [
    participant?.id,
    participant?.jid,
    participant?.lid,
    participant?.pn,
    participant?.phoneNumber,
    participant?.phone,
    participant?.number,
  ]

  const out: string[] = []

  for (const value of values) {
    const raw = stripDevice(value)
    if (!raw) continue

    if (isRawUserJid(raw)) {
      out.push(raw)
      continue
    }

    const digits = jidDigits(raw)
    if (isValidPhoneNumber(digits)) out.push(`${digits}@s.whatsapp.net`)
  }

  return Array.from(new Set(out))
}

const participantMatchesTarget = (participant: any, target: string): boolean => {
  const values = jidValuesFromParticipant(participant)
  const targetJid = normalizeUserJid(target)
  const targetDigits = phoneDigitsFromValue(target)

  if (targetJid && values.includes(targetJid)) return true

  if (isLidJid(targetJid)) {
    return values.some((value) => isLidJid(value) && stripDevice(value) === targetJid)
  }

  if (targetDigits) {
    return values.some((value) => phoneDigitsFromValue(value) === targetDigits)
  }

  return false
}

const bestFromValues = (values: string[]) => {
  const cleanValues = Array.from(new Set(values.map((value) => stripDevice(value)).filter(Boolean)))
  const lidJid = cleanValues.find((value) => isLidJid(value)) || ""
  const phoneJid = cleanValues.find((value) => isPhoneJid(value)) || ""
  const phoneNumber = phoneDigitsFromValue(phoneJid)

  return {
    lidJid,
    phoneJid,
    phoneNumber,
    bestJid: lidJid || phoneJid || cleanValues[0] || "",
  }
}

export type LidResolutionSource =
  | "self"
  | "explicit-lid"
  | "group-participant"
  | "on-whatsapp"
  | "fallback-phone"
  | "not-found"

export type LidResolution = {
  ok: boolean
  exists: boolean
  input: string
  inputNumber: string
  lidJid: string
  phoneJid: string
  phoneNumber: string
  bestJid: string
  source: LidResolutionSource
  note: string
}

const emptyResolution = (input: string, note = "No se encontró información suficiente."): LidResolution => ({
  ok: false,
  exists: false,
  input,
  inputNumber: extractPhoneNumber(input) || phoneDigitsFromValue(input),
  lidJid: "",
  phoneJid: "",
  phoneNumber: "",
  bestJid: "",
  source: "not-found",
  note,
})

export const isTargetInGroupMetadata = (target: string, metadata?: baileys.GroupMetadata | null): boolean => {
  const participants = Array.isArray(metadata?.participants) ? metadata?.participants || [] : []
  if (!participants.length) return false
  return participants.some((item: any) => participantMatchesTarget(item, target))
}

const resolveFromGroupMetadata = (target: string, metadata?: baileys.GroupMetadata | null): LidResolution | null => {
  const participants = Array.isArray(metadata?.participants) ? metadata?.participants || [] : []
  if (!participants.length) return null

  const participant = participants.find((item: any) => participantMatchesTarget(item, target))
  if (!participant) return null

  const picked = bestFromValues(jidValuesFromParticipant(participant))
  if (!picked.bestJid) return null

  return {
    ok: Boolean(picked.lidJid || picked.phoneJid),
    exists: true,
    input: target,
    inputNumber: extractPhoneNumber(target) || phoneDigitsFromValue(target),
    lidJid: picked.lidJid,
    phoneJid: picked.phoneJid,
    phoneNumber: picked.phoneNumber,
    bestJid: picked.bestJid,
    source: "group-participant",
    note: picked.lidJid
      ? "LID detectado desde participantes del grupo."
      : "El usuario aparece en el grupo, pero WhatsApp no entregó LID en metadata.",
  }
}

const resolveWithOnWhatsApp = async (wss: types.WASocket, number: string): Promise<LidResolution | null> => {
  if (!isValidPhoneNumber(number)) return null

  try {
    const result = (await wss.onWhatsApp(number)) as Array<Record<string, unknown>>
    const item = result.find((value) => {
      return Boolean(value?.exists) && Boolean(value?.lid || value?.jid || value?.phoneNumber || value?.pn)
    })

    if (!item) return null

    const values = [item.lid, item.jid, item.phoneNumber, item.pn]
      .map((value: unknown) => {
        const raw = stripDevice(value)
        if (!raw) return ""

        if (isRawUserJid(raw)) return raw

        const digits = jidDigits(raw)
        return isValidPhoneNumber(digits) ? `${digits}@s.whatsapp.net` : ""
      })
      .filter((value): value is string => Boolean(value))

    const picked = bestFromValues(values.length ? values : [`${number}@s.whatsapp.net`])

    return {
      ok: Boolean(picked.lidJid || picked.phoneJid),
      exists: true,
      input: number,
      inputNumber: number,
      lidJid: picked.lidJid,
      phoneJid: picked.phoneJid || `${number}@s.whatsapp.net`,
      phoneNumber: picked.phoneNumber || number,
      bestJid: picked.bestJid || `${number}@s.whatsapp.net`,
      source: "on-whatsapp",
      note: picked.lidJid
        ? "LID detectado con onWhatsApp."
        : "WhatsApp confirmó el número, pero no entregó LID. Para LID exacto usa .lid respondiendo/etiquetando o dentro del mismo grupo.",
    }
  } catch {
    return null
  }
}

export const resolveUserLid = async (
  wss: types.WASocket,
  target: string,
  options: {
    mctx?: types.MessageContext
    groupMetadata?: baileys.GroupMetadata | null
    preferLid?: boolean
  } = {},
): Promise<LidResolution> => {
  const input = clean(target)
  if (!input) return emptyResolution(input)

  const selfJids = [options.mctx?.me?.jids?.lid, options.mctx?.me?.jids?.pn, wss.user?.id, (wss.user as any)?.lid]
    .map((value) => stripDevice(value))
    .filter(Boolean)

  const normalized = normalizeUserJid(input)

  if (normalized && selfJids.includes(normalized)) {
    const picked = bestFromValues(selfJids)

    return {
      ok: true,
      exists: true,
      input,
      inputNumber: phoneDigitsFromValue(input),
      lidJid: picked.lidJid,
      phoneJid: picked.phoneJid,
      phoneNumber: picked.phoneNumber,
      bestJid: options.preferLid ? picked.lidJid || picked.bestJid : picked.bestJid,
      source: "self",
      note: "Es el ID del bot actual.",
    }
  }

  const directGroup = resolveFromGroupMetadata(input, options.groupMetadata)
  if (directGroup?.bestJid) return directGroup

  if (options.mctx?.is_group && options.mctx.chat.jid) {
    try {
      const freshMetadata = await wss.groupMetadata(options.mctx.chat.jid, false)
      const freshGroup = resolveFromGroupMetadata(input, freshMetadata)
      if (freshGroup?.bestJid) return freshGroup
    } catch {}
  }

  if (isLidJid(normalized)) {
    return {
      ok: true,
      exists: true,
      input,
      inputNumber: "",
      lidJid: normalized,
      phoneJid: "",
      phoneNumber: "",
      bestJid: normalized,
      source: "explicit-lid",
      note: "LID recibido directamente.",
    }
  }

  const number = extractPhoneNumber(input) || phoneDigitsFromValue(input)
  const onWhatsApp = number ? await resolveWithOnWhatsApp(wss, number) : null
  if (onWhatsApp?.bestJid) return onWhatsApp

  if (number) {
    const phoneJid = `${number}@s.whatsapp.net`

    return {
      ok: false,
      exists: false,
      input,
      inputNumber: number,
      lidJid: "",
      phoneJid,
      phoneNumber: number,
      bestJid: phoneJid,
      source: "fallback-phone",
      note: "Solo pude formar el JID por número. No es LID real.",
    }
  }

  return emptyResolution(input)
}

export const formatLidResolution = (result: LidResolution): string => {
  const lines = [
    `「✧」 LID`,
    `│ LID › ${result.lidJid || "no detectado"}`,
    `│ PN › ${result.phoneJid || "no detectado"}`,
    `│ Número › ${result.phoneNumber ? `+${result.phoneNumber}` : result.inputNumber ? `+${result.inputNumber}` : "no detectado"}`,
    `│ Fuente › ${result.source}`,
    `│ Estado › ${result.exists ? "existe" : result.ok ? "detectado" : "incompleto"}`,
    `╰ Nota › ${result.note}`,
  ]

  return lines.join("\n")
}
