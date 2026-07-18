import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "handshake",
  alias: ["strechar"],
  description: "Estrecha la mano de alguien.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["only.groups"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "handshake",
      selfCaption: (actor) => `\`${actor}\` estrecha su propia mano 🤝`,
      targetCaption: (actor, target) => `\`${actor}\` estrecha la mano de \`${target}\` 🤝`,
    })
  },
} as types.Command
