import type * as types from "../../../types/types.js"

const command: types.Command = {
  name: "leave",
  alias: ["salir"],
  description: "Salir de un grupo",
  category: "bot",
  hidden: false,
  requires: ["bot.owner"],
  flags: ["only.groups"],
  execute: async (wss, { mctx }) => {
    await mctx.reply(`「⚙」 Leave\n│ Estado › saliendo del grupo\n╰ Grupo › ${mctx.chat.name}`)
    await wss.groupLeave(mctx.chat.jid)
  },
}

export default command
