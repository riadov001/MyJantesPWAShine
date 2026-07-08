import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useMemo } from "react";
import { StatusBadge } from "@/components/status-badge";
import type { Reservation, User, Service, RepairOrder } from "@shared/schema";
import {
  Wrench, ClipboardCheck, Car, Fuel, Eye, Plus, CheckCircle2, 
  CircleDot, Clock, FileText, ChevronRight, Zap, Settings, Sparkles, Loader2, Brain
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface WorkshopTask {
  id: string;
  reservationId: string;
  isCompleted: boolean;
  comment?: string;
  completedAt?: Date;
  step: {
    id: string;
    stepNumber: number;
    title: string;
    description?: string;
  };
}

interface ActiveReservation extends Reservation {
  tasks: WorkshopTask[];
  repairOrder: RepairOrder | null;
  progress: number;
  completedTasks: number;
  totalTasks: number;
}

const FUEL_LEVELS = [
  { value: "empty", label: "Vide", icon: "0%" },
  { value: "quarter", label: "1/4", icon: "25%" },
  { value: "half", label: "1/2", icon: "50%" },
  { value: "three_quarters", label: "3/4", icon: "75%" },
  { value: "full", label: "Plein", icon: "100%" },
];

const EXTERIOR_CHECKS = [
  "Carrosserie avant", "Carrosserie arrière", "Côté gauche", "Côté droit",
  "Pare-brise", "Vitres", "Rétroviseurs", "Pare-chocs avant", "Pare-chocs arrière",
  "Phares", "Feux arrière", "Antenne", "Jantes/Pneus",
];

const INTERIOR_CHECKS = [
  "Tableau de bord", "Sièges", "Volant", "Moquette/Tapis",
  "Plafond", "Ceintures", "Rétroviseur intérieur", "Autoradio/Écran",
];

const ACCESSORY_CHECKS = [
  "Roue de secours", "Cric", "Triangle", "Gilet jaune", "Kit premiers secours",
  "Manuel véhicule", "Double de clé", "Tapis de sol",
];

export default function WorkshopManagement() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedReservationId, setSelectedReservationId] = useState<string>("");
  const [commentingTaskId, setCommentingTaskId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  const [repairOrderDialog, setRepairOrderDialog] = useState(false);
  const [repairOrderReservation, setRepairOrderReservation] = useState<ActiveReservation | null>(null);
  const [aiAdvisorLoading, setAiAdvisorLoading] = useState(false);
  const [aiAdvisory, setAiAdvisory] = useState<any>(null);
  const [aiAdvisorOpen, setAiAdvisorOpen] = useState(false);
  const [repairOrderForm, setRepairOrderForm] = useState<any>({
    vehicleBrand: "", vehicleModel: "", vehiclePlate: "", vehicleVin: "",
    vehicleColor: "", vehicleYear: "", mileage: "", fuelLevel: "half",
    exteriorCondition: {} as Record<string, string>,
    interiorCondition: {} as Record<string, string>,
    accessories: {} as Record<string, boolean>,
    existingDamages: "", clientObservations: "", technicianNotes: "",
  });

  const { data: activeReservations = [], isLoading: loadingActive } = useQuery<ActiveReservation[]>({
    queryKey: ["/api/workshop/active-reservations"],
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services"],
  });

  const { data: repairOrders = [] } = useQuery<RepairOrder[]>({
    queryKey: ["/api/admin/repair-orders"],
  });

  const { data: tasks = [] } = useQuery<WorkshopTask[]>({
    queryKey: ["/api/workshop/reservations", selectedReservationId, "tasks"],
    enabled: !!selectedReservationId,
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ taskId, isCompleted, comment }: any) =>
      apiRequest("PATCH", `/api/workshop/tasks/${taskId}`, { isCompleted, comment }),
    onSuccess: () => {
      toast({ title: "Succès", description: "Étape mise à jour" });
      queryClient.invalidateQueries({ queryKey: ["/api/workshop/reservations", selectedReservationId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workshop/active-reservations"] });
      setCommentingTaskId(null);
      setCommentText("");
    },
    onError: (error: Error) =>
      toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const createRepairOrderMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/repair-orders", data),
    onSuccess: () => {
      toast({ title: "Succès", description: "Ordre de réparation créé" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/repair-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workshop/active-reservations"] });
      setRepairOrderDialog(false);
      setRepairOrderReservation(null);
    },
    onError: (error: Error) =>
      toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const initAllWorkflowsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/init-all-default-workflows", {}),
    onSuccess: (data: any) => {
      toast({ title: "Succès", description: "Workflows initialisés pour tous les services" });
      queryClient.invalidateQueries({ queryKey: ["/api/workshop/active-reservations"] });
    },
    onError: (error: Error) =>
      toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const updateRepairOrderMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiRequest("PATCH", `/api/admin/repair-orders/${id}`, data),
    onSuccess: () => {
      toast({ title: "Succès", description: "Ordre de réparation mis à jour" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/repair-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workshop/active-reservations"] });
    },
    onError: (error: Error) =>
      toast({ title: "Erreur", description: error.message, variant: "destructive" }),
  });

  const getClientName = (clientId: string) => {
    const user = users.find(u => u.id === clientId);
    if (!user) return `Client-${clientId.slice(0, 8)}`;
    return `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email;
  };

  const getServiceName = (serviceId: string) => {
    const service = services.find(s => s.id === serviceId);
    return service?.name || `Service-${serviceId.slice(0, 8)}`;
  };

  const handleCompleteTask = (task: WorkshopTask) => {
    updateTaskMutation.mutate({ taskId: task.id, isCompleted: !task.isCompleted, comment: task.comment });
  };

  const handleAddComment = (task: WorkshopTask) => {
    updateTaskMutation.mutate({ taskId: task.id, isCompleted: task.isCompleted, comment: commentText });
  };

  const openRepairOrderDialog = (reservation: ActiveReservation) => {
    setRepairOrderReservation(reservation);
    setRepairOrderForm({
      vehicleBrand: "", vehicleModel: "", vehiclePlate: "", vehicleVin: "",
      vehicleColor: "", vehicleYear: "", mileage: "", fuelLevel: "half",
      exteriorCondition: EXTERIOR_CHECKS.reduce((acc, check) => ({ ...acc, [check]: "ok" }), {}),
      interiorCondition: INTERIOR_CHECKS.reduce((acc, check) => ({ ...acc, [check]: "ok" }), {}),
      accessories: ACCESSORY_CHECKS.reduce((acc, check) => ({ ...acc, [check]: false }), {}),
      existingDamages: "", clientObservations: "", technicianNotes: "",
    });
    setRepairOrderDialog(true);
  };

  const submitRepairOrder = () => {
    if (!repairOrderReservation) return;
    createRepairOrderMutation.mutate({
      reservationId: repairOrderReservation.id,
      clientId: repairOrderReservation.clientId,
      garageId: repairOrderReservation.garageId,
      vehicleBrand: repairOrderForm.vehicleBrand,
      vehicleModel: repairOrderForm.vehicleModel,
      vehiclePlate: repairOrderForm.vehiclePlate,
      vehicleVin: repairOrderForm.vehicleVin,
      vehicleColor: repairOrderForm.vehicleColor,
      vehicleYear: repairOrderForm.vehicleYear ? parseInt(repairOrderForm.vehicleYear) : null,
      mileage: repairOrderForm.mileage ? parseInt(repairOrderForm.mileage) : null,
      fuelLevel: repairOrderForm.fuelLevel,
      exteriorCondition: repairOrderForm.exteriorCondition,
      interiorCondition: repairOrderForm.interiorCondition,
      accessories: repairOrderForm.accessories,
      existingDamages: repairOrderForm.existingDamages,
      clientObservations: repairOrderForm.clientObservations,
      technicianNotes: repairOrderForm.technicianNotes,
      status: "draft",
    });
  };

  const selectedReservation = activeReservations.find(r => r.id === selectedReservationId);
  const selectedTasks = selectedReservation?.tasks || tasks;
  const completedCount = selectedTasks.filter(t => t.isCompleted).length;
  const progressPercent = selectedTasks.length > 0 ? Math.round((completedCount / selectedTasks.length) * 100) : 0;

  const inProgressCount = activeReservations.filter(r => r.status === "confirmed" || r.status === "in_progress").length;
  const pendingCount = activeReservations.filter(r => r.status === "pending").length;
  const withRepairOrder = activeReservations.filter(r => r.repairOrder).length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2" data-testid="text-workshop-title">
            <Wrench className="h-7 w-7" />
            Gestion de l'Atelier
          </h1>
          <p className="text-muted-foreground mt-1">Suivi des travaux, ordres de réparation et workflows</p>
        </div>
        <Button
          variant="outline"
          onClick={() => initAllWorkflowsMutation.mutate()}
          disabled={initAllWorkflowsMutation.isPending}
          data-testid="button-init-workflows"
        >
          <Settings className="h-4 w-4 mr-2" />
          {initAllWorkflowsMutation.isPending ? "Initialisation..." : "Initialiser workflows"}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-amber-500/10">
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-pending-count">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">En attente</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-emerald-500/10">
                <Wrench className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-active-count">{inProgressCount}</p>
                <p className="text-sm text-muted-foreground">En cours</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="sm:col-span-2 lg:col-span-1">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-sky-500/10">
                <ClipboardCheck className="h-5 w-5 text-sky-500" />
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-repair-order-count">{withRepairOrder}</p>
                <p className="text-sm text-muted-foreground">Ordres de réparation</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="dashboard" data-testid="tab-dashboard">Tableau de bord</TabsTrigger>
          <TabsTrigger value="workflow" data-testid="tab-workflow">Workflow</TabsTrigger>
          <TabsTrigger value="repair-orders" data-testid="tab-repair-orders">Ordres de réparation</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4 mt-4">
          {loadingActive ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
          ) : activeReservations.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">Aucune réservation active</p>
              </CardContent>
            </Card>
          ) : (
            activeReservations.map(reservation => (
              <Card key={reservation.id} className="hover-elevate" data-testid={`card-reservation-${reservation.id}`}>
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <p className="font-semibold text-base" data-testid={`text-ref-${reservation.id}`}>
                          {reservation.reference || `RES-${reservation.id.slice(0, 8)}`}
                        </p>
                        <StatusBadge status={reservation.status as any} />
                        {reservation.repairOrder && (
                          <Badge variant="outline" className="text-sky-600 border-sky-300">
                            <ClipboardCheck className="h-3 w-3 mr-1" /> OR
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-muted-foreground">
                        <span>{getClientName(reservation.clientId)}</span>
                        <span>{getServiceName(reservation.serviceId)}</span>
                        <span>{format(new Date(reservation.scheduledDate), "dd MMM yyyy HH:mm", { locale: fr })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-primary/30 text-primary hover:bg-primary/10"
                        onClick={async () => {
                          setAiAdvisorOpen(true);
                          setAiAdvisory(null);
                          setAiAdvisorLoading(true);
                          try {
                            const ro = reservation.repairOrder;
                            const res = await apiRequest("POST", "/api/admin/ai/repair-advisor", {
                              vehicleBrand: ro?.vehicleBrand || "",
                              vehicleModel: ro?.vehicleModel || "",
                              vehicleYear: ro?.vehicleYear ? String(ro.vehicleYear) : "",
                              mileage: ro?.mileage ? String(ro.mileage) : "",
                              existingDamages: ro?.existingDamages || "",
                              clientObservations: ro?.clientObservations || "",
                              serviceName: getServiceName(reservation.serviceId),
                            });
                            const data = await res.json();
                            setAiAdvisory(data);
                          } catch {
                            toast({ title: "Erreur IA", description: "Impossible de générer le conseil.", variant: "destructive" });
                            setAiAdvisorOpen(false);
                          } finally {
                            setAiAdvisorLoading(false);
                          }
                        }}
                        data-testid={`button-ai-advisor-${reservation.id}`}
                      >
                        <Sparkles className="h-4 w-4 mr-1" />
                        Conseil IA
                      </Button>
                      {!reservation.repairOrder && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openRepairOrderDialog(reservation)}
                          data-testid={`button-create-or-${reservation.id}`}
                        >
                          <ClipboardCheck className="h-4 w-4 mr-1" />
                          Créer OR
                        </Button>
                      )}
                      <Button
                        size="sm"
                        onClick={() => { setSelectedReservationId(reservation.id); setActiveTab("workflow"); }}
                        data-testid={`button-workflow-${reservation.id}`}
                      >
                        <ChevronRight className="h-4 w-4 mr-1" />
                        Workflow
                      </Button>
                    </div>
                  </div>

                  {reservation.totalTasks > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">
                          Progression: {reservation.completedTasks}/{reservation.totalTasks}
                        </span>
                        <span className="text-xs font-medium">{reservation.progress}%</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            reservation.progress === 100 ? "bg-emerald-500" :
                            reservation.progress > 50 ? "bg-sky-500" :
                            reservation.progress > 0 ? "bg-amber-500" : "bg-muted"
                          }`}
                          style={{ width: `${reservation.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {reservation.totalTasks === 0 && (
                    <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
                      <CircleDot className="h-3 w-3" />
                      Aucun workflow assigné
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="workflow" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sélectionner une Réservation</CardTitle>
            </CardHeader>
            <CardContent>
              <Select value={selectedReservationId} onValueChange={setSelectedReservationId}>
                <SelectTrigger data-testid="select-reservation-workshop">
                  <SelectValue placeholder="Sélectionner une réservation" />
                </SelectTrigger>
                <SelectContent>
                  {activeReservations.map(reservation => (
                    <SelectItem key={reservation.id} value={reservation.id}>
                      {reservation.reference || `RES-${reservation.id.slice(0, 8)}`} — {getClientName(reservation.clientId)} — {getServiceName(reservation.serviceId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {selectedReservation && selectedTasks.length > 0 && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Progression des Travaux</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Avancement</span>
                      <span className="text-sm font-bold">{completedCount}/{selectedTasks.length} ({progressPercent}%)</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all ${
                          progressPercent === 100 ? "bg-emerald-500" : "bg-primary"
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Checklist des Étapes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {selectedTasks
                      .sort((a, b) => (a.step?.stepNumber || 0) - (b.step?.stepNumber || 0))
                      .map(task => (
                      <div
                        key={task.id}
                        className="flex items-start gap-3 p-3 border border-border rounded-md hover-elevate"
                        data-testid={`task-item-${task.id}`}
                      >
                        <Checkbox
                          checked={task.isCompleted}
                          onCheckedChange={() => handleCompleteTask(task)}
                          className="mt-1"
                          data-testid={`checkbox-task-${task.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{task.step.stepNumber}</Badge>
                            <p className={`font-medium ${task.isCompleted ? "line-through text-muted-foreground" : ""}`}>
                              {task.step.title}
                            </p>
                            {task.isCompleted && (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            )}
                          </div>
                          {task.step.description && (
                            <p className="text-sm text-muted-foreground mt-1">{task.step.description}</p>
                          )}
                          {task.comment && (
                            <div className="mt-2 p-2 bg-secondary rounded-md text-sm">
                              <p className="font-medium text-xs mb-1">Commentaire :</p>
                              <p>{task.comment}</p>
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setCommentingTaskId(task.id); setCommentText(task.comment || ""); }}
                          data-testid={`button-comment-${task.id}`}
                        >
                          {task.comment ? "Modifier" : "Commenter"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {selectedReservation && selectedTasks.length === 0 && (
            <Card>
              <CardContent className="pt-6 text-center space-y-3">
                <p className="text-muted-foreground">Aucune étape de workflow assignée</p>
                <Button
                  variant="outline"
                  onClick={() => initAllWorkflowsMutation.mutate()}
                  disabled={initAllWorkflowsMutation.isPending}
                  data-testid="button-init-workflow-inline"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Initialiser les workflows
                </Button>
              </CardContent>
            </Card>
          )}

          {!selectedReservationId && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">Sélectionnez une réservation pour voir son workflow</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="repair-orders" className="space-y-4 mt-4">
          {repairOrders.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">
                  Aucun ordre de réparation. Créez-en un depuis le tableau de bord.
                </p>
              </CardContent>
            </Card>
          ) : (
            repairOrders.map(order => (
              <Card key={order.id} data-testid={`card-repair-order-${order.id}`}>
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <p className="font-semibold" data-testid={`text-or-ref-${order.id}`}>
                          {order.reference || `OR-${order.id.slice(0, 8)}`}
                        </p>
                        <Badge variant={order.status === "signed" ? "default" : order.status === "completed" ? "secondary" : "outline"}>
                          {order.status === "draft" ? "Brouillon" : order.status === "signed" ? "Signé" : order.status === "in_progress" ? "En cours" : "Terminé"}
                        </Badge>
                        {order.signedByClient && (
                          <Badge variant="outline" className="text-emerald-600 border-emerald-300">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Signé par client
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
                        <span className="text-muted-foreground">
                          <Car className="h-3 w-3 inline mr-1" />
                          {order.vehicleBrand} {order.vehicleModel}
                        </span>
                        <span className="text-muted-foreground">{order.vehiclePlate}</span>
                        <span className="text-muted-foreground">
                          {order.mileage ? `${order.mileage.toLocaleString()} km` : "—"}
                        </span>
                        <span className="text-muted-foreground">
                          <Fuel className="h-3 w-3 inline mr-1" />
                          {FUEL_LEVELS.find(f => f.value === order.fuelLevel)?.label || "—"}
                        </span>
                      </div>
                      {order.existingDamages && (
                        <p className="text-sm text-muted-foreground mt-2">
                          <strong>Dommages :</strong> {order.existingDamages}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {order.status === "draft" && (
                        <Button
                          size="sm"
                          onClick={() => updateRepairOrderMutation.mutate({ id: order.id, data: { status: "signed", signedByClient: true, signedAt: new Date().toISOString() } })}
                          data-testid={`button-sign-or-${order.id}`}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Valider / Signer
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!commentingTaskId} onOpenChange={(open) => !open && setCommentingTaskId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Commentaire</DialogTitle>
            <DialogDescription>Ajoutez ou modifiez un commentaire sur cette étape</DialogDescription>
          </DialogHeader>
          <Textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Commentaire..."
            rows={4}
            data-testid="textarea-comment"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCommentingTaskId(null); setCommentText(""); }}>
              Annuler
            </Button>
            <Button
              onClick={() => {
                const task = selectedTasks.find(t => t.id === commentingTaskId);
                if (task) handleAddComment(task);
              }}
              disabled={updateTaskMutation.isPending}
              data-testid="button-save-comment"
            >
              {updateTaskMutation.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={repairOrderDialog} onOpenChange={(open) => { if (!open) { setRepairOrderDialog(false); setRepairOrderReservation(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Ordre de Réparation
            </DialogTitle>
            <DialogDescription>
              État des lieux du véhicule avant intervention
              {repairOrderReservation && (
                <span className="block mt-1 font-medium">
                  Réservation: {(repairOrderReservation as any).reference || repairOrderReservation.id.slice(0, 8)} — {getClientName(repairOrderReservation.clientId)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Car className="h-4 w-4" /> Informations véhicule
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Marque</Label>
                  <Input
                    value={repairOrderForm.vehicleBrand}
                    onChange={(e) => setRepairOrderForm({ ...repairOrderForm, vehicleBrand: e.target.value })}
                    placeholder="Ex: Renault"
                    data-testid="input-vehicle-brand"
                  />
                </div>
                <div>
                  <Label>Modèle</Label>
                  <Input
                    value={repairOrderForm.vehicleModel}
                    onChange={(e) => setRepairOrderForm({ ...repairOrderForm, vehicleModel: e.target.value })}
                    placeholder="Ex: Clio"
                    data-testid="input-vehicle-model"
                  />
                </div>
                <div>
                  <Label>Immatriculation</Label>
                  <Input
                    value={repairOrderForm.vehiclePlate}
                    onChange={(e) => setRepairOrderForm({ ...repairOrderForm, vehiclePlate: e.target.value.toUpperCase() })}
                    placeholder="Ex: AB-123-CD"
                    data-testid="input-vehicle-plate"
                  />
                </div>
                <div>
                  <Label>Couleur</Label>
                  <Input
                    value={repairOrderForm.vehicleColor}
                    onChange={(e) => setRepairOrderForm({ ...repairOrderForm, vehicleColor: e.target.value })}
                    placeholder="Ex: Noir"
                    data-testid="input-vehicle-color"
                  />
                </div>
                <div>
                  <Label>Année</Label>
                  <Input
                    type="number"
                    value={repairOrderForm.vehicleYear}
                    onChange={(e) => setRepairOrderForm({ ...repairOrderForm, vehicleYear: e.target.value })}
                    placeholder="Ex: 2022"
                    data-testid="input-vehicle-year"
                  />
                </div>
                <div>
                  <Label>Kilométrage</Label>
                  <Input
                    type="number"
                    value={repairOrderForm.mileage}
                    onChange={(e) => setRepairOrderForm({ ...repairOrderForm, mileage: e.target.value })}
                    placeholder="Ex: 45000"
                    data-testid="input-mileage"
                  />
                </div>
                <div>
                  <Label>VIN</Label>
                  <Input
                    value={repairOrderForm.vehicleVin}
                    onChange={(e) => setRepairOrderForm({ ...repairOrderForm, vehicleVin: e.target.value.toUpperCase() })}
                    placeholder="Numéro de châssis"
                    data-testid="input-vin"
                  />
                </div>
                <div>
                  <Label>Niveau de carburant</Label>
                  <Select value={repairOrderForm.fuelLevel} onValueChange={(v) => setRepairOrderForm({ ...repairOrderForm, fuelLevel: v })}>
                    <SelectTrigger data-testid="select-fuel-level">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FUEL_LEVELS.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.icon} {f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Eye className="h-4 w-4" /> État extérieur
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {EXTERIOR_CHECKS.map(check => (
                  <div key={check} className="flex items-center justify-between p-2 border rounded-md">
                    <span className="text-sm">{check}</span>
                    <Select
                      value={repairOrderForm.exteriorCondition[check] || "ok"}
                      onValueChange={(v) => setRepairOrderForm({
                        ...repairOrderForm,
                        exteriorCondition: { ...repairOrderForm.exteriorCondition, [check]: v }
                      })}
                    >
                      <SelectTrigger className="w-28" data-testid={`select-ext-${check}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ok">OK</SelectItem>
                        <SelectItem value="rayure">Rayure</SelectItem>
                        <SelectItem value="bosse">Bosse</SelectItem>
                        <SelectItem value="casse">Cassé</SelectItem>
                        <SelectItem value="manquant">Manquant</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-3">État intérieur</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {INTERIOR_CHECKS.map(check => (
                  <div key={check} className="flex items-center justify-between p-2 border rounded-md">
                    <span className="text-sm">{check}</span>
                    <Select
                      value={repairOrderForm.interiorCondition[check] || "ok"}
                      onValueChange={(v) => setRepairOrderForm({
                        ...repairOrderForm,
                        interiorCondition: { ...repairOrderForm.interiorCondition, [check]: v }
                      })}
                    >
                      <SelectTrigger className="w-28" data-testid={`select-int-${check}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ok">OK</SelectItem>
                        <SelectItem value="sale">Sale</SelectItem>
                        <SelectItem value="abime">Abîmé</SelectItem>
                        <SelectItem value="casse">Cassé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-3">Accessoires présents</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {ACCESSORY_CHECKS.map(check => (
                  <div key={check} className="flex items-center gap-2 p-2 border rounded-md">
                    <Checkbox
                      checked={repairOrderForm.accessories[check] || false}
                      onCheckedChange={(checked) => setRepairOrderForm({
                        ...repairOrderForm,
                        accessories: { ...repairOrderForm.accessories, [check]: checked }
                      })}
                      data-testid={`checkbox-acc-${check}`}
                    />
                    <span className="text-sm">{check}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Dommages existants</Label>
                <Textarea
                  value={repairOrderForm.existingDamages}
                  onChange={(e) => setRepairOrderForm({ ...repairOrderForm, existingDamages: e.target.value })}
                  placeholder="Décrire les dommages préexistants..."
                  rows={3}
                  data-testid="textarea-damages"
                />
              </div>
              <div>
                <Label>Observations du client</Label>
                <Textarea
                  value={repairOrderForm.clientObservations}
                  onChange={(e) => setRepairOrderForm({ ...repairOrderForm, clientObservations: e.target.value })}
                  placeholder="Observations ou demandes du client..."
                  rows={3}
                  data-testid="textarea-client-obs"
                />
              </div>
              <div>
                <Label>Notes du technicien</Label>
                <Textarea
                  value={repairOrderForm.technicianNotes}
                  onChange={(e) => setRepairOrderForm({ ...repairOrderForm, technicianNotes: e.target.value })}
                  placeholder="Notes techniques..."
                  rows={3}
                  data-testid="textarea-tech-notes"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setRepairOrderDialog(false); setRepairOrderReservation(null); }}>
              Annuler
            </Button>
            <Button
              onClick={submitRepairOrder}
              disabled={createRepairOrderMutation.isPending || !repairOrderForm.vehiclePlate}
              data-testid="button-submit-repair-order"
            >
              {createRepairOrderMutation.isPending ? "Création..." : "Créer l'ordre de réparation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Repair Advisor Dialog */}
      <Dialog open={aiAdvisorOpen} onOpenChange={(o) => { setAiAdvisorOpen(o); if (!o) setAiAdvisory(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary" />
              Conseiller IA — Guide de réparation
            </DialogTitle>
          </DialogHeader>
          {aiAdvisorLoading && (
            <div className="py-10 text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Analyse du véhicule et génération du guide...</p>
            </div>
          )}
          {aiAdvisory && !aiAdvisorLoading && (
            <div className="space-y-5 py-2">
              {/* Diagnostic */}
              <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" /> Diagnostic
                </p>
                <p className="text-sm">{aiAdvisory.diagnostic}</p>
                <div className="flex items-center gap-3 mt-2 flex-wrap">
                  {aiAdvisory.duree_totale && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {aiAdvisory.duree_totale}
                    </span>
                  )}
                  {aiAdvisory.difficulte && (
                    <span className="text-xs px-2 py-0.5 rounded bg-muted font-medium">{aiAdvisory.difficulte}</span>
                  )}
                </div>
              </div>

              {/* Étapes */}
              {(aiAdvisory.etapes || []).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Étapes de réparation</p>
                  {(aiAdvisory.etapes || []).map((e: any) => (
                    <div key={e.numero} className="flex gap-3 p-3 rounded-md border">
                      <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                        {e.numero}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{e.titre}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{e.description}</p>
                        {e.duree_estimee && <p className="text-xs text-primary mt-1 flex items-center gap-1"><Clock className="h-3 w-3" />{e.duree_estimee}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Matériel requis */}
              {(aiAdvisory.materiel_requis || []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <Wrench className="h-3.5 w-3.5" /> Matériel requis
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(aiAdvisory.materiel_requis || []).map((m: string, i: number) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-muted border">{m}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Précautions */}
              {(aiAdvisory.precautions || []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400 mb-1.5 flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" /> Précautions
                  </p>
                  {(aiAdvisory.precautions || []).map((p: string, i: number) => (
                    <p key={i} className="text-sm text-muted-foreground pl-4">• {p}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
