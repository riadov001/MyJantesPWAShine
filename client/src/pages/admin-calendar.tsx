import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Reservation, User, Service, Quote } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay,
  addMonths, subMonths, startOfWeek, endOfWeek, addWeeks, subWeeks, addDays, subDays,
  getHours, getMinutes, isToday, getISOWeek, differenceInCalendarDays
} from "date-fns";
import { formatLocalTime, formatLocalDateTime, parseWithoutTimezoneShift } from "@/lib/dateUtils";
import { fr } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Download, Calendar as CalendarIcon,
  User as UserIcon, Wrench, ExternalLink, Clock, Filter, Plus,
  CalendarDays, CalendarRange, LayoutList, CircleDot, UsersRound,
  RefreshCw, Copy, Link as LinkIcon, Check
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type ViewMode = "month" | "week" | "day" | "planning";

const WORK_START_HOUR = 7;
const WORK_END_HOUR = 20;
const HOUR_HEIGHT = 64;

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-emerald-500 border-emerald-700 text-white",
  pending: "bg-sky-500 border-sky-700 text-white",
  in_progress: "bg-amber-500 border-amber-700 text-white",
  completed: "bg-slate-500 border-slate-700 text-white",
  cancelled: "bg-rose-500 border-rose-700 text-white",
};

