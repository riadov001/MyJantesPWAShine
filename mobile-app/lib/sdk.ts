/**
 * MyJantes Mobile SDK (v2 — extended with Firebase sign-in + register
 * and the client core: profile, quotes, invoices, payments, garage).
 */

export type Role =
  | 'client'
  | 'client_professionnel'
  | 'employe'
  | 'admin'
  | 'superadmin'
  | 'rootadmin'
  | 'root';

export interface User {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  role: Role;
  garageId?: string | null;
  profileImageUrl?: string | null;
  address?: string | null;
  postalCode?: string | null;
  city?: string | null;
  companyName?: string | null;
  siret?: string | null;
  tvaNumber?: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  user: User;
}

export interface TokenStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const ACCESS_KEY = 'myjantes_access_token';
export const REFRESH_KEY = 'myjantes_refresh_token';

export interface ClientOptions {
  baseUrl: string;
  storage: TokenStorage;
  fetchImpl?: typeof fetch;
  onUnauthenticated?: () => void;
}

export type QuoteStatus =
  | 'pending'
  | 'approved'
  | 'accepted'
  | 'rejected'
  | 'completed';

export interface QuoteSummary {
  id: string;
  reference?: string | null;
  clientId: string;
  serviceId: string;
  status: QuoteStatus;
  quoteAmount?: string | null;
  wheelCount?: number | null;
  diameter?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface QuoteItem {
  id: string;
  quoteId: string;
  description: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

export interface QuoteMedia {
  id: string;
  quoteId: string;
  fileName: string;
  filePath: string;
  fileType: string;
}

export interface QuoteDetail extends QuoteSummary {
  items: QuoteItem[];
  media: QuoteMedia[];
  client: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'phone'> | null;
  service: { id: string; name: string; description?: string | null } | null;
}

export type InvoiceStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';

export interface InvoiceSummary {
  id: string;
  invoiceNumber: string;
  clientId: string;
  amount: string;
  status: InvoiceStatus;
  paymentMethod?: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  notes?: string | null;
  createdAt?: string | null;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
}

export interface InvoiceDetail extends InvoiceSummary {
  items: InvoiceItem[];
  media: { id: string; filePath: string; fileName: string; fileType: string }[];
  client: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'phone'> | null;
}

export interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  publishableKey: string;
}

export interface PaymentConfig {
  publishableKey: string;
  currency: string;
  countryCode: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface Service {
  id: string;
  name: string;
  description?: string | null;
  basePrice?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  isActive: boolean;
}

export type ReservationStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export interface Reservation {
  id: string;
  reference?: string | null;
  clientId: string;
  serviceId: string;
  garageId?: string | null;
  status: ReservationStatus;
  scheduledDate: string;
  estimatedEndDate?: string | null;
  wheelCount?: number | null;
  diameter?: string | null;
  notes?: string | null;
  vehicleRegistration?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  createdAt?: string | null;
}

export interface ReservationDetail extends Reservation {
  service: { id: string; name: string; description?: string | null } | null;
  client: Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'phone'> | null;
}

export interface AvailableSlot {
  start: string; // ISO local "YYYY-MM-DDTHH:mm:ss"
  end: string;   // ISO local "YYYY-MM-DDTHH:mm:ss"
}

export interface AvailableDay {
  date: string; // YYYY-MM-DD
  slots: AvailableSlot[];
}

export interface AvailabilityResponse {
  year: number;
  month: number;
  duration: number;
  days: AvailableDay[];
}

export interface CreateReservationInput {
  serviceId: string;
  scheduledDate: string; // ISO
  estimatedEndDate?: string | null;
  wheelCount?: number | null;
  diameter?: string | null;
  notes?: string | null;
  vehicleRegistration?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
}

export interface Review {
  id: string;
  rating: number;
  comment?: string | null;
  clientName?: string | null;
  isApproved?: boolean;
  invoiceId?: string | null;
  createdAt?: string | null;
}

export interface NotificationItem {
  id: string;
  userId: string;
  type: 'quote' | 'invoice' | 'reservation' | 'service' | 'chat';
  title: string;
  message: string;
  relatedId?: string | null;
  isRead: boolean;
  createdAt?: string | null;
}

export interface ChatParticipantUser {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  role?: string;
}

export interface ChatAttachment {
  id: string;
  messageId: string;
  fileType: 'image' | 'video' | 'document';
  filePath: string;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  isEdited?: boolean;
  createdAt?: string | null;
  sender?: ChatParticipantUser | null;
  attachments?: ChatAttachment[];
}

export interface ChatConversation {
  id: string;
  title: string;
  type: string;
  createdById: string;
  isArchived: boolean;
  lastMessageAt?: string | null;
  createdAt?: string | null;
  unreadCount?: number;
  participants?: { user: ChatParticipantUser; userId?: string; lastReadAt?: string | null }[];
  lastMessage?: ChatMessage | null;
}

export interface DeviceRegisterInput {
  token: string;
  platform: 'ios' | 'android';
  appVersion?: string | null;
  deviceModel?: string | null;
  locale?: string | null;
}

export interface UploadResult {
  url: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
}

export interface NotificationPreferences {
  smsConsent: boolean;
  emailMarketingConsent: boolean;
}

export interface Garage {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  tagline?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
}

export interface ViewLink {
  viewUrl: string;
  expiresAt?: string;
}

export interface ProfileUpdate {
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  postalCode?: string;
  city?: string;
}

export interface AvatarAsset {
  uri: string;
  name?: string;
  type?: string;
}

export class MyJantesClient {
  private baseUrl: string;
  private storage: TokenStorage;
  private fetchImpl: typeof fetch;
  private onUnauthenticated?: () => void;
  private refreshing: Promise<string | null> | null = null;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.storage = opts.storage;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.onUnauthenticated = opts.onUnauthenticated;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async getAccessToken(): Promise<string | null> {
    return this.storage.get(ACCESS_KEY);
  }

