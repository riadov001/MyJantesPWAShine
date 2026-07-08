
import { db } from "./db";
import { users, invoices, invoiceItems, reservations, services, garages, quotes } from "../shared/schema";
import { eq, and } from "drizzle-orm";
import fs from "fs";
import path from "path";

async function importComprehensive() {
  console.log("Starting comprehensive import...");

  // 1. Import Users
  const usersCsvPath = path.join(process.cwd(), "attached_assets/utilisateurs_2026-02-12_1770872709589.csv");
  if (fs.existsSync(usersCsvPath)) {
    const content = fs.readFileSync(usersCsvPath, "utf-8");
    const lines = content.split("\n").filter(l => l.trim() !== "").slice(1);
    console.log(`Importing ${lines.length} users...`);
    for (const line of lines) {
      const [id, lastName, firstName, email, role, phone, companyName] = line.split(",");
      const [existing] = await db.select().from(users).where(eq(users.id, id));
      if (!existing) {
        await db.insert(users).values({
          id,
          lastName,
          firstName,
          email,
          role: role as any,
          phone,
          companyName: companyName || null
        });
      }
    }
  }

  // 2. Import Invoices
  const invoicesCsvPath = path.join(process.cwd(), "attached_assets/factures_2026-02-12_1770872673579.csv");
  if (fs.existsSync(invoicesCsvPath)) {
    const content = fs.readFileSync(invoicesCsvPath, "utf-8");
    const lines = content.split("\n").filter(l => l.trim() !== "").slice(1);
    console.log(`Importing ${lines.length} invoices...`);
    for (const line of lines) {
      const parts = line.split(",");
      if (parts.length < 7) continue;
      const [id, invoiceNumber, clientName, amount, status, dueDateStr, dateStr] = parts;
      
      const [existing] = await db.select().from(invoices).where(eq(invoices.id, id));
      if (!existing) {
        // Find user by name
        const allUsers = await db.select().from(users);
        const user = allUsers.find(u => `${u.firstName} ${u.lastName}`.toLowerCase() === clientName.toLowerCase() || u.companyName?.toLowerCase() === clientName.toLowerCase());
        if (!user) {
           console.log(`User not found for invoice ${invoiceNumber}: ${clientName}`);
           continue;
        }

        const [d, m, y] = dateStr.split("/").map(Number);
        const createdAt = new Date(y, m - 1, d);
        let dueDate = null;
        if (dueDateStr) {
          const [dd, mm, yy] = dueDateStr.split("/").map(Number);
          dueDate = new Date(yy, mm - 1, dd);
        }

        const paymentMethod = invoiceNumber.startsWith("VIR") ? "wire_transfer" : (invoiceNumber.startsWith("CB") || invoiceNumber.startsWith("CBL") ? "card" : "cash");

        await db.insert(invoices).values({
          id,
          invoiceNumber,
          clientId: user.id,
          amount,
          status: status as any,
          paymentMethod,
          dueDate,
          createdAt,
          updatedAt: createdAt
        });

        // Add a default item
        await db.insert(invoiceItems).values({
          invoiceId: id,
          description: "Service automobile",
          quantity: "1",
          unitPriceExcludingTax: (parseFloat(amount) / 1.2).toFixed(2),
          totalExcludingTax: (parseFloat(amount) / 1.2).toFixed(2),
          taxRate: "20.00",
          taxAmount: (parseFloat(amount) - (parseFloat(amount) / 1.2)).toFixed(2),
          totalIncludingTax: amount,
          createdAt,
          updatedAt: createdAt
        });
      }
    }
  }

  // 3. Import Reservations (ICS)
  const icsPath = path.join(process.cwd(), "attached_assets/planning-myjantes-2026-02_(8)_1770872694707.ics");
  if (fs.existsSync(icsPath)) {
    const content = fs.readFileSync(icsPath, "utf-8");
    const events = content.split("BEGIN:VEVENT").slice(1);
    console.log(`Importing ${events.length} reservations...`);
    
    for (const event of events) {
      const uidMatch = event.match(/UID:(.*?)@/);
      const startMatch = event.match(/DTSTART:(.*?)Z/);
      const endMatch = event.match(/DTEND:(.*?)Z/);
      const summaryMatch = event.match(/SUMMARY:(.*)/);
      const descMatch = event.match(/DESCRIPTION:Reservation ID: (.*?)\\nClient: (.*?)\\n/);
      
      if (!uidMatch || !startMatch || !summaryMatch) continue;

      const uid = uidMatch[1];
      const startStr = startMatch[1];
      const endStr = endMatch ? endMatch[1] : null;
      
      const [serviceName, clientName] = summaryMatch[1].split(" - ").map(s => s.trim());
      
      const scheduledDate = new Date(
        parseInt(startStr.substring(0, 4)),
        parseInt(startStr.substring(4, 6)) - 1,
        parseInt(startStr.substring(6, 8)),
        parseInt(startStr.substring(9, 11)),
        parseInt(startStr.substring(11, 13))
      );

      let estimatedEndDate = null;
      if (endStr) {
        estimatedEndDate = new Date(
          parseInt(endStr.substring(0, 4)),
          parseInt(endStr.substring(4, 6)) - 1,
          parseInt(endStr.substring(6, 8)),
          parseInt(endStr.substring(9, 11)),
          parseInt(endStr.substring(11, 13))
        );
      }

      const [existing] = await db.select().from(reservations).where(eq(reservations.id, uid));
      if (!existing) {
        const allUsers = await db.select().from(users);
        const user = allUsers.find(u => `${u.firstName} ${u.lastName}`.toLowerCase() === clientName.toLowerCase() || u.companyName?.toLowerCase() === clientName.toLowerCase());
        
        const allServices = await db.select().from(services);
        let service = allServices.find(s => s.name.toLowerCase() === serviceName.toLowerCase());
        
        if (user && service) {
          await db.insert(reservations).values({
            id: uid,
            clientId: user.id,
            serviceId: service.id,
            scheduledDate,
            estimatedEndDate,
            status: "confirmed"
          });
        }
      }
    }
  }

  console.log("Comprehensive import finished.");
  process.exit(0);
}

importComprehensive().catch(err => {
  console.error(err);
  process.exit(1);
});
