import type * as types from "../../../types/types.js"
import { getConnection } from "../../../database/connect.js"

const command: types.Command = {
  name: "updatedb",
  alias: [],
  description: "Actualiza la estructura de la base de datos",
  category: "owner",
  flags: ["all.chats"],
  requires: ["bot.owner"],
  hidden: false,
  execute: async (wss, { mctx }) => {
    await mctx.reply("「♛」 Actualizando base de datos...")

    return new Promise<void>((resolve) => {
      try {
        const conn = getConnection()

        conn.run("ALTER TABLE users ADD COLUMN sticker_pack TEXT DEFAULT NULL", (err) => {
          if (err && !err.message.includes("duplicate column name")) {
            console.error("Error adding sticker_pack:", err)
          }

          conn.run("ALTER TABLE users ADD COLUMN sticker_author TEXT DEFAULT NULL", async (err) => {
            if (err && !err.message.includes("duplicate column name")) {
              console.error("Error adding sticker_author:", err)
              await mctx.reply("「✘」 Error actualizando base de datos")
            } else {
              await mctx.reply("「❖」 Base de datos actualizada exitosamente")
            }
            resolve()
          })
        })
      } catch (error) {
        console.error("Error updating database:", error)
        mctx.reply("「✘」 Error actualizando base de datos")
        resolve()
      }
    })
  },
}

export default command
