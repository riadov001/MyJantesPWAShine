import {
  garages,
  users,
  services,
  quotes,
  quoteItems,
  invoices,
  invoiceItems,
  reservations,
  reservationServices,
  notifications,
  invoiceCounters,
  deliveryNotes,
  deliveryNoteInvoices,
  deliveryNoteCounters,
  quoteMedia,
  invoiceMedia,
  applicationSettings,
  engagements,
  workflows,
  workflowSteps,
  serviceWorkflows,
  workshopTasks,
  auditLogs,
  auditLogChanges,
  passwordResetTokens,
  chatConversations,
  chatParticipants,
  chatMessages,
  chatAttachments,
  type Garage,
  type InsertGarage,
  type User,
  type PasswordResetToken,
  type InsertPasswordResetToken,
  type UpsertUser,
  type Service,
  type InsertService,
  type Quote,
  type InsertQuote,
  type QuoteItem,
  type InsertQuoteItem,
  type Invoice,
  type InsertInvoice,
  type InvoiceItem,
  type InsertInvoiceItem,
  type Reservation,
  type InsertReservation,
  type ReservationService,
  type InsertReservationService,
  type Notification,
  type InsertNotification,
  type InvoiceCounter,
  type InsertInvoiceCounter,
  type DeliveryNote,
  type InsertDeliveryNote,
  type DeliveryNoteInvoice,
  type DeliveryNoteCounter,
  type ApplicationSettings,
  type InsertApplicationSettings,
  type Engagement,
  type InsertEngagement,
  type Workflow,
  type InsertWorkflow,
  type WorkflowStep,
  type InsertWorkflowStep,
  type ServiceWorkflow,
  type InsertServiceWorkflow,
  type WorkshopTask,
  type InsertWorkshopTask,
  type AuditLog,
  type InsertAuditLog,
  type AuditLogChange,
  type InsertAuditLogChange,
  type ChatConversation,
  type InsertChatConversation,
  type ChatParticipant,
  type InsertChatParticipant,
  type ChatMessage,
  type InsertChatMessage,
  type ChatAttachment,
  type InsertChatAttachment,
  repairOrders,
  type RepairOrder,
  type InsertRepairOrder,
  expenseCategories,
  expenses,
  creditNotes,
  creditNoteItems,
  accountingEntries,
  accountingLines,
  fecExports,
  creditNoteCounters,
  expenseCounters,
  accountingEntryCounters,
  type ExpenseCategory,
  type InsertExpenseCategory,
  type Expense,
  type InsertExpense,
  type CreditNote,
  type InsertCreditNote,
  type CreditNoteItem,
  type InsertCreditNoteItem,
  type AccountingEntry,
  type InsertAccountingEntry,
  type AccountingLine,
  type InsertAccountingLine,
  type FecExport,
  type InsertFecExport,
  notificationRules,
  type NotificationRule,
  type InsertNotificationRule,
  externalApis,
  type ExternalApi,
  type InsertExternalApi,
  aiAnalysisHistory,
  type AiAnalysisHistory,
  type InsertAiAnalysisHistory,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, inArray } from "drizzle-orm";

export interface IStorage {
  // Garage methods (multi-tenant)
  getGarages(): Promise<Garage[]>;
  getGarage(id: string): Promise<Garage | undefined>;
  getGarageBySlug(slug: string): Promise<Garage | undefined>;
  createGarage(garage: InsertGarage): Promise<Garage>;
  updateGarage(id: string, garage: Partial<InsertGarage>): Promise<Garage>;
  deleteGarage(id: string): Promise<void>;
  getUsersByGarage(garageId: string): Promise<User[]>;
  
