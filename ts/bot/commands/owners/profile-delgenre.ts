import * as types from "../../../types/types.js"
import * as database from "../../../database/database.js"

export default <types.Command>{
  name: "delgenre",
  alias: [],
  description: "Eliminar tu genero.",
  category: "main",
  hidden: false,
  requires: [],
  flags: ["only.groups"],
  execute: async (_, { mctx }) => {
    await database.Users.update(mctx.sender.jid, {
      $set: {
        genre: null,
      },
    })

    await mctx.reply("「♛」 Perfil\n╰ Género eliminado.")
  },
}
