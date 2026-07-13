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

  private renderShell(brandRight: string, bodyHtml: string): string {
    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; background: #ffffff;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background: #0f172a; border-radius: 10px 10px 0 0;">
          <tr>
            <td style="padding: 18px 24px; color: #ffffff; font-size: 15px; font-weight: 700;">Grupo Cóndor</td>
            <td style="padding: 18px 24px; text-align: right; color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: 1px;">${brandRight}</td>
          </tr>
        </table>
        <div style="padding: 32px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
          ${bodyHtml}
        </div>
        <p style="color: #94a3b8; font-size: 11px; text-align: center; margin-top: 16px;">Si no esperabas este mensaje, podés ignorarlo.</p>
      </div>
    `;
  }

  async sendWelcome(name: string, email: string, tempPassword: string): Promise<void> {
    const appName = this.config.get<string>('APP_NAME') ?? 'App Taller';
    const fromAddress = this.config.get<string>('SMTP_FROM') ?? `noreply@taller.com`;
    const appUrl = this.config.get<string>('FRONTEND_URL') ?? '';

    const subject = `Bienvenido a ${appName} — Activá tu cuenta`;
    const html = this.renderShell(appName.toUpperCase(), `
        <h2 style="color: #0f172a; margin: 0 0 8px; font-size: 22px;">¡Bienvenido, ${name}!</h2>
        <p style="color: #64748b; margin: 0 0 24px; font-size: 14px;">Tu cuenta en <strong>${appName}</strong> fue creada exitosamente.</p>
        ${appUrl ? `
        <a href="${appUrl}/login" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin-bottom: 8px;">Ingresar al sistema →</a>
        ` : ''}
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 24px 0 16px;">
          <p style="margin: 0; color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;">USUARIO</p>
          <p style="margin: 4px 0 16px; font-weight: 600; color: #2563eb; font-size: 14px;">${email}</p>
          <p style="margin: 0; color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: 0.5px;">CONTRASEÑA TEMPORAL</p>
          <p style="margin: 4px 0 0; font-weight: 700; font-size: 20px; letter-spacing: 1px; color: #2563eb; font-family: 'Courier New', monospace;">${tempPassword}</p>
        </div>
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #92400e;">
          🔒 Al iniciar sesión por primera vez se te pedirá cambiar esta contraseña por una propia.
        </div>
    `);

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
    const html = this.renderShell(appName.toUpperCase(), `
        <h2 style="color: #0f172a; margin: 0 0 8px; font-size: 22px;">Hola, ${name}</h2>
        <p style="color: #64748b; margin: 0 0 4px; font-size: 14px;">Recibimos un pedido para restablecer la contraseña de tu cuenta en <strong>${appName}</strong>.</p>
        <p style="color: #64748b; margin: 0 0 24px; font-size: 14px;">Hacé click en el botón de abajo para crear una nueva contraseña. El enlace expira en <strong>1 hora</strong>.</p>
        <a href="${resetLink}" style="display: inline-block; background: #2563eb; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin-bottom: 16px;">Restablecer contraseña →</a>
        <p style="color: #94a3b8; font-size: 12px; margin: 16px 0 0;">Si el botón no funciona, copiá y pegá este enlace en tu navegador:</p>
        <p style="word-break: break-all; color: #2563eb; font-size: 12px; margin: 4px 0 20px;">${resetLink}</p>
        <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #92400e;">
          🔒 Si vos no pediste este cambio, podés ignorar este mensaje — tu contraseña actual sigue funcionando.
        </div>
    `);

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
