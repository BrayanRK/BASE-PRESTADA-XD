import type * as types from "../../../types/types.js"
import { getConnection } from "../../../database/connect.js"
import * as libs from "../../../libs/libs.js"
import { formatMoney, getCurrency, getGroupUser, cooldownMessage, randomInt } from "../../../libs/economy.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"

const command: types.Command = {
  name: "mine",
  alias: [],
  description: "Gana algo de dinero minando",
  category: "economy",
  hidden: true,
  flags: ["only.groups"],
  requires: [],
  execute: async (wss, { mctx, group, bot, usedPrefix }) => {
    const currency = getCurrency(bot)
    const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid)
    const groupUser = getGroupUser(group, mctx.sender.jid)

    if (!groupUser) {
      await mctx.reply(`「◈」 No se pudo obtener tus datos en este grupo, vuelve a intentarlo.`)
      return
    }

    const now = Date.now()
    const miningInterval = 300_000
    const timeDifference = now - groupUser.last_mining_ago

    if (timeDifference < miningInterval) {
      const remainingTime = miningInterval - timeDifference
      await mctx.reply(cooldownMessage(usedPrefix, "mine", libs.formatDuration(miningInterval - timeDifference)))
      return
    }

    const messages = [
      "Trabajaste en la mina y te pagaron",
      "Extrajiste toneladas de piedra y ganaste",
      "Encontraste vetas de hierro y obtuviste",
      "Descubriste oro oculto entre las rocas y lo vendiste por",
      "Reuniste carbón durante horas y recibiste",
      "Desenterraste gemas preciosas y ganaste",
      "Excavaste profundamente y encontraste minerales raros por",
      "Trabajaste bajo tierra todo el día y obtuviste",
      "Puliste minerales y los vendiste por",
      "Minaste esmeraldas que intercambiaste por",
      "Encontraste un filón de plata y ganaste",
      "Extrajiste cobre de la veta principal y obtuviste",
      "Picaste roca durante horas y reuniste",
      "Hallaste un diamante en bruto y lo vendiste por",
      "Cargaste vagonetas de mineral y te pagaron",
      "Encontraste cuarzo valioso y ganaste",
      "Excavaste un túnel nuevo y hallaste minerales por",
      "Vendiste chatarra metálica de la mina por",
      "Encontraste una bolsa de monedas antiguas y ganaste",
      "Reparaste herramientas de la mina y te pagaron",
      "Detonaste cargas controladas y encontraste mineral por",
      "Clasificaste rocas valiosas y ganaste",
      "Llevaste el mineral al mercado y obtuviste",
      "Encontraste una cueva con cristales y ganaste",
      "Trabajaste el turno nocturno en la mina y ganaste",
      "Ayudaste a transportar el mineral y te pagaron",
      "Descubriste una veta nueva sin explorar y ganaste",
      "Vendiste piedras semipreciosas por",
      "Encontraste un cofre olvidado en un túnel y ganaste",
      "Reforzaste los túneles de la mina y te pagaron",
      "Encontraste un yacimiento de zinc y ganaste",
      "Extrajiste mineral de titanio y vendiste por",
      "Hallaste una gruta con pepitas de oro y ganaste",
      "Operaste la perforadora todo el día y ganaste",
      "Vendiste rocas pulidas a coleccionistas por",
      "Encontraste un cristal gigante y lo vendiste por",
      "Excavaste cerca del río y hallaste oro por",
      "Limpiaste sedimentos del túnel y encontraste mineral por",
      "Cargaste explosivos con cuidado y la mina pagó",
      "Hallaste una bolsa de gemas enterradas y ganaste",
      "Vendiste el carbón extraído por",
      "Encontraste plata pura en una grieta y ganaste",
      "Operaste la draga del río y ganaste",
      "Encontraste una veta de níquel y vendiste por",
      "Excavaste de madrugada y hallaste mineral por",
      "Llevaste muestras al laboratorio y te pagaron",
      "Encontraste topacios entre la roca y vendiste por",
      "Reparaste los rieles de la mina y te pagaron",
      "Vendiste mineral en bruto al mejor postor por",
      "Descubriste una cámara secreta con tesoro y ganaste",
    ]

    const reward = randomInt(1000, 2000)
    const message = libs.pickRandom(messages)

    try {
      const conn = getConnection()
      conn.run(
        `UPDATE group_users SET money = money + ?, last_mining_ago = ? WHERE group_jid = ? AND user_jid = ?`,
        [reward, now, scopedGroupJid, mctx.sender.jid],
      )

      const newBalance = Math.max(0, Math.floor(Number(groupUser.money) || 0)) + reward
      await mctx.reply(
        `「◈」 ${message} *${formatMoney(reward, currency)}*\n` +
        `⟡ Dinero › *${formatMoney(newBalance, currency)}*`,
      )
    } catch (error) {
      console.error("[Mine] Error:", error)
      await mctx.reply(`「◈」 Error al procesar la minería.`)
    }
  },
}

export default command
