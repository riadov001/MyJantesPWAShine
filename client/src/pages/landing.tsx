import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { ThemeToggle } from "@/components/theme-toggle";
import logoMyJantes from "@assets/cropped-Logo-2-1-768x543_(3)_1767977972324.png";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 py-12 relative">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-30%] left-[-10%] w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-2xl flex flex-col items-center text-center">
        <img
          src={logoMyJantes}
          alt="MyJantes Logo"
          className="h-20 sm:h-24 w-auto mb-6"
          data-testid="img-logo"
        />

        <p className="text-sm tracking-widest uppercase text-muted-foreground mb-6 font-medium" data-testid="text-tagline">
          Expert Jantes Alu · Liévin 62800
        </p>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight mb-6" data-testid="text-hero-title">
          Rénovation &{" "}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/70">
            personnalisation
          </span>
          <br />
          de jantes aluminium
        </h1>

        <p className="text-muted-foreground text-base sm:text-lg mb-10 tracking-wide" data-testid="text-hero-subtitle">
          Haute performance · Résultat garanti · Devis gratuit
        </p>

        <div className="flex items-center justify-center gap-8 sm:gap-12 mb-10 flex-wrap">
          <div className="text-center" data-testid="stat-expertise">
            <div className="text-3xl sm:text-4xl font-bold" data-testid="text-stat-expertise-value">5+</div>
            <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider" data-testid="text-stat-expertise-label">Ans d'expertise</div>
          </div>
          <div className="w-px h-10 bg-border hidden sm:block" />
          <div className="text-center" data-testid="stat-response">
            <div className="text-3xl sm:text-4xl font-bold" data-testid="text-stat-response-value">&lt;24h</div>
            <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider" data-testid="text-stat-response-label">Réponse devis</div>
          </div>
          <div className="w-px h-10 bg-border hidden sm:block" />
          <div className="text-center" data-testid="stat-suivi">
            <div className="text-3xl sm:text-4xl font-bold" data-testid="text-stat-suivi-value">360°</div>
            <div className="text-xs text-muted-foreground mt-1 uppercase tracking-wider" data-testid="text-stat-suivi-label">Suivi client</div>
          </div>
        </div>

        <Button size="lg" asChild className="mb-10" data-testid="button-login">
          <Link href="/login">
            Accéder à la plateforme
            <ChevronRight className="h-4 w-4 ml-2" />
          </Link>
        </Button>

        <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-info-footer">
          <span data-testid="text-hours-weekday">Lun–Ven 09:00–12:30 / 13:30–18:00</span>
          <span className="mx-1">·</span>
          <span data-testid="text-hours-weekend">Fermé Sam & Dim</span>
          <span className="mx-1">·</span>
          <a href="tel:0321408053" data-testid="link-phone">03 21 40 80 53</a>
        </p>
      </div>
    </div>
  );
}
