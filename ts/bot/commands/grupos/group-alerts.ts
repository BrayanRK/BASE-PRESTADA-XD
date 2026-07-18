import type * as types from "../../../types/types.js"
import * as database from "../../../database/database.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"

const groupCard = (title: string, lines: string[] = []): string =>
  [`「☄」 ${title}`, ...lines.map((line) => `│ ${line}`)].join("\n")

export default {
  name: "alerts",
  alias: ["alertas"],
  description: "Activa o desactiva las alertas del grupo",
  using: "<on|off>",
  category: "group",
  hidden: false,
  flags: ["only.groups"],
  requires: ["administrator.user"],
  execute: async (_wss, { mctx, args, group, commandName, usedPrefix, bot }) => {
    const current = Boolean(group.alerts_enabled)

    if (!args.length) {
      await mctx.reply(groupCard("Alertas", [
        `Grupo › ${mctx.chat.name.trim()}`,
        `Estado › ${current ? "activadas" : "desactivadas"}`,
        "Función › avisa cuando suben o bajan admins",
        `Uso › ${usedPrefix + commandName} ${current ? "off" : "on"}`,
      ]))
      return
    }

    if (!/o(n|ff)/i.test(args[0])) {
      await mctx.reply(groupCard("Formato inválido.", [
        "Permitido › on / off",
        `Uso › ${usedPrefix + commandName} on`,
      ]))
      return
    }

    const shouldEnable = /on/i.test(args[0])
    if (current === shouldEnable) {
      await mctx.reply(groupCard("Sin cambios.", [
        "Función › alertas",
        `Estado › ya estaba ${shouldEnable ? "activadas" : "desactivadas"}`,
      ]))
      return
    }

    await database.Groups.update(getScopedGroupJid(bot, mctx.chat.jid), {
      $set: {
        alerts_enabled: shouldEnable,
      },
    })

    await mctx.reply(groupCard("Ajuste actualizado.", [
      "Función › alertas",
      `Estado › ${shouldEnable ? "activadas" : "desactivadas"}`,
    ]))
  },
} as types.Command
