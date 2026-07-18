import type * as baileys from "baileys"
import crypto from "node:crypto"
import type * as types from "../types/types.js"
import * as database from "../database/database.js"
import { getEffectiveBotJid } from "./bot-scope.js"
import { jidNumber, sameUser } from "./socket-manager.js"

const clean = (value: unknown): string => String(value ?? "").trim()
const stripDevice = (jid?: string | null): string => clean(jid).split(":")[0].toLowerCase()
const jidServer = (jid?: string | null): string => stripDevice(jid).split("@")[1] || ""
const isRawJid = (jid?: string | null): boolean => /@(lid|s\.whatsapp\.net)$/i.test(stripDevice(jid))

export const normalizeUserJid = (value?: string | null): string => {
  const raw = stripDevice(value)
  if (!raw) return ""
  if (/@(g\.us|newsletter|broadcast)$/i.test(raw) || raw === "status@broadcast") return ""
  if (isRawJid(raw)) return raw
  const number = jidNumber(raw)
  return number ? `${number}@s.whatsapp.net` : ""
}

export const sameIdentity = (left?: string | null, right?: string | null): boolean => {
  const a = normalizeUserJid(left) || stripDevice(left)
  const b = normalizeUserJid(right) || stripDevice(right)
  if (!a || !b) return false
  if (a === b) return true
  if (sameUser(a, b)) return true
  if (jidServer(a) === "lid" || jidServer(b) === "lid") return false
  const an = jidNumber(a)
  const bn = jidNumber(b)
  return Boolean(an && bn && an === bn)
}

export const getBotScopeJids = (bot?: Partial<types.BotDocument> | null, mctx?: types.MessageContext): string[] => {
  const values = [
    getEffectiveBotJid(bot as any),
    bot?.bot_jid,
    mctx?.me?.jids?.lid,
    mctx?.me?.jids?.pn,
  ]

  return Array.from(new Set(values.map((jid) => stripDevice(jid)).filter(Boolean)))
}

export const getBotScopeJid = (bot?: Partial<types.BotDocument> | null, mctx?: types.MessageContext): string => {
  return getBotScopeJids(bot, mctx)[0] || ""
}

export const mentionNumber = (jid?: string | null): string => jidNumber(jid) || stripDevice(jid).split("@")[0] || "0"

const identityToken = (value?: string | null): string => {
  const raw = stripDevice(value)
  if (!raw) return ""
  if (/^num:\d+$/i.test(raw)) return raw.toLowerCase()
  return normalizeUserJid(raw) || raw
}

export const userIdentityTokens = (...values: Array<string | null | undefined>): string[] => {
  const out = new Set<string>()

  for (const value of values) {
    const raw = stripDevice(value)
    if (!raw) continue

    const normalized = normalizeUserJid(raw) || raw
    if (normalized) out.add(normalized)


    out.add(raw)

    const number = jidNumber(raw)
    if (number) {
      if (jidServer(raw) !== "lid") out.add(`${number}@s.whatsapp.net`)
    }
  }

  return Array.from(out).filter(Boolean)
}

const safeJsonList = (raw: string): string[] => {
  try {
    const parsed = JSON.parse(raw || "[]")
    if (!Array.isArray(parsed)) return []
    return Array.from(new Set(parsed.map((item) => identityToken(String(item))).filter(Boolean)))
  } catch {
    return []
  }
}

const getList = async (botJid: string, key: string): Promise<string[]> => {
  const raw = await database.BotSettings.get(botJid, key)
  return safeJsonList(raw)
}

const setList = async (botJid: string, key: string, list: string[]): Promise<boolean> => {
  const cleanList = Array.from(new Set(list.map((jid) => identityToken(jid)).filter(Boolean)))
  return database.BotSettings.set(botJid, key, JSON.stringify(cleanList))
}

const hasAnyInList = (list: string[], jids: string[]): boolean => {
  const targets = Array.from(new Set(jids.flatMap((jid) => userIdentityTokens(jid)).map((jid) => identityToken(jid)).filter(Boolean)))
  if (!targets.length) return false
  return list.some((item) => targets.some((target) => identityToken(item) === target || sameIdentity(item, target)))
}

const hasInList = (list: string[], jid: string): boolean => hasAnyInList(list, [jid])

