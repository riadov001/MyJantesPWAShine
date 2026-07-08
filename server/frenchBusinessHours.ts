const BUSINESS_PERIODS = [
  { startHour: 9, startMin: 0, endHour: 12, endMin: 0 },
  { startHour: 13, startMin: 30, endHour: 18, endMin: 0 },
];

function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getFrenchHolidays(year: number): Set<string> {
  const holidays = new Set<string>();
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  holidays.add(`${year}-01-01`);
  holidays.add(`${year}-05-01`);
  holidays.add(`${year}-05-08`);
  holidays.add(`${year}-07-14`);
  holidays.add(`${year}-08-15`);
  holidays.add(`${year}-11-01`);
  holidays.add(`${year}-11-11`);
  holidays.add(`${year}-12-25`);

  const easter = getEasterDate(year);
  holidays.add(fmt(addDays(easter, 1)));
  holidays.add(fmt(addDays(easter, 39)));
  holidays.add(fmt(addDays(easter, 50)));

  return holidays;
}

function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  const year = date.getFullYear();
  const holidays = getFrenchHolidays(year);
  const dateStr = `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return !holidays.has(dateStr);
}

interface TimeSlot {
  start: string;
  end: string;
}

interface DaySlots {
  date: string;
  dayLabel: string;
  slots: TimeSlot[];
}

function generateSlotsForDay(date: Date, durationMinutes: number): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

  for (const period of BUSINESS_PERIODS) {
    let currentMin = period.startHour * 60 + period.startMin;
    const periodEnd = period.endHour * 60 + period.endMin;

    while (currentMin + durationMinutes <= periodEnd) {
      const startH = Math.floor(currentMin / 60);
      const startM = currentMin % 60;
      const endTotal = currentMin + durationMinutes;
      const endH = Math.floor(endTotal / 60);
      const endM = endTotal % 60;

      slots.push({
        start: `${dateStr}T${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}:00`,
        end: `${dateStr}T${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:00`,
      });

      currentMin += 30;
    }
  }

  return slots;
}

function slotsOverlap(s1Start: Date, s1End: Date, s2Start: Date, s2End: Date): boolean {
  return s1Start < s2End && s2Start < s1End;
}

export interface AvailableSlot {
  start: string;
  end: string;
}

export interface AvailableDay {
  date: string;
  dayLabel: string;
  dayOfWeek: string;
  slots: AvailableSlot[];
}

const WEEKDAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

export function getAvailableSlots(
  year: number,
  month: number,
  durationMinutes: number,
  existingReservations: Array<{ scheduledDate: string | Date; estimatedEndDate?: string | Date | null; durationMinutes?: number }>
): AvailableDay[] {
  const duration = durationMinutes || 60;
  const result: AvailableDay[] = [];

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const reservationRanges = existingReservations
    .filter(r => r.scheduledDate)
    .map(r => {
      const start = new Date(r.scheduledDate);
      let end: Date;
      if (r.estimatedEndDate) {
        end = new Date(r.estimatedEndDate);
      } else {
        end = new Date(start.getTime() + (r.durationMinutes || 60) * 60000);
      }
      return { start, end };
    });

  for (let d = new Date(firstDay); d <= lastDay; d = addDays(d, 1)) {
    if (d < today) continue;
    if (!isBusinessDay(d)) continue;

    const daySlots = generateSlotsForDay(d, duration);
    const availableSlots = daySlots.filter(slot => {
      const slotStart = new Date(slot.start);
      const slotEnd = new Date(slot.end);

      if (slotStart.getTime() === today.getTime() || d.toDateString() === new Date().toDateString()) {
        const now = new Date();
        now.setMinutes(now.getMinutes() + 30);
        if (slotStart <= now) return false;
      }

      return !reservationRanges.some(r => slotsOverlap(slotStart, slotEnd, r.start, r.end));
    });

    if (availableSlots.length > 0) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      result.push({
        date: dateStr,
        dayLabel: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
        dayOfWeek: WEEKDAY_LABELS[d.getDay()],
        slots: availableSlots,
      });
    }
  }

  return result;
}

export function getBusinessHoursInfo() {
  return {
    periods: BUSINESS_PERIODS.map(p => ({
      start: `${String(p.startHour).padStart(2, '0')}:${String(p.startMin).padStart(2, '0')}`,
      end: `${String(p.endHour).padStart(2, '0')}:${String(p.endMin).padStart(2, '0')}`,
    })),
    days: 'Lundi - Vendredi',
    excludes: 'Weekends et jours fériés',
  };
}

export function validateSlotWithinBusinessHours(slotStart: Date, slotEnd: Date): { valid: boolean; reason?: string } {
  if (!isBusinessDay(slotStart)) {
    return { valid: false, reason: "Ce jour n'est pas un jour ouvré" };
  }

  const startMinutes = slotStart.getHours() * 60 + slotStart.getMinutes();
  const endMinutes = slotEnd.getHours() * 60 + slotEnd.getMinutes();

  const inPeriod = BUSINESS_PERIODS.some(p => {
    const pStart = p.startHour * 60 + p.startMin;
    const pEnd = p.endHour * 60 + p.endMin;
    return startMinutes >= pStart && endMinutes <= pEnd;
  });

  if (!inPeriod) {
    return { valid: false, reason: "Le créneau est en dehors des horaires d'ouverture (9h-12h, 13h30-18h)" };
  }

  return { valid: true };
}

export function getOccupiedRanges(
  year: number,
  month: number,
  existingReservations: Array<{ scheduledDate: string | Date; estimatedEndDate?: string | Date | null; durationMinutes?: number }>
): Record<string, Array<{ start: string; end: string }>> {
  const result: Record<string, Array<{ start: string; end: string }>> = {};

  const reservationRanges = existingReservations
    .filter(r => r.scheduledDate)
    .map(r => {
      const start = new Date(r.scheduledDate);
      let end: Date;
      if (r.estimatedEndDate) {
        end = new Date(r.estimatedEndDate);
      } else {
        end = new Date(start.getTime() + (r.durationMinutes || 60) * 60000);
      }
      return { start, end };
    });

  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  for (let d = new Date(firstDay); d <= lastDay; d = addDays(d, 1)) {
    if (!isBusinessDay(d)) continue;
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayRanges = reservationRanges
      .filter(r => {
        const rDateStr = `${r.start.getFullYear()}-${String(r.start.getMonth() + 1).padStart(2, '0')}-${String(r.start.getDate()).padStart(2, '0')}`;
        return rDateStr === dateStr;
      })
      .map(r => ({
        start: r.start.toISOString(),
        end: r.end.toISOString(),
      }));
    if (dayRanges.length > 0) {
      result[dateStr] = dayRanges;
    }
  }

  return result;
}

export function getMonthHolidays(year: number, month: number): Array<{ date: string; label: string }> {
  const holidays = getFrenchHolidays(year);
  const labels: Record<string, string> = {};
  labels[`${year}-01-01`] = "Jour de l'An";
  labels[`${year}-05-01`] = "Fête du Travail";
  labels[`${year}-05-08`] = "Victoire 1945";
  labels[`${year}-07-14`] = "Fête Nationale";
  labels[`${year}-08-15`] = "Assomption";
  labels[`${year}-11-01`] = "Toussaint";
  labels[`${year}-11-11`] = "Armistice 1918";
  labels[`${year}-12-25`] = "Noël";
  const easter = getEasterDate(year);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  labels[fmt(addDays(easter, 1))] = "Lundi de Pâques";
  labels[fmt(addDays(easter, 39))] = "Ascension";
  labels[fmt(addDays(easter, 50))] = "Lundi de Pentecôte";

  const result: Array<{ date: string; label: string }> = [];
  for (const dateStr of holidays) {
    const [hYear, hMonth] = dateStr.split('-').map(Number);
    if (hYear === year && hMonth === month) {
      result.push({ date: dateStr, label: labels[dateStr] || "Jour férié" });
    }
  }
  return result;
}

export { isBusinessDay, getFrenchHolidays };
