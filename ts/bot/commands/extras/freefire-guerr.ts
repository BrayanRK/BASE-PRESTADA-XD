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
  name: "guerr",
  alias: ["guerra", "guerraclan", "ffguerra"],
  description: "Organizar guerra de clanes Free Fire.",
  using: "[hora]",
  category: "extras",
  hidden: true,
  flags: ["only.groups"],
  requires: [],
  execute: async (wss, ctx) => {
    if (!(await guardFreeFireCommand(wss, ctx))) return

    const rawTime = ctx.args.join(" ").trim()
    if (!rawTime || !parseTimeInput(rawTime)) {
      await ctx.mctx.reply(
        `${freeFireHeader("Guerra de clanes", [`Uso › ${ctx.usedPrefix}guerr 8:00pm`])}\n\n╎ Formatos válidos: *8pm*, *8:30pm*, *20:30*`,
      )
      return
    }

    await ctx.mctx.react("⚔️").catch(() => {})

    const participants = await getGroupParticipants(wss, ctx)
    const required = 30
    if (participants.length < required) {
      await ctx.mctx.reply(
        `${freeFireHeader("Faltan jugadores", [
          "Modalidad › Guerra de clanes",
          `Necesarios › ${required}`,
          `Disponibles › ${participants.length}`,
        ])}\n\n╎ Se arman 6 escuadras y suplentes.`,
      )
      return
    }

    const picked = shuffle(participants)
    const mentions: string[] = []
    let text = freeFireHeader("Guerra de clanes", [
      `Clan › ${ctx.mctx.chat.name || "Clan"}`,
      "Modalidad › 6 escuadras",
      "Jugadores › 30",
    ])

    text += `\n\n⟡ Horarios\n${renderSchedule(rawTime)}`
    text += `\n\n⟡ Alineación`

    let cursor = 0
    for (let i = 0; i < 6; i++) {
      const squad = picked.slice(cursor, cursor + 4)
      cursor += 4
      mentions.push(...squad.map((p) => p.id))
      text += `\n\n「◈」 Escuadra ${i + 1}\n${renderPlayers(squad)}`
      text += `\n◈ Rol › presión / cobertura`
    }

    const substitutes = picked.slice(cursor, cursor + 6)
    mentions.push(...substitutes.map((p) => p.id))
    text += `\n\n「◈」 Suplentes\n${renderPlayers(substitutes)}`
    text += `\n\n╎ Suerte clan, jueguen serio y sin lloros.`

    await wss.sendMessage(
      ctx.mctx.chat.jid,
      { text, mentions: Array.from(new Set(mentions)) },
      { quoted: ctx.mctx.message.original },
    )
  },
}

export default command
