# MyJantes - Application de Gestion de Services Automobiles (PWA)

## Overview

MyJantes is a Progressive Web Application (PWA) for automotive wheel repair and customization service management, designed exclusively for the MyJantes business (single-tenant). It offers comprehensive features for quotes, invoices, reservations, delivery notes, a review system, analytics, calendar, and workshop management. The application leverages real-time updates via WebSockets, provides a responsive, mobile-first interface inspired by Material Design, and integrates advanced functionalities like OCR document scanning, online payments via Stripe, and bank account aggregation through Stripe Financial Connections (OpenBanking). Public pages (quotes, invoices, bookings, reviews) use viewToken-based URLs for unauthenticated access.

## User Preferences

Style de communication préféré : Langue simple et quotidienne.
Langue de l'interface : Français (100% traduit)
Thème de couleur : Rouge vif (primary: 0 84% 60%) remplaçant le bleu professionnel
État : Interface entièrement traduite en français, thème rouge appliqué
Sauvegarde automatique : Quotidienne à 21h00 (Europe/Paris), sans cumul (garde uniquement la dernière sauvegarde), email vers rbelmahi90@gmail.com avec BDD JSON + médias ZIP en pièces jointes

## System Architecture

### Frontend Architecture

The frontend is built with React and TypeScript (Vite), utilizing Wouter for routing, TanStack Query for data fetching, Shadcn/ui (Radix UI) for components, and Tailwind CSS for styling. Form management is handled by React Hook Form with Zod. The design system adheres to Material Design principles, supporting light/dark modes, full responsiveness, and custom CSS variables with Exo 2 and JetBrains Mono fonts. Key patterns include role-based UI, real-time data synchronization via WebSockets, optimistic updates, and toast notifications.

### Backend Architecture

The backend uses Node.js with Express.js, Drizzle ORM for PostgreSQL (via Neon), and OpenID Connect for authentication (Replit Auth with Passport.js). A dedicated WebSocket server manages real-time communication. The API follows RESTful principles with role-based access control (RBAC), authentication middleware, secure WebSocket connections, and centralized error handling. Media management uses an IStorage abstraction, supporting database transactions and optimized queries.

### Mobile App v2 (`mobile-app/`)

A second-generation native mobile app (iOS + Android) lives in `mobile-app/`. Built with **Expo (managed) + TypeScript + expo-router**, it is **client-only** (particuliers + professionnels — no admin screens). All business logic stays on the backend; the app consumes `/api/mobile/*` exclusively.

- **Auth**: email/password + **Apple Sign-In** + **Google Sign-In** via Firebase. The mobile app gets a Firebase `idToken`, posts it to `POST /api/mobile/auth/firebase`, and the backend (using `firebase-admin`) verifies it and returns the standard MyJantes JWT pair (`accessToken` + `refreshToken`). Tokens are stored in `expo-secure-store`.
- **Backend additions** (in `server/mobileRoutesV2.ts`): `POST /api/mobile/auth/firebase`, `POST /api/mobile/auth/register` (particulier or pro). All existing `/api/mobile/*` routes remain unchanged.
- **Bundle ID**: `fr.myjantes.app` (kept identical for both platforms to allow App Store update of the v1 app).
- **Theming**: red `#dc2626` primary, dark/light mode follows system, French UI.
- **Roadmap**: tâches #1 (auth foundation), #2 (client core + Stripe), #3 (réservations/avis/chat/push), #4 (configurateur 2D + AR + catalogue + deep-links) **terminées**. Tâche #5 (EAS Build + soumission stores) : configuration `app.json` + `eas.json` + assets stores en place, builds/submits exécutés par l'utilisateur via EAS Cloud.
- **EAS Build**: profils `development` / `preview` / `production` dans `mobile-app/eas.json`. iOS `bundleIdentifier` + Android `package` = `fr.myjantes.app`. Variables d'env injectées via `eas secret`. AASA + assetlinks.json servis par `server/mobileRoutesV3.ts` sur `app.myjantes.fr/.well-known/*`. Endpoint `GET /api/mobile/version` piloté par `MOBILE_LATEST_IOS_VERSION` / `MOBILE_LATEST_ANDROID_VERSION` / `MOBILE_MIN_*` / `MOBILE_MAINTENANCE` côté serveur — à passer à `2.0.0` avant la mise en production des binaires.
- **Store assets**: descriptions FR (courte/longue), mots-clés, "Quoi de neuf" v2, politique de confidentialité, parcours suppression de compte → `store-assets/`. Captures d'écran à déposer dans `store-assets/screenshots/{ios-6.7,ios-6.5,ios-5.5,ipad-12.9,android-phone,android-7,android-10}/`.

See `mobile-app/README.md` for setup, Firebase console steps, EAS workflow, and architecture diagrams.

### Database Schema

Core tables include `users` (client/admin roles), `services`, `quotes` (with approval workflow), `invoices`, `reservations`, `notifications`, `sessions`, and `garages` for multi-tenancy. Relationships are maintained via foreign keys. Data integrity is ensured through UUID primary keys, timestamps, soft deletes, and foreign key constraints.

