import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { User } from "@shared/schema";
import {
  Search,
  Phone,
  Mail,
  Shield,
  ShieldCheck,
  Wrench,
  MessageCircle,
  History,
  Users,
  Calendar,
  ExternalLink,
} from "lucide-react";

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(user: User): string {
  const f = user.firstName?.charAt(0)?.toUpperCase() || "";
  const l = user.lastName?.charAt(0)?.toUpperCase() || "";
  return f + l || user.email.charAt(0).toUpperCase();
}

function getRoleInfo(role: string) {
  switch (role) {
    case "superadmin":
      return { label: "Super Admin", icon: ShieldCheck, variant: "destructive" as const };
    case "admin":
      return { label: "Administrateur", icon: Shield, variant: "default" as const };
    case "employe":
      return { label: "Employé", icon: Wrench, variant: "secondary" as const };
    default:
      return { label: role, icon: Users, variant: "outline" as const };
  }
}

export default function AdminTeam() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("members");

  const { data: allUsers = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    enabled: isAuthenticated && isAdmin,
  });

  const { data: auditLogs = [], isLoading: logsLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/audit-logs"],
    enabled: isAuthenticated && isAdmin && activeTab === "history",
  });

  const teamMembers = useMemo(() => {
    return allUsers.filter(
      (u) => u.role === "admin" || u.role === "superadmin" || u.role === "employe"
    );
  }, [allUsers]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery) return teamMembers;
    const q = searchQuery.toLowerCase();
    return teamMembers.filter(
      (m) =>
        (m.firstName || "").toLowerCase().includes(q) ||
        (m.lastName || "").toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.phone || "").includes(q)
    );
  }, [teamMembers, searchQuery]);

  const admins = filteredMembers.filter((m) => m.role === "admin" || m.role === "superadmin");
  const employees = filteredMembers.filter((m) => m.role === "employe");

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4" data-testid="page-admin-team">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-team-title">
            Équipe
          </h1>
          <p className="text-sm text-muted-foreground">
            {teamMembers.length} membre{teamMembers.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-team">
          <TabsTrigger value="members" data-testid="tab-members">
            <Users className="h-4 w-4 mr-2" />
            Membres
          </TabsTrigger>
          <TabsTrigger value="chat" data-testid="tab-chat">
            <MessageCircle className="h-4 w-4 mr-2" />
            Chat interne
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="h-4 w-4 mr-2" />
            Historique
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4 mt-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un membre..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-team"
            />
          </div>

          {admins.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Administrateurs ({admins.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {admins.map((member) => (
                  <TeamMemberCard key={member.id} member={member} />
                ))}
              </div>
            </div>
          )}

          {employees.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Employés ({employees.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {employees.map((member) => (
                  <TeamMemberCard key={member.id} member={member} />
                ))}
              </div>
            </div>
          )}

          {filteredMembers.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">Aucun membre trouvé</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="text-muted-foreground">Accédez au chat interne de l'équipe</p>
              <Button onClick={() => setLocation("/admin/chat")} data-testid="button-open-chat">
                <MessageCircle className="h-4 w-4 mr-2" />
                Ouvrir le chat
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          {logsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : auditLogs.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <History className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">Aucun événement enregistré</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {auditLogs.slice(0, 50).map((log: any, index: number) => (
                <Card key={log.id || index} data-testid={`event-log-${index}`}>
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <History className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {log.action || log.eventType || "Action"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {log.details || log.description || "-"}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">
                      {formatDateTime(log.createdAt || log.timestamp)}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {auditLogs.length > 50 && (
                <div className="text-center pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setLocation("/admin/audit-logs")}
                    data-testid="button-view-all-logs"
                  >
                    Voir tout l'historique
                    <ExternalLink className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TeamMemberCard({ member }: { member: User }) {
  const roleInfo = getRoleInfo(member.role);
  const RoleIcon = roleInfo.icon;

  return (
    <Card data-testid={`card-team-${member.id}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarImage src={member.profileImageUrl || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {getInitials(member)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold truncate">
              {member.firstName || ""} {member.lastName || ""}
            </h3>
            <Badge variant={roleInfo.variant}>
              <RoleIcon className="h-3 w-3 mr-1" />
              {roleInfo.label}
            </Badge>
          </div>
        </div>

        <div className="space-y-1.5 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{member.email}</span>
          </div>
          {member.phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span>{member.phone}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span>Depuis le {formatDate(member.createdAt as any)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
