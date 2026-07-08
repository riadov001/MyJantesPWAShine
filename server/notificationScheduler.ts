import { storage } from "./storage";
import type { NotificationRule } from "@shared/schema";

let schedulerInterval: NodeJS.Timeout | null = null;
const sentNotifications = new Set<string>();

function getDeduplicationKey(ruleId: string, entityId: string, userId: string): string {
  return `${ruleId}:${entityId}:${userId}`;
}

function cleanupOldKeys() {
  if (sentNotifications.size > 10000) {
    sentNotifications.clear();
  }
}

async function checkReservationReminders() {
  try {
    const rules = await storage.getActiveNotificationRules(undefined, "reservation_reminder");
    if (rules.length === 0) return;

    const reservations = await storage.getReservations();
    const now = new Date();

    for (const rule of rules) {
      const delayMs = getDelayMs(rule.triggerDelay, rule.triggerUnit);

      for (const reservation of reservations) {
        if (reservation.status === "cancelled" || reservation.status === "completed") continue;

        const scheduledDate = new Date(reservation.scheduledDate);
        if (scheduledDate < now) continue;

        const triggerTime = new Date(scheduledDate.getTime() - delayMs);

        const windowStart = new Date(now.getTime() - 5 * 60 * 1000);
        const windowEnd = new Date(now.getTime() + 5 * 60 * 1000);

        if (triggerTime >= windowStart && triggerTime <= windowEnd) {
          const dedupeKey = getDeduplicationKey(rule.id, reservation.id, reservation.clientId);
          if (sentNotifications.has(dedupeKey)) continue;
          sentNotifications.add(dedupeKey);

          const recipients = getRecipients(rule.recipientType, reservation.clientId);
          for (const recipientId of recipients) {
            if (recipientId === "admin") {
              const users = await storage.getAllUsers();
              const admins = users.filter(u => u.role === "admin" || u.role === "superadmin");
              for (const admin of admins) {
                await triggerNotification(rule, admin.id, {
                  reservationId: reservation.id,
                  reservationDate: scheduledDate.toLocaleDateString("fr-FR"),
                  reservationTime: scheduledDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
                });
              }
            } else {
              await triggerNotification(rule, recipientId, {
                reservationId: reservation.id,
                reservationDate: scheduledDate.toLocaleDateString("fr-FR"),
                reservationTime: scheduledDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
              });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("[NotificationScheduler] Error checking reservation reminders:", error);
  }
}

async function checkInvoiceOverdue() {
  try {
    const rules = await storage.getActiveNotificationRules(undefined, "invoice_overdue");
    if (rules.length === 0) return;

    const invoices = await storage.getInvoices();
    const now = new Date();

    for (const rule of rules) {
      const delayMs = getDelayMs(rule.triggerDelay, rule.triggerUnit);

      for (const invoice of invoices) {
        if (invoice.status === "paid" || (invoice.status as string) === "cancelled") continue;
        if (!invoice.dueDate) continue;
        if (!invoice.clientId) continue;

        const dueDate = new Date(invoice.dueDate);
        const triggerTime = new Date(dueDate.getTime() + delayMs);

        const windowStart = new Date(now.getTime() - 5 * 60 * 1000);
        const windowEnd = new Date(now.getTime() + 5 * 60 * 1000);

        if (triggerTime >= windowStart && triggerTime <= windowEnd) {
          const dedupeKey = getDeduplicationKey(rule.id, invoice.id, invoice.clientId);
          if (sentNotifications.has(dedupeKey)) continue;
          sentNotifications.add(dedupeKey);

          const recipients = getRecipients(rule.recipientType, invoice.clientId);
          for (const recipientId of recipients) {
            if (recipientId === "admin") {
              const users = await storage.getAllUsers();
              const admins = users.filter(u => u.role === "admin" || u.role === "superadmin");
              for (const admin of admins) {
                await triggerNotification(rule, admin.id, {
                  invoiceId: invoice.id,
                  invoiceNumber: invoice.invoiceNumber,
                  amount: invoice.amount,
                  dueDate: dueDate.toLocaleDateString("fr-FR"),
                });
              }
            } else {
              await triggerNotification(rule, recipientId, {
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                amount: invoice.amount,
                dueDate: dueDate.toLocaleDateString("fr-FR"),
              });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("[NotificationScheduler] Error checking invoice overdue:", error);
  }
}

async function checkQuoteExpiry() {
  try {
    const rules = await storage.getActiveNotificationRules(undefined, "quote_expiry");
    if (rules.length === 0) return;

    const quotes = await storage.getQuotes();
    const now = new Date();

    for (const rule of rules) {
      const delayMs = getDelayMs(rule.triggerDelay, rule.triggerUnit);

      for (const quote of quotes) {
        if (quote.status === "accepted" || quote.status === "cancelled" || quote.status === "rejected") continue;
        if (!quote.validUntil) continue;
        if (!quote.clientId) continue;

        const expiryDate = new Date(quote.validUntil);
        const triggerTime = rule.triggerDirection === "before"
          ? new Date(expiryDate.getTime() - delayMs)
          : new Date(expiryDate.getTime() + delayMs);

        const windowStart = new Date(now.getTime() - 5 * 60 * 1000);
        const windowEnd = new Date(now.getTime() + 5 * 60 * 1000);

        if (triggerTime >= windowStart && triggerTime <= windowEnd) {
          const dedupeKey = getDeduplicationKey(rule.id, quote.id, quote.clientId);
          if (sentNotifications.has(dedupeKey)) continue;
          sentNotifications.add(dedupeKey);

          const recipients = getRecipients(rule.recipientType, quote.clientId);
          for (const recipientId of recipients) {
            if (recipientId === "admin") {
              const users = await storage.getAllUsers();
              const admins = users.filter(u => u.role === "admin" || u.role === "superadmin");
              for (const admin of admins) {
                await triggerNotification(rule, admin.id, {
                  quoteId: quote.id,
                  quoteReference: quote.reference || quote.id,
                  amount: quote.quoteAmount,
                  expiryDate: expiryDate.toLocaleDateString("fr-FR"),
                });
              }
            } else {
              await triggerNotification(rule, recipientId, {
                quoteId: quote.id,
                quoteReference: quote.reference || quote.id,
                amount: quote.quoteAmount,
                expiryDate: expiryDate.toLocaleDateString("fr-FR"),
              });
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("[NotificationScheduler] Error checking quote expiry:", error);
  }
}

async function checkReviewRequests() {
  try {
    const rules = await storage.getActiveNotificationRules(undefined, "review_request");
    if (rules.length === 0) return;

    const reservations = await storage.getReservations();
    const now = new Date();

    for (const rule of rules) {
      const delayMs = getDelayMs(rule.triggerDelay, rule.triggerUnit);

      for (const reservation of reservations) {
        if (reservation.status !== "completed") continue;

        const completedDate = reservation.updatedAt ? new Date(reservation.updatedAt) : null;
        if (!completedDate) continue;

        const triggerTime = new Date(completedDate.getTime() + delayMs);

        const windowStart = new Date(now.getTime() - 5 * 60 * 1000);
        const windowEnd = new Date(now.getTime() + 5 * 60 * 1000);

        if (triggerTime >= windowStart && triggerTime <= windowEnd) {
          const dedupeKey = getDeduplicationKey(rule.id, reservation.id, reservation.clientId);
          if (sentNotifications.has(dedupeKey)) continue;
          sentNotifications.add(dedupeKey);

          await triggerNotification(rule, reservation.clientId, {
            reservationId: reservation.id,
            reservationDate: new Date(reservation.scheduledDate).toLocaleDateString("fr-FR"),
          });
        }
      }
    }
  } catch (error) {
    console.error("[NotificationScheduler] Error checking review requests:", error);
  }
}

function getRecipients(recipientType: string, entityClientId: string): string[] {
  const recipients: string[] = [];
  if (recipientType === "admin" || recipientType === "both") {
    recipients.push("admin");
  }
  if (recipientType === "client" || recipientType === "both") {
    recipients.push(entityClientId);
  }
  return recipients;
}

async function triggerNotification(
  rule: NotificationRule,
  userId: string,
  variables: Record<string, string | null>
) {
  const channels = Array.isArray(rule.channels) ? rule.channels as string[] : [];
  const user = await storage.getUser(userId);
  if (!user) return;

  const clientName = `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "";
  const allVars = { ...variables, clientName };

  if (channels.includes("app")) {
    const title = replaceVariables(rule.popupTitle || rule.name, allVars);
    const message = replaceVariables(rule.popupMessage || rule.description || "", allVars);
    try {
      // storage.createNotification fans out WS realtime + mobile push centrally.
      await storage.createNotification({
        userId,
        type: mapEventToNotificationType(rule.eventType),
        title,
        message,
        relatedId: variables.reservationId || variables.invoiceId || variables.quoteId || null,
      });
    } catch (err) {
      console.error("[NotificationScheduler] Error creating in-app notification:", err);
    }
  }

  if (channels.includes("email") && user.email) {
    const subject = replaceVariables(rule.emailSubject || rule.name, allVars);
    const body = replaceVariables(rule.emailBody || "", allVars);
    try {
      const { sendReminderEmail } = await import("./emailService");
      await sendReminderEmail(user.email, clientName, subject, body);
    } catch (err) {
      console.error("[NotificationScheduler] Error sending email notification:", err);
    }
  }

  if (channels.includes("sms") && user.phone && user.smsConsent) {
    const smsBody = replaceVariables(rule.smsMessage || rule.popupMessage || "", allVars);
    try {
      const { sendSms } = await import("./smsService");
      const smsEventMap: Record<string, string> = {
        reservation_reminder: "reservation_reminder",
        invoice_overdue: "invoice_sent",
        quote_expiry: "quote_sent",
        review_request: "review_request",
        payment_confirmed: "invoice_paid",
        reservation_created: "reservation_confirmed",
        invoice_created: "invoice_sent",
        quote_sent: "quote_sent",
        custom: "general",
      };
      await sendSms({
        to: user.phone,
        recipientName: clientName,
        recipientEmail: user.email || undefined,
        eventType: (smsEventMap[rule.eventType] || "general") as any,
        eventTitle: rule.name,
        eventDetails: smsBody,
      });
    } catch (err) {
      console.error("[NotificationScheduler] Error sending SMS notification:", err);
    }
  }

  try {
    await storage.updateNotificationRule(rule.id, { lastTriggeredAt: new Date() } as any);
  } catch (err) {}
}

function mapEventToNotificationType(eventType: string): "quote" | "invoice" | "reservation" | "service" | "chat" {
  switch (eventType) {
    case "reservation_reminder":
    case "reservation_created":
      return "reservation";
    case "invoice_overdue":
    case "invoice_created":
    case "payment_confirmed":
      return "invoice";
    case "quote_expiry":
    case "quote_sent":
      return "quote";
    case "review_request":
      return "service";
    default:
      return "service";
  }
}

function replaceVariables(template: string, vars: Record<string, string | null>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value || "");
  }
  return result;
}

function getDelayMs(delay: number, unit: string): number {
  switch (unit) {
    case "minutes": return delay * 60 * 1000;
    case "hours": return delay * 60 * 60 * 1000;
    case "days": return delay * 24 * 60 * 60 * 1000;
    default: return delay * 60 * 60 * 1000;
  }
}

export function initNotificationScheduler() {
  if (process.env.DISABLE_AUTO_REMINDERS === 'true') {
    console.log("[NotificationScheduler] Automatic reminders are disabled (DISABLE_AUTO_REMINDERS=true)");
    return;
  }

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }

  schedulerInterval = setInterval(async () => {
    cleanupOldKeys();
    await checkReservationReminders();
    await checkInvoiceOverdue();
    await checkQuoteExpiry();
    await checkReviewRequests();
  }, 5 * 60 * 1000);

  console.log("[NotificationScheduler] Scheduler initialized - checking every 5 minutes");
}

export async function triggerEventNotification(
  eventType: string,
  userId: string,
  variables: Record<string, string | null>,
  garageId?: string
) {
  try {
    const rules = await storage.getActiveNotificationRules(garageId, eventType);
    for (const rule of rules) {
      if (rule.triggerDelay === 0) {
        await triggerNotification(rule, userId, variables);
      }
    }
  } catch (error) {
    console.error("[NotificationScheduler] Error triggering event notification:", error);
  }
}
