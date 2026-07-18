import { dvyerGet, evogbGet } from "../../../libs/downloads.js";
export default {
    name: "apistatus",
    alias: ["scrats", "apicheck"],
    description: "Muestra el estado de las APIs.",
    category: "downloaders",
    using: "",
    flags: ["all.chats"],
    requires: [],
    hidden: false,
    execute: async (_wss, { mctx }) => {
        await mctx.react("⌛");
        const [dvyer, evogb] = await Promise.allSettled([
            dvyerGet("/ping").catch(() => dvyerGet("/health")),
            evogbGet("/ping").catch(() => evogbGet("/health")),
        ]);
        const ok = "✅";
        const fail = "❌";
        const dvyerStatus = dvyer.status === "fulfilled" ? ok : fail;
        const evogbStatus = evogb.status === "fulfilled" ? ok : fail;
        await mctx.reply(`「◈」 *Estado de APIs*\n\n${dvyerStatus} DV-YER\n${evogbStatus} EVOGB`);
        await mctx.react("✅");
    },
};
