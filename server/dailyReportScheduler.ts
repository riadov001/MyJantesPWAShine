import * as cron from 'node-cron';
import { db } from './db';
import { invoices, quotes, applicationSettings } from '@shared/schema';
import { sendEmail, getEmailHeader, getEmailFooter } from './emailService';
import { eq, and, gte, lte, sql } from 'drizzle-orm';
import { storage } from './storage';

let scheduledTask: cron.ScheduledTask | null = null;
let currentSettings = {
  enabled: false,
  time: '21:00',
  recipients: 'contact@myjantes.com',
};

async function generateDailyReport() {
  console.log(`[DailyReport] Génération du rapport quotidien à ${new Date().toISOString()}`);

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(yesterdayStart);
    yesterdayEnd.setHours(23, 59, 59, 999);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const currentDay = now.getDate();

    const allInvoices = await db.select().from(invoices);
    const allQuotes = await db.select().from(quotes);

    const todayPaidInvoices = allInvoices.filter(inv => {
      const d = new Date(inv.createdAt!);
      return inv.status === 'paid' && d >= todayStart && d <= todayEnd;
    });
    const todayRevenue = todayPaidInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0);

    const yesterdayPaidInvoices = allInvoices.filter(inv => {
      const d = new Date(inv.createdAt!);
      return inv.status === 'paid' && d >= yesterdayStart && d <= yesterdayEnd;
    });
    const yesterdayRevenue = yesterdayPaidInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0);

    const monthPaidInvoices = allInvoices.filter(inv => {
      const d = new Date(inv.createdAt!);
      return inv.status === 'paid' && d >= monthStart && d <= todayEnd;
    });
    const monthRevenue = monthPaidInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0);

    const monthPendingInvoices = allInvoices.filter(inv => {
      const d = new Date(inv.createdAt!);
      return inv.status === 'pending' && d >= monthStart && d <= todayEnd;
    });
    const monthPending = monthPendingInvoices.reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0);

    const todayNewQuotes = allQuotes.filter(q => {
      const d = new Date(q.createdAt!);
      return d >= todayStart && d <= todayEnd;
    });

    const todayNewInvoices = allInvoices.filter(inv => {
      const d = new Date(inv.createdAt!);
      return d >= todayStart && d <= todayEnd;
    });

    const appSettings = await storage.getApplicationSettings();
    const dailyObj = parseFloat((appSettings as any)?.dailyRevenueObjective || '0');
    const monthlyObjective = dailyObj > 0 ? dailyObj * daysInMonth : 10000;

    const progressPercent = monthlyObjective > 0 ? Math.min((monthRevenue / monthlyObjective) * 100, 100) : 0;
    const avgDaily = currentDay > 0 ? monthRevenue / currentDay : 0;
    const projection = avgDaily * daysInMonth;
    const remainingDays = daysInMonth - currentDay;
    const requiredDaily = remainingDays > 0 ? Math.max(0, (monthlyObjective - monthRevenue) / remainingDays) : 0;

    const variation = yesterdayRevenue > 0
      ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100
      : todayRevenue > 0 ? 100 : 0;
    const isUp = variation >= 0;

    const monthName = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const todayFormatted = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const progressBarWidth = Math.round(progressPercent);
    const progressColor = progressPercent >= 100 ? '#10b981' : progressPercent >= 70 ? '#f59e0b' : '#ef4444';
    const variationColor = isUp ? '#10b981' : '#ef4444';
    const variationArrow = isUp ? '&#9650;' : '&#9660;';

    const html = `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <title>Rapport Quotidien - ${todayFormatted}</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
        ${getEmailHeader('MY JANTES')}
        
        <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: 0;">
          
          <!-- Encaissement du jour -->
          <div style="background: #f0f9ff; border-radius: 8px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #3b82f6;">
            <h2 style="margin: 0 0 10px 0; color: #1e40af; font-size: 16px;">Encaissement du Jour</h2>
            <div style="font-size: 32px; font-weight: bold; color: #1e3a5f;">${todayRevenue.toLocaleString('fr-FR')} €</div>
            <p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">
              Hier : ${yesterdayRevenue.toLocaleString('fr-FR')} € 
              <span style="color: ${variationColor}; font-weight: bold; margin-left: 8px;">
                ${variationArrow} ${variation === 0 && yesterdayRevenue === 0 && todayRevenue === 0 ? '—' : `${isUp ? '+' : ''}${variation.toFixed(0)}%`}
              </span>
            </p>
            <p style="margin: 4px 0 0 0; font-size: 13px; color: #888;">${todayPaidInvoices.length} facture(s) encaissée(s) | ${todayNewQuotes.length} nouveau(x) devis | ${todayNewInvoices.length} nouvelle(s) facture(s)</p>
          </div>
          
          <!-- Objectif Mensuel -->
          <div style="background: #f0fdf4; border-radius: 8px; padding: 20px; margin-bottom: 20px; border-left: 4px solid ${progressColor};">
            <h2 style="margin: 0 0 10px 0; color: #166534; font-size: 16px;">Objectif Mensuel - ${monthName}</h2>
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px;">
              <span style="font-size: 28px; font-weight: bold; color: #1e3a5f;">${monthRevenue.toLocaleString('fr-FR')} €</span>
              <span style="font-size: 14px; color: #666;">sur ${monthlyObjective.toLocaleString('fr-FR')} €</span>
            </div>
            <!-- Progress bar -->
            <div style="background: #e5e7eb; border-radius: 6px; height: 12px; overflow: hidden; margin-bottom: 8px;">
              <div style="background: ${progressColor}; height: 100%; border-radius: 6px; width: ${progressBarWidth}%;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 13px; color: #666;">
              <span style="font-weight: bold; color: ${progressColor};">${progressPercent.toFixed(0)}% atteint</span>
              <span>En attente : ${monthPending.toLocaleString('fr-FR')} €</span>
            </div>
          </div>
          
          <!-- Moyennes & Projection -->
          <div style="background: #faf5ff; border-radius: 8px; padding: 20px; margin-bottom: 20px; border-left: 4px solid #8b5cf6;">
            <h2 style="margin: 0 0 12px 0; color: #5b21b6; font-size: 16px;">Moyennes & Projection</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #666; font-size: 14px;">Moyenne/jour actuelle</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; font-size: 14px;">${avgDaily.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #666; font-size: 14px;">Objectif/jour restant</td>
                <td style="padding: 6px 0; text-align: right; font-weight: bold; font-size: 14px; color: ${requiredDaily <= avgDaily ? '#10b981' : '#ef4444'};">${requiredDaily.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</td>
              </tr>
              <tr style="border-top: 1px solid #e5e7eb;">
                <td style="padding: 8px 0 0 0; color: #666; font-size: 14px;">Projection fin de mois</td>
                <td style="padding: 8px 0 0 0; text-align: right; font-weight: bold; font-size: 16px; color: ${projection >= monthlyObjective ? '#10b981' : '#f59e0b'};">${projection.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} €</td>
              </tr>
            </table>
          </div>
          
          <!-- Récap chiffres -->
          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; margin-bottom: 10px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <tr>
                <td style="padding: 4px 0; color: #888;">Jour ${currentDay}/${daysInMonth} du mois</td>
                <td style="padding: 4px 0; text-align: right; color: #888;">${remainingDays} jours restants</td>
              </tr>
              <tr>
                <td style="padding: 4px 0; color: #888;">Total factures du mois</td>
                <td style="padding: 4px 0; text-align: right; color: #888;">${monthPaidInvoices.length} payées + ${monthPendingInvoices.length} en attente</td>
              </tr>
            </table>
          </div>
        </div>
        
        ${getEmailFooter('MY JANTES')}
      </body>
      </html>
    `;

    const recipientList = currentSettings.recipients
      .split(',')
      .map(r => r.trim())
      .filter(r => r.length > 0);

    if (recipientList.length === 0) {
      console.log('[DailyReport] Aucun destinataire configuré');
      return;
    }

    const primaryRecipient = recipientList[0];
    const ccRecipients = recipientList.slice(1);

    const result = await sendEmail({
      to: primaryRecipient,
      cc: ccRecipients.length > 0 ? ccRecipients : undefined,
      subject: `[MyJantes] Rapport Quotidien - ${todayFormatted}`,
      html,
      source: "rapport",
    });

    if (result.success) {
      console.log(`[DailyReport] Rapport envoyé à ${recipientList.join(', ')}`);
    } else {
      console.error(`[DailyReport] Erreur d'envoi: ${result.error}`);
    }
  } catch (error: any) {
    console.error('[DailyReport] Erreur:', error.message);
  }
}

