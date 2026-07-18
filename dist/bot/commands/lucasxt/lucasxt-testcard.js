import axios from "axios";
const CARD_IMAGE_URL = "https://files.catbox.moe/0tjxi1.png";
const CARD_TITLE = "WhatsApp Business";
const CARD_SUBTITLE = "📢 NOTIFICACIÓN";
const CARD_SOURCE_URL = "https://whatsapp.com";
const fetchBuffer = async (url) => {
    try {
        const res = await axios.get(url, {
            responseType: "arraybuffer",
            timeout: 15_000,
            maxContentLength: 5 * 1024 * 1024,
            headers: { "User-Agent": "Mozilla/5.0" },
        });
        const buf = Buffer.from(res.data);
        console.log(`[testcard] thumb descargado: ${buf.length} bytes`);
        return buf.length ? buf : null;
    }
    catch (err) {
        console.error("[testcard] fetchBuffer FALLÓ:", err);
        return null;
    }
};
export default {
    name: "testcardimg",
    alias: ["tci"],
    description: "Prueba card con linkPreview",
    category: "lucasxt",
    hidden: true,
    flags: ["all.chats"],
    requires: ["owner.user"],
    using: "[texto]",
    execute: async (wss, { mctx, args }) => {
        const text = args.join(" ").trim() || "test";
        console.log("[testcardimg] START — chat:", mctx.chat.jid);
        await mctx.react("⏳");
        console.log("[testcardimg] descargando imagen...");
        const thumb = await fetchBuffer(CARD_IMAGE_URL);
        if (!thumb) {
            await mctx.react("❌");
            return mctx.reply("No se pudo descargar la imagen.");
        }
        try {
            const result = await wss.sendMessage(mctx.chat.jid, {
                text: `${text}\n${CARD_SOURCE_URL}`,
                linkPreview: {
                    "matched-text": CARD_SOURCE_URL,
                    "canonical-url": CARD_SOURCE_URL,
                    title: CARD_TITLE,
                    description: CARD_SUBTITLE,
                    jpegThumbnail: thumb,
                }
            }, { quoted: mctx.message.original });
            console.log("[testcardimg] sendMessage OK — msgId:", result?.key?.id);
            await mctx.react("✅");
        }
        catch (err) {
            console.error("[testcardimg] sendMessage FALLÓ:", err);
            await mctx.react("❌");
            await mctx.reply(`「✖」 Error sendMessage: ${err instanceof Error ? err.message : String(err)}`);
        }
    },
};
