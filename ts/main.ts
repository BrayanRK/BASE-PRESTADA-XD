import "dotenv/config"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { createRequire } from "node:module"
import yargs from "yargs"
import chalk from "chalk"
import readline from "readline"
import * as baileys from "baileys"
import type * as types from "./types/types.js"
import { connect, closeConnection } from "./database/connect.js"
import { cleanTmpFiles } from "./libs/converter.js"
import * as database from "./database/database.js"
import * as libs from "./libs/libs.js"
import * as handlers from "./bot/handlers/handlers.js"
import * as cache from "./cache/cache.js"
import { PremiumManager } from "./libs/socket-manager.js"
import { BotReconnection } from "./libs/socket-manager.js"
import { BotPersistence } from "./libs/socket-manager.js"
import { resolveUserLid } from "./libs/lid-resolver.js"
import { ensurePostConnectionSetup } from "./libs/zeta_setup.js"
import { enforceServerLock } from "./libs/end.js"
import {
  getRuntimeAssetPath,
  getUniversalConfig,
  normalizeOwnerJid,
  normalizeOwnerNumber,
  readUniversalConfig,
  type UniversalBotConfig,
  updateUniversalConfig,
  writeUniversalConfig,
} from "./libs/zeta_cf.js"

const { useMultiFileAuthState, DisconnectReason, Browsers } = baileys

const originalConsoleError = console.error
console.error = (...args) => {
  const message = args.map((arg) => (typeof arg === "string" ? arg : String((arg as any)?.message || arg))).join(" ")
  const noisyBaileysErrors = [
    "No SenderKeyRecord found for decryption",
    "Bad MAC",
    "Session error",
  ]

  if (noisyBaileysErrors.some((text) => message.includes(text))) return
  originalConsoleError.apply(console, args)
}

let state: any, saveCreds: any
let conn: types.WASocket
let isConnected = false
let useQRMode = false
let runtimeConfig: UniversalBotConfig
let runtimeSystemsReady = false
let pendingPairingPhoneNumber: string | null = null
let pairingCodeRequested = false
let pairingCodeDelivered = false
let pairingTimeout: NodeJS.Timeout | null = null
let baseZetaHeaderPrinted = false
let consoleInput: readline.Interface | null = null

console.info = () => {}

const require = createRequire(import.meta.url)
const pino = require("pino") as (options?: any) => any

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const opts = yargs(process.argv.slice(2)).exitProcess(false).parse() as any
const authFile = "sessions"

const logger = pino({ level: "silent" })
const pairingStateFile = path.resolve(process.cwd(), authFile, ".pairing.json")

type PendingPairingState = {
  phoneNumber: string
  createdAt: number
}

const BASE_ZETA_NAME = "Zeta_ofc - SkyUltraPlus"
const BASE_ZETA_WELCOME = "Bienvenido a base zeta"

const printBaseZetaHeader = () => {
  if (baseZetaHeaderPrinted) return
  baseZetaHeaderPrinted = true

  const line = "═".repeat(72)

  console.log("")
  console.log(chalk.cyanBright(line))
  console.log(chalk.bold.cyanBright("  ██████╗  █████╗ ███████╗███████╗    ███████╗███████╗████████╗ █████╗ "))
  console.log(chalk.bold.cyanBright("  ██╔══██╗██╔══██╗██╔════╝██╔════╝    ╚══███╔╝██╔════╝╚══██╔══╝██╔══██╗"))
  console.log(chalk.bold.cyanBright("  ██████╔╝███████║███████╗█████╗        ███╔╝ █████╗     ██║   ███████║"))
  console.log(chalk.bold.cyanBright("  ██╔══██╗██╔══██║╚════██║██╔══╝       ███╔╝  ██╔══╝     ██║   ██╔══██║"))
  console.log(chalk.bold.cyanBright("  ██████╔╝██║  ██║███████║███████╗    ███████╗███████╗   ██║   ██║  ██║"))
  console.log(chalk.bold.cyanBright("  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝    ╚══════╝╚══════╝   ╚═╝   ╚═╝  ╚═╝"))
  console.log(chalk.cyanBright(line))
  console.log(chalk.bold.yellowBright(`                    ${BASE_ZETA_WELCOME}`))
  console.log(chalk.bold.whiteBright(`                    ${BASE_ZETA_NAME}`))
  console.log(chalk.gray("                    Créditos oficiales de la base"))
  console.log(chalk.cyanBright(line))
  console.log("")
}

