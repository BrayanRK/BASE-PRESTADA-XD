import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ffmpegStatic = require("ffmpeg-static");
const ffmpegBin = ffmpegStatic || "ffmpeg";
const DICE_PIPS = {
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.5], [0.73, 0.5], [0.27, 0.73], [0.73, 0.73]],
};
const loadCanvas = async () => {
    try {
        return await import("@napi-rs/canvas");
    }
    catch {
        throw new Error("El módulo @napi-rs/canvas no está instalado. Ejecuta: npm i @napi-rs/canvas");
    }
};
const topng = async (canvas) => {
    const result = canvas.toBuffer?.("image/png");
    if (result instanceof Promise)
        return result;
    if (Buffer.isBuffer(result) && result.length)
        return result;
    return canvas.encode("png");
};
const roundedRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
};
const drawDie = (ctx, x, y, size, value) => {
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#f0f0f0";
    roundedRect(ctx, x, y, size, size, size * 0.16);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#cccccc";
    ctx.lineWidth = 2;
    roundedRect(ctx, x, y, size, size, size * 0.16);
    ctx.stroke();
    ctx.fillStyle = "#1a1a2e";
    const pips = DICE_PIPS[value] ?? DICE_PIPS[1];
    const pipRadius = size * 0.09;
    for (const [px, py] of pips) {
        ctx.beginPath();
        ctx.arc(x + size * px, y + size * py, pipRadius, 0, Math.PI * 2);
        ctx.fill();
    }
};
const randomDieFace = () => Math.floor(Math.random() * 6) + 1;
const REEL_COLORS = ["#e74c3c", "#f39c12", "#9b59b6", "#2ecc71", "#3498db", "#e67e22"];
const REEL_LABELS = ["7", "$", "♦", "★", "♠", "♥"];
const drawReel = (ctx, x, y, w, h, symbolIndex, spinning = false) => {
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "#1a1c24";
    roundedRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = spinning ? "#444455" : "#5a3eff";
    ctx.lineWidth = spinning ? 2 : 3;
    roundedRect(ctx, x, y, w, h, 14);
    ctx.stroke();
    const color = REEL_COLORS[symbolIndex % REEL_COLORS.length];
    const label = REEL_LABELS[symbolIndex % REEL_LABELS.length];
    ctx.fillStyle = spinning ? "#555566" : color;
    ctx.font = `bold ${Math.floor(h * 0.48)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + w / 2, y + h / 2);
};
const emojiToIndex = (emoji) => {
    const MAP = {
        "🍒": 0, "🍋": 1, "🍇": 2, "🔔": 3, "⭐": 4, "💎": 5,
        "7": 0, "$": 1, "♦": 2, "★": 3, "♠": 4, "♥": 5,
    };
    return MAP[emoji] ?? Math.floor(Math.random() * 6);
};
const randomReelIndex = () => Math.floor(Math.random() * REEL_LABELS.length);
const framesToVideo = async (frames, fps) => {
    const id = `${Date.now()}-${randomUUID()}`;
    const dir = path.join(tmpdir(), `zeta-anim-${id}`);
    await fs.mkdir(dir, { recursive: true });
    const cleanup = async () => fs.rm(dir, { recursive: true, force: true }).catch(() => { });
    try {
        await Promise.all(frames.map((frame, i) => fs.writeFile(path.join(dir, `f${String(i).padStart(4, "0")}.png`), frame)));
        const outputPath = path.join(dir, "out.mp4");
        await new Promise((resolve, reject) => {
            const child = spawn(ffmpegBin, [
                "-y", "-hide_banner", "-loglevel", "error",
                "-f", "image2",
                "-framerate", String(fps),
                "-i", path.join(dir, "f%04d.png"),
                "-c:v", "libx264",
                "-profile:v", "baseline",
                "-level", "3.0",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                "-an",
                outputPath,
            ]);
            let errText = "";
            child.stderr.on("data", (c) => { errText += c.toString(); });
            child.on("error", reject);
            child.on("close", (code) => {
                if (code !== 0)
                    return reject(new Error(errText || `ffmpeg salió con código ${code}`));
                resolve();
            });
        });
        const data = await fs.readFile(outputPath);
        if (!data.length)
            throw new Error("ffmpeg no generó el video.");
        return data;
    }
    finally {
        await cleanup();
    }
};
export const renderDiceAnimation = async (die1, die2) => {
    const { createCanvas } = await loadCanvas();
    const W = 360;
    const H = 220;
    const SIZE = 110;
    const GAP = 24;
    const x0 = (W - SIZE * 2 - GAP) / 2;
    const y0 = (H - SIZE) / 2;
    const ROLL = 10;
    const HOLD = 8;
    const frames = [];
    for (let i = 0; i < ROLL; i++) {
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#0d0f1a";
        ctx.fillRect(0, 0, W, H);
        drawDie(ctx, x0, y0, SIZE, randomDieFace());
        drawDie(ctx, x0 + SIZE + GAP, y0, SIZE, randomDieFace());
        frames.push(await topng(canvas));
    }
    for (let i = 0; i < HOLD; i++) {
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#0d0f1a";
        ctx.fillRect(0, 0, W, H);
        drawDie(ctx, x0, y0, SIZE, die1);
        drawDie(ctx, x0 + SIZE + GAP, y0, SIZE, die2);
        frames.push(await topng(canvas));
    }
    return framesToVideo(frames, 10);
};
export const renderSlotsAnimation = async (a, b, c) => {
    const { createCanvas } = await loadCanvas();
    const W = 400;
    const H = 180;
    const RW = 110;
    const RH = 130;
    const GAP = 18;
    const totalW = RW * 3 + GAP * 2;
    const x0 = (W - totalW) / 2;
    const ry = (H - RH) / 2;
    const finals = [emojiToIndex(a), emojiToIndex(b), emojiToIndex(c)];
    const SPIN = 14;
    const SETTLE = 4;
    const HOLD = 8;
    const stopAt = [SPIN, SPIN + SETTLE, SPIN + SETTLE * 2];
    const total = stopAt[2];
    const frames = [];
    for (let i = 0; i < total; i++) {
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#0d0f1a";
        ctx.fillRect(0, 0, W, H);
        for (let r = 0; r < 3; r++) {
            const rx = x0 + r * (RW + GAP);
            const spinning = i < stopAt[r];
            const idx = spinning ? randomReelIndex() : finals[r];
            drawReel(ctx, rx, ry, RW, RH, idx, spinning);
        }
        frames.push(await topng(canvas));
    }
    for (let i = 0; i < HOLD; i++) {
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#0d0f1a";
        ctx.fillRect(0, 0, W, H);
        for (let r = 0; r < 3; r++) {
            drawReel(ctx, x0 + r * (RW + GAP), ry, RW, RH, finals[r], false);
        }
        frames.push(await topng(canvas));
    }
    return framesToVideo(frames, 12);
};