const addToList = async (botJid: string, key: string, jid: string): Promise<boolean> => {
  const targets = userIdentityTokens(jid)
  if (!targets.length) return false
  const list = await getList(botJid, key)
  for (const target of targets) {
    if (!hasInList(list, target)) list.push(target)
  }
  return setList(botJid, key, list)
}

const addManyToList = async (botJid: string, key: string, jids: string[]): Promise<boolean> => {
  const targets = Array.from(new Set(jids.flatMap((jid) => userIdentityTokens(jid))))
  if (!targets.length) return false
  const list = await getList(botJid, key)
  for (const target of targets) {
    if (!hasInList(list, target)) list.push(target)
  }
  return setList(botJid, key, list)
}

const removeFromList = async (botJid: string, key: string, jid: string): Promise<boolean> => {
  const targets = userIdentityTokens(jid)
  if (!targets.length) return false
  const list = await getList(botJid, key)
  return setList(botJid, key, list.filter((item) => !targets.some((target) => identityToken(item) === identityToken(target) || sameIdentity(item, target))))
}

const removeManyFromList = async (botJid: string, key: string, jids: string[]): Promise<boolean> => {
  const targets = Array.from(new Set(jids.flatMap((jid) => userIdentityTokens(jid))))
  if (!targets.length) return false
  const list = await getList(botJid, key)
  return setList(botJid, key, list.filter((item) => !targets.some((target) => identityToken(item) === identityToken(target) || sameIdentity(item, target))))
}

export const mutedUsersKey = (groupJid: string): string => `lucasxt:muted:${stripDevice(groupJid)}`
export const tagWhitelistKey = (groupJid: string): string => `lucasxt:wtag:${stripDevice(groupJid)}`
export const antiTagKey = (groupJid: string): string => `lucasxt:antitag:${stripDevice(groupJid)}`
export const bannedUsersKey = "lucasxt:banusers"

export const getMutedUsers = (botJid: string, groupJid: string): Promise<string[]> => getList(botJid, mutedUsersKey(groupJid))
export const muteUser = (botJid: string, groupJid: string, userJid: string): Promise<boolean> => addToList(botJid, mutedUsersKey(groupJid), userJid)
export const muteUserMany = (botJid: string, groupJid: string, userJids: string[]): Promise<boolean> => addManyToList(botJid, mutedUsersKey(groupJid), userJids)
export const unmuteUser = (botJid: string, groupJid: string, userJid: string): Promise<boolean> => removeFromList(botJid, mutedUsersKey(groupJid), userJid)
export const unmuteUserMany = (botJid: string, groupJid: string, userJids: string[]): Promise<boolean> => removeManyFromList(botJid, mutedUsersKey(groupJid), userJids)
export const isMutedUser = async (botJid: string, groupJid: string, userJid: string): Promise<boolean> => hasInList(await getMutedUsers(botJid, groupJid), userJid)
export const isMutedUserAny = async (botJid: string, groupJid: string, userJids: string[]): Promise<boolean> => hasAnyInList(await getMutedUsers(botJid, groupJid), userJids)

export const getBannedUsers = (botJid: string): Promise<string[]> => getList(botJid, bannedUsersKey)
export const banBotUser = (botJid: string, userJid: string): Promise<boolean> => addToList(botJid, bannedUsersKey, userJid)
export const banBotUserMany = (botJid: string, userJids: string[]): Promise<boolean> => addManyToList(botJid, bannedUsersKey, userJids)
export const unbanBotUser = (botJid: string, userJid: string): Promise<boolean> => removeFromList(botJid, bannedUsersKey, userJid)
export const unbanBotUserMany = (botJid: string, userJids: string[]): Promise<boolean> => removeManyFromList(botJid, bannedUsersKey, userJids)
export const isBannedBotUser = async (botJid: string, userJid: string): Promise<boolean> => hasInList(await getBannedUsers(botJid), userJid)
export const isBannedBotUserAny = async (botJid: string, userJids: string[]): Promise<boolean> => hasAnyInList(await getBannedUsers(botJid), userJids)

