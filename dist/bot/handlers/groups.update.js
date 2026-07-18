export const groupsUpdate = async (updates, wss) => {
    try {
        for (const update of updates) {
            if (!update.id)
                continue;
            await wss.groupMetadata(update.id, false);
        }
    }
    catch (error) {
        console.error({
            date: new Date().toISOString(),
            error,
        });
    }
};
