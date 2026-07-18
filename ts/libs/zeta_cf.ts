import fs from "node:fs"
import path from "node:path"

export type SetupAssetKey = "generalImage" | "subMainImage" | "rpgImage" | "welcomeImage"
export type SetupTextKey = "channelUrl" | "facebookUrl" | "instagramUrl" | "tiktokUrl" | "telegramUrl" | "ownerJid"

export type SetupAsset = {
  path: string
  mimetype: string
  size: number
  savedAt: string
}

export type SocialLinks = {
  facebook: string
  instagram: string
  tiktok: string
  telegram: string
}

export type UniversalBotSetup = {
  completed: boolean
  lockedChatJid: string
  assets: Partial<Record<SetupAssetKey, SetupAsset>>
  textCompleted: Partial<Record<SetupTextKey, boolean>>
  prefixes: string[]
  updatedAt: string
}

export type UniversalBotConfig = {
  botName: string
  ownerJid: string
  ownerLid: string
  ownerPn: string
  ownerNumber: string
  currencyName: string
  ownerName: string
  receptionNumber: string
  channelUrl: string
  socialLinks: SocialLinks
  setup: UniversalBotSetup
  configuredAt: string
}

export const UNIVERSAL_CONFIG_PATH = path.join(process.cwd(), "base_zeta.json")

const cleanText = (value: unknown): string => String(value ?? "").trim()

export const DEFAULT_COMMAND_PREFIXES = ["."] as const

const emptySocialLinks = (): SocialLinks => ({
  facebook: "",
  instagram: "",
  tiktok: "",
  telegram: "",
})

const emptySetup = (): UniversalBotSetup => ({
  completed: false,
  lockedChatJid: "",
  assets: {},
  textCompleted: {},
  prefixes: [],
  updatedAt: "",
})

export const normalizeOwnerJid = (value: string): string => {
  const input = cleanText(value)
  if (!input || input === "0") return ""

  const compact = input.replace(/\s+/g, "")
  if (/@(lid|s\.whatsapp\.net)$/i.test(compact)) return compact.toLowerCase()

  const digits = compact.replace(/[^0-9]/g, "")
  if (!digits) return ""

  return `${digits}@s.whatsapp.net`
}

export const normalizeOwnerLid = (value: string): string => {
  const jid = normalizeOwnerJid(value)
  return /@lid$/i.test(jid) ? jid : ""
}

export const normalizeOwnerPn = (value: string): string => {
  const jid = normalizeOwnerJid(value)
  return /@s\.whatsapp\.net$/i.test(jid) ? jid : ""
}

export const normalizeOwnerNumber = (value: string): string => {
  const digits = cleanText(value).replace(/[^0-9]/g, "")
  if (!digits || digits === "0") return ""
  return /^\d{8,15}$/.test(digits) ? digits : ""
}

const normalizeStoredOwnerNumber = (ownerNumber?: unknown, ownerJid?: unknown): string => {
  const direct = normalizeOwnerNumber(cleanText(ownerNumber))
  if (direct) return direct

  const jid = cleanText(ownerJid)
  if (/@s\.whatsapp\.net$/i.test(jid)) return normalizeOwnerNumber(jid)

  return ""
}

export const normalizeReceptionNumber = (value: string): string => {
  const digits = cleanText(value).replace(/[^0-9]/g, "")
  if (!digits) return ""

  if (digits.startsWith("521")) return digits
  if (digits.startsWith("52")) return `521${digits.slice(2)}`

  return digits
}

export const normalizePrefixes = (value: string | string[] | undefined): string[] => {
  const source = Array.isArray(value) ? value.join(" ") : cleanText(value)
  const prefixes = source
    .split(/\s+/)
    .map((prefix) => prefix.trim())
    .filter(Boolean)

  return Array.from(new Set(prefixes)).slice(0, 20)
}