export const getAllowedTagUsers = (botJid: string, groupJid: string): Promise<string[]> => getList(botJid, tagWhitelistKey(groupJid))
export const allowTagUser = (botJid: string, groupJid: string, userJid: string): Promise<boolean> => addToList(botJid, tagWhitelistKey(groupJid), userJid)
export const allowTagUserMany = (botJid: string, groupJid: string, userJids: string[]): Promise<boolean> => addManyToList(botJid, tagWhitelistKey(groupJid), userJids)
export const removeAllowedTagUser = (botJid: string, groupJid: string, userJid: string): Promise<boolean> => removeFromList(botJid, tagWhitelistKey(groupJid), userJid)
export const removeAllowedTagUserMany = (botJid: string, groupJid: string, userJids: string[]): Promise<boolean> => removeManyFromList(botJid, tagWhitelistKey(groupJid), userJids)
export const isAllowedTagUser = async (botJid: string, groupJid: string, userJid: string): Promise<boolean> => hasInList(await getAllowedTagUsers(botJid, groupJid), userJid)
export const isAllowedTagUserAny = async (botJid: string, groupJid: string, userJids: string[]): Promise<boolean> => hasAnyInList(await getAllowedTagUsers(botJid, groupJid), userJids)

export const setAntiTag = (botJid: string, groupJid: string, enabled: boolean): Promise<boolean> => database.BotSettings.setBool(botJid, antiTagKey(groupJid), enabled)
export const isAntiTagEnabled = (botJid: string, groupJid: string): Promise<boolean> => database.BotSettings.getBool(botJid, antiTagKey(groupJid), false)

export const generatedTagCacheKey = (groupJid: string): string => `lucasxt:tagcache:${stripDevice(groupJid)}`

const TAG_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const TAG_CACHE_LIMIT = 120
const GLOBAL_TAG_CACHE_BOT_JID = "__zeta_global_tag_cache__"

type TagCacheRecord = {
  hash: string
  text: string
  createdAt: number
  expiresAt: number
}

const safeJsonTagCache = (raw: string): TagCacheRecord[] => {
  try {
    const parsed = JSON.parse(raw || "[]")
    if (!Array.isArray(parsed)) return []
    const now = Date.now()
    return parsed
      .map((item) => ({
        hash: clean(item?.hash),
        text: clean(item?.text),
        createdAt: Number(item?.createdAt || 0),
        expiresAt: Number(item?.expiresAt || 0),
      }))
      .filter((item) => item.hash && item.text && item.expiresAt > now)
      .slice(0, TAG_CACHE_LIMIT)
  } catch {
    return []
  }
}

