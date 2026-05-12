import { BrevoClient } from "@getbrevo/brevo";
import nodemailer from "nodemailer";
import { Resend } from "resend";
/** Brevo SMTP tab password (`xsmtpsib-…`) vs REST transactional API key (`xkeysib-…`). */
function isBrevoSmtpKey(apiKey) {
    return apiKey.trimStart().toLowerCase().startsWith("xsmtpsib-");
}
/** Brevo SMTP relay docs: `auth.user` is the login from SMTP & API → SMTP (often `*@brevo.com`), not necessarily `From`. */
function brevoAuthFailureHint(errorMessage, smtpUsedImplicitLogin) {
    if (!/535|Authentication failed|Invalid login/i.test(errorMessage))
        return "";
    let h = " Hint: set BREVO_SMTP_LOGIN to the exact SMTP login / auth.user shown on Brevo → SMTP & API → SMTP (often *@brevo.com). Pass must be the xsmtpsib key.";
    if (smtpUsedImplicitLogin) {
        h +=
            " Right now BREVO_SMTP_LOGIN is unset, so we used BREVO_FROM_EMAIL as auth.user — Brevo usually rejects that.";
    }
    h +=
        " Alternatively add BREVO_REST_API_KEY with an API key (xkeysib-…) from the API keys tab to skip SMTP.";
    return h;
}
function resolveBrevoRestApiKey(env) {
    const explicit = env.BREVO_REST_API_KEY?.trim();
    if (explicit)
        return explicit;
    const k = env.BREVO_API_KEY?.trim();
    if (k && !isBrevoSmtpKey(k))
        return k;
    return undefined;
}
function resolveBrevoSmtpPassword(env) {
    const k = env.BREVO_API_KEY?.trim();
    if (k && isBrevoSmtpKey(k))
        return k;
    return undefined;
}
export class TransactionalEmailService {
    brevoApi;
    brevoSmtp;
    /** True when SMTP is used but `BREVO_SMTP_LOGIN` was missing (we fell back to FROM — often wrong for Brevo). */
    brevoSmtpImplicitLogin;
    brevoSender;
    resend;
    resendFrom;
    constructor(env) {
        let smtpImplicitLogin = false;
        const restKey = resolveBrevoRestApiKey(env);
        const smtpPass = resolveBrevoSmtpPassword(env);
        if (env.BREVO_FROM_EMAIL && (restKey || smtpPass)) {
            const name = env.BREVO_FROM_NAME?.trim() || env.BREVO_FROM_EMAIL;
            this.brevoSender = { email: env.BREVO_FROM_EMAIL, name };
            if (restKey) {
                this.brevoApi = new BrevoClient({ apiKey: restKey });
            }
            else if (smtpPass) {
                // Matches Brevo’s nodemailer example: auth.user/pass are SMTP credentials; sendMail.from may differ.
                const explicitLogin = env.BREVO_SMTP_LOGIN?.trim();
                smtpImplicitLogin = !explicitLogin;
                const user = explicitLogin ?? env.BREVO_FROM_EMAIL;
                this.brevoSmtp = nodemailer.createTransport({
                    host: "smtp-relay.brevo.com",
                    port: 587,
                    secure: false,
                    auth: { user, pass: smtpPass },
                });
            }
        }
        this.brevoSmtpImplicitLogin = smtpImplicitLogin;
        if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
            this.resend = new Resend(env.RESEND_API_KEY);
            this.resendFrom = env.RESEND_FROM_EMAIL;
        }
    }
    async sendViaBrevo(to, subject, html) {
        const sender = this.brevoSender;
        if (!sender)
            return { sent: false, reason: "brevo_not_configured" };
        if (this.brevoSmtp) {
            await this.brevoSmtp.sendMail({
                from: `"${sender.name.replace(/"/g, "")}" <${sender.email}>`,
                to,
                subject,
                html,
            });
            return { sent: true };
        }
        if (!this.brevoApi)
            return { sent: false, reason: "brevo_not_configured" };
        await this.brevoApi.transactionalEmails.sendTransacEmail({
            sender: { email: sender.email, name: sender.name },
            to: [{ email: to }],
            subject,
            htmlContent: html,
        });
        return { sent: true };
    }
    async sendViaResend(to, subject, html) {
        if (!this.resend || !this.resendFrom) {
            return { sent: false, reason: "resend_not_configured" };
        }
        await this.resend.emails.send({
            from: this.resendFrom,
            to,
            subject,
            html,
        });
        return { sent: true };
    }
    /**
     * Uses Brevo when `BREVO_API_KEY` + `BREVO_FROM_EMAIL` are set (`xkeysib-` REST or `xsmtpsib-` SMTP);
     * otherwise Resend when configured.
     */
    async send(to, subject, html) {
        if ((this.brevoApi || this.brevoSmtp) && this.brevoSender) {
            try {
                return await this.sendViaBrevo(to, subject, html);
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                if (this.resend && this.resendFrom) {
                    try {
                        return await this.sendViaResend(to, subject, html);
                    }
                    catch {
                        return { sent: false, reason: `brevo_failed_resend_failed:${msg.slice(0, 120)}` };
                    }
                }
                return {
                    sent: false,
                    reason: `brevo_error:${msg.slice(0, 140)}${brevoAuthFailureHint(msg, Boolean(this.brevoSmtp && this.brevoSmtpImplicitLogin))}`,
                };
            }
        }
        if (this.resend && this.resendFrom) {
            try {
                return await this.sendViaResend(to, subject, html);
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return { sent: false, reason: `resend_error:${msg.slice(0, 160)}` };
            }
        }
        return { sent: false, reason: "email_provider_not_configured" };
    }
    async sendSignupConfirmation(to, competitionName) {
        return this.send(to, `Signup confirmed - ${competitionName}`, `
        <h2>Registration confirmed</h2>
        <p>Your team registration for <strong>${competitionName}</strong> is confirmed.</p>
        <p>You can use the "My Team" tab to manage your squad until the deadline.</p>
      `);
    }
    async sendCompetitionInvite(to, competitionName, inviteUrl) {
        return this.send(to, `Invitation - ${competitionName}`, `
        <h2>You're invited</h2>
        <p>You are invited to join <strong>${competitionName}</strong>.</p>
        <p><a href="${inviteUrl}">Open invitation link</a></p>
      `);
    }
}
//# sourceMappingURL=transactional-email.js.map