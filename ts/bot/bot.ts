import * as hapi from "@hapi/boom"
import * as baileys from "baileys"
import EventEmitter from "node:events"
import path from "node:path"
import { createRequire } from "node:module"
import type * as types from "../types/types.js"
import fsp from "node:fs/promises"
import * as cache from "../cache/cache.js"
import * as database from "../database/database.js"
import * as handlers from "./handlers/handlers.js"
import { BotPersistence } from "../libs/socket-manager.js"
import { getRuntimeAssetPath, getRuntimeBotName, getRuntimeCurrencyName, getRuntimeOwnerLid, getRuntimeOwnerName, getRuntimeOwnerPn } from "../libs/zeta_cf.js"
import { ensurePremiumSocketSetup } from "../libs/socket-manager.js"
import { enforceServerLock } from "../libs/end.js"
import { getConnection } from "../database/connect.js"
import { isSocketStopped, markSocketStopped, normalizeSocketNumber, markPremiumTokenReusableByNumber, restorePremiumBotProfileByNumber, savePremiumBotProfileByNumber } from "../libs/socket-manager.js"

const require = createRequire(import.meta.url)
const pino = require("pino") as (options?: any) => any

export class Bot {
  protected codesSent = 0
  protected pairingCodeRequested = false
  protected pairingCodeTimer: ReturnType<typeof setTimeout> | null = null
  protected reconnectionAttempts = 0
  protected terminalConfirmStrikes = 0
  protected socket: types.WASocket | null = null
  protected openedOnce = false
  private backupChain: Promise<void> = Promise.resolve()
  public config: types.BotConfiguration
  public ev = new EventEmitter<types.BotEvents>()
  static bots = new Map<string, types.BotData>()

  constructor(config: types.BotConfiguration) {
    this.config = config
  }

