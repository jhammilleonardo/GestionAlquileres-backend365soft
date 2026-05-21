import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export type LifecycleExternalChannel = 'email' | 'whatsapp';
type LifecycleExternalProvider =
  | 'stub'
  | 'sendgrid'
  | 'twilio'
  | 'whatsapp_cloud';

export interface LifecycleExternalNotification {
  channel: LifecycleExternalChannel;
  recipient: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
}

@Injectable()
export class LifecycleExternalNotificationAdapter {
  private readonly logger = new Logger(
    LifecycleExternalNotificationAdapter.name,
  );
  private readonly provider = this.getProvider();

  async send(notification: LifecycleExternalNotification): Promise<void> {
    if (!notification.recipient.trim()) {
      this.logger.warn(
        `Notificación ${notification.channel} omitida: destinatario vacío`,
      );
      return;
    }

    try {
      if (notification.channel === 'email') {
        await this.sendEmail(notification);
        return;
      }

      await this.sendWhatsapp(notification);
    } catch (error) {
      this.logger.error(
        `Error enviando ${notification.channel} externo a ${this.maskRecipient(
          notification.recipient,
        )}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async sendEmail(
    notification: LifecycleExternalNotification,
  ): Promise<void> {
    if (this.provider !== 'sendgrid') {
      this.logStub(notification);
      return;
    }

    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    const fromName = process.env.SENDGRID_FROM_NAME ?? '365Soft';

    if (!apiKey || !fromEmail) {
      throw new Error(
        'SENDGRID_API_KEY y SENDGRID_FROM_EMAIL son requeridos para email real',
      );
    }

    await axios.post(
      'https://api.sendgrid.com/v3/mail/send',
      {
        personalizations: [
          {
            to: [{ email: notification.recipient }],
            dynamic_template_data: notification.metadata,
          },
        ],
        from: { email: fromEmail, name: fromName },
        subject: notification.title,
        content: [
          {
            type: 'text/plain',
            value: notification.message,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: Number(process.env.NOTIFICATION_TIMEOUT_MS ?? 7000),
      },
    );
  }

  private async sendWhatsapp(
    notification: LifecycleExternalNotification,
  ): Promise<void> {
    if (this.provider === 'twilio') {
      await this.sendTwilioWhatsapp(notification);
      return;
    }

    if (this.provider === 'whatsapp_cloud') {
      await this.sendWhatsappCloud(notification);
      return;
    }

    this.logStub(notification);
  }

  private async sendTwilioWhatsapp(
    notification: LifecycleExternalNotification,
  ): Promise<void> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error(
        'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_WHATSAPP_FROM son requeridos para WhatsApp Twilio',
      );
    }

    const body = new URLSearchParams({
      From: this.toTwilioWhatsappNumber(fromNumber),
      To: this.toTwilioWhatsappNumber(notification.recipient),
      Body: `${notification.title}\n\n${notification.message}`,
    });

    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      body,
      {
        auth: {
          username: accountSid,
          password: authToken,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: Number(process.env.NOTIFICATION_TIMEOUT_MS ?? 7000),
      },
    );
  }

  private async sendWhatsappCloud(
    notification: LifecycleExternalNotification,
  ): Promise<void> {
    const token = process.env.WHATSAPP_CLOUD_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
    const graphVersion = process.env.WHATSAPP_CLOUD_GRAPH_VERSION ?? 'v19.0';

    if (!token || !phoneNumberId) {
      throw new Error(
        'WHATSAPP_CLOUD_TOKEN y WHATSAPP_CLOUD_PHONE_NUMBER_ID son requeridos para WhatsApp Cloud API',
      );
    }

    await axios.post(
      `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to: this.normalizePhone(notification.recipient),
        type: 'text',
        text: {
          preview_url: false,
          body: `${notification.title}\n\n${notification.message}`,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: Number(process.env.NOTIFICATION_TIMEOUT_MS ?? 7000),
      },
    );
  }

  private logStub(notification: LifecycleExternalNotification): void {
    this.logger.log(
      `[${notification.channel.toUpperCase()}:${this.provider}] to=${this.maskRecipient(
        notification.recipient,
      )} subject="${notification.title}" preview="${notification.message.slice(
        0,
        80,
      )}" meta=${JSON.stringify(notification.metadata)}`,
    );
  }

  private getProvider(): LifecycleExternalProvider {
    const provider = (process.env.LIFECYCLE_NOTIFICATION_PROVIDER ?? 'stub')
      .trim()
      .toLowerCase();
    if (
      provider === 'sendgrid' ||
      provider === 'twilio' ||
      provider === 'whatsapp_cloud'
    ) {
      return provider;
    }
    return 'stub';
  }

  private toTwilioWhatsappNumber(phone: string): string {
    return phone.startsWith('whatsapp:')
      ? phone
      : `whatsapp:${this.normalizePhone(phone)}`;
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/^whatsapp:/, '').replace(/[^\d+]/g, '');
  }

  private maskRecipient(recipient: string): string {
    if (recipient.includes('@')) {
      const [name, domain] = recipient.split('@');
      return `${name.slice(0, 2)}***@${domain}`;
    }
    return `${recipient.slice(0, 4)}***${recipient.slice(-2)}`;
  }
}
