import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "lurk",
  alias: ["esconderse"],
  description: "Acecha o se esconde.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["all.chats"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "lurk",
      selfCaption: (actor) => `\`${actor}\` está acechando 👀`,
    })
  },
} as types.Command
