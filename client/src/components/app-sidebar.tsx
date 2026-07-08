import { useState, useEffect, useMemo } from "react";
import {
  Home,
  FileText,
  DollarSign,
  Calendar,
  CalendarCheck,
  Settings,
  Package,
  Users,
  Briefcase,
  Wrench,
  ClipboardList,
  GitBranch,
  History,
  MessageCircle,
  LifeBuoy,
  Archive,
  Truck,
  Star,
  CreditCard,
  Landmark,
  ChevronDown,
  Receipt,
  Calculator,
  BookOpen,
  ShoppingBag,
  UserCircle,
  UsersRound,
  Cog,
  ShieldCheck,
  Shield,
  Lock,
  ScanLine,
  BarChart3,
  MessageSquare,
  Paintbrush,
  Camera,
  Images,
  Bell,
  Upload,
  Clock,
  Globe,
  Brain,
  Tv2,
  LayoutDashboard,
  ArrowLeftRight,
  Inbox,
  Activity,
  Mail,
  Send,
  type LucideIcon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import logoMyJantes from "@assets/cropped-Logo-2-1-768x543_(3)_1767977972324.png";
import { useSidebar } from "@/components/ui/sidebar";

interface MenuItem {
  title: string;
  url: string;
  icon: LucideIcon;
  hideForEmployee?: boolean;
  superadminOnly?: boolean;
  rootOnly?: boolean;
}

interface MenuGroup {
  label: string;
  icon: LucideIcon;
  items: MenuItem[];
  superadminOnly?: boolean;
  rootOnly?: boolean;
  hideForEmployee?: boolean;
  collapsible?: boolean;
}

const menuGroups: MenuGroup[] = [
  {
    label: "Mon Compte",
    icon: UserCircle,
    items: [
      { title: "Tableau de bord", url: "/admin", icon: Home },
      { title: "Configurateur 3D", url: "/configurateur", icon: Paintbrush },
      { title: "Essai AR", url: "/ar-jantes", icon: Camera },
      { title: "Mes Devis", url: "/admin/quotes", icon: FileText },
      { title: "Mes Factures", url: "/admin/invoices", icon: DollarSign },
      { title: "Mes Réservations", url: "/admin/reservations", icon: Calendar },
    ],
  },
  {
    label: "Gestion Atelier",
    icon: Wrench,
    items: [
      { title: "Atelier", url: "/admin/workshop", icon: Wrench },
      { title: "Dashboard Atelier", url: "/admin/atelier-dashboard", icon: LayoutDashboard },
      { title: "Mode Atelier TV", url: "/atelier", icon: Tv2 },
      { title: "Planning", url: "/admin/calendar", icon: CalendarCheck },
      { title: "Prestations", url: "/admin/engagements", icon: Briefcase },
      { title: "Livraisons", url: "/admin/delivery-notes", icon: Truck },
      { title: "Galerie Photos", url: "/admin/gallery", icon: Images },
    ],
  },
  {
    label: "Catalogue & Services",
    icon: ClipboardList,
    items: [
      { title: "Catalogue", url: "/admin/services-catalog", icon: ClipboardList },
      { title: "Services", url: "/admin/services", icon: Package },
      { title: "Workflows", url: "/admin/service-workflows", icon: GitBranch },
    ],
  },
  {
    label: "Ventes & Clients",
    icon: ShoppingBag,
    hideForEmployee: true,
    items: [
      { title: "Demandes devis", url: "/admin/quote-requests", icon: Inbox },
      { title: "Paiements", url: "/admin/payments", icon: CreditCard },
      { title: "Liste clients", url: "/admin/clients", icon: Users },
      { title: "Avis clients", url: "/admin/reviews", icon: Star },
      { title: "Analyses", url: "/admin/advanced-analytics", icon: BarChart3 },
      { title: "Analyses IA", url: "/admin/ai-analyses", icon: Brain },
    ],
  },
  {
    label: "Comptabilité",
    icon: Calculator,
    hideForEmployee: true,
    superadminOnly: true,
    items: [
      { title: "Vue d'ensemble", url: "/admin/accounting", icon: BookOpen },
      { title: "Dépenses", url: "/admin/expenses", icon: Receipt },
      { title: "Avoirs", url: "/admin/credit-notes", icon: FileText },
      { title: "Stripe Banking", url: "/admin/stripe-banking", icon: Landmark },
    ],
  },
  {
    label: "Équipe",
    icon: UsersRound,
    hideForEmployee: true,
    items: [
      { title: "Membres", url: "/admin/team", icon: UsersRound },
      { title: "Chat interne", url: "/admin/chat", icon: MessageCircle },
      { title: "Historique Audit", url: "/admin/audit-logs", icon: History },
      { title: "Journal SMS", url: "/admin/sms-logs", icon: MessageSquare },
    ],
  },
  {
    label: "Paramètres",
    icon: Cog,
    hideForEmployee: true,
    items: [
      { title: "Général", url: "/admin/settings", icon: Settings },
      { title: "Utilisateurs", url: "/admin/users", icon: UserCircle },
      { title: "Rappels auto", url: "/admin/notification-settings", icon: Bell },
      { title: "Simulateur", url: "/admin/wheel-settings", icon: Cog },
      { title: "Import / Export", url: "/admin/import-csv", icon: ArrowLeftRight },
      { title: "Scanner OCR", url: "/admin/scanner", icon: ScanLine },
      { title: "Confidentialité", url: "/privacy", icon: Shield },
      { title: "Accès", url: "/access-policy", icon: Lock },
    ],
  },
  {
    label: "Administration Système",
    icon: ShieldCheck,
    superadminOnly: true,
    items: [
      { title: "Monitoring", url: "/admin/monitoring", icon: Activity, rootOnly: true },
      { title: "APIs externes", url: "/admin/external-apis", icon: Globe, rootOnly: true },
      { title: "Sauvegardes", url: "/admin/backups", icon: Archive },
    ],
  },
  {
    label: "Mailing",
    icon: Mail,
    rootOnly: true,
    items: [
      { title: "Resend mail", url: "/admin/mailing/resend", icon: Inbox },
      { title: "App mail sent", url: "/admin/mailing/app-sent", icon: Send },
    ],
  },
];

function isGroupActive(group: MenuGroup, location: string) {
  return group.items.some(item => item.url === location);
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user, isSuperAdmin, isRoot } = useAuth();
  const { setOpenMobile } = useSidebar();
  const isEmployee = user?.role === "employe";

  // Debug roles if needed
  // console.log("Auth State:", { role: user?.role, isRoot, isSuperAdmin });

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    menuGroups.forEach(group => {
      if (isGroupActive(group, location)) {
        initial[group.label] = true;
      }
    });
    return initial;
  });

  const toggleGroup = (label: string) => {
    setOpenGroups(prev => ({ ...prev, [label]: !prev[label] }));
  };

  const [recentlyViewed, setRecentlyViewed] = useState<string[]>(() => {
    const saved = localStorage.getItem("recentlyViewed");
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    if (location && location.startsWith("/admin")) {
      setRecentlyViewed(prev => {
        const filtered = prev.filter(url => url !== location);
        const next = [location, ...filtered].slice(0, 5);
        localStorage.setItem("recentlyViewed", JSON.stringify(next));
        return next;
      });
    }
  }, [location]);

  const recentItems = useMemo(() => {
    const allItems = menuGroups.flatMap(g => g.items);
    return recentlyViewed
      .map(url => allItems.find(item => item.url === url))
      .filter((item): item is MenuItem => !!item && item.url !== "/admin");
  }, [recentlyViewed]);

  return (
    <Sidebar className="sidebar-gradient">
      <SidebarContent>
        <SidebarGroup>
          <div className="px-4 py-5">
            <div className="rounded-md p-2 inline-block bg-white backdrop-blur-sm border border-white/20">
              <img
                src={logoMyJantes}
                alt="MyJantes Logo"
                className="h-10 w-auto"
                data-testid="logo-myjantes"
              />
            </div>
            <p className="text-[10px] font-bold tracking-widest text-sidebar-foreground/70 mt-2 uppercase">L'EXPERT DE LA JANTE ALU</p>
          </div>
        </SidebarGroup>

        {recentItems.length > 0 && (
          <SidebarGroup>
            <div className="px-3 pb-1">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-3.5 w-3.5 text-sidebar-foreground/50" />
                <span className="text-[10px] font-bold text-sidebar-foreground/50 uppercase tracking-widest">Consultés récemment</span>
              </div>
              <SidebarMenu>
                {recentItems.map((item) => (
                  <SidebarMenuItem key={`recent-${item.url}`}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      onClick={() => setOpenMobile(false)}
                      className="h-8 text-xs"
                    >
                      <Link href={item.url}>
                        <item.icon className="h-3.5 w-3.5" />
                        <span className="truncate">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </div>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarMenu>
            {menuGroups.map((group) => {
              if (group.rootOnly && !isRoot) return null;
              if (group.superadminOnly && !isSuperAdmin) return null;
              if (group.hideForEmployee && isEmployee) return null;

              const active = isGroupActive(group, location);
              const isOpen = openGroups[group.label] || active;
              const isSingleDirect = group.collapsible === false;
              const GroupIcon = group.icon;

              if (isSingleDirect) {
                const item = group.items[0];
                return (
                  <SidebarMenuItem key={group.label}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      data-testid={`nav-${group.label.toLowerCase().replace(/\s+/g, "-")}`}
                      onClick={() => setOpenMobile(false)}
                    >
                      <Link href={item.url}>
                        <GroupIcon className="h-4 w-4" />
                        <span>{group.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }

              return (
                <Collapsible
                  key={group.label}
                  open={isOpen}
                  onOpenChange={() => toggleGroup(group.label)}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        data-testid={`nav-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`}
                        className={active ? "font-medium" : ""}
                      >
                        <GroupIcon className="h-4 w-4" />
                        <span className="flex-1">{group.label}</span>
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {group.items.map((item) => {
                          if (item.hideForEmployee && isEmployee) return null;
                          if (item.rootOnly && !isRoot) return null;
                          if (item.superadminOnly && !isSuperAdmin) return null;
                          return (
                            <SidebarMenuSubItem key={item.url}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={location === item.url}
                                data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                                onClick={() => {
                                  if (window.innerWidth < 1024) {
                                    setOpenMobile(false);
                                  }
                                }}
                              >
                                <Link href={item.url}>
                                  <item.icon className="h-3.5 w-3.5" />
                                  <span>{item.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild data-testid="button-support">
              <Link href="/support">
                <LifeBuoy className="h-4 w-4" />
                <span>Support</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
