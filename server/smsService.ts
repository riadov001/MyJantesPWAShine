import twilio from 'twilio';
import { db } from './db';
import { smsLogs } from '@shared/schema';
import { desc, eq } from 'drizzle-orm';

type SmsProvider = 'twilio' | 'textbelt' | 'gatewayapi' | 'relationcity' | 'log';

function getProvider(): SmsProvider {
  const env = (process.env.SMS_PROVIDER || 'twilio').toLowerCase();
  if (env === 'twilio' || env === 'textbelt' || env === 'gatewayapi' || env === 'relationcity' || env === 'log') return env;
  return 'twilio';
}

async function sendViaRelationCity(to: string, body: string): Promise<{ sid?: string; error?: string }> {
  const apiKey = process.env.RELATIONCITY_API_KEY;
  if (!apiKey) {
    return { error: 'RELATIONCITY_API_KEY non configuré' };
  }

  const msisdn = to.replace(/\+/g, '');

  try {
    // GatewayAPI style (since they are related)
    const response = await fetch('https://gatewayapi.com/rest/mtsms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        recipients: [{ msisdn: parseInt(msisdn, 10) }],
        message: body,
      }),
    });

    const result = await response.json() as any;
    console.log(`[SMS:RelationCity] Response:`, JSON.stringify(result));

    if (!response.ok) {
      // Try standard RelationCity format if Bearer + GatewayAPI endpoint fails
      const altResponse = await fetch('https://app.relationcity.io/api/v1/sms/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          recipient: msisdn,
          message: body,
        }),
      });
      const altResult = await altResponse.json();
      console.log(`[SMS:RelationCity] Alt Response:`, JSON.stringify(altResult));
      
      if (!altResponse.ok) {
        return { error: altResult.message || `RelationCity erreur HTTP ${altResponse.status}` };
      }
      return { sid: altResult.id || 'relationcity-ok' };
    }

    return { sid: result.ids?.[0]?.toString() || 'relationcity-ok' };
  } catch (error: any) {
    return { error: error.message };
  }
}

async function getTwilioCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken || !hostname) {
    throw new Error('Twilio: credentials not available');
  }

  const connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=twilio',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings?.settings?.account_sid) {
    throw new Error('Twilio not connected');
  }

  return connectionSettings.settings;
}

async function sendViaTwilio(to: string, body: string): Promise<{ sid?: string; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER || "+16084707669";

  if (!accountSid || !authToken) {
    console.error("[Twilio] Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN env vars");
    return { error: "Twilio credentials not configured" };
  }

  console.log(`[Twilio] Sending SMS to ${to}`);

  try {
    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({ body, from: fromNumber, to });
    console.log(`[Twilio] Success! SID: ${message.sid}`);
    return { sid: message.sid };
  } catch (error: any) {
    console.error(`[Twilio] Error detail:`, error);
    return { error: error.message };
  }
}

async function sendViaTextBelt(to: string, body: string): Promise<{ sid?: string; error?: string }> {
  const apiKey = process.env.TEXTBELT_API_KEY || 'textbelt';
  const response = await fetch('https://textbelt.com/text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      phone: to,
      message: body,
      key: apiKey,
    }),
  });
  const result = await response.json() as { success: boolean; textId?: string; error?: string; quotaRemaining?: number };
  console.log(`[SMS:TextBelt] Response:`, JSON.stringify(result));
  if (!result.success) {
    return { error: result.error || 'TextBelt send failed' };
  }
  return { sid: result.textId || 'textbelt-ok' };
}

async function sendViaGatewayAPI(to: string, body: string): Promise<{ sid?: string; error?: string }> {
  const apiToken = process.env.GATEWAYAPI_TOKEN;

  if (!apiToken) {
    return { error: 'GATEWAYAPI_TOKEN non configuré' };
  }

  const sender = process.env.GATEWAYAPI_SENDER || 'MyJantes';
  const msisdn = to.replace(/\+/g, '');

  const response = await fetch('https://gatewayapi.com/rest/mtsms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token ${apiToken}`,
    },
    body: JSON.stringify({
      recipients: [{ msisdn: parseInt(msisdn, 10) }],
      message: body,
      sender: sender,
    }),
  });

  const result = await response.json() as { ids?: number[]; usage?: any; code?: string; message?: string };
  console.log(`[SMS:GatewayAPI] Response:`, JSON.stringify(result));

  if (!response.ok || result.code) {
    return { error: result.message || `GatewayAPI erreur HTTP ${response.status}` };
  }

  const messageId = result.ids?.[0]?.toString() || 'gatewayapi-ok';
  return { sid: messageId };
}

