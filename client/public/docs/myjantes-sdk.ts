/**
 * MyJantes Mobile SDK
 * Version: 1.0.0
 */

export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: 'client' | 'admin' | 'employee' | 'superadmin';
  garageId?: string;
}

export interface Quote {
  id: string;
  clientId: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  amount: string;
  createdAt: string;
}

export class MyJantesClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'https://myjantes.replit.app/api') {
    this.baseUrl = baseUrl;
  }

  private async request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }
    return response.json();
  }

  // Auth
  async login(email: string, password: string) {
    return this.request('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async getCurrentUser(): Promise<User> {
    return this.request('/auth/user');
  }

  // Quotes
  async getMyQuotes(): Promise<Quote[]> {
    return this.request('/quotes');
  }

  // Media Upload Flow
  async requestUploadUrl(fileName: string, size: number, contentType: string) {
    return this.request('/uploads/request-url', {
      method: 'POST',
      body: JSON.stringify({ name: fileName, size, contentType }),
    });
  }

  async linkQuoteMedia(quoteId: string, fileName: string, objectPath: string, fileType: string) {
    return this.request(`/admin/quotes/${quoteId}/media`, {
      method: 'POST',
      body: JSON.stringify({ fileName, filePath: objectPath, fileType }),
    });
  }
}