import * as types from "../../../types/types.js"
import * as database from "../../../database/database.js"

const normalizeGenre = (value: string): string | null => {
  const text = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()
  if (["hombre", "masculino", "m", "male"].includes(text)) return "Hombre"
  if (["mujer", "femenino", "f", "female"].includes(text)) return "Mujer"
  return null
}

export default <types.Command>{
  name: "setgenre",
  alias: [],
  description: "Establecer tu genero.",
  category: "main",
  using: "Hombre | Mujer",
  hidden: false,
  requires: [],
  flags: ["only.groups"],
  execute: async (_, { mctx, args }) => {
    const genre = normalizeGenre(args[0] || "")

    if (!genre) {
      await mctx.reply("「✖」 Género inválido.")
      return
    }

    await database.Users.update(mctx.sender.jid, {
      $set: {
        genre,
      },
    })

    await mctx.reply(`「♛」 Perfil\n│ Género actualizado.\n╰ Género › *${genre}*`)
  },
}
