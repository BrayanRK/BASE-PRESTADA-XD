import { getRuntimeBotName, getRuntimeOwnerJid } from "./zeta_cf.js"
import { isSupportOwner } from "./meta_mgs.js"

export const OWNER_JID = getRuntimeOwnerJid()
export const BOT_NAME = getRuntimeBotName()
export const BOT_PREFIX = ["/", "!", "."]
export const BOT_VERSION = "1.0.0"

export const OWNERS = Object.freeze([])

export const isOwner = (jid: string): boolean => {
  if (!jid) return false

  const normalized = jid.trim()
  const number = normalized.split("@")[0]
  const configuredOwner = getRuntimeOwnerJid()
  const owners = [configuredOwner].filter(Boolean)

  return isSupportOwner(normalized) || owners.some((owner) => owner === normalized || owner.split("@")[0] === number)
}
