import type * as types from "../../../types/types.js"
import { getConnection } from "../../../database/connect.js"
import * as libs from "../../../libs/libs.js"
import { cooldownMessage, formatMoney, getCurrency, getGroupUser, percent, randomInt } from "../../../libs/economy.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"

const command: types.Command = {
  name: "crime",
  alias: [],
  description: "Ganar {currency} rápido con riesgo. Puedes ganar 1,800 a 6,500 o perder 500 a 2,500.",
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
    const crimeInterval = 1_800_000
    const timeDifference = now - ((groupUser as types.GroupUserDocument & { last_crime_ago?: number }).last_crime_ago || 0)

    if (timeDifference < crimeInterval) {
      await mctx.reply(cooldownMessage(usedPrefix, "crime", libs.formatDuration(crimeInterval - timeDifference)))
      return
    }

    const successMessages = [
      "La jugada salió limpia y ganaste",
      "Abriste una caja fuerte digital y sacaste",
      "Escapaste justo a tiempo y conseguiste",
      "El trato raro salió bien y te pagaron",
      "Hackeaste un cajero automático y sacaste",
      "Vendiste información robada y ganaste",
      "Asaltaste una tienda vacía y te llevaste",
      "Falsificaste documentos y cobraste",
      "Estafaste a un comprador distraído y ganaste",
      "Robaste un cargamento sin ser visto y vendiste por",
      "Sobornaste a un guardia y conseguiste",
      "Clonaste tarjetas y retiraste",
      "Vendiste mercancía robada en el mercado negro y ganaste",
      "El golpe salió perfecto y te llevaste",
      "Escapaste de la policía con el botín y ganaste",
      "Hiciste un fraude exitoso y ganaste",
      "Vaciaste una bodega abandonada y vendiste por",
      "Negociaste con la mafia local y ganaste",
      "El plan A funcionó a la perfección y obtuviste",
      "Lavaste dinero sin ser detectado y ganaste",
      "Asaltaste un camión blindado y te llevaste",
      "Vendiste armas falsas a un comprador ingenuo y ganaste",
      "Distrajiste a los guardias y robaste",
      "Forzaste una cerradura sin alarmas y sacaste",
      "Cruzaste la frontera con mercancía y ganaste",
      "Engañaste a un cómplice rival y ganaste",
      "El soplón te avisó a tiempo y escapaste con",
      "Pirateaste una cuenta bancaria y retiraste",
      "Vendiste un auto robado y ganaste",
      "Timaste a un turista despistado y ganaste",
      "Asaltaste una casa de empeño y te llevaste",
      "Intervino un cómplice nuevo y el golpe salió bien, ganaste",
      "Saqueaste un depósito olvidado y vendiste por",
      "Falsificaste billetes y los cambiaste por",
      "Robaste joyas de una vitrina y vendiste por",
      "Secuestraste un envío y lo revendiste por",
      "Hiciste contrabando exitoso y ganaste",
      "Asaltaste a un cobrador de impuestos y conseguiste",
      "Robaste combustible de un depósito y vendiste por",
      "Te infiltraste en una bodega y sacaste",
      "Vendiste pasaportes falsos y ganaste",
      "Asaltaste un furgón de reparto y te llevaste",
      "Engañaste a un prestamista y ganaste",
      "Falsificaste una firma importante y cobraste",
      "Vendiste datos bancarios filtrados y ganaste",
      "Robaste cables de cobre y los vendiste por",
      "Asaltaste una casa vacía y te llevaste",
      "Hiciste una apuesta amañada y ganaste",
      "Estafaste con un negocio falso y ganaste",
      "Vendiste copias falsificadas y ganaste",
    ]
    const failMessages = [
      "Te atraparon y pagaste una multa de",
      "La jugada salió mal y perdiste",
      "Tu cómplice te traicionó y te quitó",
      "Fallaste el escape y soltaste",
      "La policía te interceptó y pagaste",
      "El plan se filtró y perdiste",
      "Te tendieron una trampa y perdiste",
      "El soborno no funcionó y pagaste",
      "Te identificaron por las cámaras y pagaste",
      "El comprador era un policía encubierto y perdiste",
      "Activaste la alarma y tuviste que pagar",
      "Te delataron y pagaste una fianza de",
      "El golpe salió mal desde el principio y perdiste",
      "Perdiste el botín huyendo y soltaste",
      "Te robaron a ti mismo y perdiste",
      "El auto de escape no llegó y pagaste",
      "Tu arma se atascó y terminaste pagando",
      "Caíste en una emboscada y perdiste",
      "El guardia te reconoció y pagaste",
      "Te descubrieron antes de empezar y perdiste",
      "Pagaste a un abogado para salir libre, perdiste",
      "El cómplice se quedó con todo y perdiste",
      "Te rastrearon por el celular y pagaste",
      "La banda rival te robó el botín y perdiste",
      "Te arrestaron a mitad del golpe y pagaste",
      "El plan se vino abajo y pagaste",
      "Resbalaste al escapar y perdiste",
      "Te vendió un informante falso y pagaste",
      "La caja fuerte tenía alarma silenciosa y pagaste",
      "Te bloquearon la cuenta bancaria y perdiste",
      "El cargamento era falso y perdiste",
      "Te cobraron protección y pagaste",
      "La policía ya te esperaba y pagaste",
      "Perdiste el control del vehículo huyendo y pagaste",
      "Te reconoció una cámara de seguridad y pagaste",
      "El golpe se canceló a último minuto y perdiste",
      "Un testigo llamó a la policía y pagaste",
      "Te traicionó tu propio contacto y perdiste",
      "La mercancía resultó ser falsa y perdiste",
      "Te cobraron una deuda pendiente del barrio y pagaste",
      "Se rompió la cerradura antes de tiempo y perdiste",
      "Te superó la seguridad del lugar y pagaste",
      "El intercambio salió mal y perdiste",
      "Caíste en una redada policial y pagaste",
      "Perdiste la pista del objetivo y gastaste",
      "Un rival te delató con la policía y pagaste",
      "Te quedaste sin combustible huyendo y pagaste",
      "El plan B también falló y perdiste",
      "Tropezaste con la alarma silenciosa y pagaste",
      "Un vecino llamó a la policía y pagaste",
    ]

    const won = percent(62)
    const reward = randomInt(1800, 6500)
    const penalty = Math.min(groupUser.money, randomInt(500, 2500))

    try {
      const conn = getConnection()

      if (won) {
        conn.run(
          `UPDATE group_users SET money = money + ?, last_crime_ago = ? WHERE group_jid = ? AND user_jid = ?`,
          [reward, now, scopedGroupJid, mctx.sender.jid],
        )
        await mctx.reply(`✦ ${libs.pickRandom(successMessages)} *${formatMoney(reward, currency)}*.`)
        return
      }

      conn.run(
        `UPDATE group_users SET money = money - ?, last_crime_ago = ? WHERE group_jid = ? AND user_jid = ?`,
        [penalty, now, scopedGroupJid, mctx.sender.jid],
      )
      await mctx.reply(`「◈」 ${libs.pickRandom(failMessages)} *${formatMoney(penalty, currency)}*.`)
    } catch (error) {
      console.error("[Crime] Error:", error)
      await mctx.reply(`「◈」 Error al procesar el crimen.`)
    }
  },
}

export default command
