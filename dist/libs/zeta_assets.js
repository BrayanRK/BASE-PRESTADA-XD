import fs from "node:fs";
import path from "node:path";
import { readUniversalConfig } from "./zeta_cf.js";
const roleAssets = {
    main: ["generalImage"],
    submenu: ["subMainImage", "generalImage"],
    rpg: ["rpgImage", "subMainImage", "generalImage"],
    welcome: ["welcomeImage", "generalImage"],
};
const cleanText = (value) => String(value ?? "").trim();
const resolveAssetPath = (assetPath) => {
    const cleanPath = cleanText(assetPath);
    if (!cleanPath)
        return "";
    if (/^https?:\/\//i.test(cleanPath))
        return cleanPath;
    if (path.isAbsolute(cleanPath))
        return cleanPath;
    return path.resolve(process.cwd(), cleanPath);
};
const guessMimeFromPath = (assetPath) => {
    const ext = path.extname(assetPath).toLowerCase();
    if (ext === ".jpg" || ext === ".jpeg")
        return "image/jpeg";
    if (ext === ".png")
        return "image/png";
    if (ext === ".webp")
        return "image/webp";
    if (ext === ".gif")
        return "image/gif";
    if (ext === ".mp4")
        return "video/mp4";
    if (ext === ".webm")
        return "video/webm";
    if (ext === ".mov")
        return "video/quicktime";
    if (ext === ".mkv")
        return "video/x-matroska";
    if (ext === ".mp3")
        return "audio/mpeg";
    if (ext === ".ogg")
        return "audio/ogg";
    if (ext === ".opus")
        return "audio/ogg";
    if (ext === ".wav")
        return "audio/wav";
    if (ext === ".pdf")
        return "application/pdf";
    return "application/octet-stream";
};
const getBotAssetPath = (role, bot) => {
    if (!bot)
        return "";
    if (role === "main")
        return cleanText(bot.thumbnail_url);
    if (role === "submenu")
        return cleanText(bot.submenu_url) || (bot.bot_type !== "main" ? cleanText(bot.thumbnail_url) : "");
    if (role === "welcome")
        return cleanText(bot.welcome_url);
    if (role === "rpg")
        return cleanText(bot.rpg_url);
    return "";
};
const getAssetDataFromPath = (assetPath, mimetype) => {
    const resolved = resolveAssetPath(assetPath);
    if (!resolved)
        return null;
    if (/^https?:\/\//i.test(resolved)) {
        return {
            buffer: Buffer.alloc(0),
            path: resolved,
            mimetype: cleanText(mimetype) || guessMimeFromPath(resolved),
        };
    }
    if (!fs.existsSync(resolved))
        return null;
    const buffer = fs.readFileSync(resolved);
    if (!buffer.length)
        return null;
    return {
        buffer,
        path: resolved,
        mimetype: cleanText(mimetype) || guessMimeFromPath(resolved),
    };
};
const getUniversalAssetData = (role) => {
    const config = readUniversalConfig();
    if (!config?.setup?.assets)
        return null;
    for (const key of roleAssets[role]) {
        const asset = config.setup.assets[key];
        const data = getAssetDataFromPath(asset?.path || "", asset?.mimetype);
        if (data)
            return data;
    }
    return null;
};
const getAssetData = (role, bot) => {
    const botPath = getBotAssetPath(role, bot);
    const botAsset = getAssetDataFromPath(botPath);
    if (botAsset)
        return botAsset;
    return getUniversalAssetData(role);
};
const convertGifToMp4 = async (buffer) => {
    try {
        const { ffmpeg } = await import("./converter.js");
        const result = await ffmpeg(buffer, [
            "-movflags",
            "+faststart",
            "-pix_fmt",
            "yuv420p",
            "-vf",
            "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        ], "gif", "mp4");
        return result.data.length ? result.data : null;
    }
    catch {
        return null;
    }
};
const convertWebpToMp4 = async (buffer) => {
    try {
        const { webp2mp4 } = await import("./webp2mp4.js");
        const result = await webp2mp4(buffer);
        return result.length ? result : null;
    }
    catch {
        return null;
    }
};
export const getZetaAssetPath = (role, bot) => {
    return getAssetData(role, bot)?.path || "";
};
export const mergeCaptionWithMenuMedia = async (role, caption, bot) => {
    const asset = getAssetData(role, bot);
    if (!asset)
        return { text: caption };
    if (/^https?:\/\//i.test(asset.path)) {
        const mime = asset.mimetype.toLowerCase();
        if (mime.startsWith("video/"))
            return { video: { url: asset.path }, mimetype: asset.mimetype, caption };
        return { image: { url: asset.path }, mimetype: asset.mimetype, caption };
    }
    const ext = path.extname(asset.path).toLowerCase();
    const mime = asset.mimetype.toLowerCase();
    if (mime === "image/gif" || ext === ".gif") {
        const mp4 = await convertGifToMp4(asset.buffer);
        if (mp4) {
            return {
                video: mp4,
                mimetype: "video/mp4",
                caption,
                gifPlayback: true,
            };
        }
        return {
            image: asset.buffer,
            mimetype: "image/gif",
            caption,
        };
    }
    if (mime === "image/webp" || ext === ".webp") {
        const mp4 = await convertWebpToMp4(asset.buffer);
        if (mp4) {
            return {
                video: mp4,
                mimetype: "video/mp4",
                caption,
                gifPlayback: true,
            };
        }
        return {
            image: asset.buffer,
            mimetype: "image/webp",
            caption,
        };
    }
    if (mime.startsWith("image/")) {
        return {
            image: asset.buffer,
            mimetype: asset.mimetype,
            caption,
        };
    }
    if (mime.startsWith("video/")) {
        return {
            video: asset.buffer,
            mimetype: asset.mimetype,
            caption,
            gifPlayback: false,
        };
    }
    if (mime.startsWith("audio/")) {
        return {
            document: asset.buffer,
            mimetype: asset.mimetype,
            fileName: path.basename(asset.path),
            caption,
        };
    }
    return {
        document: asset.buffer,
        mimetype: asset.mimetype,
        fileName: path.basename(asset.path),
        caption,
    };
};
