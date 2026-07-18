import { freeFireHeader, guardFreeFireCommand } from "../../../libs/freefire.js";
const maps = [
    "https://cdn.russellxz.click/b55d4ed4.jpeg",
    "https://cdn.russellxz.click/175045dc.jpeg",
    "https://cdn.russellxz.click/2559d309.jpeg",
    "https://cdn.russellxz.click/b7a5b400.jpeg",
];
const command = {
    name: "mapas",
    alias: ["mapa", "ffmapa", "ffmapas"],
    description: "Elegir un mapa aleatorio para el reto Free Fire.",
    category: "extras",
    hidden: true,
    flags: ["only.groups"],
    requires: [],
    execute: async (wss, ctx) => {
        if (!(await guardFreeFireCommand(wss, ctx)))
            return;
        await ctx.mctx.react("🗺️").catch(() => { });
        const selected = maps[Math.floor(Math.random() * maps.length)];
        const caption = `${freeFireHeader("Mapa asignado", [
            `Grupo › ${ctx.mctx.chat.name || "grupo"}`,
            "Modo › estrategia / reto",
        ])}\n\n⟡ Terreno listo\n╎ Organicen rotación, zona y cobertura.`;
        await wss.sendMessage(ctx.mctx.chat.jid, {
            image: { url: selected },
            caption,
        }, { quoted: ctx.mctx.message.original });
    },
};
export default command;
