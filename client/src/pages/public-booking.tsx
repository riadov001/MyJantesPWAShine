import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar as CalendarIcon,
  Clock,
  ChevronLeft,
  ChevronRight,
  Check,
  Loader2,
  Wrench,
  MapPin,
  Phone,
  Mail,
  ArrowLeft,
  Info,
} from "lucide-react";

interface AvailableSlot {
  start: string;
  end: string;
}

interface AvailableDay {
  date: string;
  dayLabel: string;
  dayOfWeek: string;
  slots: AvailableSlot[];
}

interface HolidayInfo {
  date: string;
  label: string;
}

interface SlotsResponse {
  service: { name: string; duration: number };
  businessHours: { periods: { start: string; end: string }[]; days: string };
  days: AvailableDay[];
  occupiedRanges: Record<string, Array<{ start: string; end: string }>>;
  holidays: HolidayInfo[];
  month: string;
}

interface ReservationInfo {
  id: string;
  reference: string;
  scheduledDate: string;
  estimatedEndDate: string;
  status: string;
  service: string;
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

const statusLabels: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente de confirmation", className: "bg-amber-100 text-amber-800" },
  confirmed: { label: "Confirmé", className: "bg-green-100 text-green-800" },
  completed: { label: "Terminé", className: "bg-blue-100 text-blue-800" },
  cancelled: { label: "Annulé", className: "bg-red-100 text-red-800" },
};

const TIMELINE_START = 9 * 60;
const TIMELINE_END = 18 * 60;
const LUNCH_START = 12 * 60;
const LUNCH_END = 13 * 60 + 30;
const TIMELINE_TOTAL = TIMELINE_END - TIMELINE_START;

function minutesFromMidnight(isoStr: string): number {
  const d = new Date(isoStr);
  return d.getHours() * 60 + d.getMinutes();
}

