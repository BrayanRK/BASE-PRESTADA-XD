import vm from 'node:vm';
import * as url from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import https from 'node:https';
import http from 'node:http';
import * as process from 'node:process';
import * as libs from '../../../libs/libs.js';
import * as cache from '../../../cache/cache.js';
import * as database from '../../../database/database.js';
import axios from 'axios';
import * as downloads from '../../../libs/downloads.js';
export default {
    name: 'eval',
    alias: ['e'],
    description: 'Ejecuta código javascript.',
    category: 'owner',
    using: '<js>',
    flags: [],
    requires: ['owner.user'],
    hidden: true,
    execute: async (wss, ectx) => {
        const { args, mctx } = ectx;
        try {
            const __filename = url.fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const context = {
                fs,
                fsp,
                https,
                http,
                axios,
                fetch: (u, opts) => new Promise((res, rej) => {
                    const mod = u.startsWith('https') ? https : http;
                    const req = mod.request(u, { ...(opts || {}), headers: opts?.headers || {} }, (r) => {
                        let d = '';
                        r.on('data', (c) => d += c);
                        r.on('end', () => {
                            try {
                                res({ ok: r.statusCode < 400, status: r.statusCode, json: () => JSON.parse(d), text: () => d });
                            }
                            catch (e) {
                                rej(e);
                            }
                        });
                    });
                    req.on('error', rej);
                    req.end();
                }),
                console,
                Array,
                String,
                Buffer,
                JSON,
                Math,
                Date,
                __filename,
                __dirname,
                ...process,
                ...ectx,
                libs,
                downloads,
                wss,
                cache,
                database,
            };
            vm.createContext(context);
            const script = new vm.Script(`(async () => {
                return ${args.join(' ')}
            })();`);
            const result = await script.runInContext(context);
            await mctx.reply(`${JSON.stringify(result, null, 2)}`);
        }
        catch (error) {
            await mctx.reply(libs.formatError(String(error)));
        }
    },
};
