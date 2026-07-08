import { useEffect } from "react";
import jsPDF from "jspdf";

export default function MobileSpecs() {
  useEffect(() => {
    generatePDF();
  }, []);

  const generatePDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const margin = 15;
    let y = 20;

    const addTitle = (text: string, size: number = 16) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(size);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(220, 38, 38);
      doc.text(text, margin, y);
      y += size * 0.5 + 4;
    };

    const addSubtitle = (text: string) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(50, 50, 50);
      doc.text(text, margin, y);
      y += 7;
    };

    const addText = (text: string) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 5 + 2;
    };

    const addCode = (text: string) => {
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setFillColor(245, 245, 245);
      const lines = text.split('\n');
      const height = lines.length * 5 + 6;
      doc.rect(margin, y - 4, pageWidth - margin * 2, height, 'F');
      doc.setFontSize(9);
      doc.setFont('courier', 'normal');
      doc.setTextColor(40, 40, 40);
      lines.forEach((line, i) => {
        doc.text(line, margin + 3, y + i * 5);
      });
      y += height + 4;
    };

    const addBullet = (text: string) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text('•', margin + 2, y);
      const lines = doc.splitTextToSize(text, pageWidth - margin * 2 - 10);
      doc.text(lines, margin + 8, y);
      y += lines.length * 5 + 1;
    };

    // Title
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text('Application Mobile MyJantes', pageWidth / 2, y, { align: 'center' });
    y += 8;
    doc.setFontSize(14);
    doc.setTextColor(100, 100, 100);
    doc.text('Expo React Native - Spécifications Complètes', pageWidth / 2, y, { align: 'center' });
    y += 15;

    // Configuration Backend
    addTitle('CONFIGURATION BACKEND');
    addSubtitle('URL API Backend (Production)');
    addCode('https://workspace.appmytools.replit.app');
    y += 2;
    addSubtitle('Variable d\'environnement Expo');
    addCode('API_BASE_URL=https://workspace.appmytools.replit.app');
    y += 5;

    // Authentification
    addTitle('AUTHENTIFICATION');
    addText('Authentification via Replit OpenID Connect. Pour app mobile :');
    addBullet('GET /api/login - Redirection OAuth Replit (WebBrowser)');
    addBullet('GET /api/logout - Déconnexion');
    addBullet('GET /api/user - Récupérer utilisateur connecté');
    addText('Rôles : client, admin, superadmin');
    y += 5;

    // Espace Client
    addTitle('ESPACE CLIENT');

    addSubtitle('Dashboard Client');
    addBullet('Résumé des devis (en attente, acceptés, refusés)');
    addBullet('Résumé des factures (à payer, payées, en retard)');
    addBullet('Notifications non lues avec badge');
    addBullet('Accès rapide aux actions principales');

    addSubtitle('Gestion des Devis (Client)');
    addBullet('GET /api/quotes - Liste des devis du client');
    addBullet('GET /api/quotes/:id - Détail devis');
    addBullet('Afficher : référence, véhicule, articles, montant, photos, statut');
    addBullet('Statuts : pending, approved, rejected, completed');
    addBullet('Actions : Accepter/Refuser (PATCH /api/quotes/:id)');

    addSubtitle('Gestion des Factures (Client)');
    addBullet('GET /api/invoices - Liste des factures');
    addBullet('GET /api/invoices/:id - Détail facture');
    addBullet('Statuts : pending, paid, overdue, cancelled');
    addBullet('Modes paiement : card, wire_transfer, cash, check');

    addSubtitle('Réservations (Client)');
    addBullet('GET /api/reservations - Liste');
    addBullet('POST /api/reservations - Créer réservation');
    addBullet('PATCH /api/reservations/:id - Annuler');
    addBullet('Statuts : pending, confirmed, cancelled, completed');

    doc.addPage();
    y = 20;

    // Espace Admin
    addTitle('ESPACE ADMIN');

    addSubtitle('Dashboard Admin Analytique');
    addBullet('GET /api/admin/analytics - Données analytiques');
    addBullet('Params : startDate, endDate, paymentMethod, serviceId');
    addText('Données retournées :');
    addBullet('globalRevenue, pendingRevenue, avgInvoiceAmount, conversionRate');
    addBullet('totalInvoices, totalQuotes, totalReservations');
    addBullet('monthlyRevenue (12 mois), weeklyRevenue');
    addBullet('revenueByPaymentMethod, revenueByService');
    addBullet('invoiceStatusStats, quoteStatusStats');
    addBullet('currentMonth (CA, pending, growth, etc.)');

    addSubtitle('Gestion des Devis (Admin)');
    addBullet('GET /api/admin/quotes - Liste complète');
    addBullet('POST /api/admin/quotes - Créer devis');
    addBullet('PATCH /api/admin/quotes/:id - Modifier');
    addBullet('DELETE /api/admin/quotes/:id - Supprimer (superadmin)');
    addBullet('POST /api/admin/quotes/:id/generate-invoice - Générer facture');
    addBullet('GET/POST/DELETE /api/admin/quotes/:id/media - Photos');

    addSubtitle('Gestion des Factures (Admin)');
    addBullet('GET /api/admin/invoices - Liste complète');
    addBullet('POST /api/admin/invoices - Créer');
    addBullet('PATCH /api/admin/invoices/:id - Modifier / Marquer payée');
    addBullet('DELETE /api/admin/invoices/:id - Supprimer (superadmin)');
    addBullet('POST /api/admin/invoices/:id/send-email - Envoyer par email');

    addSubtitle('Gestion des Réservations (Admin)');
    addBullet('GET /api/admin/reservations - Liste');
    addBullet('PATCH /api/admin/reservations/:id - Confirmer/Modifier');

    addSubtitle('Gestion des Utilisateurs (Admin)');
    addBullet('GET /api/admin/users - Liste utilisateurs');
    addBullet('PATCH /api/admin/users/:id - Modifier role, assigner garage');

    addSubtitle('Gestion des Services');
    addBullet('GET /api/services - Liste');
    addBullet('POST/PATCH/DELETE /api/admin/services - CRUD');

    addSubtitle('Gestion des Garages (Superadmin)');
    addBullet('GET /api/admin/garages - Liste');
    addBullet('POST/PATCH/DELETE /api/admin/garages - CRUD');
    addBullet('Champs : name, logo, colors, address, siret, tva, iban, bic...');

    doc.addPage();
    y = 20;

    // Notifications
    addTitle('NOTIFICATIONS');
    addBullet('GET /api/notifications - Liste');
    addBullet('PATCH /api/notifications/:id/read - Marquer lue');
    addBullet('PATCH /api/notifications/read-all - Marquer toutes lues');
    addText('Types : quote_created, quote_approved, invoice_created, invoice_paid, reservation_confirmed...');
    y += 5;

    // Design
    addTitle('DESIGN & UX');
    addSubtitle('Thème');
    addBullet('Couleur primaire : #dc2626 (Rouge)');
    addBullet('Support mode sombre/clair');
    addBullet('Langue : Français');

    addSubtitle('Navigation');
    addBullet('Client : Bottom tabs (Accueil, Devis, Factures, Réservations, Profil)');
    addBullet('Admin : Drawer menu + Bottom tabs');
    addBullet('Pull-to-refresh, Skeleton loaders');

    addSubtitle('Librairies recommandées');
    addBullet('React Navigation 6+');
    addBullet('React Query / TanStack Query');
    addBullet('AsyncStorage ou SecureStore');
    addBullet('Expo WebBrowser pour OAuth');
    y += 5;

    // Endpoints Summary
    addTitle('RÉSUMÉ DES ENDPOINTS');
    addCode(`# Auth
GET  /api/login
GET  /api/logout
GET  /api/user

# Client
GET  /api/quotes
GET  /api/quotes/:id
GET  /api/invoices
GET  /api/invoices/:id
GET  /api/reservations
POST /api/reservations
PATCH /api/reservations/:id
GET  /api/notifications

# Admin
GET  /api/admin/analytics
GET/POST/PATCH/DELETE /api/admin/quotes
GET/POST/PATCH/DELETE /api/admin/invoices
POST /api/admin/invoices/:id/send-email
GET/PATCH /api/admin/reservations
GET/PATCH /api/admin/users
GET/POST/PATCH/DELETE /api/admin/services
GET/POST/PATCH/DELETE /api/admin/garages`);

    y += 10;
    addTitle('INSTRUCTIONS POUR AGENT', 12);
    addText('Vérifie les fonctionnalités déjà présentes dans app mobile et ajoute celles qui manquent. Connecte app au backend https://workspace.appmytools.replit.app. Utilise React Query pour appels API. Respecte design rouge (#dc2626) avec support dark mode.');

    // Footer
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`MyJantes - Spécifications Mobile App - Page ${i}/${pageCount}`, pageWidth / 2, 290, { align: 'center' });
    }

    doc.save('MyJantes-Mobile-App-Specifications.pdf');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold mb-4">Spécifications Application Mobile MyJantes</h1>
        <p className="text-muted-foreground mb-6">Le PDF a été téléchargé automatiquement.</p>
        <button 
          onClick={generatePDF}
          className="bg-primary text-white px-6 py-3 rounded-lg hover:bg-primary/90"
        >
          Télécharger à nouveau
        </button>
      </div>
    </div>
  );
}