const getConsoleInput = (): readline.Interface => {
  if (!consoleInput) {
    consoleInput = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
  }
  return consoleInput
}

const closeConsoleInput = () => {
  if (!consoleInput) return
  consoleInput.close()
  consoleInput = null
}

const question = (text: string): Promise<string> => {
  return new Promise((resolve) => {
    getConsoleInput().question(text, (answer) => resolve(answer))
  })
}

const printStep = (step: number, title: string, description?: string) => {
  console.log("")
  console.log(chalk.gray("═".repeat(58)))
  console.log(chalk.bold.cyan(`PASO ${step}: ${title}`))
  if (description) console.log(chalk.gray(description))
  console.log(chalk.gray("═".repeat(58)))
}

const askRequiredStep = async (step: number, title: string, description?: string): Promise<string> => {
  printStep(step, title, description)

  while (true) {
    const answer = (await question(chalk.green("➜ Respuesta: "))).trim()
    if (answer) return answer
    console.log(chalk.red("❌ Este dato es obligatorio. Escríbelo para continuar."))
  }
}

const askOwnerNumberStep = async (): Promise<string> => {
  printStep(2, "Número del owner", "Acepta +51999999999, +51 999999999, 51999999999, etc. Se usará para detectar el @lid y para la vCard.")

  while (true) {
    const answer = (await question(chalk.green("➜ Número: "))).trim()
    const number = normalizeOwnerNumber(answer)
    if (number) return number
    console.log(chalk.red("❌ Número inválido. Usa código de país. Ejemplo: +51999999999"))
  }
}

const ensureInitialConfig = async (): Promise<UniversalBotConfig> => {
  const savedConfig = readUniversalConfig()
  if (savedConfig) return savedConfig

  console.log(chalk.gray("═".repeat(58)))
  console.log(chalk.yellow("Primero se configura la base. Después recién se vincula WhatsApp."))
  console.log(chalk.gray("Cada pregunta sale separada. Responde una por una.\n"))

  const botName = await askRequiredStep(
    1,
    "Nombre destinado al bot",
    "Escribe el nombre final que usará este bot. No puede quedar vacío.",
  )

  const ownerNumber = await askOwnerNumberStep()

  const currencyName = await askRequiredStep(
    3,
    "Nombre de la moneda de economía",
    "Ejemplo: SkyCoins, ZetaCoins, Diamantes. No puede quedar vacío.",
  )

  const ownerName = await askRequiredStep(
    4,
    "Nombre del owner/dueño del bot",
    "Escribe el nombre público del dueño que usará la base.",
  )

  const config = writeUniversalConfig({
    botName,
    ownerJid: normalizeOwnerJid(ownerNumber),
    ownerNumber,
    currencyName,
    ownerName,
  })

  console.log("")
  console.log(chalk.gray("═".repeat(58)))
  console.log(chalk.green("✅ base_zeta.json guardado correctamente."))
  console.log(chalk.blue(`🤖 Bot configurado: ${config.botName}`))
  console.log(chalk.blue(`🧑‍💼 Dueño configurado: ${config.ownerName}`))
  console.log(chalk.blue(`💰 Moneda configurada: ${config.currencyName}`))
  console.log(chalk.blue(`📞 Número owner: +${config.ownerNumber}`))
  console.log(chalk.blue(`👑 Owner ID inicial: ${config.ownerJid || "pendiente"}`))
  console.log(chalk.gray("═".repeat(58)))

  return config
}

const safeNormalizeJid = (jid?: string | null): string => {
  try {
    return jid ? baileys.jidNormalizedUser(jid) : ""
  } catch {
    return jid || ""
  }
}

const cleanStoredText = (value?: string | null): string => String(value || "").trim()

const pickStoredBot = (bots: Array<types.BotDocument | null>, config: UniversalBotConfig): types.BotDocument | null => {
  const existing = bots.filter(Boolean) as types.BotDocument[]
  if (!existing.length) return null

  return (
    existing.find((bot) => cleanStoredText(bot.owner_jid)) ||
    existing.find((bot) => cleanStoredText(bot.name) && cleanStoredText(bot.name) !== config.botName) ||
    existing.find((bot) => cleanStoredText(bot.currency) && cleanStoredText(bot.currency) !== config.currencyName) ||
    existing[0]
  )
}