export default function AdminCalendar() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [copied, setCopied] = useState(false);

  // Redirect non-admin users
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isAdmin)) {
      window.location.href = "/";
    }
  }, [isAuthenticated, isLoading, isAdmin]);

  const { data: reservations = [], isLoading: reservationsLoading } = useQuery<Reservation[]>({
    queryKey: ["/api/admin/reservations"],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
    enabled: isAuthenticated,
  });

  const { data: quotes = [] } = useQuery<Quote[]>({
    queryKey: ["/api/admin/quotes"],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: settings } = useQuery<any>({
    queryKey: ["/api/admin/settings"],
    enabled: isAuthenticated && isAdmin,
  });

  const regenerateTokenMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/calendar/regenerate-token", {});
      return res as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings"] });
      toast({ title: "Token régénéré", description: "La nouvelle URL est disponible." });
    },
    onError: () => toast({ title: "Erreur", description: "Impossible de régénérer le token", variant: "destructive" }),
  });

  const calendarToken = settings?.calendarToken;
  const feedUrl = calendarToken ? `${window.location.origin}/api/calendar/${calendarToken}/feed.ics` : null;
  const webcalUrl = feedUrl ? feedUrl.replace(/^https?:/, 'webcal:') : null;
  const googleCalUrl = feedUrl ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl)}` : null;
  const outlookUrl = feedUrl ? `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}` : null;

  const copyFeedUrl = () => {
    if (feedUrl) {
      navigator.clipboard.writeText(feedUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const assignEmployeeMutation = useMutation({
    mutationFn: async ({ reservationId, employeeId }: { reservationId: string; employeeId: string | null }) => {
      return apiRequest("PATCH", `/api/admin/reservations/${reservationId}`, { assignedEmployeeId: employeeId });
    },
    onSuccess: () => {
      toast({ title: "Succès", description: "Employé assigné avec succès" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reservations"] });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message || "Échec de l'assignation", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ reservationId, status }: { reservationId: string; status: string }) => {
      return apiRequest("PATCH", `/api/admin/reservations/${reservationId}`, { status });
    },
    onSuccess: () => {
      toast({ title: "Succès", description: "Statut mis à jour" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/reservations"] });
    },
    onError: (error: any) => {
      toast({ title: "Erreur", description: error.message || "Échec de la mise à jour", variant: "destructive" });
    },
  });

  const handleAssignEmployee = (reservationId: string, employeeId: string) => {
    const newEmployeeId = employeeId === "unassigned" ? null : employeeId;
    assignEmployeeMutation.mutate({ reservationId, employeeId: newEmployeeId });
    if (selectedReservation && selectedReservation.id === reservationId) {
      setSelectedReservation({ ...selectedReservation, assignedEmployeeId: newEmployeeId });
    }
  };

  const employees = useMemo(() => users.filter(u => u.role === "employe" || u.role === "admin"), [users]);

  // Status colors helper
  const statusConfig: Record<string, { color: string; label: string }> = {
    confirmed: { color: STATUS_COLORS.confirmed, label: "Confirmée" },
    pending: { color: STATUS_COLORS.pending, label: "En attente" },
    in_progress: { color: STATUS_COLORS.in_progress, label: "En cours" },
    completed: { color: STATUS_COLORS.completed, label: "Terminée" },
    cancelled: { color: STATUS_COLORS.cancelled, label: "Annulée" },
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "bg-emerald-500 border-emerald-700 text-white";
      case "pending": return "bg-sky-500 border-sky-700 text-white";
      case "in_progress": return "bg-amber-500 border-amber-700 text-white";
      case "completed": return "bg-slate-500 border-slate-700 text-white";
      case "cancelled": return "bg-rose-500 border-rose-700 text-white";
      default: return "bg-gray-500 text-white";
    }
  };
  const getStatusLabel = (status: string) => statusConfig[status]?.label || status;

  const getClientName = useCallback((clientId: string) => {
    const client = users.find(u => u.id === clientId);
    if (!client) return `Client-${clientId.slice(0, 8)}`;
    return `${client.firstName || ""} ${client.lastName || ""}`.trim() || client.email;
  }, [users]);

  const getEmployeeName = useCallback((employeeId: string | null) => {
    if (!employeeId) return "Non assigné";
    const employee = users.find(u => u.id === employeeId);
    if (!employee) return `Employé-${employeeId.slice(0, 8)}`;
    return `${employee.firstName || ""} ${employee.lastName || ""}`.trim() || employee.email;
  }, [users]);

  const getServiceName = useCallback((serviceId: string) => {
    const service = services.find(s => s.id === serviceId);
    return service?.name || `Service-${serviceId.slice(0, 8)}`;
  }, [services]);

  const getServiceDuration = useCallback((serviceId: string) => {
    const service = services.find(s => s.id === serviceId);
    return service?.estimatedDuration || 60;
  }, [services]);

  const getQuoteReference = useCallback((quoteId: string | null) => {
    if (!quoteId) return null;
    const quote = quotes.find(q => q.id === quoteId);
    return quote?.reference || null;
  }, [quotes]);

  const filteredReservations = useMemo(() => {
    return reservations.filter(r => {
      const matchesEmployee = employeeFilter === "all" || r.assignedEmployeeId === employeeFilter;
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      return matchesEmployee && matchesStatus;
    });
  }, [reservations, employeeFilter, statusFilter]);

  const getReservationsForDay = useCallback((date: Date) => {
    return filteredReservations.filter(r => {
      const start = parseWithoutTimezoneShift(r.scheduledDate);
      const duration = getServiceDuration(r.serviceId);
      const end = r.estimatedEndDate
        ? parseWithoutTimezoneShift(r.estimatedEndDate)
        : new Date(start.getTime() + duration * 60000);
      
      const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDateOnly = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      
      return checkDate >= startDateOnly && checkDate <= endDateOnly;
    });
  }, [filteredReservations, getServiceDuration]);

  const isMultiDay = useCallback((res: Reservation) => {
    const start = parseWithoutTimezoneShift(res.scheduledDate);
    const duration = getServiceDuration(res.serviceId);
    const end = res.estimatedEndDate
      ? parseWithoutTimezoneShift(res.estimatedEndDate)
      : new Date(start.getTime() + duration * 60000);
    
    return !isSameDay(start, end);
  }, [getServiceDuration]);

  // Navigation
  const navigateBack = () => {
    if (viewMode === "month") setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };

  const navigateForward = () => {
    if (viewMode === "month") setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };

  const goToToday = () => setCurrentDate(new Date());

  const getHeaderTitle = () => {
    if (viewMode === "planning") return "Planning des assignations";
    if (viewMode === "month") return format(currentDate, 'MMMM yyyy', { locale: fr });
    if (viewMode === "week") {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(weekStart, 'd', { locale: fr })} - ${format(weekEnd, 'd MMMM yyyy', { locale: fr })}`;
    }
    return format(currentDate, 'EEEE d MMMM yyyy', { locale: fr });
  };

  const handleClickTimeSlot = (date: Date, hour: number) => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:00`;
    setLocation(`/admin/reservations?openDialog=true&scheduledDate=${encodeURIComponent(dateStr)}`);
  };

  // Scroll to current hour on mount for week/day views
  useEffect(() => {
    if ((viewMode === "week" || viewMode === "day") && scrollContainerRef.current) {
      const currentHour = new Date().getHours();
      const scrollTo = Math.max(0, (currentHour - WORK_START_HOUR - 1) * HOUR_HEIGHT);
      scrollContainerRef.current.scrollTop = scrollTo;
    }
  }, [viewMode]);

  // ICS generation
  const escapeICSText = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const formatICSDate = (date: Date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const foldICSLine = (line: string): string => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(line);
    if (bytes.length <= 75) return line;
    const result: string[] = [];
    const decoder = new TextDecoder();
    let start = 0;
    let isFirst = true;
    while (start < bytes.length) {
      const limit = isFirst ? 75 : 74;
      let end = Math.min(start + limit, bytes.length);
      while (end > start && (bytes[end] & 0xC0) === 0x80) end--;
      const chunk = decoder.decode(bytes.slice(start, end));
      result.push(isFirst ? chunk : ' ' + chunk);
      start = end;
      isFirst = false;
    }
    return result.join('\r\n');
  };

  const buildICSContent = (lines: string[]): string => lines.map(line => foldICSLine(line)).join('\r\n');

  const generateICS = (reservation: Reservation) => {
    const startDate = new Date(reservation.scheduledDate);
    const duration = getServiceDuration(reservation.serviceId);
    const endDate = reservation.estimatedEndDate
      ? new Date(reservation.estimatedEndDate)
      : new Date(startDate.getTime() + duration * 60000);
    const clientName = escapeICSText(getClientName(reservation.clientId));
    const employeeName = escapeICSText(getEmployeeName(reservation.assignedEmployeeId));
    const serviceName = escapeICSText(getServiceName(reservation.serviceId));
    const icsLines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MyJantes//Reservation Calendar//FR',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
      `DTSTART:${formatICSDate(startDate)}`, `DTEND:${formatICSDate(endDate)}`,
      `DTSTAMP:${formatICSDate(new Date())}`, `UID:${reservation.id}@myjantes.fr`,
      `SUMMARY:${serviceName} - ${clientName}`,
      `DESCRIPTION:Client: ${clientName}\\nEmploye: ${employeeName}\\nService: ${serviceName}`,
      'LOCATION:MyJantes Atelier',
      `STATUS:${reservation.status === 'confirmed' ? 'CONFIRMED' : reservation.status === 'cancelled' ? 'CANCELLED' : 'TENTATIVE'}`,
      'END:VEVENT', 'END:VCALENDAR'
    ];
    const blob = new Blob([buildICSContent(icsLines)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reservation-${(reservation as any).reference || reservation.id.slice(0, 8)}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "Fichier ICS téléchargé", description: "L'événement a été exporté." });
  };

  const generateAllICS = () => {
    const eventLines: string[] = [];
    filteredReservations.forEach(reservation => {
      const startDate = new Date(reservation.scheduledDate);
      const duration = getServiceDuration(reservation.serviceId);
      const endDate = reservation.estimatedEndDate
        ? new Date(reservation.estimatedEndDate)
        : new Date(startDate.getTime() + duration * 60000);
      const clientName = escapeICSText(getClientName(reservation.clientId));
      const employeeName = escapeICSText(getEmployeeName(reservation.assignedEmployeeId));
      const serviceName = escapeICSText(getServiceName(reservation.serviceId));
      eventLines.push(
        'BEGIN:VEVENT', `DTSTART:${formatICSDate(startDate)}`, `DTEND:${formatICSDate(endDate)}`,
        `DTSTAMP:${formatICSDate(new Date())}`, `UID:${reservation.id}@myjantes.fr`,
        `SUMMARY:${serviceName} - ${clientName}`,
        `DESCRIPTION:Client: ${clientName}\\nEmploye: ${employeeName}\\nService: ${serviceName}`,
        'LOCATION:MyJantes Atelier',
        `STATUS:${reservation.status === 'confirmed' ? 'CONFIRMED' : reservation.status === 'cancelled' ? 'CANCELLED' : 'TENTATIVE'}`,
        'END:VEVENT'
      );
    });
    const icsLines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MyJantes//Reservation Calendar//FR',
      'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...eventLines, 'END:VCALENDAR'];
    const blob = new Blob([buildICSContent(icsLines)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `planning-myjantes-${format(currentDate, 'yyyy-MM')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: "Planning exporté", description: `${filteredReservations.length} réservations exportées.` });
  };

  // Month view
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  // Week view
  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [currentDate]);

  const workHours = useMemo(() => {
    return Array.from({ length: WORK_END_HOUR - WORK_START_HOUR }, (_, i) => WORK_START_HOUR + i);
  }, []);

  const getReservationPosition = useCallback((reservation: Reservation) => {
    const start = parseWithoutTimezoneShift(reservation.scheduledDate);
    const duration = getServiceDuration(reservation.serviceId);
    const end = reservation.estimatedEndDate
      ? parseWithoutTimezoneShift(reservation.estimatedEndDate)
      : new Date(start.getTime() + duration * 60000);
    const startHour = getHours(start) + getMinutes(start) / 60;
    const endHour = getHours(end) + getMinutes(end) / 60;
    const top = Math.max(0, (startHour - WORK_START_HOUR) * HOUR_HEIGHT);
    const height = Math.max(24, (endHour - startHour) * HOUR_HEIGHT);
    return { top, height, startTime: formatLocalTime(reservation.scheduledDate), endTime: formatLocalTime(end) };
  }, [getServiceDuration]);

  const calendarWeeks = useMemo(() => {
    const weeks: Date[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      weeks.push(calendarDays.slice(i, i + 7));
    }
    return weeks;
  }, [calendarDays]);

  const getReservationBars = useCallback((weekDaysParam: Date[]) => {
    const weekStart = weekDaysParam[0];
    const weekEnd = weekDaysParam[6];

    const barsInWeek = filteredReservations.filter(r => {
      const start = parseWithoutTimezoneShift(r.scheduledDate);
      const duration = getServiceDuration(r.serviceId);
      const end = r.estimatedEndDate
        ? parseWithoutTimezoneShift(r.estimatedEndDate)
        : new Date(start.getTime() + duration * 60000);
      const startD = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endD = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      const ws = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
      const we = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate());
      return startD <= we && endD >= ws;
    });

    return barsInWeek.map(r => {
      const start = parseWithoutTimezoneShift(r.scheduledDate);
      const duration = getServiceDuration(r.serviceId);
      const end = r.estimatedEndDate
        ? parseWithoutTimezoneShift(r.estimatedEndDate)
        : new Date(start.getTime() + duration * 60000);
      const startD = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endD = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      const ws = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());

      const barStart = startD < ws ? 0 : differenceInCalendarDays(startD, ws);
      const barEnd = endD > weekEnd
        ? 6
        : differenceInCalendarDays(endD, ws);

      const resRef = (r as any).reference;
      const quoteRef = getQuoteReference(r.quoteId);
      const label = resRef || quoteRef || getServiceName(r.serviceId);

      return {
        reservation: r,
        startCol: barStart,
        endCol: barEnd,
        label,
        isStart: startD >= ws,
        isEnd: endD <= weekEnd,
      };
    }).sort((a, b) => {
      if (a.startCol !== b.startCol) return a.startCol - b.startCol;
      return (b.endCol - b.startCol) - (a.endCol - a.startCol);
    });
  }, [filteredReservations, getServiceDuration, getQuoteReference, getServiceName]);

  if (isLoading || reservationsLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const dayLabels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  const renderTimelineEvent = (res: Reservation, dayColumnWidth?: string) => {
    const pos = getReservationPosition(res);
    return (
      <Tooltip key={res.id}>
        <TooltipTrigger asChild>
          <div
            onClick={(e) => { e.stopPropagation(); setSelectedReservation(res); }}
            className={`absolute left-1 right-1 ${getStatusColor(res.status)} text-white rounded-md px-1.5 py-0.5 cursor-pointer overflow-hidden text-[10px] sm:text-xs leading-tight border border-white/20 z-10`}
            style={{ top: `${pos.top}px`, height: `${pos.height}px`, minHeight: "22px" }}
            data-testid={`calendar-event-${res.id}`}
          >
            <div className="font-medium truncate">{pos.startTime} - {pos.endTime}</div>
            {pos.height > 32 && (
              <div className="truncate opacity-90">{getClientName(res.clientId).split(' ')[0]}</div>
            )}
            {pos.height > 48 && (
              <div className="truncate opacity-75">{getServiceName(res.serviceId)}</div>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold">{getServiceName(res.serviceId)}</p>
            <p className="text-xs">{pos.startTime} - {pos.endTime}</p>
            <p className="text-xs">{getClientName(res.clientId)}</p>
            <p className="text-xs">{getEmployeeName(res.assignedEmployeeId)}</p>
            <Badge className={`${getStatusColor(res.status)} text-white text-[10px]`}>
              {getStatusLabel(res.status)}
            </Badge>
          </div>
        </TooltipContent>
      </Tooltip>
    );
  };

  const renderMonthView = () => (
    <div className="border rounded-md overflow-hidden">
      <div className="grid grid-cols-[40px_repeat(7,1fr)] border-b bg-muted/30">
        <div className="p-1 text-center text-[10px] font-medium text-muted-foreground border-r">S</div>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, i) => (
          <div key={i} className="p-1 text-center text-[10px] sm:text-xs font-medium text-muted-foreground border-r last:border-r-0">
            {day}
          </div>
        ))}
      </div>
      {calendarWeeks.map((week, weekIdx) => {
        const weekNum = getISOWeek(week[0]);
        const bars = getReservationBars(week);

        const rows: typeof bars[] = [];
        const placed = new Set<string>();
        bars.forEach(bar => {
          if (placed.has(bar.reservation.id)) return;
          let foundRow = -1;
          for (let r = 0; r < rows.length; r++) {
            const conflict = rows[r].some(b => !(bar.endCol < b.startCol || bar.startCol > b.endCol));
            if (!conflict) { foundRow = r; break; }
          }
          if (foundRow === -1) {
            rows.push([bar]);
          } else {
            rows[foundRow].push(bar);
          }
          placed.add(bar.reservation.id);
        });

        const maxVisibleRows = 4;
        const visibleRows = rows.slice(0, maxVisibleRows);
        const hiddenCount = rows.length - maxVisibleRows;

        return (
          <div key={weekIdx} className="grid grid-cols-[40px_repeat(7,1fr)] border-b last:border-b-0">
            <div className="p-1 flex items-start justify-center border-r bg-muted/20">
              <span className="text-[10px] font-semibold text-muted-foreground mt-0.5">{weekNum}</span>
            </div>
            <div className="col-span-7 grid grid-cols-7 relative" style={{ minHeight: `${Math.max(44, 20 + visibleRows.length * 20 + (hiddenCount > 0 ? 14 : 0))}px` }}>
              {week.map((day, dayIdx) => {
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isTodayDate = isToday(day);
                return (
                  <div
                    key={dayIdx}
                    onClick={() => {
                      setSelectedDate(day);
                      setCurrentDate(day);
                      setViewMode("day");
                    }}
                    className={`
                      border-r last:border-r-0 cursor-pointer transition-colors p-0.5
                      ${!isCurrentMonth ? 'bg-muted/20' : ''}
                      ${isTodayDate ? 'bg-primary/5' : ''}
                    `}
                    data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
                  >
                    <div className="flex items-center justify-center">
                      <span className={`text-[11px] font-medium leading-none ${isTodayDate ? 'bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center' : ''} ${!isCurrentMonth ? 'text-muted-foreground/50' : ''}`}>
                        {format(day, 'd')}
                      </span>
                    </div>
                  </div>
                );
              })}

              <div className="absolute inset-0 pointer-events-none" style={{ top: '20px' }}>
                {visibleRows.map((row, rowIdx) =>
                  row.map(bar => {
                    const left = `${(bar.startCol / 7) * 100}%`;
                    const width = `${((bar.endCol - bar.startCol + 1) / 7) * 100}%`;
                    const top = `${rowIdx * 20}px`;

                    return (
                      <div
                        key={bar.reservation.id}
                        className={`absolute ${getStatusColor(bar.reservation.status)} pointer-events-auto cursor-pointer overflow-hidden border border-white/20 shadow-sm`}
                        style={{
                          left, width, top, height: '18px',
                          borderRadius: bar.isStart && bar.isEnd ? '3px' : bar.isStart ? '3px 0 0 3px' : bar.isEnd ? '0 3px 3px 0' : '0',
                          marginLeft: bar.isStart ? '2px' : '0',
                          marginRight: bar.isEnd ? '2px' : '0',
                        }}
                        onClick={(e) => { e.stopPropagation(); setSelectedReservation(bar.reservation); }}
                        title={`${bar.label} - ${getClientName(bar.reservation.clientId)}`}
                        data-testid={`month-event-${bar.reservation.id}`}
                      >
                        <div className="px-1 text-[10px] font-medium truncate leading-[18px]">
                          {bar.label}
                        </div>
                      </div>
                    );
                  })
                )}
                {hiddenCount > 0 && (
                  <div className="absolute left-[40px] text-[9px] text-muted-foreground" style={{ top: `${visibleRows.length * 20}px` }}>
                    +{hiddenCount} autres
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderWeekView = () => {
    const totalHeight = workHours.length * HOUR_HEIGHT;
    return (
      <div className="border rounded-md overflow-hidden">
        <div className="grid grid-cols-[50px_repeat(7,1fr)] sm:grid-cols-[60px_repeat(7,1fr)] border-b sticky top-0 bg-background z-20">
          <div className="p-1 sm:p-2 border-r text-xs text-muted-foreground" />
          {weekDays.map((day, idx) => (
            <div
              key={idx}
              className={`p-1 sm:p-2 text-center border-r last:border-r-0 cursor-pointer hover:bg-muted/50 ${isToday(day) ? 'bg-primary/10' : ''}`}
              onClick={() => { setCurrentDate(day); setViewMode("day"); }}
              data-testid={`week-header-${format(day, 'yyyy-MM-dd')}`}
            >
              <div className="text-[10px] sm:text-xs text-muted-foreground">{dayLabels[idx]}</div>
              <div className={`text-sm sm:text-base font-semibold ${isToday(day) ? 'bg-primary text-primary-foreground rounded-full w-7 h-7 flex items-center justify-center mx-auto' : ''}`}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>

        <div ref={scrollContainerRef} className="overflow-auto" style={{ maxHeight: "calc(100vh - 320px)" }}>
          <div className="grid grid-cols-[50px_repeat(7,1fr)] sm:grid-cols-[60px_repeat(7,1fr)]" style={{ height: `${totalHeight}px` }}>
            <div className="relative border-r">
              {workHours.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 text-[10px] sm:text-xs text-muted-foreground text-right pr-1 sm:pr-2"
                  style={{ top: `${(hour - WORK_START_HOUR) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                >
                  {`${hour}:00`}
                </div>
              ))}
            </div>

            {weekDays.map((day, dayIdx) => {
              const dayReservations = getReservationsForDay(day);
              return (
                <div key={dayIdx} className="relative border-r last:border-r-0">
                  {workHours.map((hour) => (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 border-b border-dashed border-border/50 hover:bg-primary/5 cursor-pointer transition-colors"
                      style={{ top: `${(hour - WORK_START_HOUR) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                      onClick={() => handleClickTimeSlot(day, hour)}
                      data-testid={`timeslot-${format(day, 'yyyy-MM-dd')}-${hour}`}
                    />
                  ))}
                  {/* Current time indicator */}
                  {isToday(day) && (() => {
                    const now = new Date();
                    const currentHour = getHours(now) + getMinutes(now) / 60;
                    if (currentHour >= WORK_START_HOUR && currentHour <= WORK_END_HOUR) {
                      const top = (currentHour - WORK_START_HOUR) * HOUR_HEIGHT;
                      return (
                        <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top: `${top}px` }}>
                          <div className="flex items-center">
                            <div className="w-2 h-2 rounded-full bg-red-500 -ml-1" />
                            <div className="flex-1 h-0.5 bg-red-500" />
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {dayReservations.map(res => renderTimelineEvent(res))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderPlanningView = () => {
    const days = eachDayOfInterval({
      start: startOfWeek(currentDate, { weekStartsOn: 1 }),
      end: endOfWeek(currentDate, { weekStartsOn: 1 })
    });

    return (
      <div className="border rounded-md overflow-hidden bg-background">
        <div className="grid grid-cols-[150px_1fr] border-b">
          <div className="p-4 border-r font-bold bg-muted/50 text-sm">Employé</div>
          <div className="grid grid-cols-7 flex-1">
            {days.map((day, i) => (
              <div key={i} className={`p-2 text-center border-r last:border-r-0 ${isToday(day) ? 'bg-primary/5' : ''}`}>
                <div className="text-[10px] uppercase text-muted-foreground font-medium">{format(day, 'EEE', { locale: fr })}</div>
                <div className="text-sm font-semibold">{format(day, 'd')}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="divide-y overflow-y-auto max-h-[calc(100vh-400px)]">
          {[...employees, { id: null, firstName: "Non", lastName: "assigné", email: "" }].map((emp) => (
            <div key={emp.id || 'unassigned'} className="grid grid-cols-[150px_1fr] min-h-[100px]">
              <div className="p-3 border-r bg-muted/10 flex flex-col justify-center">
                <div className="font-semibold text-sm">
                  {emp.id ? `${emp.firstName} ${emp.lastName}` : "Non assigné"}
                </div>
                {emp.email && <div className="text-[10px] text-muted-foreground truncate">{emp.email}</div>}
              </div>
              <div className="grid grid-cols-7 relative">
                {days.map((day, dayIdx) => {
                  const dayRes = filteredReservations.filter(r => {
                    if (r.assignedEmployeeId !== emp.id) return false;
                    const start = parseWithoutTimezoneShift(r.scheduledDate);
                    const duration = getServiceDuration(r.serviceId);
                    const end = r.estimatedEndDate
                      ? parseWithoutTimezoneShift(r.estimatedEndDate)
                      : new Date(start.getTime() + duration * 60000);
                    
                    const checkDate = new Date(day.getFullYear(), day.getMonth(), day.getDate());
                    const startD = new Date(start.getFullYear(), start.getMonth(), start.getDate());
                    const endD = new Date(end.getFullYear(), end.getMonth(), end.getDate());
                    return checkDate >= startD && checkDate <= endD;
                  });

                  return (
                    <div key={dayIdx} className="border-r last:border-r-0 p-1 min-h-[100px] hover:bg-muted/20 transition-colors">
                      <div className="flex flex-col gap-1.5 h-full">
                        {dayRes.map(res => {
                          const start = parseWithoutTimezoneShift(res.scheduledDate);
                          const end = res.estimatedEndDate 
                            ? parseWithoutTimezoneShift(res.estimatedEndDate)
                            : new Date(start.getTime() + getServiceDuration(res.serviceId) * 60000);
                          
                          const isStart = isSameDay(day, start);
                          const isEnd = isSameDay(day, end);
                          const multiDay = isMultiDay(res);
                          
                          return (
                            <Tooltip key={res.id}>
                              <TooltipTrigger asChild>
                                <div
                                  onClick={(e) => { e.stopPropagation(); setSelectedReservation(res); }}
                                  className={`
                                    ${getStatusColor(res.status)} text-white text-[10px] p-1.5 cursor-pointer border border-black/5 shadow-sm transition-all
                                    ${multiDay ? (isStart ? 'rounded-l-md rounded-r-none border-r-0' : isEnd ? 'rounded-r-md rounded-l-none border-l-0' : 'rounded-none border-x-0') : 'rounded-md'}
                                    hover:brightness-110 active:scale-[0.98]
                                  `}
                                >
                                  {(isStart || !multiDay) && (
                                    <div className="font-bold truncate">{getServiceName(res.serviceId)}</div>
                                  )}
                                  {(isStart || !multiDay) && (
                                    <div className="opacity-90 truncate text-[9px]">{getClientName(res.clientId)}</div>
                                  )}
                                  {!isStart && multiDay && <div className="h-4" />} {/* Spacer for continuation */}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <div className="text-xs p-1">
                                  <p className="font-bold">{getServiceName(res.serviceId)}</p>
                                  <p>{formatLocalDateTime(start)} - {formatLocalDateTime(end)}</p>
                                  <p>Client : {getClientName(res.clientId)}</p>
                                  <p>Statut : {getStatusLabel(res.status)}</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const totalHeight = workHours.length * HOUR_HEIGHT;
    const dayReservations = getReservationsForDay(currentDate);

    // Simple column allocation to avoid overlapping
    const columns: Reservation[][] = [];
    const sortedRes = [...dayReservations].sort((a, b) => {
      const aStart = parseWithoutTimezoneShift(a.scheduledDate).getTime();
      const bStart = parseWithoutTimezoneShift(b.scheduledDate).getTime();
      return aStart - bStart;
    });

    sortedRes.forEach(res => {
      const resStart = parseWithoutTimezoneShift(res.scheduledDate).getTime();
      const resDuration = getServiceDuration(res.serviceId);
      const resEnd = res.estimatedEndDate
        ? parseWithoutTimezoneShift(res.estimatedEndDate).getTime()
        : resStart + resDuration * 60000;

      let placed = false;
      for (const col of columns) {
        const lastInCol = col[col.length - 1];
        const lastStart = parseWithoutTimezoneShift(lastInCol.scheduledDate).getTime();
        const lastDuration = getServiceDuration(lastInCol.serviceId);
        const lastEnd = lastInCol.estimatedEndDate
          ? parseWithoutTimezoneShift(lastInCol.estimatedEndDate).getTime()
          : lastStart + lastDuration * 60000;
        if (resStart >= lastEnd) {
          col.push(res);
          placed = true;
          break;
        }
      }
      if (!placed) columns.push([res]);
    });

    const totalColumns = Math.max(1, columns.length);

    return (
      <div className="border rounded-md overflow-hidden">
        <div className="border-b p-3 bg-background flex items-center justify-between gap-2 flex-wrap sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            <h3 className="font-semibold capitalize">{format(currentDate, 'EEEE d MMMM yyyy', { locale: fr })}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">{dayReservations.length} réservation(s)</Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleClickTimeSlot(currentDate, 9)}
              data-testid="button-add-reservation-day"
            >
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Nouvelle</span>
            </Button>
          </div>
        </div>

        <div ref={scrollContainerRef} className="overflow-auto" style={{ maxHeight: "calc(100vh - 360px)" }}>
          <div className="grid grid-cols-[60px_1fr] sm:grid-cols-[70px_1fr]" style={{ height: `${totalHeight}px` }}>
            <div className="relative border-r">
              {workHours.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 text-xs text-muted-foreground text-right pr-2 flex items-start pt-0.5"
                  style={{ top: `${(hour - WORK_START_HOUR) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                >
                  <span className="ml-auto">{`${hour}:00`}</span>
                </div>
              ))}
            </div>

            <div className="relative">
              {workHours.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 border-b border-dashed border-border/50 hover:bg-primary/5 cursor-pointer transition-colors"
                  style={{ top: `${(hour - WORK_START_HOUR) * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                  onClick={() => handleClickTimeSlot(currentDate, hour)}
                >
                  <div
                    className="absolute left-0 right-0 border-b border-dotted border-border/30"
                    style={{ top: `${HOUR_HEIGHT / 2}px` }}
                  />
                </div>
              ))}

              {/* Current time indicator */}
              {isToday(currentDate) && (() => {
                const now = new Date();
                const currentHour = getHours(now) + getMinutes(now) / 60;
                if (currentHour >= WORK_START_HOUR && currentHour <= WORK_END_HOUR) {
                  const top = (currentHour - WORK_START_HOUR) * HOUR_HEIGHT;
                  return (
                    <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top: `${top}px` }}>
                      <div className="flex items-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1" />
                        <div className="flex-1 h-0.5 bg-red-500" />
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {columns.map((col, colIdx) =>
                col.map(res => {
                  const pos = getReservationPosition(res);
                  const widthPercent = 100 / totalColumns;
                  const leftPercent = colIdx * widthPercent;

                  return (
                    <Tooltip key={res.id}>
                      <TooltipTrigger asChild>
                        <div
                          onClick={(e) => { e.stopPropagation(); setSelectedReservation(res); }}
                          className={`absolute ${getStatusColor(res.status)} text-white rounded-md px-2 py-1 cursor-pointer overflow-hidden text-xs leading-tight border border-white/20 z-10`}
                          style={{
                            top: `${pos.top}px`,
                            height: `${pos.height}px`,
                            left: `calc(${leftPercent}% + 4px)`,
                            width: `calc(${widthPercent}% - 8px)`,
                            minHeight: "28px",
                          }}
                          data-testid={`day-event-${res.id}`}
                        >
                          <div className="font-semibold truncate">{pos.startTime} - {pos.endTime}</div>
                          {pos.height > 36 && <div className="truncate">{getClientName(res.clientId)}</div>}
                          {pos.height > 52 && <div className="truncate opacity-80">{getServiceName(res.serviceId)}</div>}
                          {pos.height > 68 && (
                            <div className="truncate opacity-70 flex items-center gap-1">
                              <UserIcon className="h-3 w-3" />
                              {getEmployeeName(res.assignedEmployeeId)}
                            </div>
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <div className="space-y-1">
                          <p className="font-semibold">{getServiceName(res.serviceId)}</p>
                          <p className="text-xs">{pos.startTime} - {pos.endTime}</p>
                          <p className="text-xs">{getClientName(res.clientId)}</p>
                          <p className="text-xs">{getEmployeeName(res.assignedEmployeeId)}</p>
                          <Badge className={`${getStatusColor(res.status)} text-white text-[10px]`}>
                            {getStatusLabel(res.status)}
                          </Badge>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="p-2 sm:p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-calendar-title">
            Calendrier des Réservations
          </h1>
          <p className="text-sm text-muted-foreground">
            Planification interactive de l'atelier
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={generateAllICS} data-testid="button-export-all-ics">
            <Download className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">ICS</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowSyncDialog(true)} data-testid="button-sync-calendar">
            <LinkIcon className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Synchroniser</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/admin/reservations?openDialog=true")}
            data-testid="button-new-reservation-cal"
          >
            <Plus className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Réservation</span>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-3">
            {/* View mode toggle + navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1 bg-muted rounded-md p-0.5">
                <Button
                  variant={viewMode === "month" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("month")}
                  data-testid="button-view-month"
                >
                  <CalendarDays className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Mois</span>
                </Button>
                <Button
                  variant={viewMode === "week" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("week")}
                  data-testid="button-view-week"
                >
                  <CalendarRange className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Semaine</span>
                </Button>
                <Button
                  variant={viewMode === "day" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("day")}
                  data-testid="button-view-day"
                >
                  <LayoutList className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Jour</span>
                </Button>
                <Button
                  variant={viewMode === "planning" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("planning")}
                  data-testid="button-view-planning"
                >
                  <UsersRound className="h-4 w-4 mr-1" />
                  <span className="hidden sm:inline">Planning</span>
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={navigateBack} data-testid="button-prev">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={goToToday} data-testid="button-today">
                  <CircleDot className="h-4 w-4 mr-1" />
                  Aujourd'hui
                </Button>
                <h2 className="text-sm sm:text-lg font-semibold min-w-[140px] sm:min-w-[220px] text-center capitalize">
                  {getHeaderTitle()}
                </h2>
                <Button variant="outline" size="icon" onClick={navigateForward} data-testid="button-next">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-employee-filter">
                  <UserIcon className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Employé" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les employés</SelectItem>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {`${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[150px]" data-testid="select-status-filter">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="confirmed">Confirmé</SelectItem>
                  <SelectItem value="in_progress">En cours</SelectItem>
                  <SelectItem value="completed">Terminé</SelectItem>
                  <SelectItem value="cancelled">Annulé</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === "planning" && renderPlanningView()}
          {viewMode === "month" && renderMonthView()}
          {viewMode === "week" && renderWeekView()}
          {viewMode === "day" && renderDayView()}
        </CardContent>
      </Card>

      {/* Calendar Sync Dialog */}
      <Dialog open={showSyncDialog} onOpenChange={setShowSyncDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarIcon className="h-5 w-5" />
              Synchronisation de l'agenda
            </DialogTitle>
            <DialogDescription>
              Abonnez votre agenda (Google, Apple, Outlook) pour synchroniser automatiquement toutes les réservations en temps réel.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            {!calendarToken ? (
              <div className="text-center space-y-3 py-4">
                <p className="text-sm text-muted-foreground">Aucune URL d'abonnement générée. Créez-en une pour commencer.</p>
                <Button onClick={() => regenerateTokenMutation.mutate()} disabled={regenerateTokenMutation.isPending} data-testid="button-generate-cal-token">
                  {regenerateTokenMutation.isPending ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <LinkIcon className="h-4 w-4 mr-2" />}
                  Générer l'URL de synchronisation
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-sm font-medium">URL du flux ICS</p>
                  <div className="flex gap-2">
                    <Input readOnly value={feedUrl || ""} className="text-xs font-mono" data-testid="input-feed-url" />
                    <Button size="icon" variant="outline" onClick={copyFeedUrl} data-testid="button-copy-feed-url">
                      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Copiez cette URL et collez-la dans votre application d'agenda pour vous abonner.</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Ajouter directement à</p>
                  <div className="flex flex-col gap-2">
                    <Button variant="outline" className="justify-start gap-3" asChild data-testid="button-add-google-cal">
                      <a href={googleCalUrl || "#"} target="_blank" rel="noopener noreferrer">
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="3" fill="#4285F4"/><rect x="2" y="9" width="20" height="13" rx="0" fill="white"/><rect x="2" y="9" width="20" height="4" fill="#4285F4"/><rect x="2" y="2" width="20" height="10" rx="3" fill="#4285F4"/><path d="M8 16h8M8 19h5" stroke="#4285F4" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        Google Calendar
                        <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                      </a>
                    </Button>
                    <Button variant="outline" className="justify-start gap-3" asChild data-testid="button-add-outlook-cal">
                      <a href={outlookUrl || "#"} target="_blank" rel="noopener noreferrer">
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24"><rect width="24" height="24" rx="3" fill="#0078D4"/><rect x="4" y="6" width="10" height="12" rx="1" fill="white" opacity="0.9"/><rect x="13" y="6" width="7" height="12" rx="1" fill="white" opacity="0.6"/><circle cx="9" cy="12" r="3" fill="#0078D4"/></svg>
                        Outlook Calendar
                        <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                      </a>
                    </Button>
                    <Button variant="outline" className="justify-start gap-3" asChild data-testid="button-add-apple-cal">
                      <a href={webcalUrl || "#"}>
                        <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24"><rect width="24" height="24" rx="4" fill="#FF3B30"/><rect x="2" y="7" width="20" height="15" rx="2" fill="white"/><rect x="2" y="10" width="20" height="2" fill="#E5E7EB"/><rect x="6" y="4" width="2" height="5" rx="1" fill="#FF3B30"/><rect x="16" y="4" width="2" height="5" rx="1" fill="#FF3B30"/></svg>
                        Apple Calendrier (iCal / webcal)
                        <ExternalLink className="h-3 w-3 ml-auto text-muted-foreground" />
                      </a>
                    </Button>
                  </div>
                </div>

                <div className="pt-2 border-t flex items-center justify-between gap-4">
                  <p className="text-xs text-muted-foreground">Révoquer et créer une nouvelle URL (l'ancienne ne fonctionnera plus)</p>
                  <Button variant="outline" size="sm" onClick={() => regenerateTokenMutation.mutate()} disabled={regenerateTokenMutation.isPending} data-testid="button-regen-token">
                    <RefreshCw className={`h-4 w-4 ${regenerateTokenMutation.isPending ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Reservation Detail Dialog */}
      <Dialog open={!!selectedReservation} onOpenChange={() => setSelectedReservation(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span className="truncate">Détails de la réservation</span>
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {selectedReservation && ((selectedReservation as any).reference || `ID: ${selectedReservation.id.slice(0, 8)}`)}
            </DialogDescription>
          </DialogHeader>
          {selectedReservation && (
            <div className="space-y-3 sm:space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`${getStatusColor(selectedReservation.status)} text-white text-xs`}>
                  {getStatusLabel(selectedReservation.status)}
                </Badge>
                <Select
                  value={selectedReservation.status}
                  onValueChange={(value: any) => {
                    updateStatusMutation.mutate({ reservationId: selectedReservation.id, status: value });
                    setSelectedReservation({ ...selectedReservation, status: value });
                  }}
                >
                  <SelectTrigger className="h-7 w-[130px] text-xs" data-testid="select-quick-status">
                    <SelectValue placeholder="Changer" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">En attente</SelectItem>
                    <SelectItem value="confirmed">Confirmé</SelectItem>
                    <SelectItem value="in_progress">En cours</SelectItem>
                    <SelectItem value="completed">Terminé</SelectItem>
                    <SelectItem value="cancelled">Annulé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 text-xs sm:text-sm">
                <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
                  <span className="text-muted-foreground shrink-0">Début:</span>
                  <span className="font-medium break-words">
                    {formatLocalDateTime(selectedReservation.scheduledDate)}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
                  <span className="text-muted-foreground shrink-0">Fin:</span>
                  <span className="font-medium break-words">
                    {selectedReservation.estimatedEndDate
                      ? formatLocalDateTime(selectedReservation.estimatedEndDate)
                      : formatLocalDateTime(new Date(parseWithoutTimezoneShift(selectedReservation.scheduledDate).getTime() + getServiceDuration(selectedReservation.serviceId) * 60000))
                    }
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
                  <span className="text-muted-foreground shrink-0">Service:</span>
                  <span className="font-medium break-words">{getServiceName(selectedReservation.serviceId)}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5">
                  <span className="text-muted-foreground shrink-0">Client:</span>
                  <span className="font-medium break-words">{getClientName(selectedReservation.clientId)}</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                  <span className="text-muted-foreground shrink-0">Employé:</span>
                  <Select
                    value={selectedReservation.assignedEmployeeId || "unassigned"}
                    onValueChange={(value) => handleAssignEmployee(selectedReservation.id, value)}
                    disabled={assignEmployeeMutation.isPending}
                  >
                    <SelectTrigger className="h-8 w-full sm:w-[180px]" data-testid="select-modal-assign-employee">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Non assigné</SelectItem>
                      {employees.map(emp => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {`${emp.firstName || ''} ${emp.lastName || ''}`.trim() || emp.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedReservation.productDetails && (
                  <div className="pt-2 border-t">
                    <span className="text-muted-foreground">Détails:</span>
                    <p className="mt-1 break-words">{selectedReservation.productDetails}</p>
                  </div>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-3 sm:pt-4">
                <Button onClick={() => generateICS(selectedReservation)} className="flex-1" size="sm" data-testid="button-modal-download-ics">
                  <Download className="h-4 w-4 mr-2" />
                  <span className="text-xs sm:text-sm">ICS</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const clientId = selectedReservation.clientId;
                    setSelectedReservation(null);
                    setLocation(`/admin/engagements?clientId=${clientId}`);
                  }}
                  className="flex-1"
                  data-testid="button-modal-view-prestation"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  <span className="text-xs sm:text-sm">Prestation</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedReservation(null);
                    setLocation(`/admin/reservations?highlight=${selectedReservation.id}`);
                  }}
                  className="flex-1"
                  data-testid="button-modal-view-reservation"
                >
                  <Wrench className="h-4 w-4 mr-2" />
                  <span className="text-xs sm:text-sm">Modifier</span>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
