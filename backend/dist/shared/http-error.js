export class HttpError extends Error {
    statusCode;
    expose;
    constructor(statusCode, message, expose = true) {
        super(message);
        this.name = "HttpError";
        this.statusCode = statusCode;
        this.expose = expose;
    }
}
//# sourceMappingURL=http-error.js.map