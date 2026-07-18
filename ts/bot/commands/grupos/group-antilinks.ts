import type * as types from "../../../types/types.js"
import * as database from "../../../database/database.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"

const groupCard = (title: string, lines: string[] = []): string =>
  [`「☄」 ${title}`, ...lines.map((line) => `│ ${line}`)].join("\n")

export default {
  name: "antilinks",
  alias: ["antienlaces"],
  description: "Activa o desactiva el anti enlaces del grupo",
  using: "<on|off>",
  category: "group",
  hidden: false,
  flags: ["only.groups"],
  requires: ["administrator.user"],
  execute: async (_wss, { mctx, args, group, commandName, usedPrefix, bot }) => {
    const current = Boolean(group.antilinks_enabled)

    if (!args.length) {
      await mctx.reply(groupCard("Anti Enlaces", [
        `Grupo › ${mctx.chat.name.trim()}`,
        `Estado › ${current ? "activado" : "desactivado"}`,
        "Función › bloquea enlaces prohibidos",
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
        "Función › antilinks",
        `Estado › ya estaba ${shouldEnable ? "activado" : "desactivado"}`,
      ]))
      return
    }

    await database.Groups.update(getScopedGroupJid(bot, mctx.chat.jid), {
      $set: {
        antilinks_enabled: shouldEnable,
      },
    })

    await mctx.reply(groupCard("Ajuste actualizado.", [
      "Función › antilinks",
      `Estado › ${shouldEnable ? "activado" : "desactivado"}`,
    ]))
  },
} as types.Command
