import type * as types from "../../../types/types.js"
import { sendAnimeReaction } from "../../../libs/anime-reactions.js"

export default {
  name: "cuddle",
  alias: ["acurruca"],
  description: "Acurruca a alguien.",
  category: "anime",
  hidden: false,
  requires: [],
  flags: ["only.groups"],
  execute: async (wss, ectx) => {
    await sendAnimeReaction(wss, ectx, {
      category: "cuddle",
      selfCaption: (actor) => `\`${actor}\` se acurruca 🥰`,
      targetCaption: (actor, target) => `\`${actor}\` acurruca a \`${target}\` 🥰`,
    })
  },
} as types.Command