export const stripTagMessageMarkers = (value?: string | null): string => {
  let text = String(value || "")
  for (const marker of TAG_FORWARD_MARKERS) text = text.split(marker).join("")
  return text.replace(/[\u061c\u034f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
}

export const normalizeTagMessageText = (value?: string | null): string => {
  return stripTagMessageMarkers(value)
    .normalize("NFKC")
    .replace(/\r/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .toLowerCase()
}

const tagTextHash = (value?: string | null): string => {
  const normalized = normalizeTagMessageText(value)
  return normalized ? crypto.createHash("sha256").update(normalized).digest("hex") : ""
}

const getTagCache = async (botJid: string, groupJid: string): Promise<TagCacheRecord[]> => {
  const raw = await database.BotSettings.get(botJid, generatedTagCacheKey(groupJid))
  return safeJsonTagCache(raw)
}

const setTagCache = async (botJid: string, groupJid: string, records: TagCacheRecord[]): Promise<boolean> => {
  const now = Date.now()
  const cleanRecords = records
    .filter((item) => item.hash && item.text && item.expiresAt > now)
    .slice(0, TAG_CACHE_LIMIT)
  return database.BotSettings.set(botJid, generatedTagCacheKey(groupJid), JSON.stringify(cleanRecords))
}

const addGeneratedTagRecord = async (botJid: string, groupJid: string, record: TagCacheRecord): Promise<boolean> => {
  const records = await getTagCache(botJid, groupJid)
  return setTagCache(botJid, groupJid, [record, ...records.filter((item) => item.hash !== record.hash)])
}

export const rememberGeneratedTagText = async (botJid: string, groupJid: string, value?: string | null): Promise<boolean> => {
  const text = normalizeTagMessageText(value)
  if (!botJid || !groupJid || !text) return false

  const hash = tagTextHash(text)
  if (!hash) return false

  const now = Date.now()
  const next: TagCacheRecord = {
    hash,
    text: text.slice(0, 2500),
    createdAt: now,
    expiresAt: now + TAG_CACHE_TTL_MS,
  }

  const savedLocal = await addGeneratedTagRecord(botJid, groupJid, next)
  const savedGlobal = botJid === GLOBAL_TAG_CACHE_BOT_JID ? true : await addGeneratedTagRecord(GLOBAL_TAG_CACHE_BOT_JID, groupJid, next)
  return savedLocal || savedGlobal
}

export const isKnownGeneratedTagText = async (botJid: string, groupJid: string, value?: string | null): Promise<boolean> => {
  const text = normalizeTagMessageText(value)
  if (!botJid || !groupJid || !text) return false

  const hash = tagTextHash(text)
  if (!hash) return false

  const records = [
    ...(await getTagCache(botJid, groupJid)),
    ...(botJid === GLOBAL_TAG_CACHE_BOT_JID ? [] : await getTagCache(GLOBAL_TAG_CACHE_BOT_JID, groupJid)),
  ]
  return records.some((item) => item.hash === hash || item.text === text)
}

export const userJidCandidates = (...values: Array<string | null | undefined>): string[] => {
  const out = new Set<string>()

  const add = (value?: string | null): void => {
    const raw = stripDevice(value)
    if (!raw || /@(g\.us|newsletter|broadcast)$/i.test(raw) || raw === "status@broadcast") return

    const normalized = normalizeUserJid(raw)
    if (normalized) out.add(normalized)
    if (isRawJid(raw)) out.add(raw)

    const number = jidNumber(raw)
    if (number) {
      const server = jidServer(raw)
      if (server !== "lid") out.add(`${number}@s.whatsapp.net`)
      out.add(`${number}@lid`)
    }
  }

  for (const value of values) add(value)
  return Array.from(out).filter(Boolean)
}

export const getQuotedSenderIdentityJids = (mctx?: types.MessageContext | null): string[] => {
  const original = mctx?.quoted?.message?.original as any
  return userJidCandidates(
    mctx?.quoted?.sender?.jid,
    original?.key?.participant,
    original?.participant,
    original?.message?.senderKeyDistributionMessage?.groupId,
  )
}

export const getTargetJids = (mctx: types.MessageContext, args: string[] = []): string[] => {
  const rawArg = args.find((arg) => /\d{5,}/.test(arg) || /@(lid|s\.whatsapp\.net)$/i.test(arg)) || ""
  return userJidCandidates(
    ...(mctx.message.mentioned || []),
    ...(mctx.message.mentionedJid || []),
    ...getQuotedSenderIdentityJids(mctx),
    rawArg.replace(/^@/, ""),
  )
}

export const getTargetJid = (mctx: types.MessageContext, args: string[] = []): string => {
  return getTargetJids(mctx, args)[0] || ""
}

type AnyParticipant = baileys.GroupParticipant & Record<string, any>

const participantIds = (participant?: Partial<AnyParticipant> | null): string[] => {
  if (!participant) return []
  return [
    participant.id,
    participant.jid,
    participant.lid,
    participant.phoneNumber,
    participant.phoneJid,
    participant.pn,
    participant.pnJid,
  ]
    .flatMap((jid) => userIdentityTokens(jid))
    .filter(Boolean)
}

export const getParticipantIdentityJids = (participant?: Partial<AnyParticipant> | null, extra: string[] = []): string[] => {
  return Array.from(new Set([...participantIds(participant), ...extra.flatMap((jid) => userIdentityTokens(jid))].filter(Boolean)))
}

const socketBotIds = (wss: types.WASocket, mctx?: types.MessageContext, bot?: Partial<types.BotDocument> | null): string[] => {
  const user: any = wss.user || {}
  const values = [
    user.id,
    user.lid,
    user.jid,
    user.pn,
    user.phoneNumber,
    mctx?.me?.jids?.lid,
    mctx?.me?.jids?.pn,
    bot?.bot_jid,
    getEffectiveBotJid(bot as any),
  ]

  const out = new Set<string>()
  for (const value of values) {
    const normalized = normalizeUserJid(value) || stripDevice(value)
    if (normalized) out.add(normalized)
    const number = jidNumber(value)
    const server = jidServer(value)
    if (number && server !== "lid") out.add(`${number}@s.whatsapp.net`)
  }
  return Array.from(out)
}

export const participantMatchesJid = (participant: Partial<AnyParticipant> | null | undefined, jid: string): boolean => {
  const ids = participantIds(participant)
  const targets = userIdentityTokens(jid)
  return ids.some((id) => targets.includes(identityToken(id)) || sameIdentity(id, jid))
}

export const findParticipant = (metadata: baileys.GroupMetadata | null | undefined, jid: string): AnyParticipant | null => {
  const participants = (metadata?.participants || []) as AnyParticipant[]
  return participants.find((participant) => participantMatchesJid(participant, jid)) || null
}

export const findParticipantAny = (metadata: baileys.GroupMetadata | null | undefined, jids: string[]): AnyParticipant | null => {
  const participants = (metadata?.participants || []) as AnyParticipant[]
  const targets = userJidCandidates(...jids)
  return participants.find((participant) => targets.some((jid) => participantMatchesJid(participant, jid))) || null
}

export const refreshGroupMetadata = async (wss: types.WASocket, groupJid: string, fallback?: baileys.GroupMetadata | null): Promise<baileys.GroupMetadata | null> => {
  try {
    const metadata = await wss.groupMetadata(groupJid)
    return metadata || fallback || null
  } catch {
    return fallback || null
  }
}

export type GroupActionTarget = {
  participant: AnyParticipant | null
  jids: string[]
}

export const resolveGroupActionTarget = async (
  wss: types.WASocket,
  metadata: baileys.GroupMetadata | null | undefined,
  rawTargets: string[],
): Promise<GroupActionTarget> => {
  const seed = userJidCandidates(...rawTargets)
  const out = new Set<string>(seed)

  let participant = findParticipantAny(metadata, seed)
  for (const jid of getParticipantIdentityJids(participant)) out.add(jid)

  const phoneCandidates = Array.from(out)
    .map((jid) => stripDevice(jid))
    .filter((jid) => jidServer(jid) !== "lid")
    .map((jid) => jidNumber(jid))
    .filter((num, index, list) => /^\d{5,16}$/.test(num) && list.indexOf(num) === index)

  const onWhatsApp = (wss as any)?.onWhatsApp
  if (typeof onWhatsApp === "function" && phoneCandidates.length) {
    for (const num of phoneCandidates) {
      try {
        const result = await onWhatsApp.call(wss, `${num}@s.whatsapp.net`)
        const rows = Array.isArray(result) ? result : [result]
        for (const row of rows) {
          for (const jid of userJidCandidates(row?.jid, row?.lid, row?.phoneNumber, row?.pn)) out.add(jid)
        }
      } catch {}
    }
  }

  participant = findParticipantAny(metadata, Array.from(out)) || participant
  const participantJids = getParticipantIdentityJids(participant)
  for (const jid of participantJids) out.add(jid)

  const ordered = [participant?.id, participant?.jid, participant?.lid, ...participantJids, ...seed, ...Array.from(out)]
  return {
    participant,
    jids: userJidCandidates(...ordered),
  }
}

export const participantIsAdmin = (participant?: Partial<AnyParticipant> | null): boolean => {
  return Boolean(participant?.admin === "admin" || participant?.admin === "superadmin" || participant?.admin === true)
}

export const isGroupOwnerJid = (metadata: baileys.GroupMetadata | null | undefined, jid: string): boolean => {
  const owner = normalizeUserJid(metadata?.owner || "")
  return Boolean(owner && sameIdentity(owner, jid))
}

export const isUserAdminInMetadata = (metadata: baileys.GroupMetadata | null | undefined, userJid: string): boolean => {
  return participantIsAdmin(findParticipant(metadata, userJid)) || isGroupOwnerJid(metadata, userJid)
}

export const findBotParticipant = (metadata: baileys.GroupMetadata | null | undefined, wss: types.WASocket, mctx?: types.MessageContext, bot?: Partial<types.BotDocument> | null): AnyParticipant | null => {
  const ids = socketBotIds(wss, mctx, bot)
  const participants = (metadata?.participants || []) as AnyParticipant[]
  return participants.find((participant) => ids.some((jid) => participantMatchesJid(participant, jid))) || null
}

export const isBotAdminInMetadata = (metadata: baileys.GroupMetadata | null | undefined, wss: types.WASocket, mctx?: types.MessageContext, bot?: Partial<types.BotDocument> | null): boolean => {
  const botParticipant = findBotParticipant(metadata, wss, mctx, bot)
  if (participantIsAdmin(botParticipant)) return true
  return socketBotIds(wss, mctx, bot).some((jid) => isGroupOwnerJid(metadata, jid))
}

const TAG_FORWARD_MARKER = "\u2063\u200b\u200c\u200d\u2060\u200b\u2063"
const TAG_FORWARD_MARKER_V2 = "\u061c\u034f\u200b\u200c\u200d\u2060\u2063\u200e"
const TAG_FORWARD_MARKERS = [TAG_FORWARD_MARKER, TAG_FORWARD_MARKER_V2]
const MIN_TAG_MENTIONS = 3
const MASS_TAG_MENTIONS = 8

const cleanMentionJid = (value?: string | null): string => {
  const raw = stripDevice(value)
  if (!raw) return ""
  if (isRawJid(raw)) return raw
  return normalizeUserJid(raw)
}

export const getTagMentionJids = (
  mentions: string[],
  wss?: types.WASocket,
  mctx?: types.MessageContext,
  bot?: Partial<types.BotDocument> | null,
): string[] => {
  const out = new Set<string>()

  for (const jid of mentions || []) {
    const cleanJid = cleanMentionJid(jid)
    if (cleanJid) out.add(cleanJid)
  }

  if (wss || mctx || bot) {
    for (const jid of socketBotIds(wss || ({} as types.WASocket), mctx, bot)) {
      const cleanJid = cleanMentionJid(jid)
      if (cleanJid) out.add(cleanJid)
    }
  }

  return Array.from(out)
}

export const markTagMessageText = (value?: string | null): string => {
  const text = String(value || "")
  const marked = TAG_FORWARD_MARKERS.every((marker) => text.includes(marker))
  return marked ? text : `${text}${TAG_FORWARD_MARKER}${TAG_FORWARD_MARKER_V2}`
}

const isPlainObject = (value: unknown): value is Record<string, any> => {
  return Boolean(value && typeof value === "object" && !ArrayBuffer.isView(value))
}

const collectContextInfosDeep = (node: any, output: any[] = [], depth = 0, seen = new Set<any>()): any[] => {
  if (!isPlainObject(node) || depth > 16 || seen.has(node)) return output
  seen.add(node)

  if (isPlainObject(node.contextInfo)) output.push(node.contextInfo)

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) collectContextInfosDeep(item, output, depth + 1, seen)
      continue
    }
    collectContextInfosDeep(value, output, depth + 1, seen)
  }

  return output
}