export function updateDailyReportSchedule(settings: typeof currentSettings) {
  currentSettings = { ...settings };

  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }

  if (currentSettings.enabled && currentSettings.time) {
    const [hours, minutes] = currentSettings.time.split(':');
    const cronExpression = `${minutes} ${hours} * * *`;

    scheduledTask = cron.schedule(cronExpression, generateDailyReport, {
      timezone: 'Europe/Paris',
    });

    console.log(`[DailyReport] Rapport quotidien planifié à ${currentSettings.time} (Europe/Paris) -> ${currentSettings.recipients}`);
  } else {
    console.log('[DailyReport] Rapport quotidien désactivé');
  }
}

export function getDailyReportSettings() {
  return { ...currentSettings };
}

export async function initDailyReportScheduler() {
  try {
    const appSettings = await storage.getApplicationSettings();
    if (appSettings) {
      const settings = {
        enabled: (appSettings as any).dailyReportEnabled ?? false,
        time: (appSettings as any).dailyReportTime || '21:00',
        recipients: (appSettings as any).dailyReportRecipients || 'contact@myjantes.com',
      };
      updateDailyReportSchedule(settings);
    }
  } catch (error) {
    console.log('[DailyReport] Initialisation sans paramètres sauvegardés, utilisation des valeurs par défaut');
  }
}

export async function triggerDailyReport() {
  return generateDailyReport();
}
