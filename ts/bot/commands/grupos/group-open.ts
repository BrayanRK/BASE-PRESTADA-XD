import type * as types from "../../../types/types.js"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getFreshMetadata = async (wss: types.WASocket, jid: string) => {
  return await wss.groupMetadata(jid, false).catch(() => null)
}

const groupCard = (title: string, lines: string[] = []): string =>
  [`「☄」 ${title}`, ...lines.map((line) => `│ ${line}`)].join("\n")

export default {
  name: "open",
  alias: ["abrir"],
  description: "Abrir el grupo para que todos los usuarios puedan enviar mensajes.",
  category: "group",
  hidden: false,
  flags: ["only.groups"],
  requires: ["administrator", "administrator.user"],
  execute: async (wss, { mctx }) => {
    const jid = mctx.chat.jid
    const metadata = await getFreshMetadata(wss, jid)

    if (!metadata) {
      await mctx.reply(groupCard("No pude leer el grupo.", ["Estado › metadata no disponible", "Solución › intenta otra vez."]))
      return
    }

    if (!metadata.announce) {
      await mctx.reply(groupCard("El grupo ya estaba abierto.", ["Estado › sin cambios", "Modo › todos pueden escribir."]))
      return
    }

    try {
      await wss.groupSettingUpdate(jid, "not_announcement")
      await sleep(500)

      const updated = await getFreshMetadata(wss, jid)
      if (updated?.announce) {
        await mctx.reply(groupCard("WhatsApp aún lo marca cerrado.", ["Estado › pendiente", "Solución › revisa admin e intenta otra vez."]))
        return
      }

      await mctx.reply(groupCard("El grupo fue abierto.", ["Estado › listo", "Modo › todos pueden escribir."]))
    } catch (error: any) {
      await mctx.reply(groupCard("Error al abrir el grupo.", [`Motivo › ${error.message || error}`]))
    }
  },
} as types.Command
