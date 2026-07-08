// Local authentication with email/password
import { Switch, Route, Redirect, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { UserMenu } from "@/components/user-menu";
import { useAuth } from "@/hooks/useAuth";
import { useWebSocket } from "@/hooks/useWebSocket";
import { Button } from "@/components/ui/button";
import { LifeBuoy, MessageCircle, Home, FileText, Receipt, Box } from "lucide-react";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import ClientDashboard from "@/pages/client-dashboard";
import ClientQuotes from "@/pages/client-quotes";
import ClientInvoices from "@/pages/client-invoices";
import AdminDashboard from "@/pages/admin-dashboard";
import Services from "@/pages/services";
import AdminQuotes from "@/pages/admin-quotes";
import AdminServices from "@/pages/admin-services";
import AdminInvoices from "@/pages/admin-invoices";
import AdminInvoiceEdit from "@/pages/admin-invoice-edit";
import AdminQuoteEdit from "@/pages/admin-quote-edit";
import AdminReservations from "@/pages/admin-reservations";
import AdminCalendar from "@/pages/admin-calendar";
import AdminSettings from "@/pages/admin-settings";
import AdminUsers from "@/pages/admin-users";
import AdminEngagements from "@/pages/admin-engagements";
import AdminServiceWorkflows from "@/pages/admin-service-workflows";
import AdminAuditLogs from "@/pages/admin-audit-logs";
import AdminSmsLogs from "@/pages/admin-sms-logs";
import WorkshopManagement from "@/pages/workshop-management";
import EmployeeServices from "@/pages/employee-services";
import ForgotPassword from "@/pages/forgot-password";
import ResetPassword from "@/pages/reset-password";
import InternalChat from "@/pages/internal-chat";
import AdminBackups from "@/pages/admin-backups";
import AdminGarages from "@/pages/admin-garages";
import AdminDeliveryNotes from "@/pages/admin-delivery-notes";
import MobileSpecs from "@/pages/mobile-specs";
import PublicQuoteView from "@/pages/public-quote-view";
import PublicBooking from "@/pages/public-booking";
import PublicInvoiceView from "@/pages/public-invoice-view";
import PublicReview from "@/pages/public-review";
import AdminReviews from "@/pages/admin-reviews";
import AdminClients from "@/pages/admin-clients";
import AdminTeam from "@/pages/admin-team";

import AdminPayments from "@/pages/admin-payments";
import AdminBankConnection from "@/pages/admin-bank-connection";
import AdminStripeBanking from "@/pages/admin-stripe-banking";
import AdminBridgeBanking from "@/pages/admin-bridge-banking";
import PaymentSuccess from "@/pages/payment-success";
import PaymentCancel from "@/pages/payment-cancel";
import PaymentCheckout from "@/pages/payment-checkout";
import AdminAccounting from "@/pages/admin-accounting";
import AdminExpenses from "@/pages/admin-expenses";
import AdminCreditNotes from "@/pages/admin-credit-notes";
import AdminScanner from "@/pages/admin-scanner";
import AdminQuoteRequests from "@/pages/admin-quote-requests";
import AdminAdvancedAnalytics from "@/pages/admin-advanced-analytics";
import AdminAIAnalyses from "@/pages/admin-ai-analyses";
import AdminWheelSettings from "@/pages/admin-wheel-settings";
import AdminNotificationSettings from "@/pages/admin-notification-settings";
import ClientChat from "@/pages/client-chat";
import SupportPage from "@/pages/support";
import WheelConfigurator from "@/pages/wheel-configurator";
import ARWheelTryOn from "@/pages/ar-wheel-tryon";
import AdminCSVImport from "@/pages/admin-csv-import";
import AdminGallery from "@/pages/admin-gallery";
import AdminExternalApis from "@/pages/admin-external-apis";
import AdminMonitoring from "@/pages/admin-monitoring";
import AdminMailingResend from "@/pages/admin-mailing-resend";
import AdminMailingAppSent from "@/pages/admin-mailing-app-sent";
import PrivacyPolicy from "@/pages/privacy-policy";
import AccessControlPolicy from "@/pages/access-control-policy";
import PublicPaymentSuccess from "@/pages/public-payment-success";
import AtelierPage from "@/pages/atelier";
import AtelierDashboardPage from "@/pages/admin-atelier-dashboard";
import { AIAssistant } from "@/components/ai-assistant";
import logoMyJantes from "@assets/cropped-Logo-2-1-768x543_(3)_1767977972324.png";


function Router() {
  const { isAuthenticated, isLoading, isAdmin, isSuperAdmin, isRoot, isEmployee } = useAuth();
  const [location] = useLocation();
  useWebSocket(); // Initialize WebSocket connection

  if (isLoading) {
    return (
      <Switch>
        <Route path="/devis/:token" component={PublicQuoteView} />
        <Route path="/reservation/:token" component={PublicBooking} />
        <Route path="/facture/:token/paiement-confirme" component={PublicPaymentSuccess} />
        <Route path="/facture/:token" component={PublicInvoiceView} />
        <Route path="/avis/:token" component={PublicReview} />
        <Route>
          <div className="flex items-center justify-center min-h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Chargement...</p>
            </div>
          </div>
        </Route>
      </Switch>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <Switch>
          <Route path="/" component={Landing} />
          <Route path="/login" component={Login} />
          <Route path="/devis/:token" component={PublicQuoteView} />
          <Route path="/reservation/:token" component={PublicBooking} />
          <Route path="/facture/:token/paiement-confirme" component={PublicPaymentSuccess} />
          <Route path="/facture/:token" component={PublicInvoiceView} />
          <Route path="/avis/:token" component={PublicReview} />
          <Route path="/mobile-specs" component={MobileSpecs} />
          <Route path="/forgot-password" component={ForgotPassword} />
          <Route path="/reset-password/:token" component={ResetPassword} />
          <Route path="/payment/checkout" component={PaymentCheckout} />
          <Route path="/payment/success" component={PaymentSuccess} />
          <Route path="/payment/cancel" component={PaymentCancel} />
          <Route>
            <Redirect to="/login" />
          </Route>
        </Switch>
      </>
    );
  }

  if (isAdmin || isSuperAdmin) {
    const style = {
      "--sidebar-width": "16rem",
      "--sidebar-width-icon": "3rem",
    };

    return (
      <>
        <SidebarProvider style={style as React.CSSProperties}>
          <div className="flex h-screen w-full">
            <AppSidebar />
            <div className="flex flex-col flex-1 overflow-hidden">
              <header className="flex items-center justify-between gap-2 p-2 sm:p-4 header-glass shrink-0 sticky top-0 z-50">
                <SidebarTrigger data-testid="button-sidebar-toggle" />
                <div className="flex items-center gap-1 sm:gap-2">
                  <NotificationBell />
                  <ThemeToggle />
                  <UserMenu />
                </div>
              </header>
              <main className="flex-1 overflow-auto page-transition">
                <Switch>
                  <Route path="/devis/:token" component={PublicQuoteView} />
                  <Route path="/reservation/:token" component={PublicBooking} />
                  <Route path="/facture/:token/paiement-confirme" component={PublicPaymentSuccess} />
                  <Route path="/facture/:token" component={PublicInvoiceView} />
                  <Route path="/avis/:token" component={PublicReview} />
                  <Route path="/admin/dashboard" component={AdminDashboard} />
                  <Route path="/admin" component={AdminDashboard} />
                  <Route path="/admin/engagements" component={AdminEngagements} />
                  <Route path="/admin/service-workflows" component={AdminServiceWorkflows} />
                  <Route path="/admin/services" component={AdminServices} />
                  <Route path="/admin/quotes/:id/edit" component={AdminQuoteEdit} />
                  <Route path="/admin/quotes" component={AdminQuotes} />
                  <Route path="/admin/invoices/:id/edit" component={AdminInvoiceEdit} />
                  <Route path="/admin/invoices" component={AdminInvoices} />
                  <Route path="/payment/checkout" component={PaymentCheckout} />
                  <Route path="/payment/success" component={PaymentSuccess} />
                  <Route path="/payment/cancel" component={PaymentCancel} />
                  <Route path="/admin/delivery-notes" component={AdminDeliveryNotes} />
                  <Route path="/admin/reservations" component={AdminReservations} />
                  <Route path="/admin/calendar" component={AdminCalendar} />
                  <Route path="/admin/workshop" component={WorkshopManagement} />
                  <Route path="/admin/atelier-dashboard" component={AtelierDashboardPage} />
                  <Route path="/atelier" component={AtelierPage} />
                  <Route path="/admin/services-catalog" component={EmployeeServices} />
                  <Route path="/admin/users" component={AdminUsers} />
                  <Route path="/admin/audit-logs" component={AdminAuditLogs} />
                  <Route path="/admin/sms-logs" component={AdminSmsLogs} />
                  <Route path="/admin/settings" component={AdminSettings} />
                  <Route path="/admin/chat" component={InternalChat} />
                  <Route path="/admin/garages" component={AdminGarages} />
                  <Route path="/admin/reviews" component={AdminReviews} />
                  <Route path="/admin/clients" component={AdminClients} />
                  <Route path="/admin/team" component={AdminTeam} />
                  
                  <Route path="/admin/payments" component={AdminPayments} />
                  <Route path="/admin/bank-connection" component={AdminBankConnection} />
                  <Route path="/admin/stripe-banking" component={AdminStripeBanking} />
                  <Route path="/admin/bridge-banking" component={AdminBridgeBanking} />
                  <Route path="/admin/advanced-analytics" component={AdminAdvancedAnalytics} />
                  <Route path="/admin/ai-analyses" component={AdminAIAnalyses} />

                  {/* Accounting routes restricted for employees */}
                  {!isEmployee && (
                    <>
                      <Route path="/admin/accounting" component={AdminAccounting} />
                      <Route path="/admin/expenses" component={AdminExpenses} />
                      <Route path="/admin/credit-notes" component={AdminCreditNotes} />
                    </>
                  )}

                  {isSuperAdmin && <Route path="/admin/gallery" component={AdminGallery} />}
                  {isRoot && <Route path="/admin/monitoring" component={AdminMonitoring} />}
                  {isRoot && <Route path="/admin/external-apis" component={AdminExternalApis} />}
                  {isRoot && <Route path="/admin/mailing/resend" component={AdminMailingResend} />}
                  {isRoot && <Route path="/admin/mailing/app-sent" component={AdminMailingAppSent} />}
                  {isSuperAdmin && <Route path="/admin/backups" component={AdminBackups} />}
                  <Route path="/admin/scanner" component={AdminScanner} />
                  <Route path="/admin/quote-requests" component={AdminQuoteRequests} />
                  <Route path="/admin/import-csv" component={AdminCSVImport} />
                  <Route path="/admin/wheel-settings" component={AdminWheelSettings} />
                  <Route path="/admin/notification-settings" component={AdminNotificationSettings} />
                  <Route path="/privacy" component={PrivacyPolicy} />
                  <Route path="/access-policy" component={AccessControlPolicy} />
                  <Route path="/configurateur" component={WheelConfigurator} />
                  <Route path="/ar-jantes" component={ARWheelTryOn} />
                  <Route path="/support" component={SupportPage} />
                  <Route path="/mobile-specs" component={MobileSpecs} />
                  <Route path="/login">
                    <Redirect to="/admin" />
                  </Route>
                  <Route path="/">
                    <Redirect to="/admin" />
                  </Route>
                  <Route>
                    <Redirect to="/admin" />
                  </Route>
                </Switch>
              </main>
            </div>
          </div>
        </SidebarProvider>
        <AIAssistant />
      </>
    );
  }

  const clientNavItems = [
    { href: "/", icon: Home, label: "Accueil" },
    { href: "/quotes", icon: FileText, label: "Devis" },
    { href: "/invoices", icon: Receipt, label: "Factures" },
    { href: "/configurateur", icon: Box, label: "Simulateur" },
    { href: "/messages", icon: MessageCircle, label: "Messages" },
  ];

  return (
    <>
      <div className="flex flex-col h-screen">
        <header className="flex items-center justify-between gap-2 p-2 sm:p-4 border-b border-border bg-background shrink-0 sticky top-0 z-50">
          <Link href="/" className="flex items-center gap-2">
            <img src={logoMyJantes} alt="MyJantes" className="h-8 sm:h-10 object-contain" />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="icon" data-testid="button-client-support" asChild className="hidden sm:flex">
              <Link href="/support">
                <LifeBuoy className="h-4 w-4" />
              </Link>
            </Button>
            <NotificationBell />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        <main className="flex-1 overflow-auto pb-16 sm:pb-0">
          <Switch>
            <Route path="/" component={ClientDashboard} />
            <Route path="/services" component={Services} />
            <Route path="/quotes" component={ClientQuotes} />
            <Route path="/invoices" component={ClientInvoices} />
            <Route path="/messages" component={ClientChat} />
            <Route path="/privacy" component={PrivacyPolicy} />
            <Route path="/access-policy" component={AccessControlPolicy} />
            <Route path="/configurateur" component={WheelConfigurator} />
            <Route path="/ar-jantes" component={ARWheelTryOn} />
            <Route path="/support" component={SupportPage} />
            <Route path="/payment/checkout" component={PaymentCheckout} />
            <Route path="/payment/success" component={PaymentSuccess} />
            <Route path="/payment/cancel" component={PaymentCancel} />
            <Route path="/mobile-specs" component={MobileSpecs} />
            <Route path="/login">
              <Redirect to="/" />
            </Route>
            <Route>
              <Redirect to="/" />
            </Route>
          </Switch>
        </main>

        <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border flex items-center" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          {clientNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}
                data-testid={`nav-bottom-${item.label.toLowerCase()}`}
              >
                <Icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      <AIAssistant />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Router />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
