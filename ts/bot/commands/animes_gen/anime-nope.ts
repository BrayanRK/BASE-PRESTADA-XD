import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "no",
  alias: ["nope"],
  description: "Dice 'no'.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["all.chats"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "nope",
      selfCaption: (actor) => `\`${actor}\` dice 'no' 🙅‍♀️`,
    })
  },
} as types.Command
