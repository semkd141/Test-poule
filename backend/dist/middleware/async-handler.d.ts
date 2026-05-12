import type { NextFunction, Request, RequestHandler, Response } from "express";
type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
/**
 * Wraps async route handlers so rejections reach the error middleware.
 */
export declare function asyncHandler(fn: AsyncRequestHandler): RequestHandler;
export {};
//# sourceMappingURL=async-handler.d.ts.map