import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AccessControlPolicy() {
  return (
    <div className="container mx-auto py-10 px-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Politique de Contrôle d'Accès</CardTitle>
        </CardHeader>
        <CardContent className="prose dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold">1. Objectif</h2>
            <p>
              Cette politique définit les règles et les processus pour garantir que l'accès aux systèmes et aux données de MyJantes est limité aux utilisateurs autorisés, conformément au principe du moindre privilège.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Contrôle d'Accès Basé sur les Rôles (RBAC)</h2>
            <p>
              L'accès est accordé en fonction du rôle de l'utilisateur :
            </p>
            <ul className="list-disc pl-6">
              <li><strong>Super Admin :</strong> Accès total au système et à la configuration.</li>
              <li><strong>Admin :</strong> Accès à la gestion du garage, des clients, des devis et des factures.</li>
              <li><strong>Employé :</strong> Accès aux services techniques et au planning.</li>
              <li><strong>Client :</strong> Accès restreint à ses propres données (devis, factures, profil).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Authentification</h2>
            <p>
              Tous les utilisateurs doivent s'authentifier via un identifiant unique et un mot de passe robuste. L'authentification multi-facteurs (MFA) est fortement recommandée pour tous les accès administratifs.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Revue des Accès et Déprovisionnement</h2>
            <p>
              Des audits périodiques sont réalisés pour vérifier la pertinence des accès accordés. Le déprovisionnement des accès pour les employés quittant l'organisation ou changeant de rôle est automatisé via notre système de gestion d'identité centralisé.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Architecture Zero Trust</h2>
            <p>
              MyJantes implémente une approche "Zero Trust" : aucun utilisateur ou système n'est considéré comme fiable par défaut, qu'il soit à l'intérieur ou à l'extérieur du réseau. Chaque demande d'accès est explicitement vérifiée, authentifiée et autorisée.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Gestion des Vulnérabilités et Fin de Vie (EOL)</h2>
            <p>
              Nous effectuons des scans de vulnérabilité réguliers sur notre infrastructure et nos applications. De plus, nous surveillons activement les logiciels en fin de vie (EOL) pour garantir qu'aucun composant obsolète et non sécurisé n'est utilisé en production.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Journalisation et Audit</h2>
            <p>
              Toutes les actions critiques (connexion, modification de données sensibles, changements de privilèges) sont enregistrées dans un journal d'audit sécurisé, permettant une traçabilité complète et des audits de sécurité réguliers.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
