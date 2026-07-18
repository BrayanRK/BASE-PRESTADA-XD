import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "punch",
  alias: ["golpe"],
  description: "Golpea a alguien.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["only.groups"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "punch",
      selfCaption: (actor) => `\`${actor}\` golpea el aire 👊`,
      targetCaption: (actor, target) => `\`${actor}\` golpea a \`${target}\` 👊`,
    })
  },
} as types.Command
