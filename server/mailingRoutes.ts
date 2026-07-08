import { Router } from "express";
import { isRoot } from "./localAuth";
import { db } from "./db";
import { sentEmails } from "@shared/schema";
import { desc, count, sql } from "drizzle-orm";

const router = Router();

router.get("/resend", isRoot, async (req, res) => {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ message: "RESEND_API_KEY non configurée" });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;

    const response = await fetch(
      `https://api.resend.com/emails?limit=${limit}&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const err: any = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        message: err?.message || `Resend API HTTP ${response.status}`,
      });
    }

    const data: any = await response.json();

    const emails = (data?.data || []).map((email: any) => ({
      id: email.id,
      from: email.from,
      to: Array.isArray(email.to) ? email.to.join(", ") : email.to,
      subject: email.subject,
      status: email.last_event || "sent",
      attachmentsCount: Array.isArray(email.attachments)
        ? email.attachments.length
        : 0,
      sentAt: email.created_at,
    }));

    return res.json({
      emails,
      total: data?.total ?? emails.length,
      page,
      limit,
    });
  } catch (error: any) {
    console.error("[Mailing] Resend history error:", error.message);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/app-sent", isRoot, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const [emails, totalResult] = await Promise.all([
      db
        .select()
        .from(sentEmails)
        .orderBy(desc(sentEmails.sentAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: count() }).from(sentEmails),
    ]);

    return res.json({
      emails,
      total: totalResult[0]?.count ?? 0,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error("[Mailing] App sent history error:", error.message);
    return res.status(500).json({ message: error.message });
  }
});

export { router as mailingRouter };
