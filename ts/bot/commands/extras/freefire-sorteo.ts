import type * as types from "../../../types/types.js"
import {
  freeFireHeader,
  getGroupParticipants,
  guardFreeFireCommand,
  parseTimeInput,
  renderPlayers,
  renderSchedule,
  shuffle,
} from "../../../libs/freefire.js"

const command: types.Command = {
  name: "ffsorteo",
  alias: ["ffsquad", "sorteoff", "squadff"],
  description: "Sortear escuadras personalizadas para Free Fire.",
  using: "[escuadras] [hora]",
  category: "extras",
  hidden: true,
  flags: ["only.groups"],
  requires: [],
  execute: async (wss, ctx) => {
    if (!(await guardFreeFireCommand(wss, ctx))) return

    const squads = Math.min(12, Math.max(2, Number.parseInt(ctx.args[0] || "", 10) || 2))
    const rawTime = ctx.args.slice(Number.isFinite(Number(ctx.args[0])) ? 1 : 0).join(" ").trim()
    if (!rawTime || !parseTimeInput(rawTime)) {
      await ctx.mctx.reply(
        `${freeFireHeader("Sorteo Free Fire", [`Uso › ${ctx.usedPrefix}ffsorteo 4 8:00pm`])}\n\n╎ El primer número es la cantidad de escuadras.`,
      )
      return
    }

    const required = squads * 4
    const participants = await getGroupParticipants(wss, ctx)
    if (participants.length < required) {
      await ctx.mctx.reply(
        `${freeFireHeader("Faltan jugadores", [
          `Escuadras › ${squads}`,
          `Necesarios › ${required}`,
          `Disponibles › ${participants.length}`,
        ])}`,
      )
      return
    }

    const picked = shuffle(participants)
    const mentions: string[] = []
    let text = freeFireHeader("Sorteo Free Fire", [
      `Escuadras › ${squads}`,
      `Grupo › ${ctx.mctx.chat.name || "grupo"}`,
    ])
    text += `\n\n⟡ Horarios\n${renderSchedule(rawTime)}`

    for (let i = 0; i < squads; i++) {
      const squad = picked.slice(i * 4, i * 4 + 4)
      mentions.push(...squad.map((p) => p.id))
      text += `\n\n「◈」 Escuadra ${i + 1}\n${renderPlayers(squad)}`
    }

    await wss.sendMessage(
      ctx.mctx.chat.jid,
      { text, mentions: Array.from(new Set(mentions)) },
      { quoted: ctx.mctx.message.original },
    )
  },
}

export default command