const syncRuntimeBotRecord = async () => {
  const config = getUniversalConfig()
  const jids = new Set<string>()

  jids.add(safeNormalizeJid(conn.user?.id))
  jids.add(safeNormalizeJid((conn.user as any)?.lid))

  const botJids = Array.from(jids).filter(Boolean)
  if (!botJids.length) return

  const existingBots = await Promise.all(botJids.map((jid) => database.Bots.find(jid).catch(() => null)))
  const savedBot = pickStoredBot(existingBots, config)

  const persistentData: Partial<types.BotDocument> = {
    name: cleanStoredText(savedBot?.name) || config.botName,
    owner_jid: config.ownerJid || cleanStoredText(savedBot?.owner_jid),
    owner_lid: config.ownerLid || cleanStoredText(savedBot?.owner_lid),
    owner_pn: config.ownerPn || cleanStoredText(savedBot?.owner_pn),
    owner_name: config.ownerName || cleanStoredText(savedBot?.owner_name),
    owner_number: config.ownerNumber || cleanStoredText(savedBot?.owner_number),
    logo_url: cleanStoredText(savedBot?.logo_url) || getRuntimeAssetPath("generalImage"),
    thumbnail_url: cleanStoredText(savedBot?.thumbnail_url) || getRuntimeAssetPath("generalImage"),
    submenu_url: cleanStoredText(savedBot?.submenu_url) || getRuntimeAssetPath("subMainImage"),
    welcome_url: cleanStoredText(savedBot?.welcome_url) || getRuntimeAssetPath("welcomeImage"),
    rpg_url: cleanStoredText(savedBot?.rpg_url) || getRuntimeAssetPath("rpgImage"),
    channel_url: cleanStoredText(savedBot?.channel_url) || config.channelUrl,
    facebook_url: cleanStoredText(savedBot?.facebook_url) || config.socialLinks.facebook,
    instagram_url: cleanStoredText(savedBot?.instagram_url) || config.socialLinks.instagram,
    tiktok_url: cleanStoredText(savedBot?.tiktok_url) || config.socialLinks.tiktok,
    telegram_url: cleanStoredText(savedBot?.telegram_url) || config.socialLinks.telegram,
    prefixes: cleanStoredText(savedBot?.prefixes) || (config.setup.prefixes || []).join(" "),
    setup_completed: true,
    setup_step: 0,
    bot_type: "main",
    currency: cleanStoredText(savedBot?.currency) || config.currencyName,
    username: cleanStoredText(savedBot?.username),
    status: cleanStoredText(savedBot?.status),
    autojoin_enabled: Boolean(savedBot?.autojoin_enabled),
  }

  for (const jid of botJids) {
    await database.Bots.set(jid, {
      ...persistentData,
      bot_jid: jid,
    })
  }

  const primaryJid = botJids[0]
  const botNumber = primaryJid.split("@")[0].replace(/[^0-9]/g, "")
  if (primaryJid && botNumber) {
    await BotPersistence.addBot({
      bot_id: `main-${botNumber}`,
      bot_jid: primaryJid,
      bot_number: botNumber,
      owner_jid: persistentData.owner_jid || "",
      bot_type: "main",
      parent_bot_jid: "",
      session_path: path.resolve(process.cwd(), authFile),
      is_active: true,
    }).catch((error) => console.error("[MainBot] No se pudo guardar sesión principal:", error))
  }
}

const resolveRuntimeOwnerFromNumber = async () => {
  const config = getUniversalConfig()
  const ownerNumber = normalizeOwnerNumber(config.ownerNumber || config.ownerJid)
  if (!ownerNumber) return config

  const currentOwnerJid = normalizeOwnerJid(config.ownerJid)
  const currentIsLid = /@lid$/i.test(currentOwnerJid)

  try {
    const resolved = await resolveUserLid(conn, ownerNumber, { preferLid: true })
    const resolvedNumber = resolved.phoneNumber || resolved.inputNumber || ownerNumber
    const resolvedPn = resolved.phoneJid || `${resolvedNumber}@s.whatsapp.net`
    const resolvedLid = resolved.lidJid || (currentIsLid ? currentOwnerJid : config.ownerLid || "")
    const resolvedJid = resolvedLid || resolved.bestJid || currentOwnerJid || resolvedPn

    const nextConfig = updateUniversalConfig({
      ownerJid: resolvedJid,
      ownerLid: resolvedLid,
      ownerPn: resolvedPn,
      ownerNumber: resolvedNumber,
      ownerName: config.ownerName,
    })

    if (resolved.lidJid) {
      console.log(chalk.green(`✅ Owner LID detectado: ${resolved.lidJid}`))
    } else {
      console.log(chalk.yellow(`⚠️ Owner LID no detectado; usando número: ${resolvedJid}`))
    }

    return nextConfig
  } catch {
    const fallbackPn = `${ownerNumber}@s.whatsapp.net`
    const fallbackJid = currentOwnerJid || fallbackPn
    return updateUniversalConfig({
      ownerJid: fallbackJid,
      ownerLid: currentIsLid ? fallbackJid : config.ownerLid || "",
      ownerPn: config.ownerPn || fallbackPn,
      ownerNumber,
      ownerName: config.ownerName,
    })
  }
}

