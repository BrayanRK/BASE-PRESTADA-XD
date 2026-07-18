import fs from "fs";
import * as database from "./database.js";
const defaultData = {
    users: {},
    chats: {},
    stats: {},
    msgs: {},
    sticker: {},
    settings: {},
    groups: {},
    bots: {},
};
export class JSONBackup {
    static dbPath = "database.json";
    static data = defaultData;
    static isWatching = false;
    static syncInProgress = false;
    static async initialize() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const fileContent = fs.readFileSync(this.dbPath, "utf8");
                this.data = { ...defaultData, ...JSON.parse(fileContent) };
                await this.syncFromJSON();
            }
            else {
                this.data = defaultData;
                this.write();
            }
            this.startWatching();
            console.log("[JSONBackup] Sistema híbrido inicializado");
        }
        catch (error) {
            console.error("[JSONBackup] Error:", error);
            this.data = defaultData;
            this.write();
        }
    }
    static startWatching() {
        if (this.isWatching)
            return;
        this.isWatching = true;
        fs.watchFile(this.dbPath, { interval: 5000 }, async (curr, prev) => {
            if (curr.mtime !== prev.mtime && !this.syncInProgress) {
                try {
                    const fileContent = fs.readFileSync(this.dbPath, "utf8");
                    const newData = JSON.parse(fileContent);
                    if (JSON.stringify(newData) !== JSON.stringify(this.data)) {
                        this.data = newData;
                        await this.syncFromJSON();
                        console.log("[JSONBackup] Cambios detectados en database.json, sincronizando...");
                    }
                }
                catch (error) {
                    console.error("[JSONBackup] Error watching file:", error);
                }
            }
        });
    }
    static write() {
        try {
            if (this.syncInProgress)
                return;
            fs.writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2));
        }
        catch (error) {
            console.error("[JSONBackup] Error writing:", error);
        }
    }
    static read() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const fileContent = fs.readFileSync(this.dbPath, "utf8");
                this.data = { ...defaultData, ...JSON.parse(fileContent) };
            }
        }
        catch (error) {
            console.error("[JSONBackup] Error reading:", error);
        }
    }
    static async syncFromJSON() {
        if (this.syncInProgress)
            return;
        this.syncInProgress = true;
        try {
            for (const [userJid, userData] of Object.entries(this.data.users)) {
                await database.Users.set(userJid, userData);
            }
            for (const [groupJid, groupData] of Object.entries(this.data.groups)) {
                await database.Groups.set(groupJid, groupData);
            }
            for (const [botJid, botData] of Object.entries(this.data.bots)) {
                await database.Bots.set(botJid, botData);
            }
        }
        catch (error) {
            console.error("[JSONBackup] Error syncing from JSON:", error);
        }
        finally {
            this.syncInProgress = false;
        }
    }
    static async backupUser(userJid, userData) {
        try {
            this.read();
            this.data.users[userJid] = {
                ...userData,
                lastBackup: new Date().toISOString(),
            };
            this.write();
        }
        catch (error) {
            console.error("[JSONBackup] Error backing up user:", error);
        }
    }
    static async getUserFromJSON(userJid) {
        try {
            this.read();
            return this.data.users[userJid] || null;
        }
        catch (error) {
            console.error("[JSONBackup] Error getting user from JSON:", error);
            return null;
        }
    }
    static async deleteUserFromJSON(userJid) {
        try {
            this.read();
            delete this.data.users[userJid];
            this.write();
            await database.Users.delete(userJid);
        }
        catch (error) {
            console.error("[JSONBackup] Error deleting user from JSON:", error);
        }
    }
    static async saveToJSON(key, data) {
        try {
            this.read();
            this.data[key] = { ...this.data[key], ...data };
            this.write();
        }
        catch (error) {
            console.error("[JSONBackup] Error saving to JSON:", error);
        }
    }
    static async getFromJSON(key) {
        try {
            this.read();
            return this.data[key] || {};
        }
        catch (error) {
            console.error("[JSONBackup] Error getting from JSON:", error);
            return {};
        }
    }
    static async syncAllUsers() {
        if (this.syncInProgress)
            return;
        this.syncInProgress = true;
        try {
            const allUsers = await database.Users.values();
            const allGroups = await database.Groups.values();
            const allBots = await database.Bots.values();
            this.read();
            for (const user of allUsers) {
                this.data.users[user.user_jid] = {
                    ...user,
                    lastSync: new Date().toISOString(),
                };
            }
            for (const group of allGroups) {
                this.data.groups[group.group_jid] = {
                    ...group,
                    lastSync: new Date().toISOString(),
                };
            }
            for (const bot of allBots) {
                this.data.bots[bot.bot_jid] = {
                    ...bot,
                    lastSync: new Date().toISOString(),
                };
            }
            this.write();
            console.log(`[JSONBackup] Sincronizados ${allUsers.length} usuarios, ${allGroups.length} grupos, ${allBots.length} bots`);
        }
        catch (error) {
            console.error("[JSONBackup] Error syncing users:", error);
        }
        finally {
            this.syncInProgress = false;
        }
    }
    static async syncToSQLite() {
        if (this.syncInProgress)
            return;
        this.syncInProgress = true;
        try {
            this.read();
            for (const [userJid, userData] of Object.entries(this.data.users)) {
                await database.Users.update(userJid, { $set: userData });
            }
            for (const [groupJid, groupData] of Object.entries(this.data.groups)) {
                await database.Groups.update(groupJid, { $set: groupData });
            }
            for (const [botJid, botData] of Object.entries(this.data.bots)) {
                await database.Bots.update(botJid, { $set: botData });
            }
            console.log("[JSONBackup] Datos sincronizados a SQLite");
        }
        catch (error) {
            console.error("[JSONBackup] Error syncing to SQLite:", error);
        }
        finally {
            this.syncInProgress = false;
        }
    }
}
