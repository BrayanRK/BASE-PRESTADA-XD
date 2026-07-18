import type * as types from "../../../types/types.js"

const command: types.Command = {
  name: "ping",
  alias: ["p"],
  description: "Verifica la latencia del bot",
  using: "",
  category: "main",
  flags: ["only.groups"],
  requires: [],
  hidden: false,
  execute: async (wss, { mctx }) => {
    try {
      const start = Date.now()
      const response = await mctx.reply(`「♛」 Ping!`)
      const end = Date.now()
      const latency = end - start

      if (response && typeof response === "object" && "key" in response) {
        await wss.sendMessage(mctx.chat.jid, {
          text: `*✧* Pong!\n*⏱️* Latencia: ${latency}ms`,
          edit: response.key,
        })
      } else {
        await mctx.reply(`「♛」 Pong!\n*⏱️* Latencia: ${latency}ms`)
      }
    } catch (error) {
      await mctx.reply(`「♛」 Error al medir la latencia`)
    }
  },
}

export default command
