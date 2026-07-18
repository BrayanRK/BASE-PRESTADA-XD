/**
 * PCO — Pseudo Channel Overlay
 * Wrap text-only bot messages as locationMessage to render like
 * a WhatsApp Business channel notification (title · subtitle · thumbnail).
 */
import { getConnection } from "../database/connect.js";
import axios from "axios";
const KEY_ENABLED = "pco:enabled";
const KEY_IMAGE = "pco:image_url";
const KEY_TITLE = "pco:title";
const KEY_SUBTITLE = "pco:subtitle";
const dbGet = (botJid, key) => new Promise((resolve) => {
    getConnection().get(`SELECT value FROM bot_settings WHERE bot_jid = ? AND key = ?`, [botJid, key], (err, row) => resolve(err || !row ? null : row.value));
});
const dbSet = (botJid, key, value) => new Promise((resolve) => {
    getConnection().run(`INSERT INTO bot_settings (bot_jid, key, value, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(bot_jid, key) DO UPDATE SET
         value = excluded.value, updated_at = CURRENT_TIMESTAMP`, [botJid, key, value], () => resolve());
});
export const getPcoConfig = async (botJid) => ({
    enabled: (await dbGet(botJid, KEY_ENABLED)) === "1",
    image_url: await dbGet(botJid, KEY_IMAGE) ?? "",
    title: await dbGet(botJid, KEY_TITLE) ?? "",
    subtitle: await dbGet(botJid, KEY_SUBTITLE) ?? "",
});
export const setPcoEnabled = (botJid, on) => dbSet(botJid, KEY_ENABLED, on ? "1" : "0");
export const setPcoField = (botJid, field, value) => {
    const map = { image_url: KEY_IMAGE, title: KEY_TITLE, subtitle: KEY_SUBTITLE };
    return dbSet(botJid, map[field], value);
};
// Module-level thumbnail cache — shared across all reply calls
const _thumbCache = new Map();
const THUMB_TTL = 10 * 60 * 1000;
/** Download image URL → Buffer, cached 10 min */
export const fetchThumbnail = async (url) => {
    const hit = _thumbCache.get(url);
    if (hit && Date.now() - hit.ts < THUMB_TTL)
        return hit.buf;
    try {
        const res = await axios.get(url, {
            responseType: "arraybuffer",
            timeout: 10_000,
            maxContentLength: 5 * 1024 * 1024,
        });
        const buf = Buffer.from(res.data);
        _thumbCache.set(url, { buf, ts: Date.now() });
        return buf;
    }
    catch {
        _thumbCache.set(url, { buf: null, ts: Date.now() });
        return null;
    }
};
/**
 * Returns true when a sendMessage payload is a plain text message
 * that should be wrapped as PCO (no media, no react, no delete, no edit).
 */
export const isTextOnlyPayload = (content) => {
    if (typeof content.text !== "string" || !content.text.trim())
        return false;
    const mediaKeys = ["image", "video", "audio", "document", "sticker", "reaction", "react",
        "delete", "edit", "poll", "product", "listMessage", "buttonsMessage",
        "locationMessage", "forward", "gif"];
    return mediaKeys.every((k) => content[k] === undefined);
};
/**
 * Wrap a plain-text content object into a locationMessage payload
 * so WhatsApp renders it as a channel-style notification card.
 */
export const wrapAsLocation = (text, config, thumbnail) => ({
    location: {
        degreesLatitude: 0,
        degreesLongitude: 0,
        name: config.title || "Bot",
        address: config.subtitle || "",
        comment: text,
        ...(thumbnail ? { jpegThumbnail: thumbnail } : {}),
    },
});
/** Missing fields for the card to work */
export const getMissingFields = (cfg) => {
    const missing = [];
    if (!cfg.image_url)
        missing.push("imagen (.pco img <url>)");
    if (!cfg.title)
        missing.push("título (.pco title <texto>)");
    if (!cfg.subtitle)
        missing.push("subtítulo (.pco subtitle <texto>)");
    return missing;
};
