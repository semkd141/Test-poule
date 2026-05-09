import { Resend } from "resend";
import type { Env } from "../config/env.js";

type EmailResult = { sent: boolean; reason?: string };

export class TransactionalEmailService {
  private readonly resend?: Resend;
  private readonly from?: string;

  constructor(private readonly env: Pick<Env, "RESEND_API_KEY" | "RESEND_FROM_EMAIL">) {
    if (env.RESEND_API_KEY && env.RESEND_FROM_EMAIL) {
      this.resend = new Resend(env.RESEND_API_KEY);
      this.from = env.RESEND_FROM_EMAIL;
    }
  }

  private async send(to: string, subject: string, html: string): Promise<EmailResult> {
    if (!this.resend || !this.from) {
      return { sent: false, reason: "resend_not_configured" };
    }
    await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html,
    });
    return { sent: true };
  }

  async sendSignupConfirmation(to: string, competitionName: string): Promise<EmailResult> {
    return this.send(
      to,
      `Signup confirmed - ${competitionName}`,
      `
        <h2>Registration confirmed</h2>
        <p>Your team registration for <strong>${competitionName}</strong> is confirmed.</p>
        <p>You can use the "My Team" tab to manage your squad until the deadline.</p>
      `,
    );
  }

  async sendCompetitionInvite(to: string, competitionName: string, inviteUrl: string): Promise<EmailResult> {
    return this.send(
      to,
      `Invitation - ${competitionName}`,
      `
        <h2>You're invited</h2>
        <p>You are invited to join <strong>${competitionName}</strong>.</p>
        <p><a href="${inviteUrl}">Open invitation link</a></p>
      `,
    );
  }
}
