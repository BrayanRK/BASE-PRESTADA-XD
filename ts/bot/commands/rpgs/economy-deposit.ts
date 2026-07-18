import type * as types from "../../../types/types.js"
import { getConnection } from "../../../database/connect.js"
import { formatMoney, getCurrency, getGroupUser, parseBetAmount } from "../../../libs/economy.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"

const command: types.Command = {
  name: "deposit",
  alias: ["dep", "depositar", "d", "guardar", "bank"],
  description: "Deposita dinero en el banco. Usa cantidad, todo o all.",
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

    const available = Math.max(0, Math.floor(Number(groupUser.money) || 0))
    const rawAmount = args.join(" ").trim().split(/\s+/)[0]

    if (!rawAmount) {
      await mctx.reply(`「◈」 Uso: *${usedPrefix + commandName}* 1000\nTodo: *${usedPrefix + commandName}* all\nDisponible: *${formatMoney(available, currency)}*`)
      return
    }

    if (available <= 0) {
      await mctx.reply(`「◈」 No tienes dinero para depositar. Disponible: *${formatMoney(available, currency)}*`)
      return
    }

    const amount = parseBetAmount(rawAmount, available)
    if (!amount) {
      await mctx.reply(`「◈」 Usa una cantidad válida: *${usedPrefix + commandName}* 1000 o *${usedPrefix + commandName}* all.`)
      return
    }

    if (amount > available) {
      await mctx.reply(`「◈」 No tienes suficiente *${currency}*. Tienes *${formatMoney(available, currency)}*.`)
      return
    }

    try {
      const conn = getConnection()
      conn.run(
        `UPDATE group_users SET money = money - ?, money_deposited = money_deposited + ?, updated_at = CURRENT_TIMESTAMP WHERE group_jid = ? AND user_jid = ?`,
        [amount, amount, scopedGroupJid, mctx.sender.jid],
      )

      const nextMoney = available - amount
      const nextBank = Math.max(0, Math.floor(Number(groupUser.money_deposited) || 0)) + amount
      await mctx.reply(`「◈」 Depositaste *${formatMoney(amount, currency)}*\nDinero: *${formatMoney(nextMoney, currency)}*\nBanco: *${formatMoney(nextBank, currency)}*`)
    } catch (error) {
      console.error("[Deposit] Error:", error)
      await mctx.reply(`「◈」 Error al procesar el depósito.`)
    }
  },
}

export default command
