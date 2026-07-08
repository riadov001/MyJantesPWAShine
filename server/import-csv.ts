
import { db } from "./db";
import { quotes, users, services, quoteItems } from "../shared/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

async function importCsv() {
  const csvPath = path.join(process.cwd(), "attached_assets/devis_2026-02-12_1770872623455.csv");
  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter(line => line.trim() !== "");
  const headers = lines[0].split(",");
  const dataLines = lines.slice(1);

  console.log(`Importing ${dataLines.length} quotes...`);

  // Cache users and services to avoid multiple queries
  const allUsers = await db.select().from(users);
  const allServices = await db.select().from(services);

  for (const line of dataLines) {
    // Handle quotes in service names with commas (simple CSV parser)
    // ID,Référence,Client,Service,Montant,Statut,Date
    // 53a75da0-967a-4ef2-a292-705f14e551f4,DEV-02-00042,Frederic Colle,SOUDURE,108.00,approved,11/02/2026
    
    // Using a simple regex to split by comma but ignore commas inside quotes if they existed
    // However, the provided CSV doesn't seem to have quotes around fields with commas like "19,20,21"
    // So we need to be careful. Let's look at a line:
    // 924f48df-fc52-4354-ba7a-dabca01cf4b9,DEV-02-00039,Laurent Lefranc,RENOVATION JANTE UNICOLOR 19,20,21,660.00,approved,11/02/2026
    // Here, "RENOVATION JANTE UNICOLOR 19,20,21" has commas.
    
    const parts = line.split(",");
    const id = parts[0];
    const reference = parts[1];
    const clientName = parts[2];
    
    // The service name might contain commas. The last 3 parts are Montant, Statut, Date.
    const date = parts[parts.length - 1];
    const status = parts[parts.length - 2];
    const amount = parts[parts.length - 3];
    const serviceName = parts.slice(3, parts.length - 3).join(",");

    // Find or create user
    let user = allUsers.find(u => `${u.firstName} ${u.lastName}`.toLowerCase() === clientName.toLowerCase() || u.companyName?.toLowerCase() === clientName.toLowerCase());
    if (!user) {
      const nameParts = clientName.split(" ");
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || "Client";
      const [newUser] = await db.insert(users).values({
        email: `${clientName.replace(/\s+/g, '.').toLowerCase()}@import.tmp`,
        firstName,
        lastName,
        role: "client"
      }).returning();
      user = newUser;
      allUsers.push(newUser);
    }

    // Find or create service
    let service = allServices.find(s => s.name.toLowerCase() === serviceName.toLowerCase());
    if (!service) {
      const [newService] = await db.insert(services).values({
        name: serviceName,
        basePrice: amount,
        category: "Imported"
      }).returning();
      service = newService;
      allServices.push(newService);
    }

    // Parse date DD/MM/YYYY
    const [day, month, year] = date.split("/").map(Number);
    const createdAt = new Date(year, month - 1, day);

    // Check if quote already exists
    const [existing] = await db.select().from(quotes).where(eq(quotes.reference, reference));
    if (!existing) {
      try {
        const [quote] = await db.insert(quotes).values({
          id,
          reference,
          clientId: user.id,
          serviceId: service.id,
          status: (status === "approved" || status === "accepted") ? "approved" : (status === "rejected" ? "rejected" : "pending"),
          quoteAmount: amount,
          priceExcludingTax: (parseFloat(amount) / 1.2).toFixed(2),
          taxAmount: (parseFloat(amount) - (parseFloat(amount) / 1.2)).toFixed(2),
          taxRate: "20.00",
          createdAt,
          updatedAt: createdAt
        }).returning();

        // Create a default item for the quote
        await db.insert(quoteItems).values({
          quoteId: quote.id,
          description: serviceName,
          quantity: "1",
          unitPriceExcludingTax: (parseFloat(amount) / 1.2).toFixed(2),
          totalExcludingTax: (parseFloat(amount) / 1.2).toFixed(2),
          taxRate: "20.00",
          taxAmount: (parseFloat(amount) - (parseFloat(amount) / 1.2)).toFixed(2),
          totalIncludingTax: amount,
          createdAt,
          updatedAt: createdAt
        });
      } catch (err) {
        console.error(`Error importing ${reference}:`, err.message);
      }
    }
  }

  console.log("Import finished.");
  process.exit(0);
}

importCsv().catch(err => {
  console.error(err);
  process.exit(1);
});
