import type * as types from "../types/types.js"

export const getCurrency = (bot?: Pick<types.BotDocument, "currency"> | null): string => {
  const currency = String(bot?.currency ?? "").trim()
  return currency || "Coins"
}

export const formatCoins = (amount: number): string => Math.max(0, Math.floor(amount)).toLocaleString("en-US")

export const formatMoney = (amount: number, currency: string): string => `¥${formatCoins(amount)} ${currency}`

export const MIN_BET_AMOUNT = 1_000
export const BET_EXAMPLE_AMOUNT = 1_000

export const minBetMessage = (currency: string): string => {
  return `⚠ La apuesta mínima es *${formatMoney(MIN_BET_AMOUNT, currency)}*.`
}

export const parseBetAmount = (input: string | undefined, max: number): number | null => {
  const value = String(input ?? "").trim().toLowerCase()
  const safeMax = Math.max(0, Math.floor(Number(max) || 0))

  if (!value) return null
  if (["all", "todo", "todos", "t", "max", "full", "completo"].includes(value)) return safeMax > 0 ? safeMax : null

  const multiplier = value.endsWith("k") ? 1_000 : value.endsWith("m") ? 1_000_000 : 1
  const cleanValue = value.replace(/,/g, "").replace(/\s/g, "").replace(/[km]$/, "")
  const parsed = Number.parseFloat(cleanValue)

  if (!Number.isFinite(parsed) || parsed <= 0) return null

  return Math.floor(parsed * multiplier)
}

export const getAmountFromArgs = (args: string[], max: number): number | null => {
  for (const arg of args) {
    if (arg.startsWith("@")) continue
    const amount = parseBetAmount(arg, max)
    if (amount) return amount
  }

  return null
}

export const getGroupUser = (
  group: types.GroupDocument,
  userJid: string,
): types.GroupUserDocument | undefined => group.users.find((user) => user.user_jid === userJid)

export const getMentionedOrQuoted = (mctx: types.MessageContext): string | null => {
  const anyCtx = mctx as any
  return (
    mctx.message.mentioned?.[0] ||
    anyCtx.quoted?.sender?.jid ||
    anyCtx.message?.quoted?.sender ||
    null
  )
}

export const percent = (chance: number): boolean => Math.random() * 100 < chance

export const randomInt = (min: number, max: number): number => {
  const floorMin = Math.ceil(min)
  const floorMax = Math.floor(max)
  return Math.floor(Math.random() * (floorMax - floorMin + 1)) + floorMin
}

export const cooldownMessage = (usedPrefix: string, commandName: string, duration: string): string => {
  return `《✧》 Debes esperar *${duration}* para usar *${usedPrefix}${commandName}* de nuevo.`
}