export const parseOptionalUrl = (value: unknown): { ok: boolean; value: string } => {
  const input = cleanText(value)
  if (!input || input === "0") return { ok: true, value: "" }

  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`

  try {
    const url = new URL(candidate)
    if (!/^https?:$/i.test(url.protocol)) return { ok: false, value: "" }
    if (!url.hostname || !/[a-z0-9]/i.test(url.hostname)) return { ok: false, value: "" }
    return { ok: true, value: url.toString() }
  } catch {
    return { ok: false, value: "" }
  }
}

export const normalizeOptionalUrl = (value: unknown): string => {
  const parsed = parseOptionalUrl(value)
  return parsed.ok ? parsed.value : ""
}

const normalizeSocialLinks = (value: Partial<SocialLinks> | undefined): SocialLinks => ({
  facebook: normalizeOptionalUrl(value?.facebook),
  instagram: normalizeOptionalUrl(value?.instagram),
  tiktok: normalizeOptionalUrl(value?.tiktok),
  telegram: normalizeOptionalUrl(value?.telegram),
})

const normalizeSetup = (value: Partial<UniversalBotSetup> | undefined): UniversalBotSetup => {
  const setup = emptySetup()
  const assets = value?.assets && typeof value.assets === "object" ? value.assets : {}
  const prefixes = normalizePrefixes(value?.prefixes)
  const textCompleted = value?.textCompleted && typeof value.textCompleted === "object" ? value.textCompleted : {}
  const requiredAssets: SetupAssetKey[] = ["generalImage", "subMainImage", "rpgImage", "welcomeImage"]
  const hasAllAssets = requiredAssets.every((key) => Boolean((assets as any)[key]?.path))

  return {
    completed: Boolean(value?.completed && hasAllAssets && prefixes.length),
    lockedChatJid: cleanText(value?.lockedChatJid),
    assets,
    textCompleted,
    prefixes,
    updatedAt: cleanText(value?.updatedAt),
  }
}

export const isValidUniversalConfig = (value: Partial<UniversalBotConfig> | null): value is UniversalBotConfig => {
  if (!value) return false
  return Boolean(cleanText(value.botName) && cleanText(value.currencyName) && cleanText(value.ownerName))
}

export const readUniversalConfig = (): UniversalBotConfig | null => {
  try {
    if (!fs.existsSync(UNIVERSAL_CONFIG_PATH)) return null
    const raw = fs.readFileSync(UNIVERSAL_CONFIG_PATH, "utf8")
    const parsed = JSON.parse(raw) as Partial<UniversalBotConfig>
    if (!isValidUniversalConfig(parsed)) return null

    return {
      botName: cleanText(parsed.botName),
      ownerJid: normalizeOwnerJid(cleanText(parsed.ownerJid)),
      ownerLid: normalizeOwnerLid(cleanText((parsed as any).ownerLid || parsed.ownerJid)),
      ownerPn: normalizeOwnerPn(cleanText((parsed as any).ownerPn || (parsed as any).ownerNumber || parsed.ownerJid)),
      ownerNumber: normalizeStoredOwnerNumber((parsed as any).ownerNumber, parsed.ownerJid),
      currencyName: cleanText(parsed.currencyName),
      ownerName: cleanText(parsed.ownerName),
      receptionNumber: normalizeReceptionNumber(cleanText(parsed.receptionNumber)),
      channelUrl: normalizeOptionalUrl(parsed.channelUrl),
      socialLinks: normalizeSocialLinks(parsed.socialLinks),
      setup: normalizeSetup(parsed.setup),
      configuredAt: cleanText(parsed.configuredAt) || new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export const writeUniversalConfig = (
  config: Omit<UniversalBotConfig, "configuredAt" | "setup" | "channelUrl" | "socialLinks" | "receptionNumber" | "ownerNumber" | "ownerLid" | "ownerPn"> & {
    ownerLid?: string
    ownerPn?: string
    ownerNumber?: string
    receptionNumber?: string
    channelUrl?: string
    socialLinks?: Partial<SocialLinks>
    setup?: Partial<UniversalBotSetup>
  },
): UniversalBotConfig => {
  const data: UniversalBotConfig = {
    botName: cleanText(config.botName),
    ownerJid: normalizeOwnerJid(config.ownerJid),
    ownerLid: normalizeOwnerLid(config.ownerLid || config.ownerJid),
    ownerPn: normalizeOwnerPn(config.ownerPn || config.ownerNumber || config.ownerJid || ""),
    ownerNumber: normalizeStoredOwnerNumber(config.ownerNumber, config.ownerPn || config.ownerJid),
    currencyName: cleanText(config.currencyName),
    ownerName: cleanText(config.ownerName),
    receptionNumber: normalizeReceptionNumber(config.receptionNumber),
    channelUrl: normalizeOptionalUrl(config.channelUrl),
    socialLinks: normalizeSocialLinks(config.socialLinks),
    setup: normalizeSetup(config.setup),
    configuredAt: new Date().toISOString(),
  }

  if (!isValidUniversalConfig(data)) {
    throw new Error("Configuración universal incompleta")
  }

  fs.writeFileSync(UNIVERSAL_CONFIG_PATH, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
  return data
}

export const updateUniversalConfig = (
  update: Partial<Omit<UniversalBotConfig, "setup">> & { setup?: Partial<UniversalBotSetup> },
): UniversalBotConfig => {
  const current = readUniversalConfig()
  if (!current) throw new Error("Falta base_zeta.json. Ejecuta el bot y completa la configuración inicial.")

  const data: UniversalBotConfig = {
    ...current,
    ...update,
    botName: cleanText(update.botName ?? current.botName),
    ownerJid: normalizeOwnerJid(cleanText(update.ownerJid ?? current.ownerJid)),
    ownerLid: normalizeOwnerLid(cleanText((update as any).ownerLid ?? current.ownerLid ?? update.ownerJid ?? current.ownerJid)),
    ownerPn: normalizeOwnerPn(cleanText((update as any).ownerPn ?? current.ownerPn ?? (update as any).ownerNumber ?? current.ownerNumber ?? update.ownerJid ?? current.ownerJid)),
    ownerNumber: normalizeStoredOwnerNumber((update as any).ownerNumber ?? current.ownerNumber, (update as any).ownerPn ?? current.ownerPn ?? update.ownerJid ?? current.ownerJid),
    currencyName: cleanText(update.currencyName ?? current.currencyName),
    ownerName: cleanText(update.ownerName ?? current.ownerName),
    receptionNumber: normalizeReceptionNumber(cleanText(update.receptionNumber ?? current.receptionNumber)),
    channelUrl: normalizeOptionalUrl(update.channelUrl ?? current.channelUrl),
    socialLinks: normalizeSocialLinks({ ...current.socialLinks, ...(update.socialLinks || {}) }),
    setup: normalizeSetup({
      ...current.setup,
      ...(update.setup || {}),
      assets: { ...(current.setup?.assets || {}), ...(update.setup?.assets || {}) },
      textCompleted: { ...(current.setup?.textCompleted || {}), ...(update.setup?.textCompleted || {}) },
    }),
    configuredAt: current.configuredAt,
  }

  fs.writeFileSync(UNIVERSAL_CONFIG_PATH, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 })
  return data
}

export const getUniversalConfig = (): UniversalBotConfig => {
  const config = readUniversalConfig()
  if (!config) throw new Error("Falta base_zeta.json. Ejecuta el bot y completa la configuración inicial.")
  return config
}

export const getRuntimeBotName = (): string => readUniversalConfig()?.botName || ""
export const getRuntimeCurrencyName = (): string => readUniversalConfig()?.currencyName || ""
export const getRuntimeOwnerName = (): string => readUniversalConfig()?.ownerName || ""
export const getRuntimeOwnerJid = (): string => readUniversalConfig()?.ownerJid || ""
export const getRuntimeOwnerLid = (): string => readUniversalConfig()?.ownerLid || ""
export const getRuntimeOwnerPn = (): string => readUniversalConfig()?.ownerPn || ""
export const getRuntimeOwnerNumber = (): string => readUniversalConfig()?.ownerNumber || ""
export const getRuntimeReceptionNumber = (): string => readUniversalConfig()?.receptionNumber || ""
export const getRuntimeChannelUrl = (): string => readUniversalConfig()?.channelUrl || ""
export const getRuntimeSocialLinks = (): SocialLinks => readUniversalConfig()?.socialLinks || emptySocialLinks()
export const getRuntimeSetup = (): UniversalBotSetup => readUniversalConfig()?.setup || emptySetup()
export const isRuntimeSetupComplete = (): boolean => Boolean(readUniversalConfig()?.setup?.completed)
export const getRuntimeCommandPrefixes = (): string[] => readUniversalConfig()?.setup?.prefixes || []
export const getRuntimeAssetPath = (key: SetupAssetKey): string => readUniversalConfig()?.setup?.assets?.[key]?.path || ""
