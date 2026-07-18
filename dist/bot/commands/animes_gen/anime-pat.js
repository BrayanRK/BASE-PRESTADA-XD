import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "pat",
    alias: ["acariciar"],
    description: "Acaricia a alguien.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["only.groups"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "pat",
            selfCaption: (actor) => `\`${actor}\` se acaricia 👋`,
            targetCaption: (actor, target) => `\`${actor}\` acaricia a \`${target}\` 👋`,
        });
    },
};
