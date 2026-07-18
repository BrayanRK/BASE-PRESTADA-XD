import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "run",
  alias: ["correr"],
  description: "Corre.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["all.chats"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "run",
      selfCaption: (actor) => `\`${actor}\` está corriendo 🏃‍♀️`,
    })
  },
} as types.Command
