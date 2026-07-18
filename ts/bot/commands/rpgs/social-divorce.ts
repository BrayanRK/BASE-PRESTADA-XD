import type * as types from "../../../types/types.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"
import {
  divorceMarriage,
  formatMarriageDate,
  formatMarriageDuration,
  getActiveMarriageByUser,
  getPartnerJid,
} from "../../../libs/marriage.js"

const mention = (jid: string): string => `@${jid.split("@")[0]}`

const command: types.Command = {
  name: "divorce",
  alias: ["divorcio", "divorciar", "separar"],
  description: "Divorciarte de tu pareja.",
  category: "main",
  flags: ["only.groups"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx, bot }) => {
    const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid)
    const marriage = await getActiveMarriageByUser(scopedGroupJid, mctx.sender.jid)

    if (!marriage) {
      await mctx.reply(`「◈」 No tienes una relación activa en este grupo.`)
      return
    }

    const partnerJid = getPartnerJid(marriage, mctx.sender.jid)
    const partnerName = await wss.getName(partnerJid).catch(() => mention(partnerJid))
    const senderName = await wss.getName(mctx.sender.jid).catch(() => mention(mctx.sender.jid))
    const together = formatMarriageDuration(marriage.married_at)

    await divorceMarriage(marriage.id)

    const message = `「◈」 Divorcio registrado\n` +
      `${mention(mctx.sender.jid)} y ${mention(partnerJid)}\n` +
      `⟡ Pareja 》 *${senderName} + ${partnerName}*\n` +
      `⟡ Tiempo juntos 》 *${together}*\n` +
      `⟡ Casados desde 》 *${formatMarriageDate(marriage.married_at)}*\n\n` +
      `✦ Relación finalizada.`

    await wss.sendMessage(
      mctx.chat.jid,
      {
        text: message,
        mentions: [mctx.sender.jid, partnerJid],
      },
      { quoted: mctx.message.original },
    )
  },
}

export default command
