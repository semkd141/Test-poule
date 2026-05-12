/**
 * Represents a non-2xx response from Supabase (or other upstream HTTP APIs).
 * The original JSON body is forwarded to the client.
 */
export class UpstreamHttpError extends Error {
    status;
    payload;
    constructor(status, payload) {
        super(`Upstream request failed with status ${status}`);
        this.name = "UpstreamHttpError";
        this.status = status;
        this.payload = payload;
    }
}
//# sourceMappingURL=upstream-error.js.map