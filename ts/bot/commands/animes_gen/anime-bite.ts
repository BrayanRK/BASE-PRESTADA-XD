import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "bite",
  alias: ["morder"],
  description: "Muerde a alguien.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["only.groups"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "bite",
      selfCaption: (actor) => `\`${actor}\` se muerde 🐾`,
      targetCaption: (actor, target) => `\`${actor}\` muerde a \`${target}\` 🐾`,
    })
  },
} as types.Command
