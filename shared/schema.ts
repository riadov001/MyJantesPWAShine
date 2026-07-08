// MyJantes Database Schema
// References: javascript_log_in_with_replit, javascript_database blueprints

import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  decimal,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (Required for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// Garages table (multi-tenant)
export const garages = pgTable("garages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).unique().notNull(), // URL-friendly identifier
  logo: text("logo"), // Base64 encoded logo or Object Storage URL
  primaryColor: varchar("primary_color", { length: 20 }).default("#dc2626"), // Primary theme color
  secondaryColor: varchar("secondary_color", { length: 20 }).default("#1f2937"), // Secondary theme color
  tagline: varchar("tagline", { length: 255 }),
  address: text("address"),
  city: varchar("city", { length: 255 }),
  postalCode: varchar("postal_code", { length: 20 }),
  phone: varchar("phone", { length: 50 }),
  email: varchar("email", { length: 255 }),
  website: varchar("website", { length: 255 }),
  siren: varchar("siren", { length: 15 }),
  siret: varchar("siret", { length: 20 }),
  tvaNumber: varchar("tva_number", { length: 30 }),
  iban: varchar("iban", { length: 50 }),
  swift: varchar("swift", { length: 20 }),
  bankName: varchar("bank_name", { length: 255 }),
  legalForm: varchar("legal_form", { length: 100 }),
  capitalSocial: varchar("capital_social", { length: 50 }),
  nafCode: varchar("naf_code", { length: 10 }),
  rcsCity: varchar("rcs_city", { length: 100 }),
  country: varchar("country", { length: 5 }).default("FR"),
  // Simulator and Configurator settings
  simulatorSettings: jsonb("simulator_settings").default({
    prices: {
      base: 50,
      peinture: 30,
      vernis: 20,
      polissage: 40,
      reparation: 60
    },
    colors: [
      { name: "Argent", hex: "#c0c0c0" },
      { name: "Noir Mat", hex: "#2a2a2a" },
      { name: "Noir Brillant", hex: "#1a1a1a" },
      { name: "Blanc", hex: "#f0f0f0" },
      { name: "Gunmetal", hex: "#4a4a50" },
      { name: "Bronze", hex: "#a87830" },
      { name: "Or", hex: "#d4a843" },
      { name: "Rouge", hex: "#b01020" },
      { name: "Bleu", hex: "#2040a0" },
      { name: "Anthracite", hex: "#383840" }
    ],
    maxPhotos: 5,
    enabledOptions: ["lisere", "gravure", "photoTexture"]
  }),
  // Default settings for this garage
  defaultWheelCount: integer("default_wheel_count").notNull().default(4),
  defaultDiameter: varchar("default_diameter", { length: 50 }).notNull().default("17"),
  defaultTaxRate: decimal("default_tax_rate", { precision: 5, scale: 2 }).notNull().default("20.00"),
  wheelCountOptions: varchar("wheel_count_options").notNull().default("1,2,3,4"),
  diameterOptions: text("diameter_options").notNull().default("14,15,16,17,18,19,20,21,22"),
  customFields: jsonb("custom_fields"), // Custom fields configuration for quotes/invoices
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User storage table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  password: varchar("password", { length: 255 }), // Hashed password
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  phone: varchar("phone"),
  address: text("address"),
  postalCode: varchar("postal_code"),
  city: varchar("city"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { enum: ["client", "client_professionnel", "employe", "admin", "superadmin", "root"] }).notNull().default("client"),
  garageId: varchar("garage_id").references(() => garages.id, { onDelete: 'set null' }), // Multi-tenant: user's garage
  // Champs pour clients professionnels
  companyName: varchar("company_name"),
  siret: varchar("siret", { length: 14 }),
  tvaNumber: varchar("tva_number", { length: 20 }),
  companyAddress: text("company_address"),
  companyPostalCode: varchar("company_postal_code", { length: 20 }),
  companyCity: varchar("company_city", { length: 255 }),
  companyCountry: varchar("company_country", { length: 5 }).default("FR"),
  smsConsent: boolean("sms_consent").notNull().default(false),
  marketingEmailConsent: boolean("marketing_email_consent").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Password reset tokens table
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type InsertPasswordResetToken = typeof passwordResetTokens.$inferInsert;

// Services offered
export const services = pgTable("services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  garageId: varchar("garage_id").references(() => garages.id, { onDelete: 'cascade' }), // Multi-tenant
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }),
  category: varchar("category", { length: 100 }),
  isActive: boolean("is_active").notNull().default(true),
  estimatedDuration: integer("estimated_duration"), // Duration in minutes
  imageUrl: varchar("image_url", { length: 500 }),
  customFormFields: jsonb("custom_form_fields"), // Array of field definitions
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Quote requests
export const quotes = pgTable("quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  garageId: varchar("garage_id").references(() => garages.id, { onDelete: 'cascade' }), // Multi-tenant
  reference: varchar("reference", { length: 50 }).unique(), // Format: DEV-MM-00001
  clientId: varchar("client_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: 'cascade' }),
  vehicleId: varchar("vehicle_id").references((): any => vehicles.id, { onDelete: 'set null' }),
  status: varchar("status", { enum: ["pending", "approved", "accepted", "rejected", "completed"] }).notNull().default("pending"),
  paymentMethod: varchar("payment_method", { enum: ["cash", "wire_transfer", "card", "stripe", "sepa", "klarna", "alma"] }).default("wire_transfer"),
  requestDetails: jsonb("request_details"), // Custom form data from client
  quoteAmount: decimal("quote_amount", { precision: 10, scale: 2 }),
  wheelCount: integer("wheel_count"), // Number of wheels: 1, 2, 3, or 4
  diameter: varchar("diameter", { length: 50 }), // Wheel diameter
  wheelPositions: jsonb("wheel_positions"), // ["FL", "FR", "RL", "RR"]
  priceExcludingTax: decimal("price_excluding_tax", { precision: 10, scale: 2 }), // Prix HT
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }), // TVA rate (e.g., 20.00 for 20%)
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }), // TVA amount
  productDetails: text("product_details"), // Details about products
  notes: text("notes"),
  validUntil: timestamp("valid_until"),
  viewToken: varchar("view_token", { length: 64 }).unique(),
  emailSentAt: timestamp("email_sent_at"),
  viewedAt: timestamp("viewed_at"),
  vehicleRegistration: varchar("vehicle_registration", { length: 20 }),
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleVin: varchar("vehicle_vin", { length: 20 }),
  vehicleFuelType: varchar("vehicle_fuel_type", { length: 50 }),
  vehicleFiscalPower: varchar("vehicle_fiscal_power", { length: 10 }),
  vehicleFirstRegDate: varchar("vehicle_first_reg_date", { length: 20 }),
  vehicleColor: varchar("vehicle_color", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Client reviews (avis clients) - linked to invoices only
export const reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  garageId: varchar("garage_id").references(() => garages.id, { onDelete: 'cascade' }),
  quoteId: varchar("quote_id").references(() => quotes.id, { onDelete: 'cascade' }),
  invoiceId: varchar("invoice_id").references(() => invoices.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").references(() => users.id, { onDelete: 'cascade' }),
  clientName: varchar("client_name", { length: 255 }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  reviewToken: varchar("review_token", { length: 255 }).unique(),
  isApproved: boolean("is_approved").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Quote Items (lignes de devis)
export const quoteItems = pgTable("quote_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: varchar("quote_id").notNull().references(() => quotes.id, { onDelete: 'cascade' }),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPriceExcludingTax: decimal("unit_price_excluding_tax", { precision: 10, scale: 2 }).notNull(),
  totalExcludingTax: decimal("total_excluding_tax", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull(),
  totalIncludingTax: decimal("total_including_tax", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Invoices
export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  garageId: varchar("garage_id").references(() => garages.id, { onDelete: 'cascade' }), // Multi-tenant
  quoteId: varchar("quote_id").references(() => quotes.id, { onDelete: 'cascade' }), // Optional - nullable for direct invoices
  clientId: varchar("client_id").references(() => users.id, { onDelete: 'cascade' }), // Can be null for one-off customers
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull().unique(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: varchar("payment_method", { enum: ["cash", "wire_transfer", "card", "stripe", "sepa", "klarna", "alma"] }),
  wheelCount: integer("wheel_count"),
  diameter: varchar("diameter", { length: 50 }),
  priceExcludingTax: decimal("price_excluding_tax", { precision: 10, scale: 2 }),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }),
  productDetails: text("product_details"),
  status: varchar("status", { enum: ["draft", "pending", "sent", "paid", "overdue", "cancelled"] }).notNull().default("draft"),
  customerName: varchar("customer_name", { length: 255 }),
  customerEmail: varchar("customer_email", { length: 255 }),
  customerAddress: text("customer_address"),
  customerPhone: varchar("customer_phone", { length: 50 }),
  stripeSessionId: varchar("stripe_session_id", { length: 255 }),
  stripePaymentIntentId: varchar("stripe_payment_intent_id", { length: 255 }),
  paymentLink: varchar("payment_link", { length: 500 }),
  dueDate: timestamp("due_date"),
  paidAt: timestamp("paid_at"),
  viewToken: varchar("view_token", { length: 64 }).unique(),
  emailSentAt: timestamp("email_sent_at"),
  viewedAt: timestamp("viewed_at"),
  notes: text("notes"),
  vehicleRegistration: varchar("vehicle_registration", { length: 20 }),
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleVin: varchar("vehicle_vin", { length: 20 }),
  vehicleFuelType: varchar("vehicle_fuel_type", { length: 50 }),
  vehicleFiscalPower: varchar("vehicle_fiscal_power", { length: 10 }),
  vehicleFirstRegDate: varchar("vehicle_first_reg_date", { length: 20 }),
  vehicleColor: varchar("vehicle_color", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Invoice Items (lignes de facture)
export const invoiceItems = pgTable("invoice_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPriceExcludingTax: decimal("unit_price_excluding_tax", { precision: 10, scale: 2 }).notNull(),
  totalExcludingTax: decimal("total_excluding_tax", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull(),
  totalIncludingTax: decimal("total_including_tax", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Reservations
// System logs (audit/observability)
export const systemLogs = pgTable("system_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  level: varchar("level").notNull().default("info"),
  component: varchar("component", { length: 100 }).notNull(),
  operation: varchar("operation", { length: 255 }).notNull(),
  message: text("message").notNull(),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
  userId: varchar("user_id"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  duration: integer("duration"),
  statusCode: integer("status_code"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Vehicles (registry of client vehicles, referenced by quotes/reservations)
export const vehicles = pgTable("vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  garageId: varchar("garage_id").references(() => garages.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  registration: varchar("registration", { length: 20 }),
  make: varchar("make", { length: 100 }),
  model: varchar("model", { length: 100 }),
  vin: varchar("vin", { length: 20 }),
  fuelType: varchar("fuel_type", { length: 50 }),
  fiscalPower: varchar("fiscal_power", { length: 10 }),
  firstRegDate: varchar("first_reg_date", { length: 20 }),
  color: varchar("color", { length: 50 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const reservations = pgTable("reservations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reference: varchar("reference", { length: 50 }).unique(),
  garageId: varchar("garage_id").references(() => garages.id, { onDelete: 'cascade' }),
  quoteId: varchar("quote_id").references(() => quotes.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: 'cascade' }),
  assignedEmployeeId: varchar("assigned_employee_id").references(() => users.id, { onDelete: 'set null' }), // Employee assigned to the reservation
  vehicleId: varchar("vehicle_id").references(() => vehicles.id, { onDelete: 'set null' }),
  scheduledDate: timestamp("scheduled_date").notNull(),
  estimatedEndDate: timestamp("estimated_end_date"), // Estimated end time for calendar display
  wheelCount: integer("wheel_count"), // Number of wheels: 1, 2, 3, or 4
  diameter: varchar("diameter", { length: 50 }), // Wheel diameter
  wheelPositions: jsonb("wheel_positions"), // ["FL", "FR", "RL", "RR"]
  priceExcludingTax: decimal("price_excluding_tax", { precision: 10, scale: 2 }), // Prix HT
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }), // TVA rate (e.g., 20.00 for 20%)
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }), // TVA amount
  productDetails: text("product_details"), // Details about products
  status: varchar("status", { enum: ["pending", "confirmed", "completed", "cancelled"] }).notNull().default("pending"),
  notes: text("notes"),
  vehicleRegistration: varchar("vehicle_registration", { length: 20 }),
  vehicleMake: varchar("vehicle_make", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehicleVin: varchar("vehicle_vin", { length: 20 }),
  // Mode Atelier - Kanban
  atelierStatus: varchar("atelier_status", {
    enum: ["reception", "attente", "preparation", "reparation", "finition", "controle", "termine", "restitution"]
  }).default("reception"),
  urgency: varchar("urgency", {
    enum: ["none", "low", "medium", "high", "critical"]
  }).notNull().default("none"),
  version: integer("version").notNull().default(1),
  lastUpdated: timestamp("last_updated").defaultNow(),
  conflictHistory: jsonb("conflict_history").default([]),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Reservation Services (table de liaison pour services multiples par réservation)
export const reservationServices = pgTable("reservation_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationId: varchar("reservation_id").notNull().references(() => reservations.id, { onDelete: 'cascade' }),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: 'cascade' }),
  quantity: integer("quantity").notNull().default(1),
  priceExcludingTax: decimal("price_excluding_tax", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar("type", { enum: ["quote", "invoice", "reservation", "service", "chat"] }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  relatedId: varchar("related_id"), // ID of related quote/invoice/reservation/conversation
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Chat Conversations (Discussion threads)
export const chatConversations = pgTable("chat_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 255 }).notNull(),
  type: varchar("type", { length: 50 }).notNull().default("internal"),
  createdById: varchar("created_by_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  isArchived: boolean("is_archived").notNull().default(false),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Chat Participants (Who is part of which conversation)
export const chatParticipants = pgTable("chat_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  lastReadAt: timestamp("last_read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Chat Messages
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  senderId: varchar("sender_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text("content").notNull(),
  isEdited: boolean("is_edited").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Chat Attachments (Files attached to messages)
export const chatAttachments = pgTable("chat_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => chatMessages.id, { onDelete: 'cascade' }),
  fileType: varchar("file_type", { enum: ["image", "video", "document"] }).notNull(),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Invoice counters for incremental numbering
export const invoiceCounters = pgTable("invoice_counters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  paymentType: varchar("payment_type", { enum: ["cash", "wire_transfer", "card"] }).notNull().unique(),
  currentNumber: integer("current_number").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Delivery Notes (Bons de Livraison) - groups invoices for end-of-month payment clients
export const deliveryNotes = pgTable("delivery_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  garageId: varchar("garage_id").references(() => garages.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  deliveryNoteNumber: varchar("delivery_note_number", { length: 50 }).notNull().unique(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  totalHT: decimal("total_ht", { precision: 10, scale: 2 }),
  totalTVA: decimal("total_tva", { precision: 10, scale: 2 }),
  status: varchar("status", { enum: ["draft", "finalized", "paid"] }).notNull().default("draft"),
  showPrices: boolean("show_prices").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Join table: delivery note <-> invoices
export const deliveryNoteInvoices = pgTable("delivery_note_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  deliveryNoteId: varchar("delivery_note_id").notNull().references(() => deliveryNotes.id, { onDelete: 'cascade' }),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Delivery note counters for BLV-MM-0001 numbering
export const deliveryNoteCounters = pgTable("delivery_note_counters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  currentNumber: integer("current_number").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Media files for quotes (images and videos)
export const quoteMedia = pgTable("quote_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: varchar("quote_id").notNull().references(() => quotes.id, { onDelete: 'cascade' }),
  fileType: varchar("file_type", { enum: ["image", "video"] }).notNull(),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Media files for invoices (images and videos)
export const invoiceMedia = pgTable("invoice_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  fileType: varchar("file_type", { enum: ["image", "video"] }).notNull(),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Application Settings (singleton table for app-wide configuration)
export const applicationSettings = pgTable("application_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  defaultWheelCount: integer("default_wheel_count").notNull().default(4), // Default: 4 jantes
  defaultDiameter: varchar("default_diameter", { length: 50 }).notNull().default("17"), // Default diameter
  defaultTaxRate: decimal("default_tax_rate", { precision: 5, scale: 2 }).notNull().default("20.00"), // Default: 20% TVA
  wheelCountOptions: varchar("wheel_count_options").notNull().default("1,2,3,4"), // Available options (comma-separated)
  diameterOptions: text("diameter_options").notNull().default("14,15,16,17,18,19,20,21,22"), // Available diameters (comma-separated)
  companyName: varchar("company_name", { length: 255 }).notNull().default("MyJantes"),
  companyTagline: varchar("company_tagline", { length: 255 }),
  companyAddress: text("company_address"),
  companyCity: varchar("company_city", { length: 255 }),
  companyPostalCode: varchar("company_postal_code", { length: 20 }),
  companyPhone: varchar("company_phone", { length: 50 }),
  companyEmail: varchar("company_email", { length: 255 }),
  companyWebsite: varchar("company_website", { length: 255 }),
  companySiret: varchar("company_siret", { length: 20 }),
  companyTvaNumber: varchar("company_tva_number", { length: 30 }),
  companyIban: varchar("company_iban", { length: 50 }),
  companySwift: varchar("company_swift", { length: 20 }),
  companyBankName: varchar("company_bank_name", { length: 255 }),
  companySiren: varchar("company_siren", { length: 15 }),
  companyLegalForm: varchar("company_legal_form", { length: 100 }),
  companyCapitalSocial: varchar("company_capital_social", { length: 50 }),
  companyNafCode: varchar("company_naf_code", { length: 10 }),
  companyRcsCity: varchar("company_rcs_city", { length: 100 }),
  companyCountry: varchar("company_country", { length: 5 }).default("FR"),
  companyLogo: text("company_logo"),
  simulatorSettings: jsonb("simulator_settings").default({
    prices: { base: 50, peinture: 30, vernis: 20, polissage: 40, reparation: 60 },
    colors: [
      { name: "Argent", hex: "#c0c0c0" },
      { name: "Noir Mat", hex: "#2a2a2a" },
      { name: "Noir Brillant", hex: "#1a1a1a" },
      { name: "Blanc", hex: "#f0f0f0" },
      { name: "Gunmetal", hex: "#4a4a50" },
      { name: "Bronze", hex: "#a87830" },
      { name: "Or", hex: "#d4a843" },
      { name: "Rouge", hex: "#b01020" },
      { name: "Bleu", hex: "#2040a0" },
      { name: "Anthracite", hex: "#383840" }
    ],
    maxPhotos: 5,
    enabledOptions: ["lisere", "gravure", "photoTexture"]
  }),
  dailyRevenueObjective: decimal("daily_revenue_objective", { precision: 10, scale: 2 }).default("0"),
  chatbotWelcomeMessage: text("chatbot_welcome_message"),
  chatbotFaqItems: jsonb("chatbot_faq_items"),
  dailyReportEnabled: boolean("daily_report_enabled").notNull().default(false),
  dailyReportTime: varchar("daily_report_time", { length: 5 }).notNull().default("21:00"),
  dailyReportRecipients: text("daily_report_recipients").notNull().default("contact@myjantes.com"),
  calendarToken: varchar("calendar_token", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Engagements (Prestations) - groups quotes, invoices and reservations per client
export const engagements = pgTable("engagements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { enum: ["active", "completed", "cancelled"] }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Workflows - define the steps required for a service
export const workflows = pgTable("workflows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: varchar("service_id").references(() => services.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Workflow steps - individual steps within a workflow
export const workflowSteps = pgTable("workflow_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: varchar("workflow_id").notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  stepNumber: integer("step_number").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Service-Workflow associations
export const serviceWorkflows = pgTable("service_workflows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: varchar("service_id").notNull().references(() => services.id, { onDelete: 'cascade' }),
  workflowId: varchar("workflow_id").notNull().references(() => workflows.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Workshop tracking - tracks the progress of a reservation
export const workshopTasks = pgTable("workshop_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reservationId: varchar("reservation_id").notNull().references(() => reservations.id, { onDelete: 'cascade' }),
  workflowStepId: varchar("workflow_step_id").notNull().references(() => workflowSteps.id, { onDelete: 'cascade' }),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  completedByUserId: varchar("completed_by_user_id").references(() => users.id),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Repair Orders (Ordres de Réparation) - Vehicle condition report before work
export const repairOrders = pgTable("repair_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  garageId: varchar("garage_id").references(() => garages.id, { onDelete: 'cascade' }),
  reservationId: varchar("reservation_id").references(() => reservations.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  reference: varchar("reference", { length: 50 }).unique(),
  vehicleBrand: varchar("vehicle_brand", { length: 100 }),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  vehiclePlate: varchar("vehicle_plate", { length: 20 }),
  vehicleVin: varchar("vehicle_vin", { length: 30 }),
  vehicleColor: varchar("vehicle_color", { length: 50 }),
  vehicleYear: integer("vehicle_year"),
  mileage: integer("mileage"),
  fuelLevel: varchar("fuel_level", { enum: ["empty", "quarter", "half", "three_quarters", "full"] }),
  exteriorCondition: jsonb("exterior_condition"),
  interiorCondition: jsonb("interior_condition"),
  existingDamages: text("existing_damages"),
  accessories: jsonb("accessories"),
  clientObservations: text("client_observations"),
  technicianNotes: text("technician_notes"),
  photos: jsonb("photos"),
  status: varchar("status", { enum: ["draft", "signed", "in_progress", "completed"] }).notNull().default("draft"),
  signedByClient: boolean("signed_by_client").notNull().default(false),
  signedAt: timestamp("signed_at"),
  createdById: varchar("created_by_id").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Audit Logs - tracks all actions performed in the system
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: varchar("entity_type", { 
    enum: ["quote", "invoice", "reservation", "service", "workflow", "workflow_step", "user", "workshop_task"] 
  }).notNull(),
  entityId: varchar("entity_id").notNull(),
  action: varchar("action", { 
    enum: ["created", "updated", "deleted", "validated", "rejected", "completed", "cancelled", "paid", "confirmed"] 
  }).notNull(),
  actorId: varchar("actor_id").references(() => users.id, { onDelete: 'set null' }),
  actorRole: varchar("actor_role", { enum: ["client", "client_professionnel", "employe", "admin", "superadmin", "root"] }),
  actorName: varchar("actor_name", { length: 255 }), // Store name at time of action
  summary: text("summary"), // Human-readable summary of action
  metadata: jsonb("metadata"), // Additional context (e.g., related entity info)
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (table) => [
  index("IDX_audit_entity").on(table.entityType, table.entityId),
  index("IDX_audit_actor").on(table.actorId),
  index("IDX_audit_occurred").on(table.occurredAt),
]);

// Audit Log Changes - stores field-level changes for each audit log entry
export const auditLogChanges = pgTable("audit_log_changes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  auditLogId: varchar("audit_log_id").notNull().references(() => auditLogs.id, { onDelete: 'cascade' }),
  field: varchar("field", { length: 100 }).notNull(),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
});

// Relations
export const garagesRelations = relations(garages, ({ many }) => ({
  users: many(users),
  services: many(services),
  quotes: many(quotes),
  invoices: many(invoices),
  reservations: many(reservations),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  garage: one(garages, {
    fields: [users.garageId],
    references: [garages.id],
  }),
  quotes: many(quotes),
  invoices: many(invoices),
  reservations: many(reservations),
  notifications: many(notifications),
  engagements: many(engagements),
}));

export const servicesRelations = relations(services, ({ one, many }) => ({
  garage: one(garages, {
    fields: [services.garageId],
    references: [garages.id],
  }),
  quotes: many(quotes),
  reservations: many(reservations),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  garage: one(garages, {
    fields: [quotes.garageId],
    references: [garages.id],
  }),
  client: one(users, {
    fields: [quotes.clientId],
    references: [users.id],
  }),
  service: one(services, {
    fields: [quotes.serviceId],
    references: [services.id],
  }),
  invoices: many(invoices),
  reservations: many(reservations),
  items: many(quoteItems),
}));

export const quoteItemsRelations = relations(quoteItems, ({ one }) => ({
  quote: one(quotes, {
    fields: [quoteItems.quoteId],
    references: [quotes.id],
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  garage: one(garages, {
    fields: [invoices.garageId],
    references: [garages.id],
  }),
  quote: one(quotes, {
    fields: [invoices.quoteId],
    references: [quotes.id],
  }),
  client: one(users, {
    fields: [invoices.clientId],
    references: [users.id],
  }),
  items: many(invoiceItems),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
}));

export const reservationsRelations = relations(reservations, ({ one, many }) => ({
  garage: one(garages, {
    fields: [reservations.garageId],
    references: [garages.id],
  }),
  quote: one(quotes, {
    fields: [reservations.quoteId],
    references: [quotes.id],
  }),
  client: one(users, {
    fields: [reservations.clientId],
    references: [users.id],
  }),
  service: one(services, {
    fields: [reservations.serviceId],
    references: [services.id],
  }),
  additionalServices: many(reservationServices),
}));

export const reservationServicesRelations = relations(reservationServices, ({ one }) => ({
  reservation: one(reservations, {
    fields: [reservationServices.reservationId],
    references: [reservations.id],
  }),
  service: one(services, {
    fields: [reservationServices.serviceId],
    references: [services.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const workflowsRelations = relations(workflows, ({ many }) => ({
  steps: many(workflowSteps),
  serviceWorkflows: many(serviceWorkflows),
}));

export const workflowStepsRelations = relations(workflowSteps, ({ one, many }) => ({
  workflow: one(workflows, {
    fields: [workflowSteps.workflowId],
    references: [workflows.id],
  }),
  workshopTasks: many(workshopTasks),
}));

export const serviceWorkflowsRelations = relations(serviceWorkflows, ({ one }) => ({
  service: one(services, {
    fields: [serviceWorkflows.serviceId],
    references: [services.id],
  }),
  workflow: one(workflows, {
    fields: [serviceWorkflows.workflowId],
    references: [workflows.id],
  }),
}));

export const workshopTasksRelations = relations(workshopTasks, ({ one }) => ({
  reservation: one(reservations, {
    fields: [workshopTasks.reservationId],
    references: [reservations.id],
  }),
  step: one(workflowSteps, {
    fields: [workshopTasks.workflowStepId],
    references: [workflowSteps.id],
  }),
  completedBy: one(users, {
    fields: [workshopTasks.completedByUserId],
    references: [users.id],
  }),
}));

export const repairOrdersRelations = relations(repairOrders, ({ one }) => ({
  garage: one(garages, {
    fields: [repairOrders.garageId],
    references: [garages.id],
  }),
  reservation: one(reservations, {
    fields: [repairOrders.reservationId],
    references: [reservations.id],
  }),
  client: one(users, {
    fields: [repairOrders.clientId],
    references: [users.id],
  }),
  createdBy: one(users, {
    fields: [repairOrders.createdById],
    references: [users.id],
  }),
}));

export const engagementsRelations = relations(engagements, ({ one }) => ({
  client: one(users, {
    fields: [engagements.clientId],
    references: [users.id],
  }),
}));

export const quoteMediaRelations = relations(quoteMedia, ({ one }) => ({
  quote: one(quotes, {
    fields: [quoteMedia.quoteId],
    references: [quotes.id],
  }),
}));

export const invoiceMediaRelations = relations(invoiceMedia, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceMedia.invoiceId],
    references: [invoices.id],
  }),
}));

export const deliveryNotesRelations = relations(deliveryNotes, ({ one, many }) => ({
  garage: one(garages, {
    fields: [deliveryNotes.garageId],
    references: [garages.id],
  }),
  client: one(users, {
    fields: [deliveryNotes.clientId],
    references: [users.id],
  }),
  deliveryNoteInvoices: many(deliveryNoteInvoices),
}));

export const deliveryNoteInvoicesRelations = relations(deliveryNoteInvoices, ({ one }) => ({
  deliveryNote: one(deliveryNotes, {
    fields: [deliveryNoteInvoices.deliveryNoteId],
    references: [deliveryNotes.id],
  }),
  invoice: one(invoices, {
    fields: [deliveryNoteInvoices.invoiceId],
    references: [invoices.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one, many }) => ({
  actor: one(users, {
    fields: [auditLogs.actorId],
    references: [users.id],
  }),
  changes: many(auditLogChanges),
}));

export const auditLogChangesRelations = relations(auditLogChanges, ({ one }) => ({
  auditLog: one(auditLogs, {
    fields: [auditLogChanges.auditLogId],
    references: [auditLogs.id],
  }),
}));

export const chatConversationsRelations = relations(chatConversations, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [chatConversations.createdById],
    references: [users.id],
  }),
  participants: many(chatParticipants),
  messages: many(chatMessages),
}));

export const chatParticipantsRelations = relations(chatParticipants, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatParticipants.conversationId],
    references: [chatConversations.id],
  }),
  user: one(users, {
    fields: [chatParticipants.userId],
    references: [users.id],
  }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one, many }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
  sender: one(users, {
    fields: [chatMessages.senderId],
    references: [users.id],
  }),
  attachments: many(chatAttachments),
}));

export const chatAttachmentsRelations = relations(chatAttachments, ({ one }) => ({
  message: one(chatMessages, {
    fields: [chatAttachments.messageId],
    references: [chatMessages.id],
  }),
}));

// Zod Schemas for validation
export const insertGarageSchema = createInsertSchema(garages).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserSchema = createInsertSchema(users);
export const insertServiceSchema = createInsertSchema(services).omit({ id: true, createdAt: true, updatedAt: true });
export const insertQuoteSchema = createInsertSchema(quotes).omit({ id: true, createdAt: true, updatedAt: true });

// Custom invoice schema with data transformations
export const insertInvoiceSchema = createInsertSchema(invoices)
  .omit({ id: true, createdAt: true, updatedAt: true, invoiceNumber: true })
  .extend({
    amount: z.union([z.string(), z.number()]).transform(val => String(val)),
    dueDate: z.union([z.date(), z.string()]).transform(val => 
      typeof val === 'string' ? new Date(val) : val
    ).optional(),
    quoteId: z.string().nullable().optional(), // Optional for direct invoices
    paymentMethod: z.enum(["cash", "wire_transfer", "card", "stripe", "sepa", "klarna", "alma"]).optional().nullable(),
    wheelCount: z.number().min(1).max(4).nullable().optional(),
    diameter: z.string().nullable().optional(),
    priceExcludingTax: z.string().nullable().optional(),
    taxRate: z.string().nullable().optional(),
    taxAmount: z.string().nullable().optional(),
    productDetails: z.string().nullable().optional(),
    customerName: z.string().nullable().optional(),
    customerEmail: z.string().email().nullable().optional(),
    customerAddress: z.string().nullable().optional(),
    customerPhone: z.string().nullable().optional(),
    status: z.enum(["draft", "pending", "sent", "paid", "overdue", "cancelled"]).default("draft"),
  });

// Custom reservation schema with data transformations
export const insertReservationSchema = createInsertSchema(reservations)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    scheduledDate: z.union([z.date(), z.string()]).transform(val => 
      typeof val === 'string' ? new Date(val) : val
    ),
    estimatedEndDate: z.union([z.date(), z.string()]).transform(val => 
      typeof val === 'string' ? new Date(val) : val
    ).optional().nullable(),
    quoteId: z.string().nullable().optional(),
    wheelCount: z.number().min(1).max(4).nullable().optional(),
    diameter: z.string().nullable().optional(),
    priceExcludingTax: z.string().nullable().optional(),
    taxRate: z.string().nullable().optional(),
    taxAmount: z.string().nullable().optional(),
    productDetails: z.string().nullable().optional(),
  });

export const insertInvoiceItemSchema = createInsertSchema(invoiceItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertQuoteItemSchema = createInsertSchema(quoteItems).omit({ id: true, createdAt: true, updatedAt: true });
export const insertReservationServiceSchema = createInsertSchema(reservationServices).omit({ id: true, createdAt: true });
export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export const insertInvoiceCounterSchema = createInsertSchema(invoiceCounters).omit({ id: true, updatedAt: true });
export const insertDeliveryNoteSchema = createInsertSchema(deliveryNotes).omit({ id: true, createdAt: true, updatedAt: true, deliveryNoteNumber: true });
export const insertDeliveryNoteInvoiceSchema = createInsertSchema(deliveryNoteInvoices).omit({ id: true, createdAt: true });
export const insertDeliveryNoteCounterSchema = createInsertSchema(deliveryNoteCounters).omit({ id: true, updatedAt: true });
export const insertQuoteMediaSchema = createInsertSchema(quoteMedia).omit({ id: true, createdAt: true });
export const insertInvoiceMediaSchema = createInsertSchema(invoiceMedia).omit({ id: true, createdAt: true });
export const insertApplicationSettingsSchema = createInsertSchema(applicationSettings).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEngagementSchema = createInsertSchema(engagements).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWorkflowSchema = createInsertSchema(workflows).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWorkflowStepSchema = createInsertSchema(workflowSteps).omit({ id: true, createdAt: true, updatedAt: true });
export const insertServiceWorkflowSchema = createInsertSchema(serviceWorkflows).omit({ id: true, createdAt: true });
export const insertWorkshopTaskSchema = createInsertSchema(workshopTasks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertRepairOrderSchema = createInsertSchema(repairOrders).omit({ id: true, createdAt: true, updatedAt: true });
export const insertReviewSchema = createInsertSchema(reviews).omit({ id: true, createdAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, occurredAt: true });
export const insertAuditLogChangeSchema = createInsertSchema(auditLogChanges).omit({ id: true });
export const insertChatConversationSchema = createInsertSchema(chatConversations).omit({ id: true, createdAt: true, updatedAt: true, lastMessageAt: true });
export const insertChatParticipantSchema = createInsertSchema(chatParticipants).omit({ id: true, createdAt: true });
export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true, updatedAt: true, isEdited: true });
export const insertChatAttachmentSchema = createInsertSchema(chatAttachments).omit({ id: true, createdAt: true });

// Types
export type InsertGarage = z.infer<typeof insertGarageSchema>;
export type Garage = typeof garages.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;
export type Service = typeof services.$inferSelect;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotes.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoiceItem = z.infer<typeof insertInvoiceItemSchema>;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type InsertQuoteItem = z.infer<typeof insertQuoteItemSchema>;
export type QuoteItem = typeof quoteItems.$inferSelect;
export type InsertReservation = z.infer<typeof insertReservationSchema>;
export type Reservation = typeof reservations.$inferSelect;
export type InsertReservationService = z.infer<typeof insertReservationServiceSchema>;
export type ReservationService = typeof reservationServices.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertInvoiceCounter = z.infer<typeof insertInvoiceCounterSchema>;
export type InvoiceCounter = typeof invoiceCounters.$inferSelect;
export type InsertDeliveryNote = z.infer<typeof insertDeliveryNoteSchema>;
export type DeliveryNote = typeof deliveryNotes.$inferSelect;
export type InsertDeliveryNoteInvoice = z.infer<typeof insertDeliveryNoteInvoiceSchema>;
export type DeliveryNoteInvoice = typeof deliveryNoteInvoices.$inferSelect;
export type InsertDeliveryNoteCounter = z.infer<typeof insertDeliveryNoteCounterSchema>;
export type DeliveryNoteCounter = typeof deliveryNoteCounters.$inferSelect;
export type InsertQuoteMedia = z.infer<typeof insertQuoteMediaSchema>;
export type QuoteMedia = typeof quoteMedia.$inferSelect;
export type InsertInvoiceMedia = z.infer<typeof insertInvoiceMediaSchema>;
export type InvoiceMedia = typeof invoiceMedia.$inferSelect;
export type InsertApplicationSettings = z.infer<typeof insertApplicationSettingsSchema>;
export type ApplicationSettings = typeof applicationSettings.$inferSelect;
export type InsertEngagement = z.infer<typeof insertEngagementSchema>;
export type Engagement = typeof engagements.$inferSelect;
export type InsertWorkflow = z.infer<typeof insertWorkflowSchema>;
export type Workflow = typeof workflows.$inferSelect;
export type InsertWorkflowStep = z.infer<typeof insertWorkflowStepSchema>;
export type WorkflowStep = typeof workflowSteps.$inferSelect;
export type InsertServiceWorkflow = z.infer<typeof insertServiceWorkflowSchema>;
export type ServiceWorkflow = typeof serviceWorkflows.$inferSelect;
export type InsertWorkshopTask = z.infer<typeof insertWorkshopTaskSchema>;
export type WorkshopTask = typeof workshopTasks.$inferSelect;
export type InsertRepairOrder = z.infer<typeof insertRepairOrderSchema>;
export type RepairOrder = typeof repairOrders.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLogChange = z.infer<typeof insertAuditLogChangeSchema>;
export type AuditLogChange = typeof auditLogChanges.$inferSelect;
export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatParticipant = z.infer<typeof insertChatParticipantSchema>;
export type ChatParticipant = typeof chatParticipants.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatAttachment = z.infer<typeof insertChatAttachmentSchema>;
export type ChatAttachment = typeof chatAttachments.$inferSelect;
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviews.$inferSelect;

// ========== ACCOUNTING MODULE ==========

// Expense Categories
export const expenseCategories = pgTable("expense_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  garageId: varchar("garage_id").references(() => garages.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 20 }),
  description: text("description"),
  defaultTaxRate: decimal("default_tax_rate", { precision: 5, scale: 2 }).default("20.00"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Expenses (Charges / Dépenses)
export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  garageId: varchar("garage_id").references(() => garages.id, { onDelete: 'cascade' }),
  categoryId: varchar("category_id").references(() => expenseCategories.id, { onDelete: 'set null' }),
  expenseNumber: varchar("expense_number", { length: 50 }).notNull().unique(),
  vendor: varchar("vendor", { length: 255 }).notNull(),
  description: text("description"),
  date: timestamp("date").notNull(),
  amountHT: decimal("amount_ht", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull().default("20.00"),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  amountTTC: decimal("amount_ttc", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: varchar("payment_method", { enum: ["cash", "wire_transfer", "card", "check", "direct_debit"] }).notNull().default("wire_transfer"),
  status: varchar("status", { enum: ["pending", "paid", "cancelled"] }).notNull().default("paid"),
  attachmentPath: varchar("attachment_path", { length: 500 }),
  attachmentName: varchar("attachment_name", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Credit Notes (Avoirs)
export const creditNotes = pgTable("credit_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  garageId: varchar("garage_id").references(() => garages.id, { onDelete: 'cascade' }),
  invoiceId: varchar("invoice_id").notNull().references(() => invoices.id, { onDelete: 'cascade' }),
  clientId: varchar("client_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  creditNoteNumber: varchar("credit_note_number", { length: 50 }).notNull().unique(),
  reason: text("reason").notNull(),
  totalHT: decimal("total_ht", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull().default("20.00"),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull(),
  totalTTC: decimal("total_ttc", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { enum: ["draft", "issued", "refunded", "cancelled"] }).notNull().default("draft"),
  issuedAt: timestamp("issued_at"),
  refundedAt: timestamp("refunded_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Credit Note Items
export const creditNoteItems = pgTable("credit_note_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  creditNoteId: varchar("credit_note_id").notNull().references(() => creditNotes.id, { onDelete: 'cascade' }),
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unitPriceHT: decimal("unit_price_ht", { precision: 10, scale: 2 }).notNull(),
  totalHT: decimal("total_ht", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull(),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull(),
  totalTTC: decimal("total_ttc", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Accounting Entries (Écritures comptables)
export const accountingEntries = pgTable("accounting_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  garageId: varchar("garage_id").references(() => garages.id, { onDelete: 'cascade' }),
  entryNumber: varchar("entry_number", { length: 50 }).notNull().unique(),
  date: timestamp("date").notNull(),
  journal: varchar("journal", { enum: ["sales", "purchases", "bank", "cash", "misc"] }).notNull(),
  sourceType: varchar("source_type", { enum: ["invoice", "expense", "credit_note", "payment", "manual"] }).notNull(),
  sourceId: varchar("source_id"),
  description: text("description").notNull(),
  totalDebit: decimal("total_debit", { precision: 10, scale: 2 }).notNull().default("0"),
  totalCredit: decimal("total_credit", { precision: 10, scale: 2 }).notNull().default("0"),
  isValidated: boolean("is_validated").notNull().default(false),
  validatedAt: timestamp("validated_at"),
  validatedBy: varchar("validated_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Accounting Entry Lines (Lignes d'écritures comptables)
export const accountingLines = pgTable("accounting_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entryId: varchar("entry_id").notNull().references(() => accountingEntries.id, { onDelete: 'cascade' }),
  accountCode: varchar("account_code", { length: 20 }).notNull(),
  accountLabel: varchar("account_label", { length: 255 }).notNull(),
  description: text("description"),
  debit: decimal("debit", { precision: 10, scale: 2 }).notNull().default("0"),
  credit: decimal("credit", { precision: 10, scale: 2 }).notNull().default("0"),
  vatRate: decimal("vat_rate", { precision: 5, scale: 2 }),
  vatAmount: decimal("vat_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// FEC Export history (Fichier des Écritures Comptables)
export const fecExports = pgTable("fec_exports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  garageId: varchar("garage_id").references(() => garages.id, { onDelete: 'cascade' }),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  entryCount: integer("entry_count").notNull().default(0),
  totalDebit: decimal("total_debit", { precision: 12, scale: 2 }).notNull().default("0"),
  totalCredit: decimal("total_credit", { precision: 12, scale: 2 }).notNull().default("0"),
  fileName: varchar("file_name", { length: 255 }),
  filePath: varchar("file_path", { length: 500 }),
  generatedBy: varchar("generated_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Credit note numbering counter
export const creditNoteCounters = pgTable("credit_note_counters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  year: integer("year").notNull(),
  currentNumber: integer("current_number").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Expense numbering counter
export const expenseCounters = pgTable("expense_counters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  year: integer("year").notNull(),
  currentNumber: integer("current_number").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const accountingEntryCounters = pgTable("accounting_entry_counters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  year: integer("year").notNull(),
  currentNumber: integer("current_number").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ========== ACCOUNTING RELATIONS ==========

export const expenseCategoriesRelations = relations(expenseCategories, ({ one, many }) => ({
  garage: one(garages, {
    fields: [expenseCategories.garageId],
    references: [garages.id],
  }),
  expenses: many(expenses),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  garage: one(garages, {
    fields: [expenses.garageId],
    references: [garages.id],
  }),
  category: one(expenseCategories, {
    fields: [expenses.categoryId],
    references: [expenseCategories.id],
  }),
}));

export const creditNotesRelations = relations(creditNotes, ({ one, many }) => ({
  garage: one(garages, {
    fields: [creditNotes.garageId],
    references: [garages.id],
  }),
  invoice: one(invoices, {
    fields: [creditNotes.invoiceId],
    references: [invoices.id],
  }),
  client: one(users, {
    fields: [creditNotes.clientId],
    references: [users.id],
  }),
  items: many(creditNoteItems),
}));

export const creditNoteItemsRelations = relations(creditNoteItems, ({ one }) => ({
  creditNote: one(creditNotes, {
    fields: [creditNoteItems.creditNoteId],
    references: [creditNotes.id],
  }),
}));

export const accountingEntriesRelations = relations(accountingEntries, ({ one, many }) => ({
  garage: one(garages, {
    fields: [accountingEntries.garageId],
    references: [garages.id],
  }),
  validatedByUser: one(users, {
    fields: [accountingEntries.validatedBy],
    references: [users.id],
  }),
  lines: many(accountingLines),
}));

export const accountingLinesRelations = relations(accountingLines, ({ one }) => ({
  entry: one(accountingEntries, {
    fields: [accountingLines.entryId],
    references: [accountingEntries.id],
  }),
}));

// ========== ACCOUNTING SCHEMAS & TYPES ==========

export const insertExpenseCategorySchema = createInsertSchema(expenseCategories).omit({ id: true, createdAt: true, updatedAt: true });
export const insertExpenseSchema = createInsertSchema(expenses)
  .omit({ id: true, createdAt: true, updatedAt: true, expenseNumber: true })
  .extend({
    date: z.union([z.date(), z.string()]).transform(val => typeof val === 'string' ? new Date(val) : val),
    amountHT: z.union([z.string(), z.number()]).transform(val => String(val)),
    taxRate: z.union([z.string(), z.number()]).transform(val => String(val)),
    taxAmount: z.union([z.string(), z.number()]).transform(val => String(val)),
    amountTTC: z.union([z.string(), z.number()]).transform(val => String(val)),
  });
export const insertCreditNoteSchema = createInsertSchema(creditNotes)
  .omit({ id: true, createdAt: true, updatedAt: true, creditNoteNumber: true })
  .extend({
    totalHT: z.union([z.string(), z.number()]).transform(val => String(val)),
    taxAmount: z.union([z.string(), z.number()]).transform(val => String(val)),
    totalTTC: z.union([z.string(), z.number()]).transform(val => String(val)),
  });
export const insertCreditNoteItemSchema = createInsertSchema(creditNoteItems).omit({ id: true, createdAt: true });
export const insertAccountingEntrySchema = createInsertSchema(accountingEntries)
  .omit({ id: true, createdAt: true, updatedAt: true, entryNumber: true })
  .extend({
    date: z.union([z.date(), z.string()]).transform(val => typeof val === 'string' ? new Date(val) : val),
  });
export const insertAccountingLineSchema = createInsertSchema(accountingLines).omit({ id: true, createdAt: true });
export const insertFecExportSchema = createInsertSchema(fecExports).omit({ id: true, createdAt: true });

export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type InsertExpenseCategory = z.infer<typeof insertExpenseCategorySchema>;
export type Expense = typeof expenses.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type CreditNote = typeof creditNotes.$inferSelect;
export type InsertCreditNote = z.infer<typeof insertCreditNoteSchema>;
export type CreditNoteItem = typeof creditNoteItems.$inferSelect;
export type InsertCreditNoteItem = z.infer<typeof insertCreditNoteItemSchema>;
export type AccountingEntry = typeof accountingEntries.$inferSelect;
export type InsertAccountingEntry = z.infer<typeof insertAccountingEntrySchema>;
export type AccountingLine = typeof accountingLines.$inferSelect;
export type InsertAccountingLine = z.infer<typeof insertAccountingLineSchema>;
export type FecExport = typeof fecExports.$inferSelect;
export type InsertFecExport = z.infer<typeof insertFecExportSchema>;

// OCR Scan History
export const ocrScans = pgTable("ocr_scans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  garageId: varchar("garage_id").references(() => garages.id, { onDelete: 'cascade' }),
  scannedBy: varchar("scanned_by").references(() => users.id, { onDelete: 'set null' }),
  documentType: varchar("document_type", { length: 50 }).notNull(),
  fileName: varchar("file_name", { length: 500 }),
  result: jsonb("result"),
  createdQuoteId: varchar("created_quote_id").references(() => quotes.id, { onDelete: 'set null' }),
  createdInvoiceId: varchar("created_invoice_id").references(() => invoices.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOcrScanSchema = createInsertSchema(ocrScans).omit({ id: true, createdAt: true });
export type OcrScan = typeof ocrScans.$inferSelect;
export type InsertOcrScan = z.infer<typeof insertOcrScanSchema>;

export const smsLogs = pgTable("sms_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recipientPhone: varchar("recipient_phone", { length: 20 }).notNull(),
  recipientName: varchar("recipient_name", { length: 255 }),
  recipientEmail: varchar("recipient_email", { length: 255 }),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  eventTitle: varchar("event_title", { length: 255 }).notNull(),
  eventDetails: text("event_details"),
  messageBody: text("message_body"),
  provider: varchar("provider", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  externalId: varchar("external_id", { length: 100 }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSmsLogSchema = createInsertSchema(smsLogs).omit({ id: true, createdAt: true });
export type SmsLog = typeof smsLogs.$inferSelect;
export type InsertSmsLog = z.infer<typeof insertSmsLogSchema>;

// ========== NOTIFICATION RULES (Rappels & Notifications paramétrables) ==========

export const notificationRules = pgTable("notification_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  garageId: varchar("garage_id").references(() => garages.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  eventType: varchar("event_type", { enum: [
    "reservation_reminder",
    "invoice_overdue",
    "quote_expiry",
    "review_request",
    "payment_confirmed",
    "reservation_created",
    "invoice_created",
    "quote_sent",
    "custom"
  ] }).notNull(),
  channels: jsonb("channels").notNull().default(["app"]),
  triggerDelay: integer("trigger_delay").notNull().default(0),
  triggerUnit: varchar("trigger_unit", { enum: ["minutes", "hours", "days"] }).notNull().default("hours"),
  triggerDirection: varchar("trigger_direction", { enum: ["before", "after"] }).notNull().default("before"),
  recipientType: varchar("recipient_type", { enum: ["client", "admin", "both"] }).notNull().default("client"),
  emailSubject: varchar("email_subject", { length: 500 }),
  emailBody: text("email_body"),
  popupTitle: varchar("popup_title", { length: 255 }),
  popupMessage: text("popup_message"),
  smsMessage: text("sms_message"),
  isActive: boolean("is_active").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const notificationRulesRelations = relations(notificationRules, ({ one }) => ({
  garage: one(garages, {
    fields: [notificationRules.garageId],
    references: [garages.id],
  }),
}));

export const insertNotificationRuleSchema = createInsertSchema(notificationRules).omit({ id: true, createdAt: true, updatedAt: true, lastTriggeredAt: true });
export type NotificationRule = typeof notificationRules.$inferSelect;
export type InsertNotificationRule = z.infer<typeof insertNotificationRuleSchema>;

export const externalApis = pgTable("external_apis", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: varchar("name", { length: 255 }).notNull(),
  baseUrl: text("base_url").notNull(),
  description: text("description"),
  authType: varchar("auth_type", { enum: ["none", "api_key", "bearer", "basic"] }).notNull().default("none"),
  authConfig: jsonb("auth_config").default({}),
  defaultHeaders: jsonb("default_headers").default({}),
  discoveredRoutes: jsonb("discovered_routes").default([]),
  openApiSpec: jsonb("openapi_spec"),
  isActive: boolean("is_active").notNull().default(true),
  lastDiscoveredAt: timestamp("last_discovered_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertExternalApiSchema = createInsertSchema(externalApis).omit({ id: true, createdAt: true, updatedAt: true, lastDiscoveredAt: true });
export type ExternalApi = typeof externalApis.$inferSelect;
export type InsertExternalApi = z.infer<typeof insertExternalApiSchema>;

// ========== AI ANALYSIS HISTORY ==========

export const aiAnalysisHistory = pgTable("ai_analysis_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: varchar("type", { enum: ["globale", "commerciale", "croissance", "wheel"] }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  result: jsonb("result").notNull(),
  imageUrl: text("image_url"),
  emailSentAt: timestamp("email_sent_at"),
  garageId: varchar("garage_id").references(() => garages.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAiAnalysisHistorySchema = createInsertSchema(aiAnalysisHistory).omit({ id: true, createdAt: true });
export type AiAnalysisHistory = typeof aiAnalysisHistory.$inferSelect;
export type InsertAiAnalysisHistory = z.infer<typeof insertAiAnalysisHistorySchema>;

// ========== MOBILE: PUSH DEVICE TOKENS ==========

export const deviceTokens = pgTable("device_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  platform: varchar("platform", { enum: ["ios", "android"] }).notNull(),
  appVersion: varchar("app_version", { length: 50 }),
  deviceModel: varchar("device_model", { length: 120 }),
  locale: varchar("locale", { length: 10 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_device_tokens_user").on(table.userId),
]);

export const insertDeviceTokenSchema = createInsertSchema(deviceTokens).omit({ id: true, createdAt: true, updatedAt: true });
export type DeviceToken = typeof deviceTokens.$inferSelect;
export type InsertDeviceToken = z.infer<typeof insertDeviceTokenSchema>;

// ========== DEMANDES DE DEVIS (depuis site vitrine) ==========

export const quoteRequests = pgTable("quote_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  source: varchar("source", { length: 50 }).default("website"),
  firstName: varchar("first_name", { length: 100 }),
  lastName: varchar("last_name", { length: 100 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  service: varchar("service", { length: 255 }),
  message: text("message"),
  vehicleInfo: text("vehicle_info"),
  photos: jsonb("photos").$type<string[]>().default([]),
  status: varchar("status", { length: 50 }).default("new"),
  convertedClientId: varchar("converted_client_id"),
  convertedQuoteId: varchar("converted_quote_id"),
  rawData: jsonb("raw_data"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_quote_requests_status").on(table.status),
  index("idx_quote_requests_email").on(table.email),
]);

export const insertQuoteRequestSchema = createInsertSchema(quoteRequests).omit({ id: true, createdAt: true, updatedAt: true });
export type QuoteRequest = typeof quoteRequests.$inferSelect;
export type InsertQuoteRequest = z.infer<typeof insertQuoteRequestSchema>;

// ========== SENT EMAILS LOG ==========

export const sentEmails = pgTable("sent_emails", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resendId: varchar("resend_id", { length: 255 }),
  from: varchar("from", { length: 500 }).notNull(),
  to: varchar("to", { length: 500 }).notNull(),
  subject: varchar("subject", { length: 500 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("sent"),
  source: varchar("source", { length: 100 }),
  attachmentsCount: integer("attachments_count").notNull().default(0),
  sentAt: timestamp("sent_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_sent_emails_sent_at").on(table.sentAt),
  index("idx_sent_emails_source").on(table.source),
]);

export const insertSentEmailSchema = createInsertSchema(sentEmails).omit({ id: true, createdAt: true, sentAt: true });
export type SentEmail = typeof sentEmails.$inferSelect;
export type InsertSentEmail = z.infer<typeof insertSentEmailSchema>;

