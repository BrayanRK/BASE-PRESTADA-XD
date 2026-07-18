import * as baileys from 'baileys';
import * as types from '../../types/types.js';

export const groupsUpdate = async (updates: Partial<baileys.GroupMetadata>[], wss: types.WASocket) => {
    try {
        for (const update of updates) {
            if (!update.id) continue;
            await wss.groupMetadata(update.id, false);
        }
    } catch (error) {
        console.error({
            date: new Date().toISOString(),
            error,
        });
    }
};
