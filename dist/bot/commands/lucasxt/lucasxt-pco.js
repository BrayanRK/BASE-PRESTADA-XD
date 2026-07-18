import { getPcoConfig, setPcoEnabled, setPcoField, getMissingFields, fetchThumbnail } from "../../../libs/pco.js";
const card = (title, lines) => [`「◈」 PCO — ${title}`, ...lines.map((l) => `│ ${l}`)].join("\n");
export default {
    name: "pco",
    alias: ["channelcard", "pseudochannel"],
    description: "Configura el overlay de card de canal para mensajes de texto del bot.",
    category: "lucasxt",
    hidden: true,
    flags: ["all.chats"],
    requires: ["owner.user"],
    using: "<on|off|img <url>|title <texto>|subtitle <texto>|status>",
    execute: async (_wss, { mctx, args, bot, usedPrefix }) => {
        const botJid = bot?.bot_jid || mctx.me.jids.lid || mctx.me.jids.pn;
        const cfg = await getPcoConfig(botJid);
        const sub = (args[0] || "").toLowerCase();
        const rest = args.slice(1).join(" ").trim();
        // ── status ────────────────────────────────────────────────────────────────
        if (!sub || sub === "status" || sub === "info") {
            const missing = getMissingFields(cfg);
            await mctx.reply(card("Estado", [
                `Activo   › ${cfg.enabled ? "✅ sí" : "❌ no"}`,
                `Imagen   › ${cfg.image_url ? "✅ configurada" : "⚠ falta"}`,
                `Título   › ${cfg.title || "⚠ falta"}`,
                `Subtítulo› ${cfg.subtitle || "⚠ falta"}`,
                "",
                missing.length
                    ? `⚠ Faltan: ${missing.join(", ")}`
                    : "Todo configurado. Activa con .pco on",
            ]));
            return;
        }
        // ── on / off ──────────────────────────────────────────────────────────────
        if (sub === "on" || sub === "off") {
            const enabling = sub === "on";
            if (enabling) {
                const missing = getMissingFields(cfg);
                if (missing.length) {
                    await mctx.reply(card("Faltan datos para activar", [
                        "Configura lo siguiente primero:",
                        ...missing.map((m) => `◇ ${m}`),
                    ]));
                    return;
                }
            }
            await setPcoEnabled(botJid, enabling);
            await mctx.reply(card(enabling ? "Activado ✅" : "Desactivado ❌", [
                enabling
                    ? "Los mensajes de texto del bot se enviarán como card de canal."
                    : "Los mensajes de texto vuelven al formato normal.",
            ]));
            return;
        }
        // ── img <url> ─────────────────────────────────────────────────────────────
        if (sub === "img" || sub === "image" || sub === "imagen") {
            const url = rest;
            if (!url || !/^https?:\/\/.+/.test(url)) {
                await mctx.reply(card("Imagen", [
                    `Uso › ${usedPrefix}pco img https://i.imgur.com/ejemplo.jpg`,
                    "Debe ser una URL directa a imagen (jpg/png/webp).",
                ]));
                return;
            }
            await mctx.react("⏳");
            const thumb = await fetchThumbnail(url);
            if (!thumb) {
                await mctx.react("❌");
                await mctx.reply(card("Error", ["No pude descargar la imagen desde esa URL.", "Usa una URL pública directa."]));
                return;
            }
            await setPcoField(botJid, "image_url", url);
            await mctx.react("✅");
            await mctx.reply(card("Imagen actualizada ✅", [`URL › ${url.slice(0, 60)}${url.length > 60 ? "…" : ""}`]));
            return;
        }
        // ── title <texto> ─────────────────────────────────────────────────────────
        if (sub === "title" || sub === "titulo" || sub === "título") {
            if (!rest) {
                await mctx.reply(card("Título", [`Uso › ${usedPrefix}pco title Mi Bot Oficial`]));
                return;
            }
            await setPcoField(botJid, "title", rest);
            await mctx.reply(card("Título actualizado ✅", [`Título › ${rest}`]));
            return;
        }
        // ── subtitle <texto> ──────────────────────────────────────────────────────
        if (sub === "subtitle" || sub === "subtitulo" || sub === "subtítulo") {
            if (!rest) {
                await mctx.reply(card("Subtítulo", [`Uso › ${usedPrefix}pco subtitle Notificación oficial`]));
                return;
            }
            await setPcoField(botJid, "subtitle", rest);
            await mctx.reply(card("Subtítulo actualizado ✅", [`Subtítulo › ${rest}`]));
            return;
        }
        // ── fallback ──────────────────────────────────────────────────────────────
        await mctx.reply(card("Ayuda", [
            `${usedPrefix}pco on/off       › activar o desactivar`,
            `${usedPrefix}pco img <url>    › imagen del card`,
            `${usedPrefix}pco title <txt>  › título grande`,
            `${usedPrefix}pco subtitle <t> › texto debajo del título`,
            `${usedPrefix}pco status       › ver configuración actual`,
        ]));
    },
};
