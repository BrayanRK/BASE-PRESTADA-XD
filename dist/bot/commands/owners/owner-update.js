import { exec } from "node:child_process";
import { promisify } from "node:util";
import * as libs from "../../../libs/libs.js";
const execAsync = promisify(exec);
const clean = (value) => String(value ?? "").trim();
const run = async (command, timeout = 120_000) => {
    const { stdout, stderr } = await execAsync(command, {
        cwd: process.cwd(),
        timeout,
        maxBuffer: 1024 * 1024 * 8,
    });
    return [stdout, stderr].map(clean).filter(Boolean).join("\n");
};
const safeRun = async (command, timeout = 120_000) => {
    try {
        return await run(command, timeout);
    }
    catch {
        return "";
    }
};
const fullHash = async () => clean(await safeRun("git rev-parse HEAD", 20_000));
const hasPackageChanges = (changes) => {
    return /(^|\n)[AMDRC]\s+package(-lock)?\.json(\n|$)/i.test(changes);
};
const command = {
    name: "update",
    alias: ["actualizar"],
    description: "Actualiza el bot desde Git sin reiniciar el servidor",
    category: "owner",
    flags: ["all.chats"],
    requires: ["bot.owner"],
    hidden: false,
    execute: async (wss, { mctx }) => {
        try {
            const beforeFull = await fullHash();
            const pullOutput = await run("git pull --stat --no-rebase", 180_000);
            const afterFull = await fullHash();
            const alreadyUpdated = beforeFull && afterFull && beforeFull === afterFull;
            const saysAlreadyUpdated = /already up to date|already up-to-date|ya est[aá] actualizado/i.test(pullOutput);
            if (!alreadyUpdated && !saysAlreadyUpdated) {
                const changes = beforeFull && afterFull ? await safeRun(`git diff --name-status ${beforeFull}..${afterFull}`, 60_000) : "";
                if (hasPackageChanges(changes)) {
                    await run("npm install", 240_000);
                }
                await run("npm run build", 240_000);
                await libs.Command.load();
            }
            await mctx.reply("「◈」 *Bot actualizado correctamente*");
        }
        catch {
            await mctx.reply("「◈」 *No se pudo actualizar el bot*");
        }
    },
};
export default command;
