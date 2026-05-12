/**
 * Wraps async route handlers so rejections reach the error middleware.
 */
export function asyncHandler(fn) {
    return (req, res, next) => {
        void Promise.resolve(fn(req, res, next)).catch(next);
    };
}
//# sourceMappingURL=async-handler.js.map