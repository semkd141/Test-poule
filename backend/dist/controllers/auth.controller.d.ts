import type { Env } from "../config/env.js";
import type { SupabaseGateway } from "../services/supabase-gateway.js";
import { asyncHandler } from "../middleware/async-handler.js";
export type AuthHandlers = {
    sendOtp: ReturnType<typeof asyncHandler>;
    verifyOtp: ReturnType<typeof asyncHandler>;
    signInWithPassword: ReturnType<typeof asyncHandler>;
    signUpWithPassword: ReturnType<typeof asyncHandler>;
    refreshSession: ReturnType<typeof asyncHandler>;
    logout: ReturnType<typeof asyncHandler>;
    getUser: ReturnType<typeof asyncHandler>;
    sendInvite: ReturnType<typeof asyncHandler>;
};
export declare function createAuthHandlers(gateway: SupabaseGateway, env: Env): AuthHandlers;
//# sourceMappingURL=auth.controller.d.ts.map