import type * as types from "../../../types/types.js"
import { getConnection } from "../../../database/connect.js"
import * as libs from "../../../libs/libs.js"
import { cooldownMessage, formatMoney, getCurrency, getGroupUser, percent, randomInt } from "../../../libs/economy.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"

const command: types.Command = {
  name: "slut",
  alias: [],
  description: "Ganar {currency} con riesgo. Puedes ganar 1,200 a 5,200 o perder 300 a 1,800.",
  category: "economy",
  hidden: false,
  flags: ["only.groups"],
  requires: [],
  execute: async (_, { mctx, group, bot, usedPrefix }) => {
    const currency = getCurrency(bot)
    const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid)
    const groupUser = getGroupUser(group, mctx.sender.jid)

    if (!groupUser) {
      await mctx.reply(`「◈」 No se pudo obtener tus datos en este grupo, vuelve a intentarlo.`)
      return
    }

    const now = Date.now()
    const slutInterval = 1_200_000
    const timeDifference = now - ((groupUser as types.GroupUserDocument & { last_slut_ago?: number }).last_slut_ago || 0)

    if (timeDifference < slutInterval) {
      await mctx.reply(cooldownMessage(usedPrefix, "slut", libs.formatDuration(slutInterval - timeDifference)))
      return
    }

    const successMessages = [
      "La noche salió bien y ganaste",
      "Un cliente generoso te dejó",
      "Te fue mejor de lo esperado y recibiste",
      "Terminaste tu turno y juntaste",
      "Conseguiste un trabajo extra de última hora y ganaste",
      "Tuviste una buena racha de propinas y juntaste",
      "Atendiste a un cliente fijo y te pagó",
      "El evento de esta noche pagó bien y ganaste",
      "Cerraste un trato rápido y obtuviste",
      "Te contrataron por unas horas y ganaste",
      "La velada terminó mejor de lo esperado, ganaste",
      "Un grupo te pagó por completo y ganaste",
      "Te recomendaron con un nuevo cliente y ganaste",
      "El turno de hoy fue tranquilo y rentable, ganaste",
      "Recibiste una propina extra y juntaste",
      "Terminaste temprano y aun así ganaste",
      "Tuviste suerte con la clientela de hoy y ganaste",
      "El lugar estaba lleno esta noche y ganaste",
      "Cobraste por adelantado y recibiste",
      "Te pagaron en efectivo al instante y ganaste",
      "Hiciste varias citas seguidas y ganaste",
      "El cliente repitió su pedido y te pagó",
      "Trabajaste en un evento privado y ganaste",
      "Conseguiste clientes nuevos esta semana y ganaste",
      "Te dejaron una propina inesperada y recibiste",
      "El bar de hoy estuvo generoso y ganaste",
      "Atendiste una fiesta privada y cobraste",
      "Trabajaste horas extra y juntaste",
      "Te llamaron para un trabajo especial y ganaste",
      "Cerraste el mes con buenas cuentas, ganaste",
      "Conseguiste un contrato fijo y recibiste",
      "Un cliente nuevo pagó sin regatear y ganaste",
      "La agencia te asignó un buen turno y ganaste",
      "Tuviste un golpe de suerte y recibiste",
      "El cliente quedó satisfecho y dejó de propina",
      "Conseguiste trabajo extra el fin de semana y ganaste",
      "Tuviste varios clientes seguidos y juntaste",
      "El negocio del día rindió bien y ganaste",
      "Cerraste la noche con buenas ganancias, obtuviste",
      "Un cliente fiel volvió a contratarte y ganaste",
      "La demanda estuvo alta hoy y ganaste",
    ]
    const failMessages = [
      "El cliente se fue sin pagar y perdiste",
      "La noche salió horrible y gastaste",
      "Te tocó pagar transporte y comida, perdiste",
      "Cancelaron todo a última hora y soltaste",
      "Tuviste que pagar al local por el espacio y perdiste",
      "El cliente regateó demasiado y casi no ganaste, perdiste",
      "Te robaron la propina del turno y perdiste",
      "Gastaste todo en vestuario para el evento y perdiste",
      "La noche estuvo muy floja y perdiste",
      "Pagaste una multa por llegar tarde y perdiste",
      "Tuviste un imprevisto y gastaste",
      "El intermediario se quedó con su parte y perdiste",
      "Tuviste que cancelar y devolver el pago, perdiste",
      "Gastaste en transporte de ida y vuelta y perdiste",
      "El cliente resultó ser un estafador y perdiste",
      "No hubo clientes en toda la noche y perdiste",
      "Te cobraron una comisión alta y perdiste",
      "Tuviste que pagar el maquillaje del evento y perdiste",
      "Se canceló el contrato a última hora y perdiste",
      "Pagaste por publicidad que no funcionó y perdiste",
      "Te quedaste sin transporte y gastaste",
      "El cliente desapareció sin avisar y perdiste",
      "Pagaste el alquiler del local y perdiste",
      "Una mala referencia te costó clientes y perdiste",
      "Te cobraron de más por el lugar y perdiste",
      "Tuviste que reembolsar a un cliente molesto y perdiste",
      "El evento se suspendió y perdiste lo invertido",
      "Pagaste por un servicio que no usaste y perdiste",
      "Te cobraron una penalidad por cancelar y perdiste",
      "Gastaste más de lo planeado en transporte y perdiste",
    ]

    const won = percent(70)
    const reward = randomInt(1200, 5200)
    const penalty = Math.min(groupUser.money, randomInt(300, 1800))

    try {
      const conn = getConnection()

      if (won) {
        conn.run(
          `UPDATE group_users SET money = money + ?, last_slut_ago = ? WHERE group_jid = ? AND user_jid = ?`,
          [reward, now, scopedGroupJid, mctx.sender.jid],
        )
        await mctx.reply(`✦ ${libs.pickRandom(successMessages)} *${formatMoney(reward, currency)}*.`)
        return
      }

      conn.run(
        `UPDATE group_users SET money = money - ?, last_slut_ago = ? WHERE group_jid = ? AND user_jid = ?`,
        [penalty, now, scopedGroupJid, mctx.sender.jid],
      )
      await mctx.reply(`「◈」 ${libs.pickRandom(failMessages)} *${formatMoney(penalty, currency)}*.`)
    } catch (error) {
      console.error("[Slut] Error:", error)
      await mctx.reply(`「◈」 Error al procesar el comando.`)
    }
  },
}

export default command