function sendViaLog(to: string, body: string): { sid?: string; error?: string } {
  console.log(`[SMS:Log] ════════════════════════════════════`);
  console.log(`[SMS:Log] To: ${to}`);
  console.log(`[SMS:Log] Message:`);
  body.split('\n').forEach(line => console.log(`[SMS:Log]   ${line}`));
  console.log(`[SMS:Log] ════════════════════════════════════`);
  return { sid: 'log-' + Date.now() };
}

export function isFrenchMobile(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const cleaned = phone.replace(/[\s.\-()]/g, '');
  if (/^(?:\+33|0033)[67]\d{8}$/.test(cleaned)) return true;
  if (/^0[67]\d{8}$/.test(cleaned)) return true;
  return false;
}

export function formatPhoneE164(phone: string): string {
  const cleaned = phone.replace(/[\s.\-()]/g, '');
  if (cleaned.startsWith('+33')) return cleaned;
  if (cleaned.startsWith('0033')) return '+33' + cleaned.slice(4);
  if (cleaned.startsWith('0')) return '+33' + cleaned.slice(1);
  return cleaned;
}

export type SmsEventType =
  | 'quote_sent'
  | 'quote_approved'
  | 'invoice_sent'
  | 'invoice_paid'
  | 'reservation_confirmed'
  | 'reservation_reminder'
  | 'review_request'
  | 'general';

interface SmsOptions {
  to: string;
  eventType: SmsEventType;
  eventTitle: string;
  eventDetails?: string;
  eventUrl?: string;
  recipientName?: string;
  recipientEmail?: string;
}

function buildSmsBody(options: SmsOptions): string {
  const parts: string[] = [];
  
  switch (options.eventType) {
    case 'quote_sent':
      parts.push(`MY JANTES : Nouveau devis ${options.eventTitle}.`);
      parts.push(`Montant : ${options.eventDetails}`);
      break;
    case 'quote_approved':
      parts.push(`MY JANTES : Votre devis ${options.eventTitle} a été approuvé !`);
      break;
    case 'invoice_sent':
      parts.push(`MY JANTES : Votre facture ${options.eventTitle} est disponible.`);
      parts.push(`Montant à régler : ${options.eventDetails}`);
      break;
    case 'invoice_paid':
      parts.push(`MY JANTES : Merci ! Votre paiement pour la facture ${options.eventTitle} a été reçu.`);
      break;
    case 'reservation_confirmed':
      parts.push(`MY JANTES : Votre rendez-vous pour ${options.eventTitle} est confirmé.`);
      parts.push(`Détails : ${options.eventDetails}`);
      break;
    case 'reservation_reminder':
      parts.push(`RAPPEL MY JANTES : Votre rendez-vous est prévu pour ${options.eventDetails}.`);
      break;
    case 'review_request':
      parts.push(`MY JANTES : Votre avis nous intéresse ! Comment s'est passée votre prestation ${options.eventTitle} ?`);
      break;
    default:
      parts.push(`MY JANTES : ${options.eventTitle}`);
      if (options.eventDetails) parts.push(options.eventDetails);
  }

  if (options.eventUrl) {
    parts.push(`Lien : ${options.eventUrl}`);
  }
  
  return parts.join('\n');
}