const collectTextDeep = (node: any, output: string[] = [], depth = 0, seen = new Set<any>()): string[] => {
  if (!isPlainObject(node) || depth > 16 || seen.has(node)) return output
  seen.add(node)

  for (const [key, value] of Object.entries(node)) {
    if (typeof value === "string" && /^(conversation|text|caption|comment)$/i.test(key)) {
      output.push(value)
      continue
    }

    if (Array.isArray(value)) {
      for (const item of value) collectTextDeep(item, output, depth + 1, seen)
      continue
    }

    collectTextDeep(value, output, depth + 1, seen)
  }

  return output
}

const pushCleanJids = (value: unknown, out: Set<string>): void => {
  if (typeof value === "string") {
    const jid = cleanMentionJid(value)
    if (jid) out.add(jid)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) pushCleanJids(item, out)
  }
}

const cleanJidList = (values: unknown[]): string[] => {
  const out = new Set<string>()
  for (const value of values) pushCleanJids(value, out)
  return Array.from(out)
}

const mentionedJidsFromContext = (contextInfo: any): string[] => {
  const values: unknown[] = []

  if (Array.isArray(contextInfo?.mentionedJid)) values.push(...contextInfo.mentionedJid)
  if (Array.isArray(contextInfo?.statusMentionedJid)) values.push(...contextInfo.statusMentionedJid)
  if (Array.isArray(contextInfo?.mentions)) values.push(...contextInfo.mentions)

  return cleanJidList(values)
}

