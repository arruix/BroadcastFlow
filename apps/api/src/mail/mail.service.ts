import { Injectable } from '@nestjs/common';

export type OutboundMail = {
  to: string;
  purpose: 'verify' | 'reset' | 'receipt' | 'invite';
  token: string;
};

@Injectable()
export class MailService {
  readonly sent: OutboundMail[] = [];

  send(message: OutboundMail) {
    this.sent.push(message);
    const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
    if (message.purpose === 'verify') {
      console.log(
        `\n📬 [MailService] Verificación para ${message.to}:\n` +
          `   Enlace: ${webOrigin}/verificar?token=${message.token}\n` +
          `   Token:  ${message.token}\n`,
      );
    } else if (message.purpose === 'reset') {
      console.log(
        `\n📬 [MailService] Restablecer contraseña para ${message.to}:\n` +
          `   Enlace: ${webOrigin}/restablecer?token=${message.token}\n` +
          `   Token:  ${message.token}\n`,
      );
    } else {
      console.log(
        `\n📬 [MailService] Correo enviado a ${message.to} [${message.purpose}]: ${message.token}\n`,
      );
    }
  }

  latest(
    to: string,
    purpose: OutboundMail['purpose'],
  ): OutboundMail | undefined {
    return [...this.sent]
      .reverse()
      .find((message) => message.to === to && message.purpose === purpose);
  }
}
