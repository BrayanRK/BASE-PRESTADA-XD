import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "cry",
  alias: ["llora", "llorar"],
  description: "Llora.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["all.chats"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "cry",
      selfCaption: (actor) => `\`${actor}\` está llorando 😭`,
    })
  },
} as types.Command