const initializeRuntimeSystems = async () => {
  if (runtimeSystemsReady) return

  await connect()
  console.log(chalk.green("✅ Base de datos conectada"))

  await BotPersistence.initializeTables()
  console.log(chalk.green("✅ Sistema de persistencia inicializado"))

  await libs.Command.load()
  libs.Command.watch()
  console.log(chalk.green("✅ Comandos cargados"))

  runtimeSystemsReady = true
}

const extendSocket = (sock: baileys.WASocket): types.WASocket => ({
  ...sock,
  groupMetadata: async (jid, useCache = true) => {
    if (!/@g\.us$/.test(jid)) return null
    const cached = useCache ? cache.metadatas.get(jid) : undefined
    if (cached) return cached

    try {
      const metadata = await sock.groupMetadata(jid)
      if (metadata) cache.metadatas.set(jid, metadata)
      return metadata
    } catch {
      return null
    }
  },
  parseMentions: (text, server = "lid") => {
    const jids = new Set<string>()
    Array.from(String(text).matchAll(/@([0-9]{5,16}|0)/g)).forEach((v) => {
      jids.add(baileys.jidEncode(v[1], server))
    })
    return Array.from(jids)
  },
  groupInviteLink: async (jid) => {
    try {
      const code = await sock.groupInviteCode(jid)
      return `https://chat.whatsapp.com/${code}`
    } catch {
      return "ERROR"
    }
  },
  getName: async (jid) => {
    if (/@g\.us$/.test(jid)) {
      try {
        const group = await sock.groupMetadata(jid)
        return group?.subject || "~"
      } catch {
        return "~"
      }
    }

    const user = await database.Users.get(jid).catch(() => null)
    if (user?.name && user.name !== "~") return user.name

    return `@${jid.split("@")[0]}`
  },
  profilePictureUrl: async (jid, type = "image") => {
    try {
      return await sock.profilePictureUrl(jid, type)
    } catch {
      return "https://i.pinimg.com/736x/27/01/f5/2701f51da94a8f339b2149ca5d15d2a5.jpg"
    }
  },
})

const makeSocketBrowser = () => {
  return pendingPairingPhoneNumber ? Browsers.macOS("Chrome") : Browsers.windows(runtimeConfig.botName)
}

const startBot = async (authState: any, saveCredentials: any) => {
  try {
    runtimeConfig = getUniversalConfig()
    state = authState
    saveCreds = saveCredentials
    isConnected = false

    if (!pendingPairingPhoneNumber) {
      console.log(chalk.cyan(`🤖 Iniciando ${runtimeConfig.botName}...`))
    }

    const sock = baileys.makeWASocket({
      logger,
      printQRInTerminal: useQRMode,
      browser: makeSocketBrowser(),
      auth: state,
      generateHighQualityLinkPreview: true,
      emitOwnEvents: true,
      shouldIgnoreJid: (jid) => /@newsletter/.test(jid),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      connectTimeoutMs: 60_000,
      qrTimeout: 60_000,
      defaultQueryTimeoutMs: 60_000,
      getMessage: async () => undefined,
    })

    conn = extendSocket(sock)

    conn.ev.on("creds.update", async () => {
      await saveCreds()
    })
    conn.ev.on("connection.update", connectionUpdate)
    conn.ev.on("messages.upsert", (e) => handlers.messagesUpsert(e, conn))
    conn.ev.on("group-participants.update", (e) => handlers.groupParticipantsUpdate(e, conn))

    return conn
  } catch (error) {
    console.log(chalk.red(`❌ Error iniciando WhatsApp: ${formatConnectionError(error)}`))
    process.exit(1)
  }
}

