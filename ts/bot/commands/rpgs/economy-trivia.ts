import type * as types from "../../../types/types.js"
import { getConnection } from "../../../database/connect.js"
import * as libs from "../../../libs/libs.js"
import { cooldownMessage, formatMoney, getCurrency, getGroupUser, randomInt } from "../../../libs/economy.js"
import { getScopedGroupJid } from "../../../libs/bot-scope.js"

type Question = { q: string; answers: string[]; reward: [number, number] }

const QUESTIONS: Question[] = [
  { q: "¿Cuál es el río más largo del mundo?", answers: ["amazonas"], reward: [2000, 5000] },
  { q: "¿En qué país se encuentra la Torre Eiffel?", answers: ["francia"], reward: [1500, 3500] },
  { q: "¿Cuántos continentes hay en el mundo?", answers: ["7", "siete"], reward: [1500, 3500] },
  { q: "¿Cuál es el planeta más cercano al Sol?", answers: ["mercurio"], reward: [1500, 3500] },
  { q: "¿Qué gas respiramos principalmente para vivir?", answers: ["oxigeno", "oxígeno"], reward: [1000, 3000] },
  { q: "¿Cuántos lados tiene un hexágono?", answers: ["6", "seis"], reward: [1000, 3000] },
  { q: "¿En qué año llegó el ser humano a la Luna?", answers: ["1969"], reward: [2500, 5500] },
  { q: "¿Cuál es el animal terrestre más grande del mundo?", answers: ["elefante"], reward: [1500, 3500] },
  { q: "¿Cuál es la capital de Japón?", answers: ["tokio", "tokyo"], reward: [1500, 3500] },
  { q: "¿Cuántos huesos tiene el cuerpo humano adulto?", answers: ["206"], reward: [2500, 5500] },
  { q: "¿Qué océano es el más grande del mundo?", answers: ["pacifico", "pacífico"], reward: [2000, 5000] },
  { q: "¿Cuál es el metal líquido a temperatura ambiente?", answers: ["mercurio"], reward: [2000, 5000] },
]

const triviaAnswerTimeout = 30_000
const triviaCooldown = 60_000
const pendingTrivia = new Map<string, { question: Question; expiresAt: number; timeout: NodeJS.Timeout }>()

const normalize = (text: string): string =>
  String(text ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")

const sessionKey = (chatJid: string, userJid: string): string => `${chatJid}:${userJid}`

const command: types.Command = {
  name: "trivia",
  alias: [],
  description: "Responder una pregunta de trivia para ganar {currency}. Tienes 30 segundos para responder.",
  category: "economy",
  using: "<respuesta> | primero usa el comando solo para recibir la pregunta",
  hidden: false,
  flags: ["only.groups"],
  requires: [],
  execute: async (_, { mctx, args, group, bot, usedPrefix }) => {
    const currency = getCurrency(bot)
    const scopedGroupJid = getScopedGroupJid(bot, mctx.chat.jid)
    const groupUser = getGroupUser(group, mctx.sender.jid)
    const key = sessionKey(mctx.chat.jid, mctx.sender.jid)

    if (!groupUser) {
      await mctx.reply(`「◈」 No se pudo obtener tus datos en este grupo, vuelve a intentarlo.`)
      return
    }

    const pending = pendingTrivia.get(key)
    const reply = args.join(" ").trim()

    if (pending && reply) {
      const isCorrect = pending.question.answers.some((answer) => normalize(answer) === normalize(reply))

      clearTimeout(pending.timeout)
      pendingTrivia.delete(key)

      if (!isCorrect) {
        await mctx.reply(`「◈」 Trivia\n⟡ Respuesta incorrecta. La correcta era: *${pending.question.answers[0]}*`)
        return
      }

      const reward = randomInt(pending.question.reward[0], pending.question.reward[1])
      const now = Date.now()

      try {
        const conn = getConnection()
        conn.run(
          `UPDATE group_users SET money = money + ?, last_trivia_ago = ? WHERE group_jid = ? AND user_jid = ?`,
          [reward, now, scopedGroupJid, mctx.sender.jid],
        )

        await mctx.reply(`「◈」 Trivia\n⟡ ¡Correcto! 🎉\n⟡ Premio » +*${formatMoney(reward, currency)}*`)
      } catch (error) {
        console.error("[Trivia] Error:", error)
        await mctx.reply(`「◈」 Error al procesar el premio.`)
      }
      return
    }

    if (pending) {
      await mctx.reply(`「◈」 Trivia\n⟡ Ya tienes una pregunta pendiente, responde con:\n*${usedPrefix}trivia <respuesta>*`)
      return
    }

    const now = Date.now()
    const timeDifference = now - (groupUser.last_trivia_ago || 0)

    if (timeDifference < triviaCooldown) {
      await mctx.reply(cooldownMessage(usedPrefix, "trivia", libs.formatDuration(triviaCooldown - timeDifference)))
      return
    }

    const question = libs.pickRandom(QUESTIONS)
    const timeout = setTimeout(() => {
      pendingTrivia.delete(key)
    }, triviaAnswerTimeout)

    pendingTrivia.set(key, { question, expiresAt: now + triviaAnswerTimeout, timeout })

    await mctx.reply(
      `「◈」 Trivia\n⟡ ${question.q}\n⟡ Tienes *30 segundos*, responde con:\n*${usedPrefix}trivia <respuesta>*`,
    )
  },
}

export default command
