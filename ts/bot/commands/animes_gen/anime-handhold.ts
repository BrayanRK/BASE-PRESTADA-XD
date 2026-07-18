import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "handhold",
  alias: ["hhd"],
  description: "Toma la mano de alguien.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["only.groups"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "handhold",
      selfCaption: (actor) => `\`${actor}\` toma su propia mano 🤝`,
      targetCaption: (actor, target) => `\`${actor}\` toma la mano de \`${target}\` 🤝`,
    })
  },
} as types.Command
