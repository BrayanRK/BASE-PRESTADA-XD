import { sendAnimeReaction } from "../../../libs/anime-reactions.js";
export default {
    name: "peck",
    alias: ["pico"],
    description: "Da un picotazo o un beso rápido.",
    category: "anime",
    hidden: false,
    requires: [],
    flags: ["only.groups"],
    execute: async (wss, ectx) => {
        await sendAnimeReaction(wss, ectx, {
            category: "peck",
            selfCaption: (actor) => `\`${actor}\` se da un picotazo 😗`,
            targetCaption: (actor, target) => `\`${actor}\` le da un picotazo a \`${target}\` 😗`,
        });
    },
};
