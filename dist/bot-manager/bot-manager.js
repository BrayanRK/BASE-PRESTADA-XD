import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "node:module";
import { Bot } from "../bot/bot.js";
import { PremiumManager } from "../libs/socket-manager.js";
const require = createRequire(import.meta.url);
const pino = require("pino");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export class BotManager {
    static instance;
    activeBots = new Map();
    logger = pino({ level: "silent" });
    static getInstance() {
        if (!BotManager.instance) {
            BotManager.instance = new BotManager();
        }
        return BotManager.instance;
    }
    async startBot(config) {
        const bot = new Bot(config);
        bot.ev.on("bot.open", (e) => {
            this.activeBots.set(e.botjid, bot);
            console.log(`[BotManager] Bot ${config.bot_type} ${e.botjid.split("@")[0]} conectado`);
        });
        bot.ev.on("bot.logout", () => {
            this.activeBots.delete(config.bot_jid || "");
            console.log(`[BotManager] Bot ${config.bot_type} desconectado`);
        });
        await bot.connect();
        return bot;
    }
    async loadExistingBots() {
        try {
            const existingBots = await PremiumManager.getActiveBots();
            for (const botData of existingBots) {
                try {
                    const sessionPath = this.getSessionPath(botData.bot_type, botData.bot_number);
                    const config = {
                        bot_id: `${botData.bot_type}-${botData.bot_number}-${Date.now()}`,
                        bot_jid: `${botData.bot_number}@s.whatsapp.net`,
                        owner_jid: botData.user_jid,
                        bot_type: botData.bot_type,
                        connection_method: "existing",
                        session_path: sessionPath,
                    };
                    await this.startBot(config);
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }
                catch (error) {
                    console.error(`[BotManager] Error reconectando bot ${botData.bot_number}:`, error);
                }
            }
        }
        catch (error) {
            console.error("[BotManager] Error cargando bots existentes:", error);
        }
    }
    getSessionPath(botType, botNumber) {
        const projectRoot = path.resolve(process.cwd());
        switch (botType) {
            case "main":
                return path.join(projectRoot, "mainbots", `main-${botNumber}`);
            case "premium":
                return path.join(projectRoot, "prembots", `prem-${botNumber}`);
            case "free":
                return path.join(projectRoot, "freebots", `free-${botNumber}`);
            default:
                return path.join(projectRoot, "sessions", `bot-${botNumber}`);
        }
    }
    getActiveBot(jid) {
        return this.activeBots.get(jid);
    }
    getAllActiveBots() {
        return new Map(this.activeBots);
    }
    async stopBot(jid) {
        const bot = this.activeBots.get(jid);
        if (bot) {
            this.activeBots.delete(jid);
            return true;
        }
        return false;
    }
    async stopAllBots() {
        for (const [jid, bot] of this.activeBots) {
            await this.stopBot(jid);
        }
        this.activeBots.clear();
    }
}
