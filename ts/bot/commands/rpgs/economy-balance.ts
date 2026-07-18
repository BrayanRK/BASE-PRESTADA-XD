import type * as types from "../../../types/types.js"
import { formatMoney, getCurrency } from "../../../libs/economy.js"

const command: types.Command = {
  name: "balance",
  alias: ["bal", "coins"],
  description: "Ver cuantos {currency} tienes.",
  category: "economy",
  using: "<usuario>",
  hidden: false,
  flags: ["only.groups"],
  requires: [],
  execute: async (wss, { mctx, group, bot, usedPrefix }) => {
    const currency = getCurrency(bot)
    const mentioned = mctx.message.mentioned[0] || mctx.sender.jid
    const groupUser = group.users.find((v) => v.user_jid === mentioned)

    if (!groupUser) {
      await mctx.reply(`「◈」 El participante @${mentioned.split("@")[0]} no está registrado en este grupo.`)
      return
    }

    const userName = mentioned === mctx.sender.jid ? mctx.sender.name : await wss.getName(mentioned)
    const total = groupUser.money + groupUser.money_deposited

    const message = `「◈」 Economía de @${mentioned.split("@")[0]} •${userName || "user"}•\n\n` +
      `⟡ Dinero 》 *${formatMoney(groupUser.money, currency)}*\n` +
      `⟡ Banco  》 *${formatMoney(groupUser.money_deposited, currency)}*\n` +
      `⟡ Total  》 *${formatMoney(total, currency)}*\n\n` +
      `Para proteger tu dinero, guárdalo en el banco usando *${usedPrefix}deposit*`

    await mctx.reply(message)
  },
}

export default command
