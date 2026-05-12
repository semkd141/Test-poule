/**
 * Represents a non-2xx response from Supabase (or other upstream HTTP APIs).
 * The original JSON body is forwarded to the client.
 */
export declare class UpstreamHttpError extends Error {
    readonly status: number;
    readonly payload: unknown;
    constructor(status: number, payload: unknown);
}
//# sourceMappingURL=upstream-error.d.ts.map