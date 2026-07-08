import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS') || this.config.get<string>('SMTP_PASSWORD');
    if (host) {
      const port = Number(this.config.get('SMTP_PORT') ?? 25);
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: false,
        ignoreTLS: true,
        ...(user ? { auth: { user, pass } } : {}),
      });
    }
  }

  async sendWelcome(name: string, email: string, tempPassword: string): Promise<void> {
    const appName = this.config.get<string>('APP_NAME') ?? 'App Taller';
    const fromAddress = this.config.get<string>('SMTP_FROM') ?? `noreply@taller.com`;
    const appUrl = this.config.get<string>('FRONTEND_URL') ?? '';

    const subject = `Bienvenido a ${appName} — Activá tu cuenta`;
    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #0f172a; margin-bottom: 8px;">Hola, ${name}</h2>
        <p style="color: #475569;">Tu cuenta fue creada en <strong>${appName}</strong>.</p>
        <p style="color: #475569;">Usá estas credenciales para ingresar por primera vez:</p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; color: #64748b; font-size: 13px;">Email</p>
          <p style="margin: 4px 0 12px; font-weight: 600; color: #0f172a;">${email}</p>
          <p style="margin: 0; color: #64748b; font-size: 13px;">Contraseña temporal</p>
          <p style="margin: 4px 0 0; font-weight: 700; font-size: 20px; letter-spacing: 2px; color: #0f172a; font-family: monospace;">${tempPassword}</p>
        </div>
        ${appUrl ? `
        <div style="margin: 24px 0; text-align: center;">
          <a href="${appUrl}/login" style="display: inline-block; background: #0f172a; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">Ingresar al sistema</a>
        </div>
        ` : ''}
        <p style="color: #ef4444; font-size: 13px;">Al iniciar sesión, el sistema te pedirá que cambies esta contraseña.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px;">Si no esperabas este mensaje, podés ignorarlo.</p>
      </div>
    `;

    if (this.transporter) {
      await this.transporter.sendMail({ from: fromAddress, to: email, subject, html });
      this.logger.log(`Welcome email sent to ${email}`);
    } else {
      this.logger.warn('SMTP not configured — printing credentials to console (dev mode only)');
      this.logger.log(`┌─ Welcome email (not sent) ──────────────────────`);
      this.logger.log(`│  To:       ${email}`);
      this.logger.log(`│  Name:     ${name}`);
      this.logger.log(`│  Password: ${tempPassword}`);
      this.logger.log(`└─────────────────────────────────────────────────`);
    }
  }

  async sendPasswordReset(name: string, email: string, resetLink: string): Promise<void> {
    const appName = this.config.get<string>('APP_NAME') ?? 'App Taller';
    const fromAddress = this.config.get<string>('SMTP_FROM') ?? `noreply@taller.com`;

    const subject = `Restablecer contraseña — ${appName}`;
    const html = `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #0f172a; margin-bottom: 8px;">Hola, ${name}</h2>
        <p style="color: #475569;">Recibimos un pedido para restablecer la contraseña de tu cuenta en <strong>${appName}</strong>.</p>
        <p style="color: #475569;">Hacé click en el botón de abajo para crear una nueva contraseña. El enlace expira en <strong>1 hora</strong>.</p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${resetLink}" style="display: inline-block; background: #0f172a; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Restablecer contraseña</a>
        </div>
        <p style="color: #94a3b8; font-size: 12px;">Si el botón no funciona, copiá y pegá este enlace en tu navegador:</p>
        <p style="word-break: break-all; color: #475569; font-size: 12px;">${resetLink}</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="color: #94a3b8; font-size: 12px;">Si vos no pediste este cambio, podés ignorar este mensaje. Tu contraseña actual seguirá funcionando.</p>
      </div>
    `;

    if (this.transporter) {
      await this.transporter.sendMail({ from: fromAddress, to: email, subject, html });
      this.logger.log(`Password-reset email sent to ${email}`);
    } else {
      this.logger.warn('SMTP not configured — printing reset link to console (dev mode only)');
      this.logger.log(`┌─ Password reset (not sent) ─────────────────────`);
      this.logger.log(`│  To:    ${email}`);
      this.logger.log(`│  Link:  ${resetLink}`);
      this.logger.log(`└─────────────────────────────────────────────────`);
    }
  }
}
