import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

// Invio via SMTP generico: funziona con qualunque provider (Resend, Brevo,
// Postmark, Gmail…) impostando le variabili SMTP_*. Senza configurazione, in
// sviluppo il contenuto finisce nei log; in produzione si registra solo l'errore.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;

  constructor(config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const port = Number(config.get<string>('SMTP_PORT') ?? 587);
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    this.from = config.get<string>('MAIL_FROM') ?? 'Binder <no-reply@localhost>';
    this.transporter = host
      ? createTransport({
          host,
          port,
          secure: port === 465,
          auth: user ? { user, pass } : undefined,
        })
      : null;
  }

  async sendPasswordReset(to: string, resetLink: string): Promise<void> {
    const subject = 'Reimposta la password';
    const text = [
      'Hai chiesto di reimpostare la password del tuo account Binder.',
      '',
      `Apri questo link entro un'ora: ${resetLink}`,
      '',
      'Se non sei stato tu, ignora questa email: la password resta invariata.',
    ].join('\n');
    const html = `<p>Hai chiesto di reimpostare la password del tuo account Binder.</p>
<p><a href="${escapeHtml(resetLink)}">Reimposta la password</a> (il link scade tra un'ora).</p>
<p>Se non sei stato tu, ignora questa email: la password resta invariata.</p>`;

    await this.send(to, subject, text, html);
  }

  private async send(to: string, subject: string, text: string, html: string) {
    if (!this.transporter) {
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(`SMTP non configurato: email "${subject}" non inviata`);
      } else {
        this.logger.log(`[email non inviata, SMTP non configurato] A: ${to}\n${text}`);
      }
      return;
    }
    await this.transporter.sendMail({ from: this.from, to, subject, text, html });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