  public connect = async (reconnecting = false) => {
    const sessionPath = this.config.session_path || this.getDefaultSessionPath()

    if (isSocketStopped(this.config.bot_jid || path.basename(sessionPath))) return

    try {
      await enforceServerLock("ZETA-BOT")
      await fsp.mkdir(sessionPath, { recursive: true })
      await this.restorePremiumBackup(sessionPath)

      const { state, saveCreds } = await baileys.useMultiFileAuthState(sessionPath)
      const { version } = await baileys.fetchLatestBaileysVersion()

      const sock = baileys.makeWASocket({
        auth: { creds: state.creds, keys: baileys.makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })) },
        logger: pino({ level: "silent" }),
        browser: baileys.Browsers.windows("Chrome"),
        version,
        printQRInTerminal: false,
        syncFullHistory: false,
        shouldIgnoreJid: (jid) => /@(newsletter|broadcast)/.test(jid),
        generateHighQualityLinkPreview: true,
        emitOwnEvents: true,
      })

      const wss = this.extendSocket(sock)
      this.socket = wss
      this.setupEventHandlers(wss, saveCreds, sessionPath)

      if (!reconnecting && this.config.connection_method === "code" && this.config.bot_jid) {
        this.schedulePairingCode(wss, 700)
      }
    } catch (error) {
      this.ev.emit("bot.error", { error })
    }
  }

  private getDefaultSessionPath(): string {
    const projectRoot = path.resolve(process.cwd())
    const botNumber = this.config.bot_jid?.split("@")[0] || this.config.bot_id || "unknown"

    switch (this.config.bot_type) {
      case "main":
        return path.join(projectRoot, "mainbots", `main-${botNumber}`)
      case "premium":
        return path.join(projectRoot, "prembots", `prem-${botNumber}`)
      case "free":
        return path.join(projectRoot, "freebots", `free-${botNumber}`)
      default:
        return path.join(projectRoot, "sessions", this.config.bot_id)
    }
  }

  private extendSocket = (sock: baileys.WASocket): types.WASocket => {
    const realGroupMetadata = sock.groupMetadata.bind(sock)
    const realGroupInviteCode = sock.groupInviteCode.bind(sock)
    const realProfilePictureUrl = sock.profilePictureUrl.bind(sock)
    const wss = sock as types.WASocket & Record<string, any>

    if (typeof (sock as any).requestPairingCode === "function") {
      wss.requestPairingCode = (sock as any).requestPairingCode.bind(sock)
    }

    if (typeof (sock as any).onWhatsApp === "function") {
      wss.onWhatsApp = (sock as any).onWhatsApp.bind(sock)
    }

    wss.groupMetadata = async (jid: string, incache = true) => {
      if (!/@g\.us$/.test(jid)) return null
      const cached = incache ? cache.metadatas.get(jid) : null
      if (cached) return cached

      const metadata = await realGroupMetadata(jid).catch(() => null)
      if (metadata) cache.metadatas.set(jid, metadata)
      return metadata
    }

    wss.parseMentions = (text: string, server: "lid" | "s.whatsapp.net") => {
      const jids = new Set<string>()
      Array.from(String(text).matchAll(/@([0-9]{5,16}|0)/g)).forEach((v) => {
        jids.add(baileys.jidEncode(v[1], server))
      })
      return Array.from(jids)
    }

    wss.groupInviteLink = async (jid: string) => {
      const code = await realGroupInviteCode(jid).catch(() => "ERROR")
      return `https://chat.whatsapp.com/${code}`
    }

    wss.getName = async (jid: string) => {
      if (/@g\.us$/.test(jid)) {
        const group = cache.metadatas.get(jid)
        return group?.subject || "~"
      }

      const user = await database.Users.get(jid).catch(() => null)
      if (user?.name && user.name !== "~") return user.name

      return `@${jid.split("@")[0]}`
    }

    wss.profilePictureUrl = async (jid: string, type = "image") => {
      try {
        return await realProfilePictureUrl(jid, type as any)
      } catch {
        return "https://i.pinimg.com/736x/27/01/f5/2701f51da94a8f339b2149ca5d15d2a5.jpg"
      }
    }

    return wss as types.WASocket
  }

  private getPremiumBackupPath(sessionPath: string): string {
    const projectRoot = path.resolve(process.cwd())
    const botNumber = this.config.bot_jid?.split("@")[0] || path.basename(sessionPath)
    return path.join(projectRoot, "backups", "premium-sockets", `prem-${botNumber}`)
  }

  private async pathExists(targetPath: string): Promise<boolean> {
    try {
      await fsp.access(targetPath)
      return true
    } catch {
      return false
    }
  }

  private async restorePremiumBackup(sessionPath: string): Promise<void> {
    if (this.config.bot_type !== "premium") return

    const backupPath = this.getPremiumBackupPath(sessionPath)
    if (!(await this.pathExists(backupPath))) return

    const files = await fsp.readdir(sessionPath).catch(() => [])
    if (files.length) return

    await fsp.cp(backupPath, sessionPath, { recursive: true, force: true }).catch((error) => {
      console.error("[PremiumBackup] Error restaurando backup:", error)
    })
  }

  private async backupPremiumSession(sessionPath: string): Promise<void> {
    if (this.config.bot_type !== "premium") return

    this.backupChain = this.backupChain.then(() => this.runBackupPremiumSession(sessionPath))
    await this.backupChain
  }

  private async runBackupPremiumSession(sessionPath: string): Promise<void> {
    const backupPath = this.getPremiumBackupPath(sessionPath)
    const tmpBackupPath = `${backupPath}.tmp-${Date.now()}`

    await fsp.mkdir(path.dirname(backupPath), { recursive: true }).catch(() => {})

    try {
      await fsp.cp(sessionPath, tmpBackupPath, { recursive: true, force: true })
      await fsp.rm(backupPath, { force: true, recursive: true }).catch(() => {})
      await fsp.rename(tmpBackupPath, backupPath)
    } catch (error) {
      console.error("[PremiumBackup] Error creando backup:", error)
      await fsp.rm(tmpBackupPath, { force: true, recursive: true }).catch(() => {})
    }
  }

  private setupEventHandlers = (wss: types.WASocket, saveCreds: () => Promise<void>, sessionPath: string) => {
    wss.ev.on("creds.update", async () => {
      await saveCreds()
      await this.backupPremiumSession(sessionPath)
    })
    wss.ev.on("connection.update", (e: baileys.ConnectionState) => this.handleConnectionUpdate(wss, e))
    wss.ev.on("messages.upsert", (e) => handlers.messagesUpsert(e, wss, this))
    wss.ev.on("messages.delete", (e) => handlers.handleMessagesDelete(e, wss))
    wss.ev.on("groups.update", (e) => handlers.groupsUpdate(e, wss))
    wss.ev.on("group-participants.update", (e) => handlers.groupParticipantsUpdate(e, wss))
  }

  private handleConnectionUpdate = async (wss: types.WASocket, e: baileys.ConnectionState) => {
    const credentialLimit = this.config.connection_method === "qr"
      ? this.config.bot_type === "premium" ? 3 : 1
      : 1

    if ("qr" in e && e.qr && this.codesSent < credentialLimit) {
      if (this.config.connection_method === "qr") {
        this.codesSent++
        this.ev.emit("bot.qr", { qr: e.qr })
      } else {
        this.schedulePairingCode(wss, 0)
      }
    }

    if ("connection" in e && e.connection === "open") await this.handleOpen(wss)
    if ("connection" in e && e.connection === "close") await this.handleClose(wss, e.lastDisconnect)
  }

  private schedulePairingCode(wss: types.WASocket, delayMs = 0) {
    if (this.config.connection_method !== "code" || !this.config.bot_jid) return
    if (this.codesSent >= 1 || this.pairingCodeRequested) return

    if (this.pairingCodeTimer) clearTimeout(this.pairingCodeTimer)
    this.pairingCodeTimer = setTimeout(() => {
      this.emitPairingCode(wss).catch((error) => {
        this.ev.emit("bot.error", {
          error: `Error al generar código: ${error instanceof Error ? error.message : String(error)}`,
        })
      })
    }, delayMs)
  }

  private formatPairingCode(code: unknown): string {
    const clean = String(code || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
    if (clean.length < 8) return ""
    const value = clean.slice(0, 8)
    return `${value.slice(0, 4)}-${value.slice(4)}`
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  public cleanupLinkingAttempt = async () => {
    if (this.pairingCodeTimer) {
      clearTimeout(this.pairingCodeTimer)
      this.pairingCodeTimer = null
    }

    const sessionPath = this.config.session_path || this.getDefaultSessionPath()
    const botNumber = normalizeSocketNumber(this.config.bot_jid || path.basename(sessionPath))
    if (botNumber) markSocketStopped(botNumber)

    try { ;(this.socket as any)?.ev?.removeAllListeners?.() } catch {}
    try { ;(this.socket as any)?.end?.(undefined) } catch {}
    this.socket = null

    await fsp.rm(sessionPath, { force: true, recursive: true }).catch(() => {})
    if (this.config.bot_type === "premium") {
      await fsp.rm(this.getPremiumBackupPath(sessionPath), { force: true, recursive: true }).catch(() => {})
    }
  }

  private async requestCodeWithTimeout(wss: types.WASocket, phoneNumber: string, timeoutMs = 10_000): Promise<string> {
    const requester = (wss as any).requestPairingCode
    if (typeof requester !== "function") {
      throw new Error("El socket no tiene requestPairingCode disponible")
    }

    return Promise.race([
      requester(phoneNumber),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("WhatsApp no entregó el código a tiempo")), timeoutMs)),
    ])
  }

  private async emitPairingCode(wss: types.WASocket) {
    if (!this.config.bot_jid) {
      this.ev.emit("bot.error", { error: "Número no configurado" })
      return
    }

    if (this.pairingCodeRequested || this.codesSent >= 1) return
    this.pairingCodeRequested = true

    const phoneNumber = this.config.bot_jid.split("@")[0].replace(/\D/g, "")
    let lastError: unknown = null

    try {
      if (!phoneNumber || phoneNumber.length < 8) {
        throw new Error("Número inválido para código de vinculación")
      }

      for (let attempt = 1; attempt <= 8; attempt++) {
        if (this.codesSent >= 1) return
        if ((wss as any).authState?.creds?.registered) return

        await this.delay(attempt === 1 ? 2_500 : 2_000)

        try {
          const rawCode = await this.requestCodeWithTimeout(wss, phoneNumber, 12_000)
          const code = this.formatPairingCode(rawCode)
          if (!code) throw new Error("WhatsApp devolvió un código vacío")

          this.codesSent++
          this.ev.emit("bot.code", { code })
          return
        } catch (error) {
          lastError = error
        }
      }

      this.ev.emit("bot.error", {
        error: `WhatsApp/Baileys no entregó el código: ${lastError instanceof Error ? lastError.message : String(lastError || "sin respuesta")}`,
      })
    } catch (error) {
      this.ev.emit("bot.error", {
        error: error instanceof Error ? error.message : String(error),
      })
    } finally {
      this.pairingCodeRequested = false
    }
  }

  private async handleOpen(wss: types.WASocket) {
    const botJid = baileys.jidNormalizedUser((wss as any).user?.id || "")
    if (!botJid) return

    this.openedOnce = true
    this.reconnectionAttempts = 0
    this.terminalConfirmStrikes = 0

    const botNumber = botJid.split("@")[0]
    const botLid = (() => {
      try {
        return baileys.jidNormalizedUser((wss as any).user?.lid || "")
      } catch {
        return ""
      }
    })()
    let savedBot = await database.Bots.find(botJid).catch(() => null)
    if (!savedBot && this.config.bot_type === "premium") {
      await restorePremiumBotProfileByNumber(botNumber, botJid, botLid || botJid).catch((error) => {
        console.error("[PremiumProfile] No se pudo restaurar el perfil premium:", error)
      })
      savedBot = await database.Bots.find(botJid).catch(() => null)
    }

    const effectiveBotType = savedBot?.bot_type || this.config.bot_type
    const premiumSelfOwnerJid = botLid || botJid
    const effectiveOwnerJid =
      effectiveBotType === "premium"
        ? savedBot?.setup_completed && savedBot?.owner_jid
          ? savedBot.owner_jid
          : premiumSelfOwnerJid || savedBot?.owner_jid || this.config.owner_jid
        : savedBot?.owner_jid || this.config.owner_jid
    const effectiveOwnerLid = savedBot?.owner_lid || getRuntimeOwnerLid() || (/\@lid$/i.test(effectiveOwnerJid) ? effectiveOwnerJid : "")
    const effectiveOwnerPn = savedBot?.owner_pn || getRuntimeOwnerPn() || (/\@s\.whatsapp\.net$/i.test(effectiveOwnerJid) ? effectiveOwnerJid : "")
    const effectiveOwnerName =
      savedBot?.owner_name ||
      (effectiveBotType === "premium"
        ? ""
        : effectiveOwnerJid
          ? await wss.getName(effectiveOwnerJid).catch(() => getRuntimeOwnerName())
          : getRuntimeOwnerName())
    const effectiveParentBotJid =
      effectiveBotType === "free" ? savedBot?.parent_bot_jid || this.config.parent_bot_jid || "" : ""
    const effectiveHierarchyParentJid = savedBot?.hierarchy_parent_jid || this.config.hierarchy_parent_jid || ""

    const existingBotData = Bot.bots.get(botJid)
    Bot.bots.set(botJid, {
      bot_jid: botJid,
      owner_jid: effectiveOwnerJid,
      owner_lid: effectiveOwnerLid,
      owner_pn: effectiveOwnerPn,
      bot_type: effectiveBotType,
      bot_id: this.config.bot_id,
      parent_bot_jid: effectiveParentBotJid,
      connected_at: existingBotData?.connected_at ?? Date.now(),
      original_type: existingBotData?.original_type,
      is_online: true,
      wss,
    })


    await database.Bots.set(botJid, {
      bot_jid: botJid,
      owner_jid: effectiveOwnerJid,
      owner_lid: effectiveOwnerLid,
      owner_pn: effectiveOwnerPn,
      owner_name: effectiveOwnerName,
      owner_number: savedBot?.owner_number || (effectiveBotType === "premium" ? botNumber : ""),
      bot_type: effectiveBotType,
      parent_bot_jid: effectiveParentBotJid,
      hierarchy_parent_jid: effectiveHierarchyParentJid,
      name: savedBot?.name || getRuntimeBotName(),
      logo_url: savedBot?.logo_url || getRuntimeAssetPath("generalImage"),
      thumbnail_url: savedBot?.thumbnail_url || getRuntimeAssetPath("generalImage"),
      submenu_url: savedBot?.submenu_url || getRuntimeAssetPath("subMainImage"),
      welcome_url: savedBot?.welcome_url || getRuntimeAssetPath("welcomeImage"),
      rpg_url: savedBot?.rpg_url || getRuntimeAssetPath("rpgImage"),
      channel_url: savedBot?.channel_url || "",
      facebook_url: savedBot?.facebook_url || "",
      instagram_url: savedBot?.instagram_url || "",
      tiktok_url: savedBot?.tiktok_url || "",
      telegram_url: savedBot?.telegram_url || "",
      prefixes: savedBot?.prefixes || "",
      setup_completed: savedBot?.setup_completed || effectiveBotType !== "premium",
      setup_step: savedBot?.setup_step || 0,
      currency: savedBot?.currency || getRuntimeCurrencyName(),
      username: savedBot?.username || "",
      status: savedBot?.status || "",
      autojoin_enabled: savedBot?.autojoin_enabled || false,
    })

    const sessionPath = this.config.session_path || this.getDefaultSessionPath()

    const expiresAt: string | undefined = undefined

    await BotPersistence.addBot({
      bot_id: this.config.bot_id,
      bot_jid: botJid,
      bot_number: botNumber,
      owner_jid: effectiveOwnerJid,
      user_jid: this.config.owner_jid,
      bot_type: effectiveBotType,
      parent_bot_jid: effectiveParentBotJid,
      session_path: sessionPath,
      is_active: true,
      expires_at: expiresAt,
    })

    await this.backupPremiumSession(sessionPath)
    await ensurePremiumSocketSetup(wss, false).catch(() => {})

    this.ev.emit("bot.open", { botjid: botJid })
  }

  private async handleClose(wss: types.WASocket, lastDisconnect?: { error?: Error }) {
    const code = lastDisconnect?.error
      ? hapi.isBoom(lastDisconnect.error)
        ? lastDisconnect.error.output?.statusCode
        : hapi.boomify(lastDisconnect.error).output?.statusCode
      : undefined

    const botJid = (wss as any).user?.id
    const botNumber = normalizeSocketNumber(botJid || this.config.bot_jid)
    if (botJid) {
      await BotPersistence.updateBotStatus(botJid, false)
      const existing = Bot.bots.get(botJid) || Bot.bots.get(baileys.jidNormalizedUser(botJid))
      if (existing) {
        Bot.bots.set(baileys.jidNormalizedUser(botJid) || botJid, {
          ...existing,
          is_online: false,
        })
      }
    }

    if (isSocketStopped(botJid || this.config.bot_jid)) {
      this.ev.emit("bot.close", { botjid: botJid || this.config.bot_jid || "unknown" })
      return
    }

    const awaitingPairingCodeLink =
      this.config.connection_method === "code" &&
      !this.openedOnce &&
      this.codesSent >= 1

    if (awaitingPairingCodeLink) {
      this.reconnectionAttempts++
      const delay = Math.min(3000 * this.reconnectionAttempts, 30000)

      setTimeout(() => {
        if (!isSocketStopped(botJid || this.config.bot_jid)) this.connect(true)
      }, delay)
      return
    }

    // 401 (loggedOut) es el ÚNICO código que Baileys documenta como "no reconectar":
    // significa que WhatsApp cerró la sesión de verdad (vinculación revocada).
    // Borrar la sesión aquí es correcto porque reintentar nunca va a funcionar.
    if (code === 401) {
      if (botNumber) markSocketStopped(botNumber)
      this.ev.emit("bot.logout", { reason: `[${code}] Desconectado`, error: lastDisconnect?.error?.message || "" })
      await this.delete()
      return
    }

    // 403 (forbidden, posible ban) y 440 (connectionReplaced, posible conflicto de sesión)
    // SÍ pueden ser un cierre real, pero también pueden disparar por un hipo de red o una
    // carrera al reconectar. En vez de borrar la sesión a la primera, confirmamos con un
    // segundo cierre consecutivo del mismo tipo antes de eliminar nada.
    if (code === 403 || code === 440) {
      this.terminalConfirmStrikes++

      if (this.terminalConfirmStrikes >= 2) {
        if (botNumber) markSocketStopped(botNumber)
        this.ev.emit("bot.logout", { reason: `[${code}] Desconectado (confirmado)`, error: lastDisconnect?.error?.message || "" })
        await this.delete()
        return
      }

      setTimeout(() => {
        if (!isSocketStopped(botJid || this.config.bot_jid)) this.connect(true)
      }, 4000)
      return
    }

    // Cualquier otro motivo: 408/428/500/503/515 (códigos reales de Baileys que sí son
    // recuperables), 404/405/411/522 (NO son códigos de Baileys; suelen ser ruido de red,
    // proxy o CDN mal envuelto como error) y cualquier código desconocido o ausente.
    // Por defecto se asume una caída transitoria y se reintenta con backoff exponencial
    // en vez de borrar la sesión, que era la causa real de "se desvincula y no vuelve".
    const maxAttempts = this.config.bot_type === "main" ? 999 : this.config.bot_type === "premium" ? 999 : 50

    if (this.reconnectionAttempts <= maxAttempts) {
      this.reconnectionAttempts++
      const delay = Math.min(5000 * Math.pow(2, this.reconnectionAttempts - 1), 300000)

      setTimeout(() => {
        if (!isSocketStopped(botJid || this.config.bot_jid)) this.connect(true)
      }, delay)
    } else {
      this.ev.emit("bot.close", { botjid: botJid || "unknown" })
    }
  }

  protected delete = async () => {
    const sessionPath = this.config.session_path || this.getDefaultSessionPath()
    const botNumber = normalizeSocketNumber(this.config.bot_jid || path.basename(sessionPath))
    const botJid = botNumber ? `${botNumber}@s.whatsapp.net` : this.config.bot_jid || ""

    if (this.config.bot_type === "premium" && botNumber) {
      await savePremiumBotProfileByNumber(botNumber, botJid).catch((error) => {
        console.error("[PremiumProfile] No se pudieron guardar los datos premium:", error)
      })
      await markPremiumTokenReusableByNumber(botNumber).catch(() => false)
    }

    await fsp.rm(sessionPath, { force: true, recursive: true }).catch(() => {})
    await fsp.rm(this.getPremiumBackupPath(sessionPath), { force: true, recursive: true }).catch(() => {})
    if (botNumber) {
      await fsp.rm(path.join(process.cwd(), "database", "assets", "sockets", botNumber), { force: true, recursive: true }).catch(() => {})
    }

    try {
      const db = getConnection()
      if (botNumber && this.config.bot_type !== "premium") db.run("UPDATE premium_codes SET is_active = 0 WHERE bot_number = ?", [botNumber], () => {})
      if (botJid) {
        db.run("DELETE FROM bot_settings WHERE bot_jid = ?", [botJid], () => {})
        db.run("DELETE FROM bot_subowners WHERE bot_jid = ?", [botJid], () => {})
      }
    } catch {}

    for (const [jid, bot] of Bot.bots) {
      if (bot.bot_id === this.config.bot_id || (botNumber && normalizeSocketNumber(jid) === botNumber)) {
        await database.Bots.delete(jid).catch(() => false)
        Bot.bots.delete(jid)
        await BotPersistence.removeBot(jid).catch(() => {})
      }
    }

    if (botJid) {
      await database.Bots.delete(botJid).catch(() => false)
      await BotPersistence.removeBot(botJid).catch(() => {})
    }
  }
}