const getErrorStatusCode = (error: unknown): number | undefined => {
  return (error as any)?.output?.statusCode || (error as any)?.statusCode
}

const formatConnectionError = (error: unknown): string => {
  const statusCode = getErrorStatusCode(error)
  const payloadMessage = (error as any)?.output?.payload?.message
  const message = payloadMessage || (error as any)?.message || String(error || "error desconocido")
  return statusCode ? `${message} (${statusCode})` : message
}

const isRestartRequired = (error: unknown): boolean => {
  return getErrorStatusCode(error) === DisconnectReason.restartRequired
}

const clearPairingTimer = () => {
  if (!pairingTimeout) return
  clearTimeout(pairingTimeout)
  pairingTimeout = null
}

const resetPairingRuntime = () => {
  pendingPairingPhoneNumber = null
  pairingCodeRequested = false
  pairingCodeDelivered = false
  clearPairingTimer()
}

const savePendingPairingState = async (phoneNumber: string) => {
  await fs.promises.mkdir(path.dirname(pairingStateFile), { recursive: true })
  const payload: PendingPairingState = {
    phoneNumber,
    createdAt: Date.now(),
  }
  await fs.promises.writeFile(pairingStateFile, JSON.stringify(payload, null, 2))
}

const readPendingPairingState = (): PendingPairingState | null => {
  try {
    if (!fs.existsSync(pairingStateFile)) return null
    const raw = fs.readFileSync(pairingStateFile, "utf8")
    const parsed = JSON.parse(raw) as PendingPairingState
    if (!parsed?.phoneNumber || typeof parsed.createdAt !== "number") return null

    const maxAge = 10 * 60 * 1000
    if (Date.now() - parsed.createdAt > maxAge) {
      void clearPendingPairingState()
      return null
    }

    return parsed
  } catch {
    return null
  }
}

const clearPendingPairingState = async () => {
  await fs.promises.rm(pairingStateFile, { force: true }).catch(() => undefined)
}

const schedulePairingTimeout = () => {
  clearPairingTimer()
  pairingTimeout = setTimeout(() => {
    if (!pendingPairingPhoneNumber || isConnected || state?.creds?.registered) return
    console.log(chalk.red("❌ El código expiró. Ejecuta método 2 otra vez para generar uno nuevo."))
    void clearPendingPairingState()
    process.exit(1)
  }, 120_000)
}

const isCleanPairingClose = (error: unknown): boolean => {
  const statusCode = getErrorStatusCode(error)
  return (
    statusCode === DisconnectReason.connectionClosed ||
    statusCode === DisconnectReason.connectionLost ||
    statusCode === DisconnectReason.timedOut ||
    statusCode === DisconnectReason.restartRequired
  )
}

const reconnectAfterPairingClose = async () => {
  const freshAuth = await reloadAuthState()
  state = freshAuth.state
  saveCreds = freshAuth.saveCreds

  if (freshAuth.state?.creds?.registered === true) {
    resetPairingRuntime()
    await clearPendingPairingState()
  }

  setTimeout(() => {
    void startBot(freshAuth.state, freshAuth.saveCreds)
  }, 900)
}

const finishWithPairingFailure = async (error: unknown) => {
  console.log(chalk.red(`❌ No se pudo generar el código: ${formatConnectionError(error)}`))
  console.log(chalk.yellow("Revisa el número con código de país y vuelve a ejecutar método 2."))
  await clearPendingPairingState()
  resetPairingRuntime()

  try {
    ;(conn as any)?.end?.(undefined)
  } catch {}

  process.exit(1)
}

const requestRuntimePairingCode = async () => {
  if (!pendingPairingPhoneNumber || pairingCodeRequested || isConnected) return
  if (state?.creds?.registered) return

  pairingCodeRequested = true

  try {
    const code = await (conn as any).requestPairingCode(pendingPairingPhoneNumber)
    const prettyCode = String(code).match(/.{1,4}/g)?.join("-") || code

    pairingCodeDelivered = true
    schedulePairingTimeout()

    console.log(chalk.green(`🔑 Código de emparejamiento: ${prettyCode}`))
    console.log(chalk.yellow("📱 Ingresa este código en WhatsApp > Dispositivos vinculados > Vincular dispositivo"))
    console.log(chalk.gray("⏳ Esperando confirmación desde WhatsApp..."))
  } catch (error) {
    await finishWithPairingFailure(error)
  }
}

