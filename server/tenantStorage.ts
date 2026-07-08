import { pool } from "./db";
import { getSchemaName } from "./tenantContext";
import {
  type Service, type InsertService,
  type Quote, type InsertQuote,
  type QuoteItem, type InsertQuoteItem,
  type Invoice, type InsertInvoice,
  type InvoiceItem, type InsertInvoiceItem,
  type Reservation, type InsertReservation,
  type ReservationService, type InsertReservationService,
  type Notification, type InsertNotification,
  type DeliveryNote, type InsertDeliveryNote,
  type Review,
} from "@shared/schema";

export class TenantStorage {
  private schemaName: string;

  constructor(garageSlug: string) {
    this.schemaName = getSchemaName(garageSlug);
  }

  private async query(text: string, params?: any[]) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL search_path TO "${this.schemaName}", public`);
      const result = await client.query(text, params);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getServices(): Promise<Service[]> {
    const result = await this.query(`SELECT * FROM services WHERE is_active = true ORDER BY name`);
    return result.rows.map(this.mapService);
  }

  async getAllServices(): Promise<Service[]> {
    const result = await this.query(`SELECT * FROM services ORDER BY name`);
    return result.rows.map(this.mapService);
  }

  async getService(id: string): Promise<Service | undefined> {
    const result = await this.query(`SELECT * FROM services WHERE id = $1`, [id]);
    return result.rows[0] ? this.mapService(result.rows[0]) : undefined;
  }

  async createService(service: InsertService): Promise<Service> {
    const result = await this.query(
      `INSERT INTO services (name, description, base_price, category, is_active, estimated_duration, image_url, custom_form_fields)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [service.name, service.description, service.basePrice, service.category, 
       service.isActive ?? true, service.estimatedDuration, service.imageUrl, 
       service.customFormFields ? JSON.stringify(service.customFormFields) : null]
    );
    return this.mapService(result.rows[0]);
  }

  async updateService(id: string, service: Partial<InsertService>): Promise<Service> {
    const sets: string[] = [];
    const vals: any[] = [];
    let idx = 1;

    if (service.name !== undefined) { sets.push(`name = $${idx++}`); vals.push(service.name); }
    if (service.description !== undefined) { sets.push(`description = $${idx++}`); vals.push(service.description); }
    if (service.basePrice !== undefined) { sets.push(`base_price = $${idx++}`); vals.push(service.basePrice); }
    if (service.category !== undefined) { sets.push(`category = $${idx++}`); vals.push(service.category); }
    if (service.isActive !== undefined) { sets.push(`is_active = $${idx++}`); vals.push(service.isActive); }
    if (service.estimatedDuration !== undefined) { sets.push(`estimated_duration = $${idx++}`); vals.push(service.estimatedDuration); }
    if (service.imageUrl !== undefined) { sets.push(`image_url = $${idx++}`); vals.push(service.imageUrl); }
    sets.push(`updated_at = NOW()`);
    vals.push(id);

    const result = await this.query(
      `UPDATE services SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      vals
    );
    return this.mapService(result.rows[0]);
  }

  async deleteService(id: string): Promise<void> {
    await this.query(`DELETE FROM services WHERE id = $1`, [id]);
  }

  async getQuotes(clientId?: string): Promise<Quote[]> {
    let query = `SELECT * FROM quotes`;
    const params: any[] = [];
    if (clientId) {
      query += ` WHERE client_id = $1`;
      params.push(clientId);
    }
    query += ` ORDER BY created_at DESC`;
    const result = await this.query(query, params);
    return result.rows.map(this.mapQuote);
  }

  async getQuote(id: string): Promise<Quote | undefined> {
    const result = await this.query(`SELECT * FROM quotes WHERE id = $1`, [id]);
    return result.rows[0] ? this.mapQuote(result.rows[0]) : undefined;
  }

  async getInvoices(clientId?: string): Promise<Invoice[]> {
    let query = `SELECT * FROM invoices`;
    const params: any[] = [];
    if (clientId) {
      query += ` WHERE client_id = $1`;
      params.push(clientId);
    }
    query += ` ORDER BY created_at DESC`;
    const result = await this.query(query, params);
    return result.rows.map(this.mapInvoice);
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const result = await this.query(`SELECT * FROM invoices WHERE id = $1`, [id]);
    return result.rows[0] ? this.mapInvoice(result.rows[0]) : undefined;
  }

  async getReservations(clientId?: string): Promise<Reservation[]> {
    let query = `SELECT * FROM reservations`;
    const params: any[] = [];
    if (clientId) {
      query += ` WHERE client_id = $1`;
      params.push(clientId);
    }
    query += ` ORDER BY scheduled_date DESC`;
    const result = await this.query(query, params);
    return result.rows.map(this.mapReservation);
  }

  async getReservation(id: string): Promise<Reservation | undefined> {
    const result = await this.query(`SELECT * FROM reservations WHERE id = $1`, [id]);
    return result.rows[0] ? this.mapReservation(result.rows[0]) : undefined;
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    const result = await this.query(
      `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map(this.mapNotification);
  }

  async getReviews(): Promise<Review[]> {
    const result = await this.query(`SELECT * FROM reviews ORDER BY created_at DESC`);
    return result.rows.map(this.mapReview);
  }

  async getQuoteMedia(quoteId: string): Promise<any[]> {
    const result = await this.query(
      `SELECT * FROM quote_media WHERE quote_id = $1 ORDER BY created_at ASC`,
      [quoteId]
    );
    return result.rows.map(this.mapQuoteMedia);
  }

  async getInvoiceMedia(invoiceId: string): Promise<any[]> {
    const result = await this.query(
      `SELECT * FROM invoice_media WHERE invoice_id = $1 ORDER BY created_at ASC`,
      [invoiceId]
    );
    return result.rows.map(this.mapInvoiceMedia);
  }

  async getDeliveryNotes(clientId?: string): Promise<DeliveryNote[]> {
    let query = `SELECT * FROM delivery_notes`;
    const params: any[] = [];
    if (clientId) {
      query += ` WHERE client_id = $1`;
      params.push(clientId);
    }
    query += ` ORDER BY created_at DESC`;
    const result = await this.query(query, params);
    return result.rows.map(this.mapDeliveryNote);
  }

  async getTableCount(tableName: string): Promise<number> {
    const result = await this.query(`SELECT COUNT(*) as cnt FROM "${tableName}"`);
    return parseInt(result.rows[0].cnt);
  }

  async getSchemaStats(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {};
    const tables = ["services", "quotes", "invoices", "reservations", "reviews", "notifications", "quote_media", "invoice_media"];
    for (const table of tables) {
      try {
        stats[table] = await this.getTableCount(table);
      } catch {
        stats[table] = 0;
      }
    }
    return stats;
  }

  private mapService(row: any): Service {
    return {
      id: row.id,
      garageId: row.garage_id,
      name: row.name,
      description: row.description,
      basePrice: row.base_price,
      category: row.category,
      isActive: row.is_active,
      estimatedDuration: row.estimated_duration,
      imageUrl: row.image_url,
      customFormFields: row.custom_form_fields,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapQuote(row: any): Quote {
    return {
      id: row.id,
      garageId: row.garage_id,
      reference: row.reference,
      clientId: row.client_id,
      serviceId: row.service_id,
      status: row.status,
      paymentMethod: row.payment_method,
      requestDetails: row.request_details,
      quoteAmount: row.quote_amount,
      wheelCount: row.wheel_count,
      diameter: row.diameter,
      wheelPositions: row.wheel_positions,
      priceExcludingTax: row.price_excluding_tax,
      taxRate: row.tax_rate,
      taxAmount: row.tax_amount,
      productDetails: row.product_details,
      notes: row.notes,
      validUntil: row.valid_until,
      viewToken: row.view_token,
      emailSentAt: row.email_sent_at,
      viewedAt: row.viewed_at,
      vehicleRegistration: row.vehicle_registration,
      vehicleMake: row.vehicle_make,
      vehicleModel: row.vehicle_model,
      vehicleVin: row.vehicle_vin,
      vehicleFuelType: row.vehicle_fuel_type,
      vehicleFiscalPower: row.vehicle_fiscal_power,
      vehicleFirstRegDate: row.vehicle_first_reg_date,
      vehicleColor: row.vehicle_color,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapInvoice(row: any): Invoice {
    return {
      id: row.id,
      garageId: row.garage_id,
      quoteId: row.quote_id,
      clientId: row.client_id,
      invoiceNumber: row.invoice_number,
      amount: row.amount,
      paymentMethod: row.payment_method,
      wheelCount: row.wheel_count,
      diameter: row.diameter,
      priceExcludingTax: row.price_excluding_tax,
      taxRate: row.tax_rate,
      taxAmount: row.tax_amount,
      productDetails: row.product_details,
      customerName: row.customer_name || null,
      customerEmail: row.customer_email || null,
      customerAddress: row.customer_address || null,
      customerPhone: row.customer_phone || null,
      status: row.status,
      stripeSessionId: row.stripe_session_id,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      paymentLink: row.payment_link,
      dueDate: row.due_date,
      paidAt: row.paid_at,
      viewToken: row.view_token,
      emailSentAt: row.email_sent_at,
      viewedAt: row.viewed_at,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapReservation(row: any): Reservation {
    return {
      id: row.id,
      reference: row.reference,
      garageId: row.garage_id,
      quoteId: row.quote_id,
      clientId: row.client_id,
      serviceId: row.service_id,
      assignedEmployeeId: row.assigned_employee_id,
      scheduledDate: row.scheduled_date,
      estimatedEndDate: row.estimated_end_date,
      wheelCount: row.wheel_count,
      diameter: row.diameter,
      wheelPositions: row.wheel_positions,
      priceExcludingTax: row.price_excluding_tax,
      taxRate: row.tax_rate,
      taxAmount: row.tax_amount,
      productDetails: row.product_details,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapNotification(row: any): Notification {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      message: row.message,
      relatedId: row.related_id,
      isRead: row.is_read,
      createdAt: row.created_at,
    };
  }

  private mapReview(row: any): Review {
    return {
      id: row.id,
      garageId: row.garage_id,
      quoteId: row.quote_id,
      invoiceId: row.invoice_id,
      clientId: row.client_id,
      clientName: row.client_name,
      rating: row.rating,
      comment: row.comment,
      reviewToken: row.review_token,
      isApproved: row.is_approved,
      createdAt: row.created_at,
    };
  }

  private mapQuoteMedia(row: any): any {
    return {
      id: row.id,
      quoteId: row.quote_id,
      fileType: row.file_type,
      filePath: row.file_path,
      fileName: row.file_name,
      fileSize: row.file_size,
      createdAt: row.created_at,
    };
  }

  private mapInvoiceMedia(row: any): any {
    return {
      id: row.id,
      invoiceId: row.invoice_id,
      fileType: row.file_type,
      filePath: row.file_path,
      fileName: row.file_name,
      fileSize: row.file_size,
      createdAt: row.created_at,
    };
  }

  private mapDeliveryNote(row: any): DeliveryNote {
    return {
      id: row.id,
      garageId: row.garage_id,
      clientId: row.client_id,
      deliveryNoteNumber: row.delivery_note_number,
      month: row.month,
      year: row.year,
      totalAmount: row.total_amount,
      totalHT: row.total_ht,
      totalTVA: row.total_tva,
      status: row.status,
      showPrices: row.show_prices,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export function createTenantStorage(garageSlug: string): TenantStorage {
  return new TenantStorage(garageSlug);
}
