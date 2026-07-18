import type * as types from "../../../types/types.js"
import { Bot } from "../../bot.js"
import { BotPersistence } from "../../../libs/socket-manager.js"
import { PremiumManager } from "../../../libs/socket-manager.js"
import { normalizeSocketNumber, unmarkSocketStopped } from "../../../libs/socket-manager.js"
import * as database from "../../../database/database.js"
import { box } from "../../../libs/zeta_texto.js"

const command: types.Command = {
  name: "startbot",
  alias: ["start", "iniciarbot"],
  description: "Activa un socket detenido desde el bot oficial.",
  category: "bot",
  flags: ["all.chats"],
  requires: ["bot.owner"],
  hidden: false,
  using: "<número>",
  execute: async (_wss, { mctx, args, bot, userIsOwner }) => {
    if (bot.bot_type !== "main" && !userIsOwner) {
      await mctx.reply(box("ACTIVAR SOCKET", ["Permiso › solo desde el bot oficial principal"]))
      return
    }

    const number = normalizeSocketNumber(args[0])
    if (!number) {
      await mctx.reply(box("ACTIVAR SOCKET", ["Uso › startbot 595xxxxxxxx"]))
      return
    }

    const sessions = await BotPersistence.loadBots().catch(() => [])
    const saved = sessions.find((item: any) => normalizeSocketNumber(item.bot_number || item.bot_jid) === number)
    if (!saved) {
      await mctx.reply(box("ACTIVAR SOCKET", [`Bot › @${number}`, "Estado › no existe en registros"]))
      return
    }

    if (saved.bot_type === "main") {
      await mctx.reply(box("ACTIVAR SOCKET", ["Estado › no se inicia el principal desde este comando"]))
      return
    }

    if (saved.bot_type === "premium" && !(await PremiumManager.isPremiumActive(number))) {
      await mctx.reply(box("ACTIVAR SOCKET", [`Bot › @${number}`, "Estado › premium vencido o token inactivo"]))
      return
    }

    const alreadyActive = Array.from(Bot.bots.keys()).some((jid) => normalizeSocketNumber(jid) === number)
    if (alreadyActive) {
      await BotPersistence.updateBotStatus(saved.bot_jid, true).catch(() => {})
      await mctx.reply(box("ACTIVAR SOCKET", [`Bot › @${number}`, "Estado › ya estaba activo"]))
      return
    }

    const botDoc = await database.Bots.find(saved.bot_jid).catch(() => null)
    unmarkSocketStopped(number)

    const instance = new Bot({
      bot_id: saved.bot_id,
      bot_jid: saved.bot_jid,
      owner_jid: botDoc?.owner_jid || saved.owner_jid,
      bot_type: botDoc?.bot_type || saved.bot_type,
      parent_bot_jid: botDoc?.parent_bot_jid || saved.parent_bot_jid || "",
      connection_method: "existing",
      session_path: saved.session_path,
    })

    instance.ev.once("bot.open", async (e) => {
      await BotPersistence.updateBotStatus(e.botjid, true).catch(() => {})
    })

    instance.ev.once("bot.error", async () => {
      await BotPersistence.updateBotStatus(saved.bot_jid, false).catch(() => {})
    })

    await instance.connect()
    await mctx.reply(box("ACTIVAR SOCKET", [`Bot › @${number}`, "Estado › iniciando", "Resultado › si la sesión es válida quedará activo"]))
  },
}

export default command
