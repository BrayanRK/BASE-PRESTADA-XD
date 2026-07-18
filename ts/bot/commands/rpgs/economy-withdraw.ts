import type * as types from "../../../types/types.js"
import { getConnection } from "../../../database/connect.js"
import { formatMoney, getCurrency, getGroupUser, parseBetAmount } from "../../../libs/economy.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"

const command: types.Command = {
  name: "withdraw",
  alias: ["with", "retirar", "r", "wd", "sacar", "retiro"],
  description: "Retira dinero del banco. Usa cantidad, todo o all.",
  category: "economy",
  using: "<cantidad|todo|all>",
  flags: ["only.groups"],
  requires: [],
  hidden: false,
  execute: async (_, { mctx, args, group, bot, usedPrefix, commandName }) => {
    const currency = getCurrency(bot)
    const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid)
    const groupUser = getGroupUser(group, mctx.sender.jid)

    if (!groupUser) {
      await mctx.reply(`「◈」 No se pudo obtener tus datos en este grupo, vuelve a intentarlo.`)
      return
    }

    const bank = Math.max(0, Math.floor(Number(groupUser.money_deposited) || 0))
    const rawAmount = args.join(" ").trim().split(/\s+/)[0]

    if (!rawAmount) {
      await mctx.reply(`「◈」 Uso: *${usedPrefix + commandName}* 1000\nTodo: *${usedPrefix + commandName}* all\nBanco: *${formatMoney(bank, currency)}*`)
      return
    }

    if (bank <= 0) {
      await mctx.reply(`「◈」 No tienes dinero en el banco. Banco: *${formatMoney(bank, currency)}*`)
      return
    }

    const amount = parseBetAmount(rawAmount, bank)
    if (!amount) {
      await mctx.reply(`「◈」 Usa una cantidad válida: *${usedPrefix + commandName}* 1000 o *${usedPrefix + commandName}* all.`)
      return
    }

    if (amount > bank) {
      await mctx.reply(`「◈」 No tienes suficiente *${currency}* en el banco. Tienes *${formatMoney(bank, currency)}*.`)
      return
    }

    try {
      const conn = getConnection()
      conn.run(
        `UPDATE group_users SET money = money + ?, money_deposited = money_deposited - ?, updated_at = CURRENT_TIMESTAMP WHERE group_jid = ? AND user_jid = ?`,
        [amount, amount, scopedGroupJid, mctx.sender.jid],
      )

      const nextMoney = Math.max(0, Math.floor(Number(groupUser.money) || 0)) + amount
      const nextBank = bank - amount
      await mctx.reply(`「◈」 Retiraste *${formatMoney(amount, currency)}*\nDinero: *${formatMoney(nextMoney, currency)}*\nBanco: *${formatMoney(nextBank, currency)}*`)
    } catch (error) {
      console.error("[Withdraw] Error:", error)
      await mctx.reply(`「◈」 Error al procesar el retiro.`)
    }
  },
}

export default command