### Authentication & Authorization

Authentication uses OpenID Connect (Replit) with session-based authentication via secure HTTP-only cookies. Mobile apps utilize JWT tokens. Authorization is role-based (client, admin, superadmin) and enforced via middleware guards, frontend route protection, and WebSocket authentication.

### Real-time Updates

A dedicated WebSocket server facilitates real-time communication using user-specific channels for event types like `quote_updated` or `invoice_created`, with automatic query invalidation and reconnection. A database-backed notification system provides real-time delivery, persistent storage, and unread badge counters.

### Single-Tenant Architecture

The application is exclusively for MyJantes (single-tenant). Multi-garage support has been completely removed from the business logic and user interface. The role hierarchy is `admin`, `employe`, and `client`.
- **Root Admin / Superadmin**: This role is now obsolete as there is only one business entity.
- **Admin**: Has full access to the MyJantes dashboard, settings, and financial data.
- **Client**: Access to their own quotes, invoices, and bookings.

Public pages use viewToken-based URLs (e.g., `/facture/:token`, `/devis/:token`, `/reservation/:token`, `/avis/:token`) for unauthenticated access by clients.

### Key Features

- **Workshop Management:** Redesigned workshop page with dashboard, workflow checklists, and repair orders.
- **Repair Orders:** Manages detailed vehicle information, mileage, condition checklists, and notes.
- **E-invoicing:** Compliance checker, Factur-X XML generation, and compliance dashboard.
- **Object Storage:** Single Replit Object Storage bucket (`replit-objstore-f2db546b-...`) for all media. Files stored at `.private/uploads/` in bucket, served at `/objects/uploads/` paths. `mediaService.ts` uses `objectStorage.ts` (`@replit/object-storage` Client) exclusively — no R2/GDrive fallback for uploads. Admin endpoints: `POST /api/admin/storage/migrate-uploads`, `POST /api/admin/storage/copy-bucket`.
- **OCR Document Scanner (Mindee):** Integration for scanning documents (invoices, ID cards) and extracting structured data for quotes/invoices.
- **Stripe Payments:** Online payment processing via Payment Element and Payment Intents, supporting various methods.
- **Plaid Bank Connection:** Aggregates bank account information for secure connections.
- **Advanced Analytics:** Dedicated page for service trends, financial performance, client analytics, and conversion metrics.
- **Accounting Module (Enhanced):** Interactive charts (Recharts) for revenue vs charges, cash flow area chart, expense categories donut chart, TVA summary with bar chart by rate. Timezone-safe date handling and proper TVA calculation on expense creation. 8-tab layout: overview, analytics, journal (multi-select + bulk actions), TVA, FEC, e-invoicing, dossier (email export), OpenBanking (Bridge + bunq). Access restricted to superadmin + rbelmahi90@gmail.com.
- **External API Connector:** Admin interface to connect, test, and interact with external APIs. Features: API configuration (name, URL, auth type: none/API key/bearer/basic), automatic route discovery via OpenAPI/Swagger spec scanning, endpoint testing with live request/response viewer, route filtering by method/path, secure credential storage with masked secrets. Located at `/admin/external-apis`, restricted to superadmin.
- **AI Chatbot & Wheel Configurator:** Floating AI assistant (Gemini 2.5 Flash) with a 3D wheel customization module. Features photo upload, 10 spoke patterns, photo-texture projection, real-time customization, and HD render analysis.
- **AR Wheel Try-On:** Photo-based augmented reality for virtual wheel try-on. Includes AI-powered wheel position detection, touch gestures, real-time 3D rendering, and export options.
- **SMS Notifications (Twilio):** SMS notifications for key events (quote/invoice sent, payment, review request) with user consent and preference management.
- **Smart Reservation System:** Handles French business hours, public holidays, conflict detection, and server-side validation for bookings. It supports a public booking flow after quote acceptance and an admin workflow for validating or rejecting reservations.

## External Dependencies

### Third-party Services
- **Neon Database:** Serverless PostgreSQL database.
- **Replit Auth:** OpenID Connect authentication provider.
- **Cloudflare R2:** Primary cloud object storage service.
- **Stripe:** Payment gateway for online transactions.
- **Plaid:** Bank account aggregation service.
- **Mindee:** OCR document scanning API.
- **Twilio:** SMS notification service.
- **Gemini 2.5 Flash:** AI model for chatbot and vision tasks.

### Key Libraries
- **@neondatabase/serverless:** PostgreSQL client.
- **drizzle-orm:** Type-safe ORM.
- **mindee:** Node.js SDK for Mindee OCR.
- **@stripe/stripe-js:** Frontend SDK for Stripe.
- **plaid:** Node.js SDK for Plaid.
- **react-plaid-link:** React component for Plaid Link.
- **recharts:** Interactive charting library for data visualization.
- **@tanstack/react-query:** Data fetching for React.
- **@radix-ui/*:** Accessible UI component primitives.
- **passport:** Authentication middleware.
- **ws:** WebSocket server.
- **zod:** Schema validation.
- **date-fns:** Date utility library.
- **three:** 3D rendering library.