import type { Env } from "../config/env.js";
type EmailResult = {
    sent: boolean;
    reason?: string;
};
type MailerEnv = Pick<Env, "RESEND_API_KEY" | "RESEND_FROM_EMAIL" | "BREVO_API_KEY" | "BREVO_REST_API_KEY" | "BREVO_FROM_EMAIL" | "BREVO_FROM_NAME" | "BREVO_SMTP_LOGIN">;
export declare class TransactionalEmailService {
    private readonly brevoApi?;
    private readonly brevoSmtp?;
    /** True when SMTP is used but `BREVO_SMTP_LOGIN` was missing (we fell back to FROM — often wrong for Brevo). */
    private readonly brevoSmtpImplicitLogin;
    private readonly brevoSender?;
    private readonly resend?;
    private readonly resendFrom?;
    constructor(env: MailerEnv);
    private sendViaBrevo;
    private sendViaResend;
    /**
     * Uses Brevo when `BREVO_API_KEY` + `BREVO_FROM_EMAIL` are set (`xkeysib-` REST or `xsmtpsib-` SMTP);
     * otherwise Resend when configured.
     */
    private send;
    sendSignupConfirmation(to: string, competitionName: string): Promise<EmailResult>;
    sendCompetitionInvite(to: string, competitionName: string, inviteUrl: string): Promise<EmailResult>;
}
export {};
//# sourceMappingURL=transactional-email.d.ts.map