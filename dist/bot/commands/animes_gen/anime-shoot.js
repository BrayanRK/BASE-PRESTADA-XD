import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "shoot",
    alias: ["disparar"],
    description: "Dispara a alguien.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["only.groups"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "shoot",
            selfCaption: (actor) => `\`${actor}\` dispara al aire 🔫`,
            targetCaption: (actor, target) => `\`${actor}\` dispara a \`${target}\` 🔫`,
        });
    },
};
