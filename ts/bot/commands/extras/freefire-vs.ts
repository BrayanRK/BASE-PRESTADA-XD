import { freeFireHeader, guardFreeFireCommand, parseTimeInput } from "../../../libs/freefire.js"
import { parseVsMode, startInscripcion } from "../../../libs/freefire-inscripcion.js"
import type * as types from "../../../types/types.js"

const command: types.Command = {
  name: "ffvs",
  alias: ["ffinscripcion"],
  description: "Abrir inscripción para un versus Free Fire por respuesta o reacción.",
  using: "<modo> [hora]",
  category: "extras",
  hidden: true,
  flags: ["only.groups"],
  requires: [],
  execute: async (wss, ctx) => {
    if (!(await guardFreeFireCommand(wss, ctx))) return

    const [modeArg, ...rest] = ctx.args
    const mode = parseVsMode(modeArg || "")
    const rawTime = rest.join(" ").trim() || "8:00pm"

    if (!mode) {
      await ctx.mctx.reply(
        `${freeFireHeader("ffvs", [
          `Uso 》 ${ctx.usedPrefix}ffvs 4vs4 8:00pm`,
        ])}\n\n╎ Modalidad 》 de *1vs1* a *24vs24*, mismo número en ambos lados.`,
      )
      return
    }

    if (!parseTimeInput(rawTime)) {
      await ctx.mctx.reply(
        `${freeFireHeader("Hora inválida", [`Uso 》 ${ctx.usedPrefix}ffvs ${mode.raw} 8:00pm`])}\n\n╎ Formatos válidos: *8pm*, *8:30pm*, *20:30*`,
      )
      return
    }

    await ctx.mctx.react("📝").catch(() => {})
    await startInscripcion(wss, ctx, mode, rawTime)
  },
}

export default command
