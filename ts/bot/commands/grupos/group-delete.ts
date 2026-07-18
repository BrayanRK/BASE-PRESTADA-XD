import type * as types from "../../../types/types.js"

export default {
  name: "delete",
  alias: ["del"],
  using: "<cite>",
  description: "Elimina el mensaje citado de un participante",
  category: "group",
  hidden: false,
  flags: ["only.groups"],
  requires: ["administrator", "administrator.user"],
  execute: async (wss, { mctx }) => {
    if (!mctx.quoted) {
      await mctx.reply("「☄」 Cita el mensaje que quieras eliminar.")
      return
    }

    try {
      await mctx.quoted.delete()
      await mctx.react("✅")
    } catch (error: any) {
      await mctx.reply(`「☄」 Error al eliminar el mensaje: ${error.message || error}`)
    }
  },
} as types.Command