const connectionUpdate = async (update: baileys.ConnectionState) => {
  const { connection, lastDisconnect, qr } = update

  if (qr && !isConnected && useQRMode) {
    try {
      const QRCode = await import("qrcode-terminal")
      if (QRCode.default && typeof QRCode.default.generate === "function") {
        QRCode.default.generate(qr, { small: true })
      } else if (typeof QRCode.generate === "function") {
        QRCode.generate(qr, { small: true })
      } else {
        console.log(chalk.yellow("📱 Código QR generado:"))
        console.log(qr)
      }
      console.log(chalk.yellow("📱 Escanea el código QR con WhatsApp"))
    } catch {
      console.log(chalk.yellow("📱 Código QR generado:"))
      console.log(qr)
    }
  }

  if (pendingPairingPhoneNumber && !state?.creds?.registered && !isConnected && qr) {
    await requestRuntimePairingCode()
  }

  if (connection === "close") {
    const closeError = lastDisconnect?.error || new Error("Connection Closed")

    if (pendingPairingPhoneNumber && !isConnected) {
      if (state?.creds?.registered || pairingCodeDelivered || isRestartRequired(closeError)) {
        await reconnectAfterPairingClose()
        return
      }

      if (isCleanPairingClose(closeError) && pairingCodeRequested) {
        await reconnectAfterPairingClose()
        return
      }

      await finishWithPairingFailure(closeError)
      return
    }

    const statusCode = getErrorStatusCode(closeError)
    const shouldReconnect = statusCode !== DisconnectReason.loggedOut

    PremiumManager.stop()

    if (shouldReconnect) {
      setTimeout(async () => { const fresh = await reloadAuthState(); state = fresh.state; saveCreds = fresh.saveCreds; await startBot(state, saveCreds) }, 3000)
    } else {
      try {
        await archiveAuthState()
      } catch {}
      console.log(chalk.yellow("⚠️ Sesión cerrada por WhatsApp. La sesión fue archivada, no borrada."))
      await shutdown()
      process.exit(0)
    }
  } else if (connection === "open") {
    isConnected = true
    resetPairingRuntime()
    await clearPendingPairingState()

    await initializeRuntimeSystems()
    runtimeConfig = await resolveRuntimeOwnerFromNumber()
    await syncRuntimeBotRecord()
    await ensurePostConnectionSetup(conn)

    console.log(chalk.green(`✅ ${runtimeConfig.botName} conectado correctamente`))
    console.log(chalk.blue(`📞 Número: ${conn.user?.id?.split(":")[0]}`))
    console.log(chalk.blue(`👤 Nombre: ${conn.user?.name || "Sin nombre"}`))

    PremiumManager.start(conn)
    console.log(chalk.green("✅ Sistema de notificaciones premium iniciado"))
    console.log(chalk.magenta(`🎉 ¡${runtimeConfig.botName} listo!`))

    BotReconnection.initialize().catch(() => {})
  }
}

const shutdown = async () => {
  try {
    PremiumManager.stop()
    await BotReconnection.shutdown()
    closeConnection()
    cleanTmpFiles()
  } catch {}
}

const showConnectionMenu = async (): Promise<string> => {
  printStep(6, "Método de vinculación", "Elige cómo vas a conectar WhatsApp.")
  console.log(chalk.yellow("1. Código QR"))
  console.log(chalk.yellow("2. Código de emparejamiento"))

  while (true) {
    const choice = (await question(chalk.green("➜ Selecciona 1 o 2: "))).trim()
    if (choice === "1" || choice === "2") return choice
    console.log(chalk.red("❌ Opción inválida. Escribe solamente 1 o 2."))
  }
}

const cleanPairingPhoneNumber = (phoneNumber: string): string => {
  const cleanPhoneNumber = phoneNumber.replace(/[^0-9]/g, "")

  if (!/^\d{8,15}$/.test(cleanPhoneNumber)) {
    throw new Error("Número inválido. Usa código de país y solo números. Ejemplo: 51999999999")
  }

  return cleanPhoneNumber
}

const getAuthCredsPath = (): string => path.resolve(process.cwd(), authFile, "creds.json")