function DayAgendaView({
  day,
  occupiedRanges,
  selectedSlot,
  onSelectSlot,
  primaryColor,
}: {
  day: AvailableDay;
  occupiedRanges: Array<{ start: string; end: string }>;
  selectedSlot: AvailableSlot | null;
  onSelectSlot: (slot: AvailableSlot) => void;
  primaryColor: string;
}) {
  const hours = [];
  for (let h = 9; h <= 18; h++) {
    hours.push(h);
  }

  return (
    <div className="space-y-3" data-testid="day-agenda-view">
      <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground mb-2">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-300 dark:border-emerald-700" />
          Disponible
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800" />
          Occupé
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm bg-muted border border-border" />
          Pause
        </span>
      </div>

      <div className="relative border rounded-md overflow-hidden" data-testid="timeline-container">
        <div className="flex">
          <div className="w-12 shrink-0 border-r bg-muted/30">
            {hours.map((h) => {
              const top = ((h * 60 - TIMELINE_START) / TIMELINE_TOTAL) * 100;
              return (
                <div
                  key={h}
                  className="absolute text-[10px] text-muted-foreground font-medium"
                  style={{ top: `${top}%`, left: 2, transform: "translateY(-50%)" }}
                >
                  {String(h).padStart(2, "0")}h
                </div>
              );
            })}
          </div>

          <div className="flex-1 relative" style={{ height: 480 }}>
            <div
              className="absolute left-0 right-0 bg-muted/50 border-y border-dashed border-border"
              style={{
                top: `${((LUNCH_START - TIMELINE_START) / TIMELINE_TOTAL) * 100}%`,
                height: `${((LUNCH_END - LUNCH_START) / TIMELINE_TOTAL) * 100}%`,
              }}
              data-testid="lunch-break"
            >
              <span className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground font-medium">
                Pause déjeuner
              </span>
            </div>

            {hours.map((h) => {
              const top = ((h * 60 - TIMELINE_START) / TIMELINE_TOTAL) * 100;
              return (
                <div
                  key={h}
                  className="absolute left-0 right-0 border-t border-border/30"
                  style={{ top: `${top}%` }}
                />
              );
            })}

            {occupiedRanges.map((range, i) => {
              const startMin = minutesFromMidnight(range.start);
              const endMin = minutesFromMidnight(range.end);
              const clampedStart = Math.max(startMin, TIMELINE_START);
              const clampedEnd = Math.min(endMin, TIMELINE_END);
              if (clampedStart >= clampedEnd) return null;
              const top = ((clampedStart - TIMELINE_START) / TIMELINE_TOTAL) * 100;
              const height = ((clampedEnd - clampedStart) / TIMELINE_TOTAL) * 100;
              return (
                <div
                  key={`occ-${i}`}
                  className="absolute left-1 right-1 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-sm flex items-center justify-center"
                  style={{ top: `${top}%`, height: `${height}%`, minHeight: 16, zIndex: 10 }}
                  data-testid={`occupied-block-${i}`}
                >
                  <span className="text-[10px] text-red-500 dark:text-red-400 font-medium">Réservé</span>
                </div>
              );
            })}

            {day.slots.map((slot) => {
              const startMin = minutesFromMidnight(slot.start);
              const endMin = minutesFromMidnight(slot.end);
              const top = ((startMin - TIMELINE_START) / TIMELINE_TOTAL) * 100;
              const height = ((endMin - startMin) / TIMELINE_TOTAL) * 100;
              const isSelected = selectedSlot?.start === slot.start;
              return (
                <button
                  key={slot.start}
                  onClick={() => onSelectSlot(slot)}
                  className={`absolute left-1 right-1 rounded-sm border transition-all cursor-pointer
                    ${isSelected
                      ? "text-white border-transparent z-30 shadow-md"
                      : "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 z-20"
                    }
                  `}
                  style={{
                    top: `${top}%`,
                    height: `${Math.max(height, 2.5)}%`,
                    minHeight: 20,
                    ...(isSelected ? { backgroundColor: primaryColor } : {}),
                  }}
                  data-testid={`agenda-slot-${formatTime(slot.start).replace(":", "")}`}
                >
                  <span className={`text-[10px] font-medium ${isSelected ? "text-white" : "text-emerald-700 dark:text-emerald-300"}`}>
                    {formatTime(slot.start)} - {formatTime(slot.end)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PublicBooking() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [selectedDay, setSelectedDay] = useState<AvailableDay | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [clientNotes, setClientNotes] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<"calendar" | "agenda">("calendar");

  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  const { data: existingRes } = useQuery<{ reservation: ReservationInfo | null }>({
    queryKey: ["/api/public/quotes", token, "reservation"],
    queryFn: async () => {
      const res = await fetch(`/api/public/quotes/${token}/reservation`);
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    enabled: !!token,
  });

  const { data: quoteData } = useQuery<{ quote: any; garage: any; client: any }>({
    queryKey: ["/api/public/quotes", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/quotes/${token}`);
      if (!res.ok) throw new Error("Erreur");
      return res.json();
    },
    enabled: !!token,
  });

  const { data: slotsData, isLoading: slotsLoading } = useQuery<SlotsResponse>({
    queryKey: ["/api/public/quotes", token, "available-slots", currentMonth],
    queryFn: async () => {
      const res = await fetch(`/api/public/quotes/${token}/available-slots?month=${currentMonth}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    enabled: !!token && (!existingRes || !existingRes.reservation),
  });

  const bookMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSlot) throw new Error("Aucun créneau sélectionné");
      const res = await fetch(`/api/public/quotes/${token}/book`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotStart: selectedSlot.start, slotEnd: selectedSlot.end, clientNotes }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Réservation enregistrée", description: "Vous recevrez une confirmation par email." });
      setShowConfirm(false);
      setSelectedSlot(null);
      setSelectedDay(null);
      queryClient.invalidateQueries({ queryKey: ["/api/public/quotes", token, "reservation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/quotes", token, "available-slots"] });
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const garage = quoteData?.garage;
  const primaryColor = garage?.primaryColor || "#dc2626";
  const garageName = garage?.name || "MyJantes";

  const navigateMonth = (direction: number) => {
    const [y, m] = currentMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + direction, 1);
    setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    setSelectedDay(null);
    setSelectedSlot(null);
    setShowConfirm(false);
  };

  const monthLabel = (() => {
    const [y, m] = currentMonth.split("-").map(Number);
    return new Date(y, m - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  })();

  const holidayDates = new Set(slotsData?.holidays?.map(h => h.date) || []);
  const holidayLabels: Record<string, string> = {};
  slotsData?.holidays?.forEach(h => { holidayLabels[h.date] = h.label; });

  const calendarDays = (() => {
    const [y, m] = currentMonth.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const last = new Date(y, m, 0);
    const startDay = (first.getDay() + 6) % 7;
    const days: Array<{ date: string; day: number; available: boolean; isCurrentMonth: boolean; isWeekend: boolean; isHoliday: boolean; holidayLabel?: string }> = [];

    for (let i = 0; i < startDay; i++) {
      const d = new Date(y, m - 1, -startDay + i + 1);
      days.push({ date: "", day: d.getDate(), available: false, isCurrentMonth: false, isWeekend: false, isHoliday: false });
    }

    const availableDates = new Set(slotsData?.days.map(d => d.date) || []);
    for (let d = 1; d <= last.getDate(); d++) {
      const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dateObj = new Date(y, m - 1, d);
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = holidayDates.has(dateStr);
      days.push({
        date: dateStr,
        day: d,
        available: availableDates.has(dateStr),
        isCurrentMonth: true,
        isWeekend,
        isHoliday,
        holidayLabel: holidayLabels[dateStr],
      });
    }

    return days;
  })();

  const weekDays = (() => {
    if (!selectedDay || viewMode !== "agenda") return [];
    const selDate = new Date(selectedDay.date + "T00:00:00");
    const dayOfWeek = (selDate.getDay() + 6) % 7;
    const mondayDate = new Date(selDate);
    mondayDate.setDate(selDate.getDate() - dayOfWeek);
    const result = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(mondayDate);
      d.setDate(mondayDate.getDate() + i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dayData = slotsData?.days.find(dd => dd.date === dateStr);
      const isHoliday = holidayDates.has(dateStr);
      result.push({
        date: dateStr,
        dateObj: d,
        dayData,
        isHoliday,
        holidayLabel: holidayLabels[dateStr],
        isSelected: dateStr === selectedDay?.date,
      });
    }
    return result;
  })();

  if (existingRes?.reservation) {
    const r = existingRes.reservation;
    const st = statusLabels[r.status] || statusLabels.pending;
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
        <div className="max-w-md mx-auto space-y-4">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold" style={{ color: primaryColor }} data-testid="text-garage-name">{garageName}</h1>
            <p className="text-sm text-muted-foreground mt-1">Votre réservation</p>
          </div>

          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-semibold text-lg" data-testid="text-reservation-ref">{r.reference}</h2>
              <Badge className={st.className} data-testid="badge-reservation-status">{st.label}</Badge>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
                <span data-testid="text-service-name">{r.service}</span>
              </div>
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span data-testid="text-reservation-date">{formatDate(r.scheduledDate)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span data-testid="text-reservation-time">
                  {formatTime(r.scheduledDate)}
                  {r.estimatedEndDate ? ` - ${formatTime(r.estimatedEndDate)}` : ""}
                </span>
              </div>
            </div>

            {r.status === "pending" && (
              <p className="text-xs text-muted-foreground mt-2">
                Notre équipe va confirmer votre rendez-vous rapidement. Vous recevrez un email de confirmation.
              </p>
            )}
            {r.status === "confirmed" && (
              <div className="flex items-center gap-2 text-green-600 mt-2">
                <Check className="h-4 w-4" />
                <span className="text-sm font-medium">Rendez-vous confirmé, nous vous attendons !</span>
              </div>
            )}
          </Card>

          <Button variant="outline" className="w-full" onClick={() => window.history.back()} data-testid="button-back-quote">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour au devis
          </Button>

          {garage && (
            <div className="text-center text-xs text-muted-foreground space-y-1 pt-4">
              {garage.address && (
                <p className="flex items-center justify-center gap-1 flex-wrap">
                  <MapPin className="h-3 w-3" />
                  {garage.address}{garage.postalCode ? `, ${garage.postalCode}` : ""}{garage.city ? ` ${garage.city}` : ""}
                </p>
              )}
              {garage.phone && (
                <p className="flex items-center justify-center gap-1">
                  <Phone className="h-3 w-3" />
                  <a href={`tel:${garage.phone}`}>{garage.phone}</a>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (showConfirm && selectedSlot && selectedDay) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
        <div className="max-w-md mx-auto space-y-4">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold" style={{ color: primaryColor }}>{garageName}</h1>
            <p className="text-sm text-muted-foreground mt-1">Confirmer votre réservation</p>
          </div>

          <Card className="p-6 space-y-4">
            <h2 className="font-semibold text-lg">Récapitulatif</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
                <span data-testid="text-confirm-service">{slotsData?.service.name}</span>
                <Badge variant="secondary" className="text-xs">{durationLabel(slotsData?.service.duration || 60)}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span data-testid="text-confirm-date">{selectedDay.dayLabel}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span data-testid="text-confirm-time">{formatTime(selectedSlot.start)} - {formatTime(selectedSlot.end)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Remarques (optionnel)</label>
              <Textarea
                value={clientNotes}
                onChange={(e) => setClientNotes(e.target.value)}
                placeholder="Informations complémentaires..."
                className="resize-none text-sm"
                data-testid="textarea-client-notes"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)} data-testid="button-back-slots">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retour
              </Button>
              <Button
                className="flex-1 text-white"
                style={{ backgroundColor: primaryColor }}
                onClick={() => bookMutation.mutate()}
                disabled={bookMutation.isPending}
                data-testid="button-confirm-booking"
              >
                {bookMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                Confirmer
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold" style={{ color: primaryColor }} data-testid="text-booking-title">{garageName}</h1>
          <p className="text-sm text-muted-foreground mt-1">Réservez votre créneau</p>
          {slotsData?.service && (
            <div className="flex items-center justify-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs" data-testid="badge-service-info">
                <Wrench className="h-3 w-3 mr-1" />
                {slotsData.service.name} - {durationLabel(slotsData.service.duration)}
              </Badge>
            </div>
          )}
        </div>

        <Card className="p-4">
          <div className="flex items-center justify-between gap-2 mb-4">
            <Button size="icon" variant="ghost" onClick={() => navigateMonth(-1)} data-testid="button-prev-month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold capitalize" data-testid="text-current-month">{monthLabel}</h3>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={viewMode === "calendar" ? "default" : "outline"}
                  onClick={() => setViewMode("calendar")}
                  className="text-xs h-7 px-2"
                  data-testid="button-view-calendar"
                >
                  <CalendarIcon className="h-3 w-3 mr-1" />
                  Mois
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "agenda" ? "default" : "outline"}
                  onClick={() => setViewMode("agenda")}
                  className="text-xs h-7 px-2"
                  disabled={!selectedDay}
                  data-testid="button-view-agenda"
                >
                  <Clock className="h-3 w-3 mr-1" />
                  Agenda
                </Button>
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => navigateMonth(1)} data-testid="button-next-month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {slotsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : viewMode === "calendar" ? (
            <>
              <div className="grid grid-cols-7 gap-1 text-center text-xs mb-2">
                {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(d => (
                  <div key={d} className="font-medium text-muted-foreground py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, i) => {
                  const isSelected = selectedDay?.date === day.date;
                  return (
                    <button
                      key={i}
                      disabled={!day.available || !day.isCurrentMonth}
                      onClick={() => {
                        if (day.available) {
                          const found = slotsData?.days.find(d => d.date === day.date);
                          setSelectedDay(found || null);
                          setSelectedSlot(null);
                        }
                      }}
                      className={`
                        aspect-square rounded-md text-sm flex flex-col items-center justify-center transition-colors relative
                        ${!day.isCurrentMonth ? "text-muted-foreground/30" : ""}
                        ${day.available && !isSelected ? "font-medium hover-elevate cursor-pointer" : ""}
                        ${day.available && !isSelected ? "text-foreground" : ""}
                        ${!day.available && day.isCurrentMonth && !day.isWeekend && !day.isHoliday ? "text-muted-foreground/50" : ""}
                        ${day.isWeekend && day.isCurrentMonth ? "text-muted-foreground/30 bg-muted/30" : ""}
                        ${day.isHoliday && day.isCurrentMonth ? "text-muted-foreground/40 bg-amber-50 dark:bg-amber-950/20" : ""}
                        ${isSelected ? "text-white font-bold" : ""}
                      `}
                      style={isSelected ? { backgroundColor: primaryColor } : undefined}
                      title={day.isHoliday ? day.holidayLabel : day.isWeekend && day.isCurrentMonth ? "Weekend" : undefined}
                      data-testid={day.isCurrentMonth ? `day-${day.day}` : undefined}
                    >
                      {day.day}
                      {day.isHoliday && day.isCurrentMonth && !isSelected && (
                        <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-amber-400" />
                      )}
                      {day.available && !isSelected && (
                        <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-emerald-500" />
                      )}
                    </button>
                  );
                })}
              </div>

              {slotsData?.holidays && slotsData.holidays.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {slotsData.holidays.map(h => (
                    <Badge key={h.date} variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                      {new Date(h.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })} - {h.label}
                    </Badge>
                  ))}
                </div>
              )}
            </>
          ) : selectedDay ? (
            <>
              <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
                {weekDays.map(wd => {
                  const hasSlots = wd.dayData && wd.dayData.slots.length > 0;
                  return (
                    <button
                      key={wd.date}
                      onClick={() => {
                        if (wd.dayData) {
                          setSelectedDay(wd.dayData);
                          setSelectedSlot(null);
                        }
                      }}
                      disabled={!hasSlots}
                      className={`flex-1 min-w-0 py-2 px-1 rounded-md text-center transition-colors border
                        ${wd.isSelected ? "text-white border-transparent" : "border-border"}
                        ${hasSlots && !wd.isSelected ? "hover-elevate cursor-pointer" : ""}
                        ${!hasSlots ? "opacity-40" : ""}
                        ${wd.isHoliday ? "bg-amber-50 dark:bg-amber-950/20" : ""}
                      `}
                      style={wd.isSelected ? { backgroundColor: primaryColor } : undefined}
                      data-testid={`week-day-${wd.dateObj.getDay()}`}
                    >
                      <div className={`text-[10px] font-medium ${wd.isSelected ? "text-white/80" : "text-muted-foreground"}`}>
                        {wd.dateObj.toLocaleDateString("fr-FR", { weekday: "short" })}
                      </div>
                      <div className={`text-sm font-bold ${wd.isSelected ? "text-white" : ""}`}>
                        {wd.dateObj.getDate()}
                      </div>
                      {wd.isHoliday && (
                        <div className="text-[8px] text-amber-600 dark:text-amber-400 truncate">{wd.holidayLabel}</div>
                      )}
                    </button>
                  );
                })}
              </div>

              <DayAgendaView
                day={selectedDay}
                occupiedRanges={slotsData?.occupiedRanges?.[selectedDay.date] || []}
                selectedSlot={selectedSlot}
                onSelectSlot={(slot) => {
                  setSelectedSlot(slot);
                  setShowConfirm(true);
                }}
                primaryColor={primaryColor}
              />
            </>
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Info className="h-5 w-5 mx-auto mb-2 opacity-50" />
              Sélectionnez d'abord un jour dans la vue Mois
            </div>
          )}

          {slotsData?.businessHours && (
            <div className="mt-3 text-xs text-muted-foreground flex items-center justify-center gap-1 flex-wrap">
              <Clock className="h-3 w-3" />
              {slotsData.businessHours.periods.map((p, i) => (
                <span key={i}>{p.start} - {p.end}{i < slotsData.businessHours.periods.length - 1 ? " / " : ""}</span>
              ))}
              <span className="ml-1">({slotsData.businessHours.days})</span>
            </div>
          )}
        </Card>

        {viewMode === "calendar" && selectedDay && (
          <Card className="p-4">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <h3 className="font-semibold capitalize" data-testid="text-selected-day">{selectedDay.dayLabel}</h3>
              <Button
                size="sm"
                variant="outline"
                className="text-xs"
                onClick={() => setViewMode("agenda")}
                data-testid="button-switch-agenda"
              >
                <Clock className="h-3 w-3 mr-1" />
                Vue agenda
              </Button>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {selectedDay.slots.map((slot) => {
                const isSelected = selectedSlot?.start === slot.start;
                return (
                  <button
                    key={slot.start}
                    onClick={() => {
                      setSelectedSlot(slot);
                      setShowConfirm(true);
                    }}
                    className={`
                      py-2 px-3 rounded-md text-sm font-medium transition-colors border
                      ${isSelected ? "text-white border-transparent" : "border-border hover-elevate"}
                    `}
                    style={isSelected ? { backgroundColor: primaryColor, borderColor: primaryColor } : undefined}
                    data-testid={`slot-${formatTime(slot.start).replace(":", "")}`}
                  >
                    {formatTime(slot.start)}
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        <Button variant="outline" className="w-full" onClick={() => window.history.back()} data-testid="button-back-to-quote">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour au devis
        </Button>

        {garage && (
          <div className="text-center text-xs text-muted-foreground space-y-1 pt-4 pb-8">
            <p className="font-medium">{garageName}</p>
            {garage.address && (
              <p className="flex items-center justify-center gap-1 flex-wrap">
                <MapPin className="h-3 w-3" />
                {garage.address}{garage.postalCode ? `, ${garage.postalCode}` : ""}{garage.city ? ` ${garage.city}` : ""}
              </p>
            )}
            {garage.phone && (
              <p className="flex items-center justify-center gap-1">
                <Phone className="h-3 w-3" />
                <a href={`tel:${garage.phone}`}>{garage.phone}</a>
              </p>
            )}
            {garage.email && (
              <p className="flex items-center justify-center gap-1">
                <Mail className="h-3 w-3" />
                <a href={`mailto:${garage.email}`}>{garage.email}</a>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
