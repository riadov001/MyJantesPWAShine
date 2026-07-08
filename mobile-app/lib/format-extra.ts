import type { Tone } from '@/components/Badge';

export function reservationStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'En attente';
    case 'confirmed':
      return 'Confirmée';
    case 'completed':
      return 'Terminée';
    case 'cancelled':
      return 'Annulée';
    default:
      return status;
  }
}

export function reservationStatusTone(status: string): Tone {
  switch (status) {
    case 'confirmed':
      return 'info';
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'danger';
    case 'pending':
    default:
      return 'warning';
  }
}

export function notificationTypeIcon(type: string): string {
  switch (type) {
    case 'reservation':
      return '📅';
    case 'invoice':
      return '🧾';
    case 'quote':
      return '📄';
    case 'chat':
      return '💬';
    case 'service':
      return '🛠️';
    default:
      return '🔔';
  }
}

export function formatTimeFR(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(d);
}

export function formatDateTimeFR(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