const getRawMessageNode = (mctx: types.MessageContext): any => {
  return (mctx.message.original as any)?.message || (mctx.message.original as any) || {}
}

const toBotCandidateList = (value?: string | string[] | null, mctx?: types.MessageContext): string[] => {
  const raw = Array.isArray(value) ? value : value ? [value] : []
  raw.push(mctx?.me?.jids?.lid || "", mctx?.me?.jids?.pn || "")

  const out = new Set<string>()
  for (const jid of raw) {
    const cleanJid = cleanMentionJid(jid)
    if (cleanJid) out.add(cleanJid)
  }
  return Array.from(out)
}

export const isForwardedTaggedMessage = (mctx: types.MessageContext, botJids?: string | string[] | null): boolean => {
  const rawMessage = getRawMessageNode(mctx)
  const contextInfos = collectContextInfosDeep(rawMessage)
  const texts = [mctx.message.text || "", ...collectTextDeep(rawMessage)].join("\n")
  const hasTagMarker = TAG_FORWARD_MARKERS.some((marker) => texts.includes(marker))

  const forwarded = contextInfos.some((ctx) => {
    return Boolean(ctx?.isForwarded || Number(ctx?.forwardingScore || 0) > 0 || ctx?.forwardedNewsletterMessageInfo)
  })


  if (hasTagMarker) return true

  const mentioned = new Set<string>()
  for (const jid of mctx.message.mentionedJid || []) {
    const cleanJid = cleanMentionJid(jid)
    if (cleanJid) mentioned.add(cleanJid)
  }
  for (const ctx of contextInfos) {
    for (const jid of mentionedJidsFromContext(ctx)) mentioned.add(jid)
  }

  const visibleMentionCount = new Set(Array.from(texts.matchAll(/@([0-9]{5,16})/g)).map((match) => match[1])).size


  if (forwarded && mentioned.size >= MIN_TAG_MENTIONS && visibleMentionCount === 0) return true
  if (forwarded && mentioned.size >= MASS_TAG_MENTIONS) return true



  const botCandidates = toBotCandidateList(botJids, mctx)
  const mentionsBot = botCandidates.some((botJid) => Array.from(mentioned).some((jid) => sameIdentity(jid, botJid)))
  if (forwarded && mentionsBot && mentioned.size >= 2) return true

  return false
}