export async function sendSms(options: SmsOptions): Promise<{ success: boolean; sid?: string; error?: string }> {
  if (process.env.SMS_DISABLED === 'true') {
    console.log(`[SMS] Désactivé globalement (SMS_DISABLED=true) - message non envoyé à ${options.to}`);
    return { success: false, error: 'SMS désactivés' };
  }

  const provider = getProvider();
  const toE164 = formatPhoneE164(options.to);
  const body = buildSmsBody(options);

  if (!isFrenchMobile(options.to)) {
    console.log(`[SMS] Skipped: ${options.to} is not a valid French mobile number`);
    await logSms({
      recipientPhone: toE164,
      recipientName: options.recipientName,
      recipientEmail: options.recipientEmail,
      eventType: options.eventType,
      eventTitle: options.eventTitle,
      eventDetails: options.eventDetails,
      messageBody: body,
      provider,
      status: 'skipped',
      errorMessage: 'Numéro non mobile français',
    });
    return { success: false, error: 'Numéro non mobile' };
  }

  try {
    let result: { sid?: string; error?: string };

    switch (provider) {
      case 'twilio':
        console.log(`[SMS:Twilio] Sending to ${toE164}`);
        result = await sendViaTwilio(toE164, body);
        break;
      case 'textbelt':
        console.log(`[SMS:TextBelt] Sending to ${toE164}`);
        result = await sendViaTextBelt(toE164, body);
        break;
      case 'gatewayapi':
        console.log(`[SMS:GatewayAPI] Sending to ${toE164}`);
        result = await sendViaGatewayAPI(toE164, body);
        break;
      case 'relationcity':
        console.log(`[SMS:RelationCity] Sending to ${toE164}`);
        result = await sendViaRelationCity(toE164, body);
        break;
      case 'log':
      default:
        result = sendViaLog(toE164, body);
        break;
    }

    if (result.error) {
      await logSms({
        recipientPhone: toE164,
        recipientName: options.recipientName,
        recipientEmail: options.recipientEmail,
        eventType: options.eventType,
        eventTitle: options.eventTitle,
        eventDetails: options.eventDetails,
        messageBody: body,
        provider,
        status: 'failed',
        externalId: result.sid,
        errorMessage: result.error,
      });
      console.error(`[SMS] Error (${provider}) to ${toE164}:`, result.error);
      return { success: false, error: result.error };
    }

    await logSms({
      recipientPhone: toE164,
      recipientName: options.recipientName,
      recipientEmail: options.recipientEmail,
      eventType: options.eventType,
      eventTitle: options.eventTitle,
      eventDetails: options.eventDetails,
      messageBody: body,
      provider,
      status: 'sent',
      externalId: result.sid,
    });

    console.log(`[SMS] Sent via ${provider} to ${toE164}: ${options.eventType} (ID: ${result.sid})`);
    return { success: true, sid: result.sid };
  } catch (error: any) {
    await logSms({
      recipientPhone: toE164,
      recipientName: options.recipientName,
      recipientEmail: options.recipientEmail,
      eventType: options.eventType,
      eventTitle: options.eventTitle,
      eventDetails: options.eventDetails,
      messageBody: body,
      provider,
      status: 'error',
      errorMessage: error.message,
    });
    console.error(`[SMS] Error (${provider}) to ${options.to}:`, error.message);
    return { success: false, error: error.message };
  }
}

export async function sendEventSms(params: {
  userPhone: string | null | undefined;
  userSmsConsent: boolean | null | undefined;
  userName?: string;
  userEmail?: string;
  eventType: SmsEventType;
  eventTitle: string;
  eventDetails?: string;
  eventUrl?: string;
}): Promise<void> {
  if (!params.userSmsConsent) return;
  if (!params.userPhone || !isFrenchMobile(params.userPhone)) return;

  try {
    await sendSms({
      to: params.userPhone,
      eventType: params.eventType,
      eventTitle: params.eventTitle,
      eventDetails: params.eventDetails,
      eventUrl: params.eventUrl,
      recipientName: params.userName,
      recipientEmail: params.userEmail,
    });
  } catch (err) {
    console.error(`[SMS] Failed for event ${params.eventType}:`, err);
  }
}

async function logSms(data: {
  recipientPhone: string;
  recipientName?: string | null;
  recipientEmail?: string | null;
  eventType: string;
  eventTitle: string;
  eventDetails?: string | null;
  messageBody?: string | null;
  provider: string;
  status: string;
  externalId?: string | null;
  errorMessage?: string | null;
}) {
  try {
    await db.insert(smsLogs).values({
      recipientPhone: data.recipientPhone,
      recipientName: data.recipientName || null,
      recipientEmail: data.recipientEmail || null,
      eventType: data.eventType,
      eventTitle: data.eventTitle,
      eventDetails: data.eventDetails || null,
      messageBody: data.messageBody || null,
      provider: data.provider,
      status: data.status,
      externalId: data.externalId || null,
      errorMessage: data.errorMessage || null,
    });
  } catch (err) {
    console.error('[SMS] Failed to log SMS:', err);
  }
}

export async function getSmsLogs(limit = 50) {
  return db.select().from(smsLogs).orderBy(desc(smsLogs.createdAt)).limit(limit);
}

export async function getSmsStats() {
  const all = await db.select().from(smsLogs);
  const sent = all.filter(l => l.status === 'sent').length;
  const failed = all.filter(l => l.status === 'failed' || l.status === 'error').length;
  const skipped = all.filter(l => l.status === 'skipped').length;
  return { total: all.length, sent, failed, skipped, provider: getProvider() };
}
