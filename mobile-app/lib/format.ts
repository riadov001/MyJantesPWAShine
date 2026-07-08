export function formatEUR(amount: string | number | null | undefined): string {
  if (amount == null || amount === '') return '—';
  const n = typeof amount === 'number' ? amount : parseFloat(amount);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatDateFR(input: string | null | undefined): string {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

export function formatDateShortFR(input: string | null | undefined): string {
  if (!input) return '—';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function paymentMethodLabel(method?: string | null): string {
  switch (method) {
    case 'cash':
      return 'Espèces';
    case 'wire_transfer':
      return 'Virement';
    case 'card':
      return 'Carte';
    case 'stripe':
      return 'Stripe';
    case 'sepa':
      return 'SEPA';
    case 'klarna':
      return 'Klarna';
    case 'alma':
      return 'Alma';
    default:
      return method ?? '—';
  }
}

export function quoteStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'En attente';
    case 'approved':
      return 'Approuvé';
    case 'accepted':
      return 'Accepté';
    case 'rejected':
      return 'Refusé';
    case 'completed':
      return 'Terminé';
    default:
      return status;
  }
}

export function invoiceStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'En attente';
    case 'paid':
      return 'Payée';
    case 'overdue':
      return 'En retard';
    case 'cancelled':
      return 'Annulée';
    default:
      return status;
  }
}

export function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' | 'info' {
  switch (status) {
    case 'paid':
    case 'accepted':
    case 'completed':
    case 'approved':
      return 'success';
    case 'pending':
      return 'warning';
    case 'overdue':
    case 'rejected':
      return 'danger';
    case 'cancelled':
      return 'neutral';
    default:
      return 'info';
  }
}

export function errorMessage(err: unknown, fallback = 'Une erreur est survenue'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}