  getUser(id: string | null): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  getUsersByRoles(roles: string[]): Promise<User[]>;
  updateUser(id: string, userData: Partial<User>): Promise<User>;
  createUser(user: { 
    email: string; 
    password?: string; 
    firstName?: string; 
    lastName?: string; 
    phone?: string;
    address?: string;
    postalCode?: string;
    city?: string;
    role?: "client" | "client_professionnel" | "employe" | "admin"; 
    companyName?: string; 
    siret?: string; 
    tvaNumber?: string; 
    companyAddress?: string 
  }): Promise<User>;
  deleteUser(id: string): Promise<void>;
  getServices(): Promise<Service[]>;
  getService(id: string): Promise<Service | undefined>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: string, service: Partial<InsertService>): Promise<Service>;
  deleteService(id: string): Promise<void>;
  getQuotes(clientId?: string, garageId?: string): Promise<Quote[]>;
  getQuote(id: string): Promise<Quote | undefined>;
  createQuote(quote: InsertQuote): Promise<Quote>;
  updateQuote(id: string, quote: Partial<InsertQuote>): Promise<Quote>;
  getQuoteItems(quoteId: string): Promise<QuoteItem[]>;
  getQuoteItem(id: string): Promise<QuoteItem | undefined>;
  createQuoteItem(item: InsertQuoteItem): Promise<QuoteItem>;
  updateQuoteItem(id: string, item: Partial<InsertQuoteItem>): Promise<QuoteItem>;
  deleteQuoteItem(id: string): Promise<void>;
  recalculateQuoteTotals(quoteId: string): Promise<Quote>;
  deleteQuote(id: string): Promise<void>;
  getInvoices(clientId?: string, garageId?: string): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  createInvoice(invoice: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, invoice: Partial<InsertInvoice>): Promise<Invoice>;
  deleteInvoice(id: string): Promise<void>;
  getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]>;
  getInvoiceItem(id: string): Promise<InvoiceItem | undefined>;
  createInvoiceItem(item: InsertInvoiceItem): Promise<InvoiceItem>;
  updateInvoiceItem(id: string, item: Partial<InsertInvoiceItem>): Promise<InvoiceItem>;
  deleteInvoiceItem(id: string): Promise<void>;
  recalculateInvoiceTotals(invoiceId: string): Promise<Invoice>;
  getReservations(clientId?: string, garageId?: string): Promise<Reservation[]>;
  getReservation(id: string): Promise<Reservation | undefined>;
  createReservation(reservation: InsertReservation): Promise<Reservation>;
  updateReservation(id: string, reservation: Partial<InsertReservation>): Promise<Reservation>;
  getReservationServices(reservationId: string): Promise<(ReservationService & { service: Service })[]>;
  addReservationService(data: InsertReservationService): Promise<ReservationService>;
  deleteReservation(id: string): Promise<void>;
  deleteReservationServices(reservationId: string): Promise<void>;
  setReservationServices(reservationId: string, serviceIds: string[]): Promise<void>;
  getNotifications(userId: string): Promise<Notification[]>;
  getNotification(id: string): Promise<Notification | undefined>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<void>;
  getInvoiceCounter(paymentType: "cash" | "wire_transfer" | "card"): Promise<InvoiceCounter | undefined>;
  createInvoiceCounter(counter: InsertInvoiceCounter): Promise<InvoiceCounter>;
  incrementInvoiceCounter(paymentType: "cash" | "wire_transfer" | "card"): Promise<InvoiceCounter>;
  getQuoteMediaByPath(filePath: string): Promise<(typeof quoteMedia.$inferSelect)[]>;
  getInvoiceMediaByPath(filePath: string): Promise<(typeof invoiceMedia.$inferSelect)[]>;
  createQuoteMedia(media: { quoteId: string; filePath: string; fileType: string; fileName?: string; fileSize?: number }): Promise<void>;
  createInvoiceMedia(media: { invoiceId: string; filePath: string; fileType: string; fileName?: string; fileSize?: number }): Promise<void>;
  getQuoteByReference(reference: string): Promise<Quote | undefined>;
  getQuoteMedia(quoteId: string): Promise<{ id: string; quoteId: string; fileType: string; filePath: string; fileName: string; fileSize: number | null; createdAt: Date | null }[]>;
  getQuoteMediaById(mediaId: string): Promise<{ id: string; quoteId: string; fileType: string; filePath: string; fileName: string; fileSize: number | null; createdAt: Date | null } | undefined>;
  deleteQuoteMedia(mediaId: string): Promise<void>;
  getInvoiceMedia(invoiceId: string): Promise<{ id: string; invoiceId: string; fileType: string; filePath: string; fileName: string; fileSize: number | null; createdAt: Date | null }[]>;
  getInvoiceMediaById(mediaId: string): Promise<{ id: string; invoiceId: string; fileType: string; filePath: string; fileName: string; fileSize: number | null; createdAt: Date | null } | undefined>;
  deleteInvoiceMedia(mediaId: string): Promise<void>;
  getApplicationSettings(): Promise<ApplicationSettings | undefined>;
  createOrUpdateApplicationSettings(settings: Partial<InsertApplicationSettings>): Promise<ApplicationSettings>;
  updateApplicationSettings(settings: Partial<InsertApplicationSettings>): Promise<ApplicationSettings>;
  markAllNotificationsRead(userId: string): Promise<void>;
  getUsers(): Promise<User[]>;
  getEngagements(clientId?: string): Promise<Engagement[]>;
  getEngagement(id: string): Promise<Engagement | undefined>;
  createEngagement(engagement: InsertEngagement): Promise<Engagement>;
  updateEngagement(id: string, engagement: Partial<InsertEngagement>): Promise<Engagement>;
  getEngagementSummary(clientId: string): Promise<{ 
    quotes: (Quote & { media: { id: string; fileType: string; filePath: string; fileName: string }[] })[]; 
    invoices: (Invoice & { media: { id: string; fileType: string; filePath: string; fileName: string }[] })[]; 
    reservations: Reservation[] 
  }>;
  createWorkflow(workflowData: InsertWorkflow): Promise<Workflow>;
  getWorkflow(id: string): Promise<Workflow | undefined>;
  getWorkflows(): Promise<Workflow[]>;
  getWorkflowByServiceId(serviceId: string): Promise<Workflow | undefined>;
  updateWorkflow(id: string, workflowData: Partial<InsertWorkflow>): Promise<Workflow>;
  deleteWorkflow(id: string): Promise<void>;
  createWorkflowStep(stepData: InsertWorkflowStep): Promise<WorkflowStep>;
  getWorkflowSteps(workflowId: string): Promise<WorkflowStep[]>;
  updateWorkflowStep(id: string, stepData: Partial<InsertWorkflowStep>): Promise<WorkflowStep>;
  deleteWorkflowStep(id: string): Promise<void>;
  assignWorkflowToService(serviceWorkflowData: InsertServiceWorkflow): Promise<ServiceWorkflow>;
  getServiceWorkflows(serviceId: string): Promise<Workflow[]>;
  deleteServiceWorkflow(serviceId: string, workflowId: string): Promise<void>;
  createWorkshopTask(taskData: InsertWorkshopTask): Promise<WorkshopTask>;
  updateWorkshopTask(id: string, taskData: Partial<InsertWorkshopTask>): Promise<WorkshopTask>;
  getReservationTasks(reservationId: string): Promise<(WorkshopTask & { step: WorkflowStep })[]>;
  initializeReservationWorkflow(reservationId: string, workflowSteps: WorkflowStep[]): Promise<void>;
  // Repair Order methods
  createRepairOrder(data: InsertRepairOrder): Promise<RepairOrder>;
  getRepairOrder(id: string): Promise<RepairOrder | undefined>;
  getRepairOrders(garageId?: string): Promise<RepairOrder[]>;
  getRepairOrderByReservation(reservationId: string): Promise<RepairOrder | undefined>;
  updateRepairOrder(id: string, data: Partial<InsertRepairOrder>): Promise<RepairOrder>;
  deleteRepairOrder(id: string): Promise<void>;
  // Audit Log methods
  createAuditLog(logData: InsertAuditLog, changes?: { field: string; previousValue: any; newValue: any }[]): Promise<AuditLog>;
  getAuditLogs(filters?: {
    entityType?: string;
    entityId?: string;
    actorId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: (AuditLog & { actor?: User; changes: AuditLogChange[] })[]; total: number }>;
  getAuditLog(id: string): Promise<(AuditLog & { actor?: User; changes: AuditLogChange[] }) | undefined>;
  getEntityAuditHistory(entityType: string, entityId: string): Promise<(AuditLog & { actor?: User; changes: AuditLogChange[] })[]>;
  // Password reset tokens
  createPasswordResetToken(data: { userId: string; token: string; expiresAt: Date }): Promise<PasswordResetToken>;
  getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined>;
  markPasswordResetTokenUsed(token: string): Promise<void>;
  
  // Chat methods
  createChatConversation(data: InsertChatConversation): Promise<ChatConversation>;
  getChatConversation(id: string): Promise<ChatConversation | undefined>;
  getChatConversations(userId: string): Promise<(ChatConversation & { participants: (ChatParticipant & { user: User })[], unreadCount: number, lastMessage?: ChatMessage & { sender: User; attachmentCount: number } })[]>;
  updateChatConversation(id: string, data: Partial<InsertChatConversation>): Promise<ChatConversation>;
  deleteChatConversation(id: string): Promise<void>;
  
  addChatParticipant(data: InsertChatParticipant): Promise<ChatParticipant>;
  removeChatParticipant(conversationId: string, userId: string): Promise<void>;
  getChatParticipants(conversationId: string): Promise<(ChatParticipant & { user: User })[]>;
  updateLastRead(conversationId: string, userId: string): Promise<void>;
  
  createChatMessage(data: InsertChatMessage): Promise<ChatMessage>;
  getChatMessages(conversationId: string, limit?: number, offset?: number): Promise<(ChatMessage & { sender: User, attachments: ChatAttachment[] })[]>;
  updateChatMessage(id: string, content: string): Promise<ChatMessage>;
  deleteChatMessage(id: string): Promise<void>;
  
  createChatAttachment(data: InsertChatAttachment): Promise<ChatAttachment>;
  getChatAttachments(messageId: string): Promise<ChatAttachment[]>;

  // Delivery Notes (Bons de Livraison)
  getDeliveryNotes(clientId?: string, garageId?: string): Promise<DeliveryNote[]>;
  getDeliveryNote(id: string): Promise<DeliveryNote | undefined>;
  createDeliveryNote(data: InsertDeliveryNote & { deliveryNoteNumber: string }): Promise<DeliveryNote>;
  updateDeliveryNote(id: string, data: Partial<InsertDeliveryNote>): Promise<DeliveryNote>;
  deleteDeliveryNote(id: string): Promise<void>;
  getDeliveryNoteInvoices(deliveryNoteId: string): Promise<(DeliveryNoteInvoice & { invoice: Invoice })[]>;
  setDeliveryNoteInvoices(deliveryNoteId: string, invoiceIds: string[]): Promise<void>;
  incrementDeliveryNoteCounter(month: number, year: number): Promise<DeliveryNoteCounter>;


  // Expense Categories
  getExpenseCategories(garageId?: string): Promise<ExpenseCategory[]>;
  getExpenseCategory(id: string): Promise<ExpenseCategory | undefined>;
  createExpenseCategory(data: InsertExpenseCategory): Promise<ExpenseCategory>;
  updateExpenseCategory(id: string, data: Partial<InsertExpenseCategory>): Promise<ExpenseCategory>;
  deleteExpenseCategory(id: string): Promise<void>;

  // Expenses
  getExpenses(garageId?: string): Promise<Expense[]>;
  getExpense(id: string): Promise<Expense | undefined>;
  createExpense(data: InsertExpense): Promise<Expense>;
  updateExpense(id: string, data: Partial<InsertExpense>): Promise<Expense>;
  deleteExpense(id: string): Promise<void>;
  getNextExpenseNumber(year: number): Promise<string>;

  // Credit Notes
  getCreditNotes(garageId?: string): Promise<CreditNote[]>;
  getCreditNote(id: string): Promise<CreditNote | undefined>;
  getCreditNotesByInvoice(invoiceId: string): Promise<CreditNote[]>;
  createCreditNote(data: InsertCreditNote): Promise<CreditNote>;
  updateCreditNote(id: string, data: Partial<InsertCreditNote>): Promise<CreditNote>;
  getNextCreditNoteNumber(year: number): Promise<string>;
  getCreditNoteItems(creditNoteId: string): Promise<CreditNoteItem[]>;
  createCreditNoteItem(data: InsertCreditNoteItem): Promise<CreditNoteItem>;

  // Accounting Entries
  getAccountingEntries(garageId?: string, filters?: { journal?: string; startDate?: Date; endDate?: Date; sourceType?: string }): Promise<AccountingEntry[]>;
  getAccountingEntry(id: string): Promise<AccountingEntry | undefined>;
  createAccountingEntry(data: InsertAccountingEntry): Promise<AccountingEntry>;
  updateAccountingEntry(id: string, data: Partial<InsertAccountingEntry>): Promise<AccountingEntry>;
  getAccountingLines(entryId: string): Promise<AccountingLine[]>;
  createAccountingLine(data: InsertAccountingLine): Promise<AccountingLine>;
  getNextEntryNumber(year: number): Promise<string>;

  // FEC Exports
  getFecExports(garageId?: string): Promise<FecExport[]>;
  createFecExport(data: InsertFecExport): Promise<FecExport>;

  // Notification Rules
  getNotificationRules(garageId?: string): Promise<NotificationRule[]>;
  getNotificationRule(id: string): Promise<NotificationRule | undefined>;
  createNotificationRule(data: InsertNotificationRule): Promise<NotificationRule>;
  updateNotificationRule(id: string, data: Partial<InsertNotificationRule>): Promise<NotificationRule>;
  deleteNotificationRule(id: string): Promise<void>;
  getActiveNotificationRules(garageId?: string, eventType?: string): Promise<NotificationRule[]>;

  getExternalApis(): Promise<ExternalApi[]>;
  getExternalApi(id: string): Promise<ExternalApi | undefined>;
  createExternalApi(data: InsertExternalApi): Promise<ExternalApi>;
  updateExternalApi(id: string, data: Partial<InsertExternalApi>): Promise<ExternalApi>;
  deleteExternalApi(id: string): Promise<void>;

  getAiAnalysisHistory(type?: string, limit?: number, garageId?: string): Promise<AiAnalysisHistory[]>;
  getAiAnalysis(id: string, garageId?: string): Promise<AiAnalysisHistory | undefined>;
  createAiAnalysis(data: InsertAiAnalysisHistory): Promise<AiAnalysisHistory>;
  updateAiAnalysis(id: string, data: Partial<InsertAiAnalysisHistory>, garageId?: string): Promise<AiAnalysisHistory>;
  deleteAiAnalysis(id: string, garageId?: string): Promise<void>;
  deleteFailedAiAnalyses(garageId?: string): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  // Garage methods (multi-tenant)
  async getGarages(): Promise<Garage[]> {
    return await db.select().from(garages).orderBy(desc(garages.createdAt));
  }

  async getGarage(id: string): Promise<Garage | undefined> {
    const [garage] = await db.select().from(garages).where(eq(garages.id, id));
    return garage;
  }

  async getGarageBySlug(slug: string): Promise<Garage | undefined> {
    const [garage] = await db.select().from(garages).where(eq(garages.slug, slug));
    return garage;
  }

  async createGarage(garageData: InsertGarage): Promise<Garage> {
    const [garage] = await db.insert(garages).values(garageData).returning();
    return garage;
  }

  async updateGarage(id: string, garageData: Partial<InsertGarage>): Promise<Garage> {
    const [garage] = await db
      .update(garages)
      .set({ ...garageData, updatedAt: new Date() })
      .where(eq(garages.id, id))
      .returning();
    return garage;
  }

  async deleteGarage(id: string): Promise<void> {
    await db.delete(garages).where(eq(garages.id, id));
  }

  async getUsersByGarage(garageId: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.garageId, garageId));
  }

  async getUser(id: string | null): Promise<User | undefined> {
    if (!id) return undefined;
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: { ...userData, updatedAt: new Date() },
      })
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getUsersByRoles(roles: string[]): Promise<User[]> {
    if (roles.length === 0) return [];
    return await db.select().from(users).where(inArray(users.role, roles as any[]));
  }

  async updateUser(id: string, userData: Partial<User>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...userData, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  async createUser(userData: { 
    email: string; 
    password?: string; 
    firstName?: string; 
    lastName?: string; 
    phone?: string;
    address?: string;
    postalCode?: string;
    city?: string;
    role?: "client" | "client_professionnel" | "employe" | "admin"; 
    companyName?: string; 
    siret?: string; 
    tvaNumber?: string; 
    companyAddress?: string 
  }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        email: userData.email,
        password: userData.password,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: userData.phone,
        address: userData.address,
        postalCode: userData.postalCode,
        city: userData.city,
        role: userData.role || "client",
        companyName: userData.companyName,
        siret: userData.siret,
        tvaNumber: userData.tvaNumber,
        companyAddress: userData.companyAddress,
      })
      .returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async getServices(garageId?: string): Promise<Service[]> {
    const conditions = [eq(services.isActive, true)];
    if (garageId) {
      conditions.push(eq(services.garageId, garageId));
    }
    return await db.select().from(services).where(and(...conditions)).orderBy(desc(services.createdAt));
  }

  async getService(id: string): Promise<Service | undefined> {
    const [service] = await db.select().from(services).where(eq(services.id, id));
    return service;
  }

  async createService(serviceData: InsertService): Promise<Service> {
    const [service] = await db.insert(services).values(serviceData).returning();
    return service;
  }

  async updateService(id: string, serviceData: Partial<InsertService>): Promise<Service> {
    const [service] = await db
      .update(services)
      .set({ ...serviceData, updatedAt: new Date() })
      .where(eq(services.id, id))
      .returning();
    return service;
  }

  async deleteService(id: string): Promise<void> {
    await db.delete(services).where(eq(services.id, id));
  }

  async getQuotes(clientId?: string, garageId?: string): Promise<Quote[]> {
    const conditions = [];
    if (clientId) {
      conditions.push(eq(quotes.clientId, clientId));
    }
    if (garageId) {
      conditions.push(eq(quotes.garageId, garageId));
    }
    if (conditions.length > 0) {
      return await db.select().from(quotes).where(and(...conditions)).orderBy(desc(quotes.createdAt));
    }
    return await db.select().from(quotes).orderBy(desc(quotes.createdAt));
  }

  async getQuote(id: string): Promise<Quote | undefined> {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, id));
    return quote;
  }

  async createQuote(quoteData: InsertQuote): Promise<Quote> {
    // Generate quote reference: DEV-MM-00001
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    
    // Get total count of quotes for this month to generate sequential number
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const existingQuotes = await db.select({ reference: quotes.reference })
      .from(quotes)
      .where(sql`${quotes.createdAt} >= ${startOfMonth}`);
    
    const sequentialNumber = Math.max(0, ...existingQuotes.map(q => parseInt(q.reference?.split("-").pop() || "0"))) + 1;
    const reference = `DEV-${month}-${String(sequentialNumber).padStart(5, '0')}`;
    
    const [quote] = await db.insert(quotes).values({ ...quoteData, reference }).returning();
    return quote;
  }

  async updateQuote(id: string, quoteData: Partial<InsertQuote>): Promise<Quote> {
    const [quote] = await db
      .update(quotes)
      .set({ ...quoteData, updatedAt: new Date() })
      .where(eq(quotes.id, id))
      .returning();
    return quote;
  }

  async getQuoteItems(quoteId: string): Promise<QuoteItem[]> {
    return await db
      .select()
      .from(quoteItems)
      .where(eq(quoteItems.quoteId, quoteId))
      .orderBy(quoteItems.createdAt);
  }

  async getQuoteItem(id: string): Promise<QuoteItem | undefined> {
    const [item] = await db.select().from(quoteItems).where(eq(quoteItems.id, id));
    return item;
  }

  async createQuoteItem(itemData: InsertQuoteItem): Promise<QuoteItem> {
    const [item] = await db.insert(quoteItems).values([itemData]).returning();
    return item;
  }

  async updateQuoteItem(id: string, itemData: Partial<InsertQuoteItem>): Promise<QuoteItem> {
    const [item] = await db
      .update(quoteItems)
      .set({ ...itemData, updatedAt: new Date() })
      .where(eq(quoteItems.id, id))
      .returning();
    return item;
  }

  async deleteQuoteItem(id: string): Promise<void> {
    await db.delete(quoteItems).where(eq(quoteItems.id, id));
  }

  async recalculateQuoteTotals(quoteId: string): Promise<Quote> {
    const items = await this.getQuoteItems(quoteId);
    // Les prix des services sont maintenant HT (basePrice)
    // On calcule le TTC pour chaque ligne et on somme
    let totalHT = 0;
    let totalVAT = 0;
    let totalTTC = 0;

    for (const item of items) {
      const ht = parseFloat(item.totalExcludingTax || '0');
      const vat = parseFloat(item.taxAmount || '0');
      const ttc = parseFloat(item.totalIncludingTax || '0');
      totalHT += ht;
      totalVAT += vat;
      totalTTC += ttc;
    }
    
    // Si pas d'items, on garde les valeurs par défaut
    const avgTaxRate = items.length > 0 ? parseFloat(items[0].taxRate || '20') : 20;

    return await this.updateQuote(quoteId, {
      quoteAmount: totalTTC.toFixed(2),
      priceExcludingTax: totalHT.toFixed(2),
      taxAmount: totalVAT.toFixed(2),
      taxRate: avgTaxRate.toFixed(2),
    });
  }

  async deleteQuote(id: string): Promise<void> {
    await db.delete(quoteItems).where(eq(quoteItems.quoteId, id));
    const mediaList = await db.select().from(quoteMedia).where(eq(quoteMedia.quoteId, id));
    for (const m of mediaList) {
      await this.deleteQuoteMedia(m.id);
    }
    await db.delete(quotes).where(eq(quotes.id, id));
  }

  async getInvoices(clientId?: string, garageId?: string): Promise<Invoice[]> {
    const conditions = [];
    if (clientId) {
      conditions.push(eq(invoices.clientId, clientId));
    }
    if (garageId) {
      conditions.push(eq(invoices.garageId, garageId));
    }
    
    let query = db.select().from(invoices);
    if (conditions.length > 0) {
      // @ts-ignore
      query = query.where(and(...conditions));
    }
    
    // @ts-ignore
    return await query.orderBy(desc(invoices.createdAt));
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice;
  }

  async createInvoice(invoiceData: any): Promise<Invoice> {
    const { items, ...data } = invoiceData;
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    // If a specific invoiceNumber is already provided (e.g. PPF- for Klarna/Alma), use it directly
    let finalInvoiceNumber: string = data.invoiceNumber || "";

    if (!finalInvoiceNumber) {
      // Determine prefix based on payment method
      let prefix: "cash" | "wire_transfer" | "card" = "wire_transfer";
      let prefixLabel = "VIR";

      if (data.paymentMethod === 'cash') {
        prefix = "cash";
        prefixLabel = "ESP";
      } else if (data.paymentMethod === 'card') {
        prefix = "card";
        prefixLabel = "CBL";
      }

      // Use the counter to ensure uniqueness and handle high concurrency better
      const counter = await this.incrementInvoiceCounter(prefix);
      const invoiceNumber = `${prefixLabel}-${month}-${String(counter.currentNumber).padStart(4, '0')}`;

      // Verify if this number exists (safety check for manual imports)
      const [existing] = await db.select().from(invoices).where(eq(invoices.invoiceNumber, invoiceNumber));
      finalInvoiceNumber = invoiceNumber;

      if (existing) {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const existingInvoices = await db.select({ invoiceNumber: invoices.invoiceNumber })
          .from(invoices)
          .where(and(
            sql`${invoices.createdAt} >= ${startOfMonth}`,
            sql`${invoices.invoiceNumber} LIKE ${prefixLabel + '-%'}`
          ));
        const sequentialNumber = Math.max(counter.currentNumber, ...existingInvoices.map(i => parseInt(i.invoiceNumber.split("-").pop() || "0"))) + 1;
        finalInvoiceNumber = `${prefixLabel}-${month}-${String(sequentialNumber).padStart(4, '0')}`;
        await db.update(invoiceCounters).set({ currentNumber: sequentialNumber }).where(eq(invoiceCounters.paymentType, prefix));
      }
    }

    const [invoice] = await db.insert(invoices).values([{
      ...data,
      invoiceNumber: finalInvoiceNumber,
    }]).returning();

    if (items && Array.isArray(items)) {
      for (const item of items) {
        await db.insert(invoiceItems).values({
          ...item,
          invoiceId: invoice.id,
          totalExcludingTax: (parseFloat(item.unitPriceExcludingTax) * parseFloat(item.quantity)).toString(),
          taxAmount: (parseFloat(item.unitPriceExcludingTax) * parseFloat(item.quantity) * (parseFloat(item.taxRate) / 100)).toString(),
          totalIncludingTax: (parseFloat(item.unitPriceExcludingTax) * parseFloat(item.quantity) * (1 + parseFloat(item.taxRate) / 100)).toString(),
        });
      }
    }

    return invoice;
  }

  async updateInvoice(id: string, invoiceData: Partial<InsertInvoice>): Promise<Invoice> {
    const [invoice] = await db
      .update(invoices)
      .set({ ...invoiceData, updatedAt: new Date() })
      .where(eq(invoices.id, id))
      .returning();
    return invoice;
  }

  async deleteInvoice(id: string): Promise<void> {
    await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, id));
    const mediaList = await db.select().from(invoiceMedia).where(eq(invoiceMedia.invoiceId, id));
    for (const m of mediaList) {
      await this.deleteInvoiceMedia(m.id);
    }
    await db.delete(invoices).where(eq(invoices.id, id));
  }

  async getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
    return await db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, invoiceId))
      .orderBy(invoiceItems.createdAt);
  }

  async getInvoiceItem(id: string): Promise<InvoiceItem | undefined> {
    const [item] = await db.select().from(invoiceItems).where(eq(invoiceItems.id, id));
    return item;
  }

  async createInvoiceItem(itemData: InsertInvoiceItem): Promise<InvoiceItem> {
    const [item] = await db.insert(invoiceItems).values([itemData]).returning();
    return item;
  }

  async updateInvoiceItem(id: string, itemData: Partial<InsertInvoiceItem>): Promise<InvoiceItem> {
    const [item] = await db
      .update(invoiceItems)
      .set({ ...itemData, updatedAt: new Date() })
      .where(eq(invoiceItems.id, id))
      .returning();
    return item;
  }

  async deleteInvoiceItem(id: string): Promise<void> {
    await db.delete(invoiceItems).where(eq(invoiceItems.id, id));
  }

  async recalculateInvoiceTotals(invoiceId: string): Promise<Invoice> {
    const items = await this.getInvoiceItems(invoiceId);
    // Les prix des services sont maintenant HT
    let totalHT = 0;
    let totalVAT = 0;
    let totalTTC = 0;

    for (const item of items) {
      const ht = parseFloat(item.totalExcludingTax || '0');
      const vat = parseFloat(item.taxAmount || '0');
      const ttc = parseFloat(item.totalIncludingTax || '0');
      totalHT += ht;
      totalVAT += vat;
      totalTTC += ttc;
    }
    
    const avgTaxRate = items.length > 0 ? parseFloat(items[0].taxRate || '20') : 20;

    return await this.updateInvoice(invoiceId, {
      amount: totalTTC.toFixed(2),
      priceExcludingTax: totalHT.toFixed(2),
      taxAmount: totalVAT.toFixed(2),
      taxRate: avgTaxRate.toFixed(2),
    });
  }

  async getReservations(clientId?: string, garageId?: string): Promise<Reservation[]> {
    const conditions = [];
    if (clientId) {
      conditions.push(eq(reservations.clientId, clientId));
    }
    if (garageId) {
      conditions.push(eq(reservations.garageId, garageId));
    }
    if (conditions.length > 0) {
      return await db.select().from(reservations).where(and(...conditions)).orderBy(desc(reservations.createdAt));
    }
    return await db.select().from(reservations).orderBy(desc(reservations.createdAt));
  }

  async getReservation(id: string): Promise<Reservation | undefined> {
    const [reservation] = await db.select().from(reservations).where(eq(reservations.id, id));
    return reservation;
  }

  async createReservation(reservationData: InsertReservation): Promise<Reservation> {
    const [reservation] = await db.insert(reservations).values(reservationData).returning();
    return reservation;
  }

  async updateReservation(id: string, reservationData: Partial<InsertReservation>): Promise<Reservation> {
    const [reservation] = await db
      .update(reservations)
      .set({ ...reservationData, updatedAt: new Date() })
      .where(eq(reservations.id, id))
      .returning();
    return reservation;
  }

  async getReservationServices(reservationId: string): Promise<(ReservationService & { service: Service })[]> {
    const results = await db
      .select({
        id: reservationServices.id,
        reservationId: reservationServices.reservationId,
        serviceId: reservationServices.serviceId,
        quantity: reservationServices.quantity,
        priceExcludingTax: reservationServices.priceExcludingTax,
        notes: reservationServices.notes,
        createdAt: reservationServices.createdAt,
        service: services,
      })
      .from(reservationServices)
      .innerJoin(services, eq(reservationServices.serviceId, services.id))
      .where(eq(reservationServices.reservationId, reservationId));
    return results;
  }

  async addReservationService(data: InsertReservationService): Promise<ReservationService> {
    const [result] = await db.insert(reservationServices).values(data).returning();
    return result;
  }

  async deleteReservation(id: string): Promise<void> {
    await db.delete(reservationServices).where(eq(reservationServices.reservationId, id));
    await db.delete(workshopTasks).where(eq(workshopTasks.reservationId, id));
    await db.delete(repairOrders).where(eq(repairOrders.reservationId, id));
    await db.delete(reservations).where(eq(reservations.id, id));
  }

  async deleteReservationServices(reservationId: string): Promise<void> {
    await db.delete(reservationServices).where(eq(reservationServices.reservationId, reservationId));
  }

  async setReservationServices(reservationId: string, serviceIds: string[]): Promise<void> {
    // Delete existing additional services
    await this.deleteReservationServices(reservationId);
    // Add new services if any
    if (serviceIds.length > 0) {
      const values = serviceIds.map(serviceId => ({
        reservationId,
        serviceId,
        quantity: 1,
      }));
      await db.insert(reservationServices).values(values);
    }
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    return await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }

  async getNotification(id: string): Promise<Notification | undefined> {
    const [row] = await db.select().from(notifications).where(eq(notifications.id, id));
    return row;
  }

  async createNotification(notificationData: InsertNotification): Promise<Notification> {
    const [notification] = await db.insert(notifications).values(notificationData).returning();
    // Best-effort fan-out: WS realtime + mobile push. Errors are swallowed so DB success is not affected.
    try {
      const { sendWsNotification } = await import("./wsClients");
      sendWsNotification(notification.userId, {
        type: "notification",
        notificationId: notification.id,
        title: notification.title,
        message: notification.message,
        eventType: notification.type,
        relatedId: notification.relatedId ?? null,
      });
    } catch (e) {
      console.warn("[storage.createNotification] WS dispatch failed:", (e as Error)?.message);
    }
    try {
      const { sendPushToUser } = await import("./pushService");
      await sendPushToUser(notification.userId, {
        title: notification.title,
        body: notification.message,
        data: {
          notificationId: notification.id,
          type: notification.type,
          relatedId: notification.relatedId ?? "",
        },
      });
    } catch (e) {
      console.warn("[storage.createNotification] Push dispatch failed:", (e as Error)?.message);
    }
    return notification;
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications).set({ isRead: true }).where(eq(notifications.userId, userId));
  }

  async updateApplicationSettings(settings: Partial<InsertApplicationSettings>): Promise<ApplicationSettings> {
    return this.createOrUpdateApplicationSettings(settings);
  }

  async getUsers(): Promise<User[]> {
    return this.getAllUsers();
  }

  async getInvoiceCounter(paymentType: "cash" | "wire_transfer" | "card"): Promise<InvoiceCounter | undefined> {
    const [counter] = await db.select().from(invoiceCounters).where(eq(invoiceCounters.paymentType, paymentType));
    return counter;
  }

  async createInvoiceCounter(counterData: InsertInvoiceCounter): Promise<InvoiceCounter> {
    const [counter] = await db.insert(invoiceCounters).values(counterData).returning();
    return counter;
  }

  async incrementInvoiceCounter(paymentType: "cash" | "wire_transfer" | "card"): Promise<InvoiceCounter> {
    try {
      const [counter] = await db
        .insert(invoiceCounters)
        .values({ paymentType, currentNumber: 1 })
        .onConflictDoUpdate({
          target: invoiceCounters.paymentType,
          set: {
            currentNumber: sql`${invoiceCounters.currentNumber} + 1`,
            updatedAt: new Date(),
          },
        })
        .returning();
      return counter;
    } catch (err: any) {
      if (err?.code === '42P10') {
        const existing = await db.select().from(invoiceCounters).where(eq(invoiceCounters.paymentType, paymentType));
        if (existing.length > 0) {
          const [updated] = await db.update(invoiceCounters)
            .set({ currentNumber: existing[0].currentNumber + 1, updatedAt: new Date() })
            .where(eq(invoiceCounters.paymentType, paymentType))
            .returning();
          return updated;
        } else {
          const [created] = await db.insert(invoiceCounters).values({ paymentType, currentNumber: 1 }).returning();
          return created;
        }
      }
      throw err;
    }
  }

  async createQuoteMedia(media: { quoteId: string; filePath: string; fileType: string; fileName?: string; fileSize?: number }): Promise<any> {
    const [result] = await db.insert(quoteMedia).values({
      quoteId: media.quoteId,
      filePath: media.filePath,
      fileType: media.fileType as any,
      fileName: media.fileName || "file",
      fileSize: media.fileSize,
    }).returning();
    return result;
  }

  async createInvoiceMedia(media: { invoiceId: string; filePath: string; fileType: string; fileName?: string; fileSize?: number }): Promise<any> {
    const [result] = await db.insert(invoiceMedia).values({
      invoiceId: media.invoiceId,
      filePath: media.filePath,
      fileType: media.fileType as any,
      fileName: media.fileName || "file",
      fileSize: media.fileSize,
    }).returning();
    return result;
  }

  async getQuoteByReference(reference: string): Promise<Quote | undefined> {
    const [quote] = await db.select().from(quotes).where(eq(quotes.reference, reference));
    return quote;
  }

  async getQuoteMedia(quoteId: string): Promise<(typeof quoteMedia.$inferSelect)[]> {
    return await db.select().from(quoteMedia).where(eq(quoteMedia.quoteId, quoteId));
  }

  async getQuoteMediaByPath(filePath: string): Promise<(typeof quoteMedia.$inferSelect)[]> {
    return await db.select().from(quoteMedia).where(eq(quoteMedia.filePath, filePath));
  }

  async getInvoiceMedia(invoiceId: string): Promise<(typeof invoiceMedia.$inferSelect)[]> {
    return await db.select().from(invoiceMedia).where(eq(invoiceMedia.invoiceId, invoiceId));
  }

  async getInvoiceMediaByPath(filePath: string): Promise<(typeof invoiceMedia.$inferSelect)[]> {
    return await db.select().from(invoiceMedia).where(eq(invoiceMedia.filePath, filePath));
  }

  async getQuoteMediaById(mediaId: string): Promise<(typeof quoteMedia.$inferSelect) | undefined> {
    const [media] = await db.select().from(quoteMedia).where(eq(quoteMedia.id, mediaId));
    return media;
  }

  async deleteQuoteMedia(mediaId: string): Promise<void> {
    await db.delete(quoteMedia).where(eq(quoteMedia.id, mediaId));
  }

  async getInvoiceMediaById(mediaId: string): Promise<(typeof invoiceMedia.$inferSelect) | undefined> {
    const [media] = await db.select().from(invoiceMedia).where(eq(invoiceMedia.id, mediaId));
    return media;
  }

  async deleteInvoiceMedia(mediaId: string): Promise<void> {
    await db.delete(invoiceMedia).where(eq(invoiceMedia.id, mediaId));
  }

  async getApplicationSettings(): Promise<ApplicationSettings | undefined> {
    const [settings] = await db.select().from(applicationSettings).limit(1);
    return settings;
  }

  async createOrUpdateApplicationSettings(settingsData: Partial<InsertApplicationSettings>): Promise<ApplicationSettings> {
    const existing = await this.getApplicationSettings();
    
    if (existing) {
      const [updated] = await db
        .update(applicationSettings)
        .set({ ...settingsData, updatedAt: new Date() })
        .where(eq(applicationSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(applicationSettings)
        .values([settingsData as InsertApplicationSettings])
        .returning();
      return created;
    }
  }

  async getEngagements(clientId?: string): Promise<Engagement[]> {
    if (clientId) {
      return await db.select().from(engagements).where(eq(engagements.clientId, clientId)).orderBy(desc(engagements.createdAt));
    }
    return await db.select().from(engagements).orderBy(desc(engagements.createdAt));
  }

  async getEngagement(id: string): Promise<Engagement | undefined> {
    const [engagement] = await db.select().from(engagements).where(eq(engagements.id, id));
    return engagement;
  }

  async createEngagement(engagementData: InsertEngagement): Promise<Engagement> {
    const [engagement] = await db.insert(engagements).values([engagementData]).returning();
    return engagement;
  }

  async updateEngagement(id: string, engagementData: Partial<InsertEngagement>): Promise<Engagement> {
    const [engagement] = await db
      .update(engagements)
      .set({ ...engagementData, updatedAt: new Date() })
      .where(eq(engagements.id, id))
      .returning();
    return engagement;
  }

  async getEngagementSummary(clientId: string): Promise<{ 
    quotes: (Quote & { media: { id: string; fileType: string; filePath: string; fileName: string }[] })[]; 
    invoices: (Invoice & { media: { id: string; fileType: string; filePath: string; fileName: string }[] })[]; 
    reservations: Reservation[] 
  }> {
    const [quotesList, invoicesList, reservationsList] = await Promise.all([
      db.select().from(quotes).where(eq(quotes.clientId, clientId)).orderBy(desc(quotes.createdAt)),
      db.select().from(invoices).where(eq(invoices.clientId, clientId)).orderBy(desc(invoices.createdAt)),
      db.select().from(reservations).where(eq(reservations.clientId, clientId)).orderBy(desc(reservations.createdAt)),
    ]);
    
    // Fetch all media for these quotes and invoices in a single query
    const quoteIds = quotesList.map(q => q.id);
    const invoiceIds = invoicesList.map(i => i.id);
    
    const [allQuoteMedia, allInvoiceMedia] = await Promise.all([
      quoteIds.length > 0 ? db.select().from(quoteMedia).where(inArray(quoteMedia.quoteId, quoteIds)) : Promise.resolve([]),
      invoiceIds.length > 0 ? db.select().from(invoiceMedia).where(inArray(invoiceMedia.invoiceId, invoiceIds)) : Promise.resolve([]),
    ]);
    
    const quotesWithMedia = quotesList.map(quote => ({
      ...quote,
      media: allQuoteMedia
        .filter(m => m.quoteId === quote.id)
        .map(m => ({
          id: m.id,
          fileType: m.fileType,
          filePath: m.filePath,
          fileName: m.fileName,
        })),
    }));
    
    const invoicesWithMedia = invoicesList.map(invoice => ({
      ...invoice,
      media: allInvoiceMedia
        .filter(m => m.invoiceId === invoice.id)
        .map(m => ({
          id: m.id,
          fileType: m.fileType,
          filePath: m.filePath,
          fileName: m.fileName,
        })),
    }));
    
    return { quotes: quotesWithMedia, invoices: invoicesWithMedia, reservations: reservationsList };
  }

  async createWorkflow(workflowData: InsertWorkflow): Promise<Workflow> {
    const [workflow] = await db.insert(workflows).values([workflowData]).returning();
    return workflow;
  }

  async getWorkflow(id: string): Promise<Workflow | undefined> {
    const [workflow] = await db.select().from(workflows).where(eq(workflows.id, id));
    return workflow;
  }

  async getWorkflows(): Promise<Workflow[]> {
    return await db.select().from(workflows).orderBy(desc(workflows.createdAt));
  }

  async getWorkflowByServiceId(serviceId: string): Promise<Workflow | undefined> {
    const [workflow] = await db.select().from(workflows).where(eq(workflows.serviceId, serviceId));
    return workflow;
  }

  async updateWorkflow(id: string, workflowData: Partial<InsertWorkflow>): Promise<Workflow> {
    const [workflow] = await db
      .update(workflows)
      .set({ ...workflowData, updatedAt: new Date() })
      .where(eq(workflows.id, id))
      .returning();
    return workflow;
  }

  async deleteWorkflow(id: string): Promise<void> {
    await db.delete(workflows).where(eq(workflows.id, id));
  }

  async createWorkflowStep(stepData: InsertWorkflowStep): Promise<WorkflowStep> {
    const [step] = await db.insert(workflowSteps).values([stepData]).returning();
    return step;
  }

  async getWorkflowSteps(workflowId: string): Promise<WorkflowStep[]> {
    return await db.select().from(workflowSteps).where(eq(workflowSteps.workflowId, workflowId)).orderBy(workflowSteps.stepNumber);
  }

  async updateWorkflowStep(id: string, stepData: Partial<InsertWorkflowStep>): Promise<WorkflowStep> {
    const [step] = await db
      .update(workflowSteps)
      .set({ ...stepData, updatedAt: new Date() })
      .where(eq(workflowSteps.id, id))
      .returning();
    return step;
  }

  async deleteWorkflowStep(id: string): Promise<void> {
    await db.delete(workflowSteps).where(eq(workflowSteps.id, id));
  }

  async assignWorkflowToService(serviceWorkflowData: InsertServiceWorkflow): Promise<ServiceWorkflow> {
    const [sw] = await db.insert(serviceWorkflows).values([serviceWorkflowData]).returning();
    return sw;
  }

  async getServiceWorkflows(serviceId: string): Promise<Workflow[]> {
    const serviceWorkflowsList = await db.select().from(serviceWorkflows).where(eq(serviceWorkflows.serviceId, serviceId));
    const workflowIds = serviceWorkflowsList.map(sw => sw.workflowId);
    if (workflowIds.length === 0) return [];
    return await db.select().from(workflows).where(inArray(workflows.id, workflowIds));
  }

  async deleteServiceWorkflow(serviceId: string, workflowId: string): Promise<void> {
    await db.delete(serviceWorkflows).where(
      and(eq(serviceWorkflows.serviceId, serviceId), eq(serviceWorkflows.workflowId, workflowId))
    );
  }

  async createWorkshopTask(taskData: InsertWorkshopTask): Promise<WorkshopTask> {
    const [task] = await db.insert(workshopTasks).values([taskData]).returning();
    return task;
  }

  async updateWorkshopTask(id: string, taskData: Partial<InsertWorkshopTask>): Promise<WorkshopTask> {
    const [task] = await db
      .update(workshopTasks)
      .set({ ...taskData, updatedAt: new Date() })
      .where(eq(workshopTasks.id, id))
      .returning();
    return task;
  }

  async getReservationTasks(reservationId: string): Promise<(WorkshopTask & { step: WorkflowStep })[]> {
    const tasks = await db.select().from(workshopTasks).where(eq(workshopTasks.reservationId, reservationId));
    
    return Promise.all(tasks.map(async (task) => {
      const [step] = await db.select().from(workflowSteps).where(eq(workflowSteps.id, task.workflowStepId));
      return { ...task, step: step! };
    }));
  }

  async initializeReservationWorkflow(reservationId: string, workflowSteps: WorkflowStep[]): Promise<void> {
    for (const step of workflowSteps) {
      await this.createWorkshopTask({
        reservationId,
        workflowStepId: step.id,
        isCompleted: false,
      });
    }
  }

  // Repair Order methods
  async createRepairOrder(data: InsertRepairOrder): Promise<RepairOrder> {
    const [order] = await db.insert(repairOrders).values([data]).returning();
    return order;
  }

  async getRepairOrder(id: string): Promise<RepairOrder | undefined> {
    const [order] = await db.select().from(repairOrders).where(eq(repairOrders.id, id));
    return order;
  }

  async getRepairOrders(garageId?: string): Promise<RepairOrder[]> {
    if (garageId) {
      return db.select().from(repairOrders).where(eq(repairOrders.garageId, garageId)).orderBy(desc(repairOrders.createdAt));
    }
    return db.select().from(repairOrders).orderBy(desc(repairOrders.createdAt));
  }

  async getRepairOrderByReservation(reservationId: string): Promise<RepairOrder | undefined> {
    const [order] = await db.select().from(repairOrders).where(eq(repairOrders.reservationId, reservationId));
    return order;
  }

  async updateRepairOrder(id: string, data: Partial<InsertRepairOrder>): Promise<RepairOrder> {
    const [order] = await db.update(repairOrders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(repairOrders.id, id))
      .returning();
    return order;
  }

  async deleteRepairOrder(id: string): Promise<void> {
    await db.delete(repairOrders).where(eq(repairOrders.id, id));
  }

  // Audit Log methods
  async createAuditLog(logData: InsertAuditLog, changes?: { field: string; previousValue: any; newValue: any }[]): Promise<AuditLog> {
    const [auditLog] = await db.insert(auditLogs).values([logData]).returning();
    
    if (changes && changes.length > 0) {
      await db.insert(auditLogChanges).values(
        changes.map(change => ({
          auditLogId: auditLog.id,
          field: change.field,
          previousValue: change.previousValue,
          newValue: change.newValue,
        }))
      );
    }
    
    return auditLog;
  }

  async getAuditLogs(filters?: {
    entityType?: string;
    entityId?: string;
    actorId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: (AuditLog & { actor?: User; changes: AuditLogChange[] })[]; total: number }> {
    const conditions = [];
    
    if (filters?.entityType) {
      conditions.push(eq(auditLogs.entityType, filters.entityType as any));
    }
    if (filters?.entityId) {
      conditions.push(eq(auditLogs.entityId, filters.entityId));
    }
    if (filters?.actorId) {
      conditions.push(eq(auditLogs.actorId, filters.actorId));
    }
    if (filters?.action) {
      conditions.push(eq(auditLogs.action, filters.action as any));
    }
    if (filters?.startDate) {
      conditions.push(sql`${auditLogs.occurredAt} >= ${filters.startDate}`);
    }
    if (filters?.endDate) {
      conditions.push(sql`${auditLogs.occurredAt} <= ${filters.endDate}`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    
    // Get total count
    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(whereClause);
    
    // Get paginated logs
    let query = db.select()
      .from(auditLogs)
      .where(whereClause)
      .orderBy(desc(auditLogs.occurredAt));
    
    if (filters?.limit) {
      query = query.limit(filters.limit) as typeof query;
    }
    if (filters?.offset) {
      query = query.offset(filters.offset) as typeof query;
    }
    
    const logs = await query;
    
    // Fetch actor and changes for each log
    const enrichedLogs = await Promise.all(logs.map(async (log) => {
      let actor: User | undefined;
      if (log.actorId) {
        const [foundActor] = await db.select().from(users).where(eq(users.id, log.actorId));
        actor = foundActor;
      }
      
      const changes = await db.select().from(auditLogChanges).where(eq(auditLogChanges.auditLogId, log.id));
      
      return { ...log, actor, changes };
    }));
    
    return { logs: enrichedLogs, total: Number(count) };
  }

  async getAuditLog(id: string): Promise<(AuditLog & { actor?: User; changes: AuditLogChange[] }) | undefined> {
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.id, id));
    if (!log) return undefined;
    
    let actor: User | undefined;
    if (log.actorId) {
      const [foundActor] = await db.select().from(users).where(eq(users.id, log.actorId));
      actor = foundActor;
    }
    
    const changes = await db.select().from(auditLogChanges).where(eq(auditLogChanges.auditLogId, log.id));
    
    return { ...log, actor, changes };
  }

  async getEntityAuditHistory(entityType: string, entityId: string): Promise<(AuditLog & { actor?: User; changes: AuditLogChange[] })[]> {
    const logs = await db.select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, entityType as any), eq(auditLogs.entityId, entityId)))
      .orderBy(desc(auditLogs.occurredAt));
    
    return Promise.all(logs.map(async (log) => {
      let actor: User | undefined;
      if (log.actorId) {
        const [foundActor] = await db.select().from(users).where(eq(users.id, log.actorId));
        actor = foundActor;
      }
      
      const changes = await db.select().from(auditLogChanges).where(eq(auditLogChanges.auditLogId, log.id));
      
      return { ...log, actor, changes };
    }));
  }

  // Password reset tokens
  async createPasswordResetToken(data: { userId: string; token: string; expiresAt: Date }): Promise<PasswordResetToken> {
    const [resetToken] = await db
      .insert(passwordResetTokens)
      .values({
        userId: data.userId,
        token: data.token,
        expiresAt: data.expiresAt,
      })
      .returning();
    return resetToken;
  }

  async getPasswordResetToken(token: string): Promise<PasswordResetToken | undefined> {
    const [resetToken] = await db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token));
    return resetToken;
  }

  async markPasswordResetTokenUsed(token: string): Promise<void> {
    await db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.token, token));
  }

  // Chat methods
  async createChatConversation(data: InsertChatConversation): Promise<ChatConversation> {
    const [conversation] = await db.insert(chatConversations).values(data).returning();
    return conversation;
  }

  async getChatConversation(id: string): Promise<ChatConversation | undefined> {
    const [conversation] = await db.select().from(chatConversations).where(eq(chatConversations.id, id));
    return conversation;
  }

  async getChatConversations(userId: string): Promise<(ChatConversation & { participants: (ChatParticipant & { user: User })[], unreadCount: number, lastMessage?: ChatMessage & { sender: User; attachmentCount: number } })[]> {
    const participantRecords = await db.select().from(chatParticipants).where(eq(chatParticipants.userId, userId));
    const conversationIds = participantRecords.map(p => p.conversationId);
    
    if (conversationIds.length === 0) return [];
    
    const conversations = await db.select()
      .from(chatConversations)
      .where(inArray(chatConversations.id, conversationIds))
      .orderBy(desc(chatConversations.lastMessageAt));
    
    return Promise.all(conversations.map(async (conv) => {
      const participants = await this.getChatParticipants(conv.id);
      
      const userParticipant = participantRecords.find(p => p.conversationId === conv.id);
      const lastReadAt = userParticipant?.lastReadAt;
      
      let unreadCount = 0;
      if (lastReadAt) {
        const unreadMessages = await db.select({ count: sql<number>`count(*)` })
          .from(chatMessages)
          .where(and(
            eq(chatMessages.conversationId, conv.id),
            sql`${chatMessages.createdAt} > ${lastReadAt}`
          ));
        unreadCount = Number(unreadMessages[0]?.count || 0);
      } else {
        const allMessages = await db.select({ count: sql<number>`count(*)` })
          .from(chatMessages)
          .where(eq(chatMessages.conversationId, conv.id));
        unreadCount = Number(allMessages[0]?.count || 0);
      }
      
      const [lastMessageRow] = await db.select()
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, conv.id))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);
      
      let lastMessage: (ChatMessage & { sender: User; attachmentCount: number }) | undefined;
      if (lastMessageRow) {
        const [sender] = await db.select().from(users).where(eq(users.id, lastMessageRow.senderId));
        if (sender) {
          const attachments = await db.select({ count: sql<number>`count(*)` })
            .from(chatAttachments)
            .where(eq(chatAttachments.messageId, lastMessageRow.id));
          const attachmentCount = Number(attachments[0]?.count || 0);
          lastMessage = { ...lastMessageRow, sender, attachmentCount };
        }
      }
      
      return { ...conv, participants, unreadCount, lastMessage };
    }));
  }

  async updateChatConversation(id: string, data: Partial<InsertChatConversation>): Promise<ChatConversation> {
    const [conversation] = await db.update(chatConversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(chatConversations.id, id))
      .returning();
    return conversation;
  }

  async deleteChatConversation(id: string): Promise<void> {
    await db.delete(chatConversations).where(eq(chatConversations.id, id));
  }

  async addChatParticipant(data: InsertChatParticipant): Promise<ChatParticipant> {
    const [participant] = await db.insert(chatParticipants).values(data).returning();
    return participant;
  }

  async removeChatParticipant(conversationId: string, odUserId: string): Promise<void> {
    await db.delete(chatParticipants).where(
      and(eq(chatParticipants.conversationId, conversationId), eq(chatParticipants.userId, odUserId))
    );
  }

  async getChatParticipants(conversationId: string): Promise<(ChatParticipant & { user: User })[]> {
    const participants = await db.select().from(chatParticipants).where(eq(chatParticipants.conversationId, conversationId));
    return Promise.all(participants.map(async (p) => {
      const [user] = await db.select().from(users).where(eq(users.id, p.userId));
      return { ...p, user };
    }));
  }

  async updateLastRead(conversationId: string, userId: string): Promise<void> {
    await db.update(chatParticipants)
      .set({ lastReadAt: new Date() })
      .where(and(eq(chatParticipants.conversationId, conversationId), eq(chatParticipants.userId, userId)));
  }

  async createChatMessage(data: InsertChatMessage): Promise<ChatMessage> {
    const [message] = await db.insert(chatMessages).values(data).returning();
    await db.update(chatConversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(chatConversations.id, data.conversationId));
    return message;
  }

  async getChatMessages(conversationId: string, limit = 50, offset = 0): Promise<(ChatMessage & { sender: User, attachments: ChatAttachment[] })[]> {
    const messages = await db.select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit)
      .offset(offset);
    
    return Promise.all(messages.reverse().map(async (msg) => {
      const [sender] = await db.select().from(users).where(eq(users.id, msg.senderId));
      const attachments = await db.select().from(chatAttachments).where(eq(chatAttachments.messageId, msg.id));
      return { ...msg, sender, attachments };
    }));
  }

  async updateChatMessage(id: string, content: string): Promise<ChatMessage> {
    const [message] = await db.update(chatMessages)
      .set({ content, isEdited: true, updatedAt: new Date() })
      .where(eq(chatMessages.id, id))
      .returning();
    return message;
  }

  async deleteChatMessage(id: string): Promise<void> {
    await db.delete(chatMessages).where(eq(chatMessages.id, id));
  }

  async createChatAttachment(data: InsertChatAttachment): Promise<ChatAttachment> {
    const [attachment] = await db.insert(chatAttachments).values(data).returning();
    return attachment;
  }

  async getChatAttachments(messageId: string): Promise<ChatAttachment[]> {
    return await db.select().from(chatAttachments).where(eq(chatAttachments.messageId, messageId));
  }

  // Delivery Notes (Bons de Livraison)
  async getDeliveryNotes(clientId?: string, garageId?: string): Promise<DeliveryNote[]> {
    const conditions = [];
    if (clientId) conditions.push(eq(deliveryNotes.clientId, clientId));
    if (garageId) conditions.push(eq(deliveryNotes.garageId, garageId));
    if (conditions.length > 0) {
      return await db.select().from(deliveryNotes)
        .where(and(...conditions))
        .orderBy(desc(deliveryNotes.createdAt));
    }
    return await db.select().from(deliveryNotes).orderBy(desc(deliveryNotes.createdAt));
  }

  async getDeliveryNote(id: string): Promise<DeliveryNote | undefined> {
    const [note] = await db.select().from(deliveryNotes).where(eq(deliveryNotes.id, id));
    if (!note) return undefined;

    const invoicesData = await db
      .select({
        invoice: invoices,
      })
      .from(deliveryNoteInvoices)
      .innerJoin(invoices, eq(deliveryNoteInvoices.invoiceId, invoices.id))
      .where(eq(deliveryNoteInvoices.deliveryNoteId, id));

    const invoicesWithDetails = await Promise.all(
      invoicesData.map(async (item) => {
        const invoice = item.invoice;
        const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));
        const media = await db.select().from(invoiceMedia).where(eq(invoiceMedia.invoiceId, invoice.id));
        return { ...invoice, items, media };
      })
    );

    const [client] = await db.select().from(users).where(eq(users.id, note.clientId));

    return { ...note, client, invoices: invoicesWithDetails } as any;
  }

  async createDeliveryNote(data: InsertDeliveryNote & { deliveryNoteNumber: string }): Promise<DeliveryNote> {
    const [note] = await db.insert(deliveryNotes).values(data).returning();
    return note;
  }

  async updateDeliveryNote(id: string, data: Partial<InsertDeliveryNote>): Promise<DeliveryNote> {
    const [note] = await db
      .update(deliveryNotes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(deliveryNotes.id, id))
      .returning();
    return note;
  }

  async deleteDeliveryNote(id: string): Promise<void> {
    await db.delete(deliveryNotes).where(eq(deliveryNotes.id, id));
  }

  async getDeliveryNoteInvoices(deliveryNoteId: string): Promise<(DeliveryNoteInvoice & { invoice: Invoice })[]> {
    const links = await db.select().from(deliveryNoteInvoices)
      .where(eq(deliveryNoteInvoices.deliveryNoteId, deliveryNoteId));
    return Promise.all(links.map(async (link) => {
      const [invoice] = await db.select().from(invoices).where(eq(invoices.id, link.invoiceId));
      return { ...link, invoice };
    }));
  }

  async setDeliveryNoteInvoices(deliveryNoteId: string, invoiceIds: string[]): Promise<void> {
    await db.delete(deliveryNoteInvoices).where(eq(deliveryNoteInvoices.deliveryNoteId, deliveryNoteId));
    if (invoiceIds.length > 0) {
      await db.insert(deliveryNoteInvoices).values(
        invoiceIds.map(invoiceId => ({ deliveryNoteId, invoiceId }))
      );
    }
  }

  async incrementDeliveryNoteCounter(month: number, year: number): Promise<DeliveryNoteCounter> {
    const existing = await db.select().from(deliveryNoteCounters)
      .where(and(
        eq(deliveryNoteCounters.month, month),
        eq(deliveryNoteCounters.year, year)
      ));
    
    if (existing.length > 0) {
      const [counter] = await db.update(deliveryNoteCounters)
        .set({
          currentNumber: sql`${deliveryNoteCounters.currentNumber} + 1`,
          updatedAt: new Date(),
        })
        .where(and(
          eq(deliveryNoteCounters.month, month),
          eq(deliveryNoteCounters.year, year)
        ))
        .returning();
      return counter;
    } else {
      const [counter] = await db.insert(deliveryNoteCounters)
        .values({ month, year, currentNumber: 1 })
        .returning();
      return counter;
    }
  }


  // ========== EXPENSE CATEGORIES ==========

  async getExpenseCategories(garageId?: string): Promise<ExpenseCategory[]> {
    if (garageId) {
      return await db.select().from(expenseCategories).where(eq(expenseCategories.garageId, garageId)).orderBy(expenseCategories.name);
    }
    return await db.select().from(expenseCategories).orderBy(expenseCategories.name);
  }

  async getExpenseCategory(id: string): Promise<ExpenseCategory | undefined> {
    const [cat] = await db.select().from(expenseCategories).where(eq(expenseCategories.id, id));
    return cat;
  }

  async createExpenseCategory(data: InsertExpenseCategory): Promise<ExpenseCategory> {
    const [cat] = await db.insert(expenseCategories).values(data).returning();
    return cat;
  }

  async updateExpenseCategory(id: string, data: Partial<InsertExpenseCategory>): Promise<ExpenseCategory> {
    const [cat] = await db.update(expenseCategories).set({ ...data, updatedAt: new Date() }).where(eq(expenseCategories.id, id)).returning();
    return cat;
  }

  async deleteExpenseCategory(id: string): Promise<void> {
    await db.delete(expenseCategories).where(eq(expenseCategories.id, id));
  }

  // ========== EXPENSES ==========

  async getExpenses(garageId?: string): Promise<Expense[]> {
    if (garageId) {
      return await db.select().from(expenses).where(eq(expenses.garageId, garageId)).orderBy(desc(expenses.date));
    }
    return await db.select().from(expenses).orderBy(desc(expenses.date));
  }

  async getExpense(id: string): Promise<Expense | undefined> {
    const [exp] = await db.select().from(expenses).where(eq(expenses.id, id));
    return exp;
  }

  async createExpense(data: any): Promise<Expense> {
    const [exp] = await db.insert(expenses).values(data).returning();
    return exp;
  }

  async updateExpense(id: string, data: Partial<InsertExpense>): Promise<Expense> {
    const [exp] = await db.update(expenses).set({ ...data, updatedAt: new Date() }).where(eq(expenses.id, id)).returning();
    return exp;
  }

  async deleteExpense(id: string): Promise<void> {
    await db.delete(expenses).where(eq(expenses.id, id));
  }

  async getNextExpenseNumber(year: number): Promise<string> {
    const existing = await db.select().from(expenseCounters).where(eq(expenseCounters.year, year));
    let nextNum: number;
    if (existing.length > 0) {
      await db.update(expenseCounters)
        .set({ currentNumber: sql`${expenseCounters.currentNumber} + 1`, updatedAt: new Date() })
        .where(eq(expenseCounters.year, year));
      nextNum = existing[0].currentNumber + 1;
    } else {
      await db.insert(expenseCounters).values({ year, currentNumber: 1 });
      nextNum = 1;
    }
    return `DEP-${year}-${String(nextNum).padStart(5, '0')}`;
  }

  // ========== CREDIT NOTES ==========

  async getCreditNotes(garageId?: string): Promise<CreditNote[]> {
    if (garageId) {
      return await db.select().from(creditNotes).where(eq(creditNotes.garageId, garageId)).orderBy(desc(creditNotes.createdAt));
    }
    return await db.select().from(creditNotes).orderBy(desc(creditNotes.createdAt));
  }

  async getCreditNote(id: string): Promise<CreditNote | undefined> {
    const [cn] = await db.select().from(creditNotes).where(eq(creditNotes.id, id));
    return cn;
  }

  async getCreditNotesByInvoice(invoiceId: string): Promise<CreditNote[]> {
    return await db.select().from(creditNotes).where(eq(creditNotes.invoiceId, invoiceId)).orderBy(desc(creditNotes.createdAt));
  }

  async createCreditNote(data: any): Promise<CreditNote> {
    const [cn] = await db.insert(creditNotes).values(data).returning();
    return cn;
  }

  async updateCreditNote(id: string, data: Partial<InsertCreditNote>): Promise<CreditNote> {
    const [cn] = await db.update(creditNotes).set({ ...data, updatedAt: new Date() }).where(eq(creditNotes.id, id)).returning();
    return cn;
  }

  async getNextCreditNoteNumber(year: number): Promise<string> {
    const existing = await db.select().from(creditNoteCounters).where(eq(creditNoteCounters.year, year));
    let nextNum: number;
    if (existing.length > 0) {
      await db.update(creditNoteCounters)
        .set({ currentNumber: sql`${creditNoteCounters.currentNumber} + 1`, updatedAt: new Date() })
        .where(eq(creditNoteCounters.year, year));
      nextNum = existing[0].currentNumber + 1;
    } else {
      await db.insert(creditNoteCounters).values({ year, currentNumber: 1 });
      nextNum = 1;
    }
    return `AV-${year}-${String(nextNum).padStart(5, '0')}`;
  }

  async getCreditNoteItems(creditNoteId: string): Promise<CreditNoteItem[]> {
    return await db.select().from(creditNoteItems).where(eq(creditNoteItems.creditNoteId, creditNoteId));
  }

  async createCreditNoteItem(data: InsertCreditNoteItem): Promise<CreditNoteItem> {
    const [item] = await db.insert(creditNoteItems).values(data).returning();
    return item;
  }

  // ========== ACCOUNTING ENTRIES ==========

  async getAccountingEntries(garageId?: string, filters?: { journal?: string; startDate?: Date; endDate?: Date; sourceType?: string }): Promise<AccountingEntry[]> {
    const conditions: any[] = [];
    if (garageId) conditions.push(eq(accountingEntries.garageId, garageId));
    if (filters?.journal) conditions.push(eq(accountingEntries.journal, filters.journal as any));
    if (filters?.sourceType) conditions.push(eq(accountingEntries.sourceType, filters.sourceType as any));
    if (filters?.startDate) conditions.push(sql`${accountingEntries.date} >= ${filters.startDate}`);
    if (filters?.endDate) conditions.push(sql`${accountingEntries.date} <= ${filters.endDate}`);
    
    if (conditions.length > 0) {
      return await db.select().from(accountingEntries).where(and(...conditions)).orderBy(desc(accountingEntries.date));
    }
    return await db.select().from(accountingEntries).orderBy(desc(accountingEntries.date));
  }

  async getAccountingEntry(id: string): Promise<AccountingEntry | undefined> {
    const [entry] = await db.select().from(accountingEntries).where(eq(accountingEntries.id, id));
    return entry;
  }

  async createAccountingEntry(data: any): Promise<AccountingEntry> {
    const [entry] = await db.insert(accountingEntries).values(data).returning();
    return entry;
  }

  async updateAccountingEntry(id: string, data: Partial<InsertAccountingEntry>): Promise<AccountingEntry> {
    const [entry] = await db.update(accountingEntries).set({ ...data, updatedAt: new Date() }).where(eq(accountingEntries.id, id)).returning();
    return entry;
  }

  async getAccountingLines(entryId: string): Promise<AccountingLine[]> {
    return await db.select().from(accountingLines).where(eq(accountingLines.entryId, entryId));
  }

  async createAccountingLine(data: InsertAccountingLine): Promise<AccountingLine> {
    const [line] = await db.insert(accountingLines).values(data).returning();
    return line;
  }

  async getNextEntryNumber(year: number): Promise<string> {
    const existing = await db.select().from(accountingEntryCounters).where(eq(accountingEntryCounters.year, year));
    let nextNum: number;
    if (existing.length > 0) {
      await db.update(accountingEntryCounters)
        .set({ currentNumber: sql`${accountingEntryCounters.currentNumber} + 1`, updatedAt: new Date() })
        .where(eq(accountingEntryCounters.year, year));
      nextNum = existing[0].currentNumber + 1;
    } else {
      await db.insert(accountingEntryCounters).values({ year, currentNumber: 1 });
      nextNum = 1;
    }
    return `EC-${year}-${String(nextNum).padStart(6, '0')}`;
  }

  // ========== FEC EXPORTS ==========

  async getFecExports(garageId?: string): Promise<FecExport[]> {
    if (garageId) {
      return await db.select().from(fecExports).where(eq(fecExports.garageId, garageId)).orderBy(desc(fecExports.createdAt));
    }
    return await db.select().from(fecExports).orderBy(desc(fecExports.createdAt));
  }

  async createFecExport(data: InsertFecExport): Promise<FecExport> {
    const [exp] = await db.insert(fecExports).values(data).returning();
    return exp;
  }

  // ========== NOTIFICATION RULES ==========

  async getNotificationRules(garageId?: string): Promise<NotificationRule[]> {
    if (garageId) {
      return await db.select().from(notificationRules).where(eq(notificationRules.garageId, garageId)).orderBy(desc(notificationRules.createdAt));
    }
    return await db.select().from(notificationRules).orderBy(desc(notificationRules.createdAt));
  }

  async getNotificationRule(id: string): Promise<NotificationRule | undefined> {
    const [rule] = await db.select().from(notificationRules).where(eq(notificationRules.id, id));
    return rule;
  }

  async createNotificationRule(data: InsertNotificationRule): Promise<NotificationRule> {
    const [rule] = await db.insert(notificationRules).values(data).returning();
    return rule;
  }

  async updateNotificationRule(id: string, data: Partial<InsertNotificationRule>): Promise<NotificationRule> {
    const [rule] = await db.update(notificationRules).set({ ...data, updatedAt: new Date() }).where(eq(notificationRules.id, id)).returning();
    return rule;
  }

  async deleteNotificationRule(id: string): Promise<void> {
    await db.delete(notificationRules).where(eq(notificationRules.id, id));
  }

  async getActiveNotificationRules(garageId?: string, eventType?: string): Promise<NotificationRule[]> {
    const conditions = [eq(notificationRules.isActive, true)];
    if (garageId) conditions.push(eq(notificationRules.garageId, garageId));
    if (eventType) conditions.push(eq(notificationRules.eventType, eventType as any));
    return await db.select().from(notificationRules).where(and(...conditions));
  }

  async getExternalApis(): Promise<ExternalApi[]> {
    return await db.select().from(externalApis).orderBy(desc(externalApis.createdAt));
  }

  async getExternalApi(id: string): Promise<ExternalApi | undefined> {
    const [api] = await db.select().from(externalApis).where(eq(externalApis.id, id));
    return api;
  }

  async createExternalApi(data: InsertExternalApi): Promise<ExternalApi> {
    const [api] = await db.insert(externalApis).values(data).returning();
    return api;
  }

  async updateExternalApi(id: string, data: Partial<InsertExternalApi>): Promise<ExternalApi> {
    const [api] = await db.update(externalApis).set({ ...data, updatedAt: new Date() }).where(eq(externalApis.id, id)).returning();
    return api;
  }

  async deleteExternalApi(id: string): Promise<void> {
    await db.delete(externalApis).where(eq(externalApis.id, id));
  }

  async getAiAnalysisHistory(type?: string, limit: number = 50, garageId?: string): Promise<AiAnalysisHistory[]> {
    const conditions: any[] = [];
    if (type) conditions.push(eq(aiAnalysisHistory.type, type as any));
    if (garageId) conditions.push(eq(aiAnalysisHistory.garageId, garageId));
    const query = db.select().from(aiAnalysisHistory);
    if (conditions.length > 0) {
      return await query.where(and(...conditions)).orderBy(desc(aiAnalysisHistory.createdAt)).limit(limit);
    }
    return await query.orderBy(desc(aiAnalysisHistory.createdAt)).limit(limit);
  }

  async getAiAnalysis(id: string, garageId?: string): Promise<AiAnalysisHistory | undefined> {
    const conditions: any[] = [eq(aiAnalysisHistory.id, id)];
    if (garageId) conditions.push(eq(aiAnalysisHistory.garageId, garageId));
    const [row] = await db.select().from(aiAnalysisHistory).where(and(...conditions));
    return row;
  }

  async createAiAnalysis(data: InsertAiAnalysisHistory): Promise<AiAnalysisHistory> {
    const [row] = await db.insert(aiAnalysisHistory).values(data).returning();
    return row;
  }

  async updateAiAnalysis(id: string, data: Partial<InsertAiAnalysisHistory>, garageId?: string): Promise<AiAnalysisHistory> {
    const conditions: any[] = [eq(aiAnalysisHistory.id, id)];
    if (garageId) conditions.push(eq(aiAnalysisHistory.garageId, garageId));
    const [row] = await db.update(aiAnalysisHistory).set(data).where(and(...conditions)).returning();
    return row;
  }

  async deleteAiAnalysis(id: string, garageId?: string): Promise<void> {
    const conditions: any[] = [eq(aiAnalysisHistory.id, id)];
    if (garageId) conditions.push(eq(aiAnalysisHistory.garageId, garageId));
    await db.delete(aiAnalysisHistory).where(and(...conditions));
  }

  async deleteFailedAiAnalyses(garageId?: string): Promise<number> {
    const conditions: any[] = [sql`result->>'error' = 'parse_failed'`];
    if (garageId) conditions.push(eq(aiAnalysisHistory.garageId, garageId));
    const rows = await db.delete(aiAnalysisHistory).where(and(...conditions)).returning({ id: aiAnalysisHistory.id });
    return rows.length;
  }
}

export const storage = new DatabaseStorage();
