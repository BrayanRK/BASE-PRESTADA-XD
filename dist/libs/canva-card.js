const LYO_QUOTE_ENDPOINT = "https://bot.lyo.su/quote/generate";
const DEFAULT_AVATAR = "https://telegra.ph/file/24fa902ead26340f3df2c.png";
const abortAfter = (ms) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    timer.unref?.();
    return controller.signal;
};
export const fetchLyoQuoteCard = async (input) => {
    const body = {
        type: "quote",
        format: "png",
        backgroundColor: "#1a1a1a",
        width: 512,
        height: 768,
        scale: 2,
        messages: [
            {
                entities: [],
                avatar: true,
                from: {
                    id: 1,
                    name: input.name,
                    photo: { url: input.avatarUrl || DEFAULT_AVATAR },
                },
                text: input.text,
                replyMessage: {},
            },
        ],
    };
    let response;
    try {
        response = await fetch(LYO_QUOTE_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: abortAfter(15_000),
        });
    }
    catch (error) {
        throw new Error(`lyo.su no respondió: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (response.status === 429)
        throw new Error("lyo.su sin límite de peticiones (rate-overlimit)");
    if (!response.ok)
        throw new Error(`lyo.su HTTP ${response.status}`);
    const json = await response.json().catch(() => null);
    const base64 = json?.result?.image;
    if (typeof base64 !== "string" || !base64)
        throw new Error("lyo.su devolvió una respuesta inválida");
    const buffer = Buffer.from(base64, "base64");
    if (!buffer.length)
        throw new Error("lyo.su devolvió una imagen vacía");
    return buffer;
};
const wrapText = (ctx, text, maxWidth) => {
    const words = text.split(/\s+/).filter(Boolean);
    if (!words.length)
        return [""];
    const lines = [];
    let current = "";
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && ctx.measureText(candidate).width > maxWidth) {
            lines.push(current);
            current = word;
        }
        else {
            current = candidate;
        }
    }
    if (current)
        lines.push(current);
    return lines;
};
const fitTextToBox = (ctx, text, maxWidth, maxHeight, maxFontSize, minFontSize, fontFamily) => {
    let fontSize = maxFontSize;
    let lines = [text];
    let lineHeight = fontSize * 1.32;
    while (fontSize >= minFontSize) {
        ctx.font = `400 ${fontSize}px ${fontFamily}`;
        lines = wrapText(ctx, text, maxWidth);
        lineHeight = fontSize * 1.32;
        if (lines.length * lineHeight <= maxHeight)
            break;
        fontSize -= 2;
    }
    return { fontSize, lines, lineHeight };
};
const drawEllipsisText = (ctx, text, x, y, maxWidth) => {
    let value = text;
    if (ctx.measureText(value).width <= maxWidth) {
        ctx.fillText(value, x, y);
        return;
    }
    while (value.length > 1 && ctx.measureText(`${value}…`).width > maxWidth) {
        value = value.slice(0, -1);
    }
    ctx.fillText(`${value}…`, x, y);
};
const roundedRectPath = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
};
export const renderCanvasQuoteCard = async (input) => {
    let canvasMod;
    try {
        canvasMod = await import("@napi-rs/canvas");
    }
    catch (error) {
        throw new Error("El módulo @napi-rs/canvas no está instalado. Ejecuta: npm i @napi-rs/canvas");
    }
    const { createCanvas, loadImage } = canvasMod;
    const fontFamily = "sans-serif";
    const width = 512;
    const height = 512;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#15171c";
    roundedRectPath(ctx, 0, 0, width, height, 28);
    ctx.fill();
    const avatarSize = 84;
    const avatarX = 36;
    const avatarY = 40;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    try {
        const image = await loadImage(input.avatarUrl || DEFAULT_AVATAR);
        ctx.drawImage(image, avatarX, avatarY, avatarSize, avatarSize);
    }
    catch {
        ctx.fillStyle = "#3a3d46";
        ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    }
    ctx.restore();
    const nameX = avatarX + avatarSize + 18;
    const nameMaxWidth = width - nameX - 24;
    ctx.fillStyle = "#e7e7e7";
    ctx.font = `600 26px ${fontFamily}`;
    ctx.textBaseline = "alphabetic";
    drawEllipsisText(ctx, input.name || "Usuario", nameX, avatarY + 50, nameMaxWidth);
    const textAreaX = 40;
    const textAreaY = avatarY + avatarSize + 44;
    const textAreaWidth = width - textAreaX * 2;
    const textAreaHeight = height - textAreaY - 36;
    ctx.fillStyle = "#ffffff";
    const { fontSize, lines, lineHeight } = fitTextToBox(ctx, input.text, textAreaWidth, textAreaHeight, 36, 16, fontFamily);
    ctx.font = `400 ${fontSize}px ${fontFamily}`;
    ctx.textBaseline = "top";
    const blockHeight = lines.length * lineHeight;
    let y = textAreaY + Math.max(0, (textAreaHeight - blockHeight) / 2);
    for (const line of lines) {
        ctx.fillText(line, textAreaX, y);
        y += lineHeight;
    }
    return canvas.toBuffer("image/png");
};
export const buildQuoteCard = async (input) => {
    try {
        return await fetchLyoQuoteCard(input);
    }
    catch (primaryError) {
        console.error("[qc] lyo.su falló, usando respaldo con canvas:", primaryError instanceof Error ? primaryError.message : primaryError);
        return await renderCanvasQuoteCard(input);
    }
};
