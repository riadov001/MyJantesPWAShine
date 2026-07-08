/**
 * MyJantes Mobile SDK
 * Version: 2.0.0
 *
 * - Token-based auth (JWT, Bearer header) — works on iOS / Android / RN.
 * - Automatic refresh-token flow.
 * - All routes hit /api/mobile/* on the backend.
 */

export type Role =
  | "client"
  | "client_professionnel"
  | "employe"
  | "admin"
  | "superadmin"
  | "rootadmin"
  | "root";

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role: Role;
  garageId?: string;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  basePrice?: string;
  imageUrl?: string;
}

export interface Quote {
  id: string;
  reference?: string;
  clientId: string;
  serviceId?: string;
  status: "pending" | "approved" | "accepted" | "rejected" | "completed";
  quoteAmount?: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: string;
  status: "pending" | "paid" | "overdue" | "cancelled";
  createdAt: string;
}

export interface Reservation {
  id: string;
  clientId: string;
  scheduledDate: string;
  estimatedEndDate?: string;
  durationMinutes?: number;
  status: "pending" | "confirmed" | "in_progress" | "completed" | "cancelled";
  notes?: string;
}

export interface Review {
  id: string;
  rating: number;
  comment?: string;
  clientName?: string;
  createdAt: string;
}

export interface Garage {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  tagline?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

export interface AvailabilityDay {
  date: string;
  dayOfWeek: string;
  slots: Array<{ start: string; end: string }>;
}

export interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  publishableKey: string;
}

export interface DeviceToken {
  id: string;
  token: string;
  platform: "ios" | "android";
  appVersion?: string;
  deviceModel?: string;
  locale?: string;
  isActive: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  user: User;
}

export interface TokenStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const memoryStore: Record<string, string> = {};
const defaultStorage: TokenStorage = {
  async get(k) { return memoryStore[k] ?? null; },
  async set(k, v) { memoryStore[k] = v; },
  async remove(k) { delete memoryStore[k]; },
};

const ACCESS_KEY = "myjantes_access_token";
const REFRESH_KEY = "myjantes_refresh_token";

export interface ClientOptions {
  baseUrl?: string;             // e.g. https://app.myjantes.fr
  storage?: TokenStorage;       // AsyncStorage / SecureStore wrapper
  fetchImpl?: typeof fetch;
  onUnauthenticated?: () => void;
}

export class MyJantesClient {
  private baseUrl: string;
  private storage: TokenStorage;
  private fetchImpl: typeof fetch;
  private onUnauthenticated?: () => void;
  private refreshing: Promise<string | null> | null = null;

