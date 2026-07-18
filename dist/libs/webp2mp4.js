import { ffmpeg, ffmpegWithInputArgs } from "./converter.js";
const videoArgs = [
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-vf",
    "fps=15,scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-an",
];
const isMp4 = (buffer) => {
    return buffer.length > 12 && buffer.subarray(4, 8).toString("ascii") === "ftyp";
};
const assertBuffer = (source) => {
    if (!Buffer.isBuffer(source) || !source.length) {
        throw new Error("El sticker llegó vacío.");
    }
};
const getAttr = (tag, attr) => {
    const match = tag.match(new RegExp(`${attr}=["']([^"']*)["']`, "i"));
    return match?.[1] || "";
};
const extractInputs = (html) => {
    const inputs = {};
    const regex = /<input\b[^>]*>/gi;
    let match;
    while ((match = regex.exec(html))) {
        const tag = match[0];
        const name = getAttr(tag, "name");
        if (!name)
            continue;
        inputs[name] = getAttr(tag, "value");
    }
    return inputs;
};
const findConvertedMp4 = (html, baseUrl) => {
    const source = html.match(/<source\b[^>]*src=["']([^"']+)["'][^>]*>/i)?.[1] ||
        html.match(/href=["']([^"']+\.mp4[^"']*)["']/i)?.[1] ||
        html.match(/src=["']([^"']+\.mp4[^"']*)["']/i)?.[1];
    return source ? new URL(source, baseUrl).toString() : null;
};
const fetchText = async (url, init) => {
    const response = await fetch(url, {
        ...init,
        headers: {
            "User-Agent": "Mozilla/5.0 ZetaTS/WebP2MP4",
            ...(init?.headers || {}),
        },
    });
    if (!response.ok) {
        throw new Error(`Ezgif respondió ${response.status}`);
    }
    return response.text();
};
const fetchBuffer = async (url) => {
    const response = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 ZetaTS/WebP2MP4",
        },
    });
    if (!response.ok) {
        throw new Error(`No pude descargar el MP4 (${response.status}).`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length)
        throw new Error("Ezgif devolvió un MP4 vacío.");
    return buffer;
};
const localWebp2Mp4 = async (source) => {
    try {
        const out = await ffmpegWithInputArgs(source, ["-ignore_loop", "0"], [
            "-t",
            "30",
            ...videoArgs,
        ], "webp", "mp4");
        if (isMp4(out.data))
            return out.data;
    }
    catch { }
    try {
        const out = await ffmpeg(source, videoArgs, "webp", "mp4");
        if (isMp4(out.data))
            return out.data;
    }
    catch { }
    const out = await ffmpegWithInputArgs(source, ["-loop", "1"], [
        "-t",
        "3",
        ...videoArgs,
    ], "webp", "mp4");
    if (!isMp4(out.data)) {
        throw new Error("ffmpeg no generó un MP4 válido.");
    }
    return out.data;
};
const ezgifWebp2Mp4 = async (source) => {
    const uploadUrl = "https://ezgif.com/webp-to-mp4";
    const FormDataCtor = globalThis.FormData;
    const BlobCtor = globalThis.Blob;
    const form = new FormDataCtor();
    form.append("new-image", new BlobCtor([source], { type: "image/webp" }), "sticker.webp");
    form.append("new-image-url", "");
    const uploadHtml = await fetchText(uploadUrl, {
        method: "POST",
        body: form,
        headers: {
            Origin: "https://ezgif.com",
            Referer: uploadUrl,
        },
    });
    const inputs = extractInputs(uploadHtml);
    const file = inputs.file ||
        uploadHtml.match(/\/webp-to-mp4\/([a-zA-Z0-9._-]+)/i)?.[1];
    if (!file) {
        throw new Error("Ezgif no aceptó el sticker.");
    }
    const convertUrl = `https://ezgif.com/webp-to-mp4/${file}`;
    const form2 = new FormDataCtor();
    for (const [key, value] of Object.entries(inputs)) {
        form2.append(key, value);
    }
    if (!inputs.file)
        form2.append("file", file);
    form2.append("convert", "Convert WebP to MP4!");
    const convertedHtml = await fetchText(convertUrl, {
        method: "POST",
        body: form2,
        headers: {
            Origin: "https://ezgif.com",
            Referer: convertUrl,
        },
    });
    const mp4Url = findConvertedMp4(convertedHtml, convertUrl);
    if (!mp4Url) {
        throw new Error("Ezgif no generó link MP4.");
    }
    const mp4 = await fetchBuffer(mp4Url);
    if (!isMp4(mp4)) {
        throw new Error("El resultado de Ezgif no es MP4 válido.");
    }
    return mp4;
};
export const webp2png = async (source) => {
    assertBuffer(source);
    const out = await ffmpeg(source, [
        "-frames:v",
        "1",
        "-update",
        "1",
    ], "webp", "png");
    return out.data;
};
export const webp2mp4 = async (source) => {
    assertBuffer(source);
    const local = await localWebp2Mp4(source).catch(() => null);
    if (local?.length && isMp4(local))
        return local;
    return ezgifWebp2Mp4(source);
};