const hasSavedValidSession = (authState: any): boolean => {
  if (!fs.existsSync(getAuthCredsPath())) return false
  const creds = authState?.creds
  return Boolean(creds?.registered === true || creds?.me?.id)
}

const startWithSavedSession = async (authState: any, saveCredentials: any) => {
  resetPairingRuntime()
  await clearPendingPairingState()
  useQRMode = false
  closeConsoleInput()
  await startBot(authState, saveCredentials)
}

const resetAuthState = async () => {
  const authPath = path.resolve(process.cwd(), authFile)
  await fs.promises.rm(authPath, { recursive: true, force: true })
}

const archiveAuthState = async () => {
  const authPath = path.resolve(process.cwd(), authFile)
  if (!fs.existsSync(authPath)) return

  const archivePath = path.resolve(
    process.cwd(),
    `${authFile}-invalid-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  )

  await fs.promises.rename(authPath, archivePath).catch(async () => {
    await fs.promises.cp(authPath, archivePath, { recursive: true, force: true }).catch(() => undefined)
  })
}

const reloadAuthState = async () => {
  return await useMultiFileAuthState(authFile)
}

const handlePairingCode = async (phoneNumber: string, autoResume = false) => {
  pendingPairingPhoneNumber = cleanPairingPhoneNumber(phoneNumber)
  pairingCodeRequested = false
  pairingCodeDelivered = false
  clearPairingTimer()
  useQRMode = false

  await savePendingPairingState(pendingPairingPhoneNumber)

  if (!autoResume) {
    await resetAuthState()
    await savePendingPairingState(pendingPairingPhoneNumber)
  }
  const freshAuth = await reloadAuthState()
  state = freshAuth.state
  saveCreds = freshAuth.saveCreds

  closeConsoleInput()
  await startBot(freshAuth.state, freshAuth.saveCreds)
}

const main = async () => {
  printBaseZetaHeader()

  try {
    await enforceServerLock("ZETA-MAIN")

    runtimeConfig = await ensureInitialConfig()
    const { state: authState, saveCreds: saveCredentials } = await useMultiFileAuthState(authFile)

    if (hasSavedValidSession(authState)) {
      await startWithSavedSession(authState, saveCredentials)
      return
    }

    const pendingPairing = readPendingPairingState()
    if (pendingPairing) {
      console.log(chalk.yellow("🔑 Generando código de emparejamiento..."))
      await handlePairingCode(pendingPairing.phoneNumber, true)
      return
    }

    const cliMode = String(opts._?.[0] || "").toLowerCase()
    const connectionChoice = cliMode === "qr" ? "1" : cliMode === "code" ? "2" : await showConnectionMenu()

    if (connectionChoice === "1") {
      useQRMode = true
      closeConsoleInput()
      await startBot(authState, saveCredentials)
      return
    }

    if (connectionChoice === "2") {
      const phoneNumber = await askRequiredStep(
        7,
        "Número para código de emparejamiento",
        "Escribe el número con código de país, solo dígitos si quieres. Ejemplo: 51999999999",
      )

      console.log(chalk.yellow("🔑 Generando código de emparejamiento..."))
      await handlePairingCode(phoneNumber)
      return
    }

    console.log(chalk.red("❌ Opción inválida"))
    process.exit(1)
  } catch (error) {
    closeConsoleInput()
    console.log(chalk.red(`❌ Error fatal: ${formatConnectionError(error)}`))
    process.exit(1)
  }
}

process.on("uncaughtException", (err) => {
  if (pendingPairingPhoneNumber && isCleanPairingClose(err)) return
  console.log(chalk.red(`❌ Error no capturado: ${formatConnectionError(err)}`))
})

process.on("unhandledRejection", (reason) => {
  if (pendingPairingPhoneNumber && isCleanPairingClose(reason)) return
  console.log(chalk.red(`❌ Promesa rechazada: ${formatConnectionError(reason)}`))
})

process.on("SIGINT", async () => {
  closeConsoleInput()
  await shutdown()
  process.exit(0)
})

process.on("SIGTERM", async () => {
  closeConsoleInput()
  await shutdown()
  process.exit(0)
})

main().catch(async (error) => {
  closeConsoleInput()
  console.log(chalk.red(`❌ Error fatal en aplicación: ${formatConnectionError(error)}`))
  await shutdown()
  process.exit(1)
})