const messageTextCandidates = (mctx: types.MessageContext): string[] => {
  const rawMessage = getRawMessageNode(mctx)
  const out = new Set<string>()
  const push = (value?: string | null) => {
    const cleanText = normalizeTagMessageText(value)
    if (cleanText) out.add(cleanText)
  }

  push(mctx.message.text)
  for (const value of collectTextDeep(rawMessage)) push(value)

  return Array.from(out)
}

const isForwardedLikeMessage = (mctx: types.MessageContext): boolean => {
  const rawMessage = getRawMessageNode(mctx)
  return collectContextInfosDeep(rawMessage).some((ctx) => {
    return Boolean(ctx?.isForwarded || Number(ctx?.forwardingScore || 0) > 0 || ctx?.forwardedNewsletterMessageInfo)
  })
}

export const shouldDeleteForwardedTag = async (
  mctx: types.MessageContext,
  botJid: string,
  botJids?: string | string[] | null,
): Promise<boolean> => {
  if (isForwardedTaggedMessage(mctx, botJids)) return true

  const forwardedLike = isForwardedLikeMessage(mctx)
  const rawMessage = getRawMessageNode(mctx)
  const rawTexts = [mctx.message.text || "", ...collectTextDeep(rawMessage)].join("\n")
  const hasTagMarker = TAG_FORWARD_MARKERS.some((marker) => rawTexts.includes(marker))
  if (hasTagMarker) return true

  const candidates = messageTextCandidates(mctx)
  if (!candidates.length) return false



  for (const text of candidates) {
    if (await isKnownGeneratedTagText(botJid, mctx.chat.jid, text)) {
      return true
    }
  }

  return false
}

