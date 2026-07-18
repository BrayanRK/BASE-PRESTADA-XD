import fg from "api-dylux";
import axios from "axios";
import * as cheerio from "cheerio";
import { tiktok } from "@xct007/frieren-scraper";
import { tiktokdl } from "@bochilteam/scraper";
import { downloadTikTokRaw as downloadTikTokPrimary, evogbTikTok, evogbLink, evogbAuthor, dvyerTikTokMp4, dvyerLink, dvyerAuthor, } from "../../../libs/downloads.js";
const TIKTOK_REGEX = /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/[^\s]+/i;
const doneCaption = (caption) => ["「◈」 *Descarga realizada*", caption?.trim()].filter(Boolean).join("\n\n");
const clean = (value) => String(value ?? "").trim();
const pickString = (...values) => {
    for (const value of values) {
        if (typeof value !== "string" && typeof value !== "number")
            continue;
        const text = clean(value);
        if (text)
            return text;
    }
    return "";
};
const getTikTokUrl = (text) => {
    const match = text.match(TIKTOK_REGEX);
    return match?.[0] ?? "";
};
const sendTikTokMedia = async (sock, context, result) => {
    const { mctx } = context;
    if (result.kind === "album" && Array.isArray(result.items)) {
        const item = result.items.find((value) => value.kind === "video") || result.items[0];
        if (!item)
            throw new Error("Álbum de TikTok sin media");
        await sendTikTokMedia(sock, context, {
            buffer: item.buffer,
            url: item.url,
            mime: item.mime,
            kind: item.kind,
            caption: result.caption,
            source: result.source,
        });
        return;
    }
    if (result.buffer?.length) {
        const payload = result.kind === "image"
            ? {
                image: result.buffer,
                caption: doneCaption(result.caption),
                mimetype: result.mime || "image/jpeg",
            }
            : {
                video: result.buffer,
                caption: doneCaption(result.caption),
                mimetype: result.mime || "video/mp4",
            };
        await sock.sendMessage(mctx.chat.jid, payload, {
            quoted: mctx.message.original,
        });
        return;
    }
    const videoUrl = clean(result.url);
    if (!videoUrl)
        throw new Error("No se recibió URL de video");
    try {
        await sock.sendMessage(mctx.chat.jid, {
            video: { url: videoUrl },
            caption: doneCaption(result.caption),
            mimetype: result.mime || "video/mp4",
        }, { quoted: mctx.message.original });
        return;
    }
    catch {
        const response = await axios.get(videoUrl, {
            responseType: "arraybuffer",
            timeout: 45000,
            maxContentLength: 80 * 1024 * 1024,
            headers: {
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            },
        });
        await sock.sendMessage(mctx.chat.jid, {
            video: Buffer.from(response.data),
            caption: doneCaption(result.caption),
            mimetype: result.mime || "video/mp4",
        }, { quoted: mctx.message.original });
    }
};
const fromDownloads = async (url) => {
    const data = await downloadTikTokPrimary(url);
    if (data.kind === "album" && data.items?.length) {
        return {
            items: data.items,
            kind: "album",
            caption: "",
            source: "downloads.ts",
        };
    }
    if (!data.buffer?.length)
        throw new Error("downloads.ts no devolvió archivo");
    return {
        buffer: data.buffer,
        url: data.directUrl || data.url,
        mime: data.mime,
        kind: data.kind === "image" ? "image" : "video",
        caption: "",
        source: data.source || "downloads.ts",
    };
};
const fromDvyer = async (url) => {
    const data = (await dvyerTikTokMp4(url));
    const item = data?.result ?? data?.data ?? data;
    const videoUrl = pickString(dvyerLink(item), item?.video, item?.play, item?.nowm);
    if (!videoUrl)
        throw new Error("DV-YER no devolvió video");
    const nickname = dvyerAuthor(item, "Desconocido");
    return {
        url: videoUrl,
        caption: `「♬」 TikTok\n╰ Autor › ${nickname}`,
        source: "dv-yer",
    };
};
const fromEvogb = async (url) => {
    const data = (await evogbTikTok(url));
    const item = data?.result ?? data?.data ?? data;
    const videoUrl = pickString(evogbLink(item), item?.video, item?.play, item?.nowm);
    if (!videoUrl)
        throw new Error("EVOGB no devolvió video");
    const nickname = evogbAuthor(item, "Desconocido");
    return {
        url: videoUrl,
        caption: `「♬」 TikTok\n╰ Autor › ${nickname}`,
        source: "evogb",
    };
};
const fromFrieren = async (url) => {
    const data = (await tiktok.v1(url));
    const videoUrl = pickString(data.play, data.nowm, data.wmplay, data.video, data.url, data.result?.play, data.result?.nowm, data.result?.video, data.data?.play, data.data?.nowm, data.data?.video);
    if (!videoUrl)
        throw new Error("Frieren no devolvió video");
    const nickname = pickString(data.author?.nickname, data.author?.unique_id, data.nickname, "Desconocido");
    const description = pickString(data.description, data.desc);
    return {
        url: videoUrl,
        caption: `「♬」 TikTok\n│ Autor › ${nickname}${description ? `\n╰ Descripción › ${description}` : ""}`,
        source: "frieren",
    };
};
const fromTikDown = async (url) => {
    const data = await tiktokdlF(url);
    if (!data.video)
        throw new Error("TikDown no devolvió video");
    return {
        url: data.video,
        caption: "「♬」 TikTok\n╰ Autor › Desconocido",
        source: "tikdown",
    };
};
const fromDylux = async (url) => {
    const data = (await fg.tiktok(url));
    const videoUrl = pickString(data.nowm, data.wm, data.video, data.url, data.result?.nowm, data.result?.video, data.data?.nowm, data.data?.video);
    if (!videoUrl)
        throw new Error("api-dylux no devolvió video");
    const nickname = pickString(data.author?.nickname, data.author?.unique_id, data.nickname, "Desconocido");
    return {
        url: videoUrl,
        caption: `「♬」 TikTok\n╰ Autor › ${nickname}`,
        source: "api-dylux",
    };
};
const fromBochil = async (url) => {
    const data = (await tiktokdl(url));
    const videoUrl = pickString(data.video?.no_watermark, data.video?.no_watermark_hd, data.video?.watermark, data.video, data.nowm, data.url, data.result?.video?.no_watermark, data.result?.video?.no_watermark_hd, data.result?.nowm, data.data?.video?.no_watermark, data.data?.video?.no_watermark_hd, data.data?.nowm);
    if (!videoUrl)
        throw new Error("Bochil no devolvió video");
    const nickname = pickString(data.author?.nickname, data.author?.unique_id, data.nickname, "Desconocido");
    return {
        url: videoUrl,
        caption: `「♬」 TikTok\n╰ Autor › ${nickname}`,
        source: "bochilteam",
    };
};
const execute = async (sock, context) => {
    const { mctx, args, usedPrefix, commandName } = context;
    const text = args.join(" ").trim();
    const url = getTikTokUrl(text);
    if (!url) {
        return mctx.reply("「⚠」 Envía un link de TikTok.");
    }
    const providers = [
        fromDownloads,
        fromDvyer,
        fromEvogb,
        fromFrieren,
        fromDylux,
        fromBochil,
        fromTikDown,
    ];
    const errors = [];
    for (const provider of providers) {
        try {
            const result = await provider(url);
            await sendTikTokMedia(sock, context, result);
            console.log(`[${commandName}] TikTok descargado con ${result.source}`);
            return;
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            errors.push(`${provider.name}: ${msg}`);
            console.error(`[${commandName}] ${provider.name} falló:`, msg);
        }
    }
    await mctx.reply("「✖」 No se pudo realizar la descarga.");
    console.error(`Error en el comando ${commandName}:\n${errors.join("\n")}`);
};
async function tiktokdlF(url) {
    if (!/tiktok/i.test(url))
        throw new Error("Enlace incorrecto");
    const gettoken = await axios.get("https://tikdown.org/id", {
        timeout: 20000,
        headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        },
    });
    const $ = cheerio.load(gettoken.data);
    const token = clean($("#download-form > input[type=hidden]:nth-child(2)").attr("value"));
    if (!token)
        throw new Error("No se pudo obtener token de TikDown");
    const param = new URLSearchParams({
        url,
        _token: token,
    });
    const { data } = await axios.request({
        method: "post",
        url: "https://tikdown.org/getAjax?",
        data: param,
        timeout: 25000,
        headers: {
            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            "x-requested-with": "XMLHttpRequest",
            referer: "https://tikdown.org/id",
            origin: "https://tikdown.org",
        },
    });
    if (!data?.status || !data?.html) {
        return { status: false };
    }
    const getdata = cheerio.load(data.html);
    let video = pickString(getdata("div.download-links > div:nth-child(1) > a").attr("href"), getdata("a[href*='.mp4']").first().attr("href"));
    if (!video) {
        const links = getdata("a").toArray();
        for (const el of links) {
            const href = clean(getdata(el).attr("href"));
            if (href.includes(".mp4") || href.includes("tikcdn")) {
                video = href;
                break;
            }
        }
    }
    return {
        status: Boolean(video),
        thumbnail: clean(getdata("img").attr("src")) || undefined,
        video: video || undefined,
        audio: clean(getdata("div.download-links > div:nth-child(2) > a").attr("href")) || undefined,
    };
}
export default {
    name: "tiktok",
    alias: ["tt", "tiktokdl", "ttnowm"],
    category: "downloaders",
    description: "Descarga videos de TikTok",
    using: "tiktok <url>",
    flags: [],
    requires: [],
    hidden: false,
    execute,
};