  private url(path: string) {
    if (path.startsWith('http')) return path;
    return `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  private async authHeader(): Promise<Record<string, string>> {
    const t = await this.storage.get(ACCESS_KEY);
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  async request<T = unknown>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
    const incoming: Record<string, string> =
      init.headers instanceof Headers
        ? Object.fromEntries((init.headers as unknown as Iterable<[string, string]>))
        : Array.isArray(init.headers)
          ? Object.fromEntries(init.headers)
          : ((init.headers as Record<string, string> | undefined) ?? {});
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(init.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(await this.authHeader()),
      ...incoming,
    };
    const res = await this.fetchImpl(this.url(path), { ...init, headers });
    if (res.status === 401 && retry) {
      const newToken = await this.refreshAccessToken();
      if (newToken) return this.request<T>(path, init, false);
      this.onUnauthenticated?.();
    }
    if (!res.ok) {
      const body: { message?: string } = await res
        .json()
        .catch(() => ({}));
      const err = new Error(body.message ?? `HTTP ${res.status}`) as Error & {
        status: number;
        body: unknown;
      };
      err.status = res.status;
      err.body = body;
      throw err;
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  // ---------- session ----------
  async login(email: string, password: string): Promise<AuthTokens> {
    const data = await this.request<AuthTokens>(
      '/api/mobile/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      false,
    );
    await this.storage.set(ACCESS_KEY, data.accessToken);
    await this.storage.set(REFRESH_KEY, data.refreshToken);
    return data;
  }

  async signInWithFirebase(idToken: string, provider: 'apple' | 'google'): Promise<AuthTokens> {
    const data = await this.request<AuthTokens>(
      '/api/mobile/auth/firebase',
      { method: 'POST', body: JSON.stringify({ idToken, provider }) },
      false,
    );
    await this.storage.set(ACCESS_KEY, data.accessToken);
    await this.storage.set(REFRESH_KEY, data.refreshToken);
    return data;
  }

  async register(payload: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    role?: 'client' | 'client_professionnel';
    companyName?: string;
    siret?: string;
    tvaNumber?: string;
    companyAddress?: string;
  }): Promise<AuthTokens> {
    const data = await this.request<AuthTokens>(
      '/api/mobile/auth/register',
      { method: 'POST', body: JSON.stringify(payload) },
      false,
    );
    await this.storage.set(ACCESS_KEY, data.accessToken);
    await this.storage.set(REFRESH_KEY, data.refreshToken);
    return data;
  }

  async logout(): Promise<void> {
    try {
      await this.request('/api/mobile/auth/logout', { method: 'POST' }, false);
    } catch {
      /* ignore */
    }
    await this.storage.remove(ACCESS_KEY);
    await this.storage.remove(REFRESH_KEY);
  }

  async forgotPassword(email: string): Promise<void> {
    await this.request(
      '/api/mobile/auth/forgot-password',
      { method: 'POST', body: JSON.stringify({ email }) },
      false,
    );
  }

  async refreshAccessToken(): Promise<string | null> {
    if (this.refreshing) return this.refreshing;
    const refreshToken = await this.storage.get(REFRESH_KEY);
    if (!refreshToken) return null;
    this.refreshing = (async () => {
      try {
        const res = await this.fetchImpl(this.url('/api/mobile/refresh-token'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!res.ok) {
          await this.storage.remove(ACCESS_KEY);
          await this.storage.remove(REFRESH_KEY);
          return null;
        }
        const data = (await res.json()) as { accessToken: string; refreshToken?: string };
        await this.storage.set(ACCESS_KEY, data.accessToken);
        if (data.refreshToken) await this.storage.set(REFRESH_KEY, data.refreshToken);
        return data.accessToken;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  async me(): Promise<User> {
    return this.request<User>('/api/mobile/auth/me');
  }

  async hasStoredSession(): Promise<boolean> {
    const t = await this.storage.get(ACCESS_KEY);
    return !!t;
  }

  // ---------- profile ----------
  async getProfile(): Promise<User> {
    return this.request<User>('/api/mobile/profile');
  }

  async updateProfile(patch: ProfileUpdate): Promise<User> {
    return this.request<User>('/api/mobile/profile', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  async uploadAvatar(asset: AvatarAsset): Promise<{ success: boolean; url: string }> {
    const form = new FormData();
    const fileName = asset.name ?? 'avatar.jpg';
    const type = asset.type ?? 'image/jpeg';
    // React Native's FormData accepts {uri,name,type}; cast to keep TS happy in DOM lib.
    form.append('avatar', { uri: asset.uri, name: fileName, type } as unknown as Blob);
    return this.request<{ success: boolean; url: string }>('/api/mobile/profile/avatar', {
      method: 'POST',
      body: form,
    });
  }

  async deleteAccount(): Promise<void> {
    await this.request('/api/mobile/profile', { method: 'DELETE' });
    await this.storage.remove(ACCESS_KEY);
    await this.storage.remove(REFRESH_KEY);
  }

  // ---------- garage ----------
  async getGarage(): Promise<Garage | Record<string, never>> {
    return this.request<Garage | Record<string, never>>('/api/mobile/garage');
  }

  // ---------- preferences ----------
  async getPreferences(): Promise<NotificationPreferences> {
    return this.request<NotificationPreferences>('/api/mobile/profile/preferences');
  }

  async updatePreferences(
    patch: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    return this.request<NotificationPreferences>('/api/mobile/profile/preferences', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  // ---------- services & reservations ----------
  async getServices(): Promise<Service[]> {
    return this.request<Service[]>('/api/mobile/services');
  }

  async getReservations(): Promise<Reservation[]> {
    return this.request<Reservation[]>('/api/mobile/reservations');
  }

  async getReservation(id: string): Promise<ReservationDetail> {
    return this.request<ReservationDetail>(`/api/mobile/reservations/${id}`);
  }

  async getAvailability(params: { year: number; month: number; duration?: number }): Promise<AvailabilityResponse> {
    const dur = params.duration ?? 60;
    return this.request<AvailabilityResponse>(
      `/api/mobile/reservations/availability?year=${params.year}&month=${params.month}&duration=${dur}`,
    );
  }

  async createReservation(input: CreateReservationInput): Promise<Reservation> {
    return this.request<Reservation>('/api/mobile/reservations', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async cancelReservation(id: string): Promise<void> {
    await this.request(`/api/mobile/reservations/${id}`, { method: 'DELETE' });
  }

  async rescheduleReservation(id: string, scheduledDate: string): Promise<Reservation> {
    return this.request<Reservation>(`/api/mobile/reservations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ scheduledDate }),
    });
  }

  // ---------- reviews ----------
  async listReviews(): Promise<Review[]> {
    return this.request<Review[]>('/api/mobile/reviews');
  }

  async submitReview(input: { rating: number; comment?: string; invoiceId?: string }): Promise<Review> {
    return this.request<Review>('/api/mobile/reviews', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  // ---------- notifications ----------
  async listNotifications(): Promise<NotificationItem[]> {
    return this.request<NotificationItem[]>('/api/mobile/notifications');
  }

  async getUnreadNotificationCount(): Promise<number> {
    const data = await this.request<{ count: number }>('/api/mobile/notifications/unread-count');
    return data.count;
  }

  async markNotificationRead(id: string): Promise<void> {
    await this.request(`/api/mobile/notifications/${id}/read`, { method: 'PATCH' });
  }

  async markAllNotificationsRead(): Promise<void> {
    await this.request('/api/mobile/notifications/mark-all-read', { method: 'POST' });
  }

  // ---------- devices (push) ----------
  async registerDevice(input: DeviceRegisterInput): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>('/api/mobile/devices/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async unregisterDevice(token: string): Promise<void> {
    await this.request(`/api/mobile/devices/${encodeURIComponent(token)}`, { method: 'DELETE' });
  }

  // ---------- chat ----------
  async listConversations(): Promise<ChatConversation[]> {
    return this.request<ChatConversation[]>('/api/mobile/chat/conversations');
  }

  async createConversation(input: { title?: string; participantIds: string[]; type?: string }): Promise<ChatConversation> {
    return this.request<ChatConversation>('/api/mobile/chat/conversations', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    return this.request<ChatMessage[]>(`/api/mobile/chat/conversations/${conversationId}/messages`);
  }

  async sendMessage(conversationId: string, input: { content?: string; attachments?: { url: string; fileName?: string; fileType?: 'image' | 'video' | 'document'; mimeType?: string; fileSize?: number }[] }): Promise<ChatMessage> {
    return this.request<ChatMessage>(`/api/mobile/chat/conversations/${conversationId}/messages`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async markConversationRead(conversationId: string): Promise<void> {
    await this.request(`/api/mobile/chat/conversations/${conversationId}/read`, { method: 'POST' });
  }

  // ---------- uploads ----------
  async uploadImage(asset: { uri: string; name?: string; type?: string }): Promise<UploadResult> {
    const form = new FormData();
    const fileName = asset.name ?? `upload_${Date.now()}.jpg`;
    const type = asset.type ?? 'image/jpeg';
    form.append('image', { uri: asset.uri, name: fileName, type } as unknown as Blob);
    const res = await this.request<{ url?: string; filePath?: string; fileName?: string; mimeType?: string; fileSize?: number }>(
      '/api/mobile/upload',
      { method: 'POST', body: form },
    );
    return {
      url: (res.url || res.filePath) as string,
      fileName: res.fileName,
      mimeType: res.mimeType,
      fileSize: res.fileSize,
    };
  }

  // ---------- realtime (WebSocket) ----------
  async openWebSocket(): Promise<WebSocket> {
    const token = await this.storage.get(ACCESS_KEY);
    if (!token) throw new Error('Not authenticated');
    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + `/ws?token=${encodeURIComponent(token)}`;
    return new WebSocket(wsUrl);
  }

  // ---------- quotes ----------
  async getQuotes(params: { limit?: number; offset?: number } = {}): Promise<Paginated<QuoteSummary>> {
    const limit = params.limit ?? 20;
    const offset = params.offset ?? 0;
    return this.request<Paginated<QuoteSummary>>(
      `/api/mobile/quotes?limit=${limit}&offset=${offset}`,
    );
  }

  async getQuote(id: string): Promise<QuoteDetail> {
    return this.request<QuoteDetail>(`/api/mobile/quotes/${id}`);
  }

  async acceptQuote(id: string): Promise<QuoteSummary> {
    return this.request<QuoteSummary>(`/api/mobile/quotes/${id}/accept`, { method: 'POST' });
  }

  async getQuoteShareLink(id: string): Promise<ViewLink> {
    return this.request<ViewLink>(`/api/mobile/quotes/${id}/view-link`, { method: 'POST' });
  }

  quotePdfUrl(id: string): string {
    return this.url(`/api/mobile/quotes/${id}/pdf`);
  }

  // ---------- invoices ----------
  async getInvoices(params: { limit?: number; offset?: number } = {}): Promise<Paginated<InvoiceSummary>> {
    const limit = params.limit ?? 20;
    const offset = params.offset ?? 0;
    return this.request<Paginated<InvoiceSummary>>(
      `/api/mobile/invoices?limit=${limit}&offset=${offset}`,
    );
  }

  async getInvoice(id: string): Promise<InvoiceDetail> {
    return this.request<InvoiceDetail>(`/api/mobile/invoices/${id}`);
  }

  async getInvoiceShareLink(id: string): Promise<ViewLink> {
    return this.request<ViewLink>(`/api/mobile/invoices/${id}/view-link`, { method: 'POST' });
  }

  invoicePdfUrl(id: string): string {
    return this.url(`/api/mobile/invoices/${id}/pdf`);
  }

  // ---------- payments ----------
  async getPaymentConfig(): Promise<PaymentConfig> {
    return this.request<PaymentConfig>('/api/mobile/payment/config');
  }

  async createInvoicePaymentIntent(invoiceId: string): Promise<PaymentIntentResult> {
    return this.request<PaymentIntentResult>(
      `/api/mobile/invoices/${invoiceId}/payment-intent`,
      { method: 'POST' },
    );
  }

  // ---------- catalogue services (public) ----------
  async getPublicServices(): Promise<Service[]> {
    return this.request<Service[]>('/api/mobile/public/services');
  }

  // ---------- configurateur ----------
  async configuratorEstimate(configuration: ConfiguratorConfig): Promise<ConfiguratorEstimate> {
    return this.request<ConfiguratorEstimate>('/api/mobile/configurator/estimate', {
      method: 'POST',
      body: JSON.stringify(configuration),
    });
  }

  async configuratorQuoteRequest(input: {
    configuration: ConfiguratorConfig;
    notes?: string;
    photoUrls?: string[];
  }): Promise<{ success: boolean; quoteId: string; message?: string }> {
    return this.request(
      '/api/mobile/configurator/quote-request',
      { method: 'POST', body: JSON.stringify(input) },
    );
  }

  // ---------- AR — wheel detection (server-side) ----------
  async detectWheels(asset: { uri: string; name?: string; type?: string }): Promise<{
    positions: Array<{ x: number; y: number; radius: number }>;
  }> {
    const form = new FormData();
    form.append('image', {
      uri: asset.uri,
      name: asset.name ?? 'photo.jpg',
      type: asset.type ?? 'image/jpeg',
    } as unknown as Blob);
    return this.request('/api/mobile/ar/detect-wheels', {
      method: 'POST',
      body: form as unknown as BodyInit,
    });
  }

  async analyzeWheelImage(asset: { uri: string; name?: string; type?: string }): Promise<{
    analysis?: string;
    diameter?: string;
    finish?: string;
    color?: string;
    confidence?: number;
    notes?: string;
  }> {
    const form = new FormData();
    form.append('image', {
      uri: asset.uri,
      name: asset.name ?? 'wheel.jpg',
      type: asset.type ?? 'image/jpeg',
    } as unknown as Blob);
    return this.request('/api/mobile/wheel-simulator/analyze', {
      method: 'POST',
      body: form as unknown as BodyInit,
    });
  }

  // ---------- AR composite (server-rendered shareable image) ----------
  async composeARImage(input: {
    asset: { uri: string; name?: string; type?: string };
    wheels: Array<{ x: number; y: number; radius: number }>;
    color: string;
  }): Promise<Blob> {
    const form = new FormData();
    form.append('image', {
      uri: input.asset.uri,
      name: input.asset.name ?? 'photo.jpg',
      type: input.asset.type ?? 'image/jpeg',
    } as unknown as Blob);
    form.append('wheels', JSON.stringify(input.wheels));
    form.append('color', input.color);
    const url = this.url('/api/mobile/ar/composite');
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { Accept: 'image/jpeg', ...(await this.authHeader()) },
      body: form as unknown as BodyInit,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `Composite HTTP ${res.status}`);
    }
    return await res.blob();
  }

  // ---------- Configurator dynamic settings ----------
  async getConfiguratorConfig(): Promise<ConfiguratorSettings> {
    return this.request<ConfiguratorSettings>('/api/mobile/wheel-simulator/config');
  }

  // ---------- public deep-link viewers (no auth) ----------
  async getPublicQuote(token: string): Promise<PublicQuote> {
    return this.request<PublicQuote>(`/api/mobile/public/quotes/${token}`);
  }
  async acceptPublicQuote(token: string): Promise<{ status: string; message: string }> {
    return this.request(`/api/mobile/public/quotes/${token}/accept`, { method: 'POST' });
  }
  async rejectPublicQuote(token: string): Promise<{ status: string; message: string }> {
    return this.request(`/api/mobile/public/quotes/${token}/reject`, { method: 'POST' });
  }
  async getPublicInvoice(token: string): Promise<PublicInvoice> {
    return this.request<PublicInvoice>(`/api/mobile/public/invoices/${token}`);
  }
  async createPublicInvoiceCheckout(token: string): Promise<{ sessionId: string; url: string }> {
    return this.request(`/api/mobile/public/invoices/${token}/create-checkout`, {
      method: 'POST',
    });
  }
  async getPublicReview(token: string): Promise<PublicReview> {
    return this.request<PublicReview>(`/api/mobile/public/reviews/${token}`);
  }
  async submitPublicReview(
    token: string,
    body: { rating: number; comment?: string },
  ): Promise<{ message: string }> {
    return this.request(`/api/mobile/public/reviews/${token}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
  async getPublicReservation(token: string): Promise<PublicReservation> {
    return this.request<PublicReservation>(
      `/api/mobile/public/reservations/${encodeURIComponent(token)}`,
    );
  }
  async confirmPublicReservation(token: string): Promise<{ status: string }> {
    return this.request(
      `/api/mobile/public/reservations/${encodeURIComponent(token)}/confirm`,
      { method: 'POST' },
    );
  }
  async cancelPublicReservation(token: string): Promise<{ status: string }> {
    return this.request(
      `/api/mobile/public/reservations/${encodeURIComponent(token)}/cancel`,
      { method: 'POST' },
    );
  }

  async resolvePublicToken(
    kind: 'devis' | 'facture' | 'avis' | 'reservation',
    token: string,
  ): Promise<{ ownerId: string | null; resourceId: string }> {
    return this.request(
      `/api/mobile/public/resolve-token?kind=${kind}&token=${encodeURIComponent(token)}`,
    );
  }

  // ---------- admin ----------
  async adminGetDashboard(): Promise<AdminDashboardStats> {
    return this.request<AdminDashboardStats>('/api/mobile/admin/dashboard');
  }

  async adminGetClients(params: { limit?: number; offset?: number } = {}): Promise<AdminClientSummary[]> {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    return this.request<AdminClientSummary[]>(
      `/api/mobile/admin/clients?limit=${limit}&offset=${offset}`,
    );
  }

  async adminGetClient(id: string): Promise<AdminClientDetail> {
    return this.request<AdminClientDetail>(`/api/mobile/admin/clients/${id}`);
  }

  async adminUpdateQuoteStatus(id: string, status: QuoteStatus): Promise<QuoteSummary> {
    return this.request<QuoteSummary>(`/api/mobile/admin/quotes/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async adminUpdateInvoiceStatus(id: string, status: InvoiceStatus): Promise<InvoiceSummary> {
    return this.request<InvoiceSummary>(`/api/mobile/admin/invoices/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async adminUpdateReservationStatus(
    id: string,
    status: ReservationStatus,
  ): Promise<Reservation> {
    return this.request<Reservation>(`/api/mobile/admin/reservations/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }
}

// ---------- Admin types ----------
export interface AdminDashboardStats {
  totalClients: number;
  totalQuotes: number;
  totalInvoices: number;
  totalReservations: number;
  pendingQuotes: number;
  pendingReservations: number;
  monthlyRevenue: number;
  forecastRevenue: number;
}

export interface AdminClientSummary {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  role: Role;
  companyName?: string | null;
  createdAt?: string | null;
  quotesCount?: number;
  invoicesCount?: number;
}

export interface AdminClientDetail extends AdminClientSummary {
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  siret?: string | null;
  tvaNumber?: string | null;
  quotes?: QuoteSummary[];
  invoices?: InvoiceSummary[];
  reservations?: Reservation[];
}

// ---------- Configurateur types ----------
export interface ConfiguratorSettings {
  prices?: Record<string, number>;
  colors?: Array<{ name: string; hex: string }>;
  finishes?: string[];
  sizes?: string[];
  maxPhotos?: number;
  enabledOptions?: string[];
}

export interface ConfiguratorConfig {
  serviceType: string; // e.g. "renovation", "personnalisation", "polissage"
  color: string;
  finish: 'mat' | 'brillant' | 'satine' | 'metallise' | string;
  size: string; // diamètre en pouces
  wheelCount: number;
  accessories: string[];
}

export interface ConfiguratorEstimate {
  totalHT: number;
  tva: number;
  totalTTC: number;
  perWheel: number;
  count: number;
}

// ---------- Public deep-link types ----------
export interface PublicQuote {
  quote: {
    id: string;
    reference?: string | null;
    status: string;
    quoteAmount?: string | null;
    notes?: string | null;
    validUntil?: string | null;
    createdAt?: string | null;
    wheelCount?: number | null;
    diameter?: string | null;
    vehicleMake?: string | null;
    vehicleModel?: string | null;
    vehicleRegistration?: string | null;
  };
  client: { name: string } | null;
  items: Array<{
    description: string;
    quantity: number;
    unitPriceExcludingTax: string;
    totalIncludingTax: string;
  }>;
  garage: PublicGarageInfo;
}

export interface PublicInvoice {
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    amount: string;
    notes?: string | null;
    dueDate?: string | null;
    paidAt?: string | null;
    createdAt?: string | null;
  };
  client: { name: string } | null;
  items: Array<{
    description: string;
    quantity: number;
    unitPriceExcludingTax: string;
    totalIncludingTax: string;
  }>;
  garage: PublicGarageInfo;
}

export interface PublicReview {
  reviewToken: string;
  hasReview: boolean;
  rating: number | null;
  invoiceNumber: string | null;
  clientName: string | null;
  garage: PublicGarageInfo | null;
}

export interface PublicReservation {
  reservation: {
    id: string;
    reference: string;
    status: string;
    scheduledDate: string;
    estimatedEndDate?: string | null;
    notes?: string | null;
  };
  service: { id: string; name: string; description?: string | null } | null;
  garage: PublicGarageInfo | null;
}

export interface PublicGarageInfo {
  name: string;
  logo?: string | null;
  primaryColor?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
}
