import type * as types from "../../../types/types.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"
import {
  formatMarriageDate,
  formatMarriageDuration,
  getActiveGroupMarriages,
  getActiveMarriageByUser,
  getGroupMarriageStats,
  getMarriageRank,
  getPartnerJid,
} from "../../../libs/marriage.js"

const getTargetJid = (mctx: types.MessageContext): string => {
  return mctx.message.mentioned?.[0] || mctx.message.mentionedJid?.[0] || mctx.quoted?.sender?.jid || mctx.sender.jid
}

const mention = (jid: string): string => `@${jid.split("@")[0]}`

const isGroupMode = (value?: string): boolean => {
  return /^(grupo|group|top|lista|list|all)$/i.test(String(value || ""))
}

const command: types.Command = {
  name: "marriageinfo",
  alias: ["minfo", "pareja", "relacion", "relación", "matrimonioinfo", "casados"],
  description: "Ver info personal o grupal de matrimonios.",
  using: "<@usuario> | grupo",
  category: "main",
  flags: ["only.groups"],
  requires: [],
  hidden: true,
  execute: async (wss, { mctx, args, bot }) => {
    const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid)
    if (isGroupMode(args[0])) {
      const marriages = await getActiveGroupMarriages(scopedGroupJid, 10)
      const stats = await getGroupMarriageStats(scopedGroupJid)

      if (!marriages.length) {
        await mctx.reply(`「◈」 No hay matrimonios activos en este grupo.`)
        return
      }

      const mentions: string[] = []
      let message = `「◈」 Matrimonios\n` +
        `⟡ Grupo 》 *${mctx.chat.name}*\n` +
        `⟡ Parejas activas 》 *${stats.active.toLocaleString("en-US")}*\n` +
        `⟡ Historial total 》 *${stats.total.toLocaleString("en-US")}*\n\n`

      for (let index = 0; index < marriages.length; index++) {
        const marriage = marriages[index]
        const userAName = await wss.getName(marriage.user_a_jid).catch(() => mention(marriage.user_a_jid))
        const userBName = await wss.getName(marriage.user_b_jid).catch(() => mention(marriage.user_b_jid))
        mentions.push(marriage.user_a_jid, marriage.user_b_jid)

        message += `⟡ #${index + 1} 》 *${userAName} + ${userBName}*\n`
        message += `   Tiempo 》 *${formatMarriageDuration(marriage.married_at)}*\n`
        message += `   Desde 》 *${formatMarriageDate(marriage.married_at)}*\n\n`
      }

      await wss.sendMessage(
        mctx.chat.jid,
        {
          text: message.trim(),
          mentions: Array.from(new Set(mentions)),
        },
        { quoted: mctx.message.original },
      )
      return
    }

    const targetJid = getTargetJid(mctx)
    const marriage = await getActiveMarriageByUser(scopedGroupJid, targetJid)

    if (!marriage) {
      await wss.sendMessage(
        mctx.chat.jid,
        {
          text: `「◈」 Relación\nUsuario 》 ${mention(targetJid)}\nEstado 》 *soltero/a*`,
          mentions: [targetJid],
        },
        { quoted: mctx.message.original },
      )
      return
    }

    const partnerJid = getPartnerJid(marriage, targetJid)
    const targetName = await wss.getName(targetJid).catch(() => mention(targetJid))
    const partnerName = await wss.getName(partnerJid).catch(() => mention(partnerJid))
    const rank = await getMarriageRank(scopedGroupJid, marriage.id)

    const message = `「◈」 Relación\n` +
      `⟡ Usuario 》 *${targetName}*\n` +
      `⟡ Pareja 》 *${partnerName}*\n` +
      `⟡ Tiempo casados 》 *${formatMarriageDuration(marriage.married_at)}*\n` +
      `⟡ Desde 》 *${formatMarriageDate(marriage.married_at)}*\n` +
      `⟡ Puesto grupal 》 *#${rank || "?"}*\n\n` +
      `Usa *matrimonioinfo grupo* para ver todas las parejas.`

    await wss.sendMessage(
      mctx.chat.jid,
      {
        text: message,
        mentions: [targetJid, partnerJid],
      },
      { quoted: mctx.message.original },
    )
  },
}

export default command