  constructor(opts: ClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? "https://app.myjantes.fr").replace(/\/$/, "");
    this.storage = opts.storage ?? defaultStorage;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.onUnauthenticated = opts.onUnauthenticated;
  }

  // ---------- low-level ----------

  private url(path: string) {
    if (path.startsWith("http")) return path;
    return `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  }

  private async authHeader(): Promise<Record<string, string>> {
    const t = await this.storage.get(ACCESS_KEY);
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  private async request<T = any>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(await this.authHeader()),
      ...((init.headers as any) || {}),
    };
    const res = await this.fetchImpl(this.url(path), { ...init, headers });
    if (res.status === 401 && retry) {
      const newToken = await this.refreshAccessToken();
      if (newToken) return this.request<T>(path, init, false);
      this.onUnauthenticated?.();
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err: any = new Error(body?.message || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    if (res.status === 204) return undefined as any;
    return res.json();
  }

  // ---------- session ----------

  async login(email: string, password: string): Promise<AuthTokens> {
    const data = await this.request<AuthTokens>("/api/mobile/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }, false);
    await this.storage.set(ACCESS_KEY, data.accessToken);
    await this.storage.set(REFRESH_KEY, data.refreshToken);
    return data;
  }

  async logout(): Promise<void> {
    try { await this.request("/api/mobile/auth/logout", { method: "POST" }, false); } catch { /* ignore */ }
    await this.storage.remove(ACCESS_KEY);
    await this.storage.remove(REFRESH_KEY);
  }

  async forgotPassword(email: string): Promise<void> {
    await this.request("/api/mobile/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    }, false);
  }

  async refreshAccessToken(): Promise<string | null> {
    if (this.refreshing) return this.refreshing;
    const refreshToken = await this.storage.get(REFRESH_KEY);
    if (!refreshToken) return null;
    this.refreshing = (async () => {
      try {
        const res = await this.fetchImpl(this.url("/api/mobile/refresh-token"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          await this.storage.remove(ACCESS_KEY);
          await this.storage.remove(REFRESH_KEY);
          return null;
        }
        const data = await res.json();
        await this.storage.set(ACCESS_KEY, data.accessToken);
        if (data.refreshToken) await this.storage.set(REFRESH_KEY, data.refreshToken);
        return data.accessToken as string;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  async me(): Promise<User> {
    return this.request<User>("/api/mobile/auth/me");
  }

  // ---------- public bootstrap ----------

  async health() { return this.request<{ ok: boolean; uptimeSec: number; time: string }>("/api/mobile/health", {}, false); }
  async version() { return this.request<{ ios: { latest: string; min: string }; android: { latest: string; min: string }; maintenance: boolean }>("/api/mobile/version", {}, false); }
  async garage(): Promise<Garage> { return this.request<Garage>("/api/mobile/garage", {}, false); }
  async getPaymentConfig() { return this.request<{ publishableKey: string; currency: string; countryCode: string }>("/api/mobile/payment/config", {}, false); }

  // ---------- profile ----------

  async getProfile(): Promise<User> { return this.request<User>("/api/mobile/profile"); }
  async updateProfile(patch: Partial<User>): Promise<User> {
    return this.request<User>("/api/mobile/profile", { method: "PATCH", body: JSON.stringify(patch) });
  }
  async uploadAvatar(file: { uri: string; name: string; type: string }) {
    const fd = new FormData();
    fd.append("avatar", file as any);
    return this.request("/api/mobile/profile/avatar", { method: "POST", body: fd as any });
  }

  // ---------- catalog ----------

  async getServices(): Promise<Service[]> { return this.request<Service[]>("/api/mobile/services"); }

  // ---------- quotes ----------

  async getQuotes(): Promise<Quote[]> { return this.request<Quote[]>("/api/mobile/quotes"); }
  async getQuote(id: string): Promise<Quote> { return this.request<Quote>(`/api/mobile/quotes/${id}`); }
  async createQuote(payload: Partial<Quote> & { serviceId?: string; notes?: string }): Promise<Quote> {
    return this.request<Quote>("/api/mobile/quotes", { method: "POST", body: JSON.stringify(payload) });
  }
  async getQuoteMedia(id: string) { return this.request(`/api/mobile/quotes/${id}/media`); }
  async getQuotePdfUrl(id: string) { return `${this.baseUrl}/api/mobile/quotes/${id}/pdf`; }
  async createQuoteViewLink(id: string) { return this.request<{ viewUrl: string }>(`/api/mobile/quotes/${id}/view-link`, { method: "POST" }); }

  // ---------- invoices ----------

  async getInvoices(): Promise<Invoice[]> { return this.request<Invoice[]>("/api/mobile/invoices"); }
  async getInvoice(id: string): Promise<Invoice> { return this.request<Invoice>(`/api/mobile/invoices/${id}`); }
  async getInvoiceMedia(id: string) { return this.request(`/api/mobile/invoices/${id}/media`); }
  async getInvoicePdfUrl(id: string) { return `${this.baseUrl}/api/mobile/invoices/${id}/pdf`; }
  async createInvoiceViewLink(id: string) { return this.request<{ viewUrl: string }>(`/api/mobile/invoices/${id}/view-link`, { method: "POST" }); }

  // ---------- reservations ----------

  async getReservations(): Promise<Reservation[]> { return this.request<Reservation[]>("/api/mobile/reservations"); }
  async getReservation(id: string): Promise<Reservation> { return this.request<Reservation>(`/api/mobile/reservations/${id}`); }
  async createReservation(data: Partial<Reservation>): Promise<Reservation> {
    return this.request<Reservation>("/api/mobile/reservations", { method: "POST", body: JSON.stringify(data) });
  }
  async updateReservation(id: string, data: Partial<Reservation>): Promise<Reservation> {
    return this.request<Reservation>(`/api/mobile/reservations/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  }
  async cancelReservation(id: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/api/mobile/reservations/${id}`, { method: "DELETE" });
  }
  async getAvailability(year: number, month: number, durationMinutes = 60) {
    return this.request<{ year: number; month: number; duration: number; days: AvailabilityDay[] }>(
      `/api/mobile/reservations/availability?year=${year}&month=${month}&duration=${durationMinutes}`
    );
  }

  // ---------- reviews ----------

  async getReviews(limit = 20): Promise<Review[]> {
    return this.request<Review[]>(`/api/mobile/reviews?limit=${limit}`, {}, false);
  }
  async submitReview(payload: { rating: number; comment?: string; invoiceId?: string }): Promise<Review> {
    return this.request<Review>("/api/mobile/reviews", { method: "POST", body: JSON.stringify(payload) });
  }

  // ---------- notifications ----------

  async getNotifications() { return this.request("/api/mobile/notifications"); }
  async getUnreadCount(): Promise<{ count: number }> { return this.request("/api/mobile/notifications/unread-count"); }
  async markNotificationRead(id: string) { return this.request(`/api/mobile/notifications/${id}/read`, { method: "PATCH" }); }
  async markAllNotificationsRead() { return this.request("/api/mobile/notifications/mark-all-read", { method: "POST" }); }

  // ---------- push notifications (device tokens) ----------

  async registerDevice(token: string, platform: "ios" | "android", meta: { appVersion?: string; deviceModel?: string; locale?: string } = {}) {
    return this.request<{ ok: boolean; device: DeviceToken }>("/api/mobile/devices/register", {
      method: "POST",
      body: JSON.stringify({ token, platform, ...meta }),
    });
  }
  async unregisterDevice(token: string) {
    return this.request<{ ok: boolean }>(`/api/mobile/devices/${encodeURIComponent(token)}`, { method: "DELETE" });
  }
  async getDevices(): Promise<DeviceToken[]> { return this.request<DeviceToken[]>("/api/mobile/devices"); }

  // ---------- payments (Stripe Payment Sheet) ----------

  async createInvoicePaymentIntent(invoiceId: string): Promise<PaymentIntentResult> {
    return this.request<PaymentIntentResult>(`/api/mobile/invoices/${invoiceId}/payment-intent`, { method: "POST" });
  }

  // ---------- OCR ----------

  async scanCarteGrise(file: { uri: string; name: string; type: string }) {
    const fd = new FormData();
    fd.append("file", file as any);
    return this.request("/api/mobile/ocr/carte-grise", { method: "POST", body: fd as any });
  }

  // ---------- AI assistant ----------

  async askAssistant(messages: Array<{ role: "user" | "assistant"; content: string }>): Promise<{ response: string }> {
    return this.request("/api/mobile/ai/assistant", { method: "POST", body: JSON.stringify({ messages }) });
  }

  // ---------- admin shortcuts ----------

  async adminDashboard() { return this.request("/api/mobile/admin/dashboard"); }
  async adminClients() { return this.request("/api/mobile/admin/clients"); }
  async adminUpdateQuoteStatus(id: string, status: string) {
    return this.request(`/api/mobile/admin/quotes/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  }
  async adminUpdateInvoiceStatus(id: string, status: string) {
    return this.request(`/api/mobile/admin/invoices/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  }
  async adminUpdateReservationStatus(id: string, status: string) {
    return this.request(`/api/mobile/admin/reservations/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
  }
}
