export declare class HttpError extends Error {
    readonly statusCode: number;
    readonly expose: boolean;
    constructor(statusCode: number, message: string, expose?: boolean);
}
//# sourceMappingURL=http-error.d.ts.map