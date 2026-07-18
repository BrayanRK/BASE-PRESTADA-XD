declare module 'node-webpmux' {
    export class Image {
        constructor();
        exif: Buffer;
        load(buffer: Buffer | string): Promise<void>;
        save(path: string, options?: Record<any, any>): Promise<void>;
        save(path: null, options?: Record<any, any>): Promise<Buffer>;
    }
};
