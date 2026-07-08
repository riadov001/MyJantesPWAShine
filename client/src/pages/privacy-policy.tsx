import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPolicy() {
  return (
    <div className="container mx-auto py-10 px-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Politique de Confidentialite</CardTitle>
        </CardHeader>
        <CardContent className="prose dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold">1. Introduction</h2>
            <p>
              Chez MyJantes, nous prenons la protection de vos donnees personnelles tres au serieux. Cette politique de confidentialite explique comment nous collectons, utilisons et protegeons vos informations.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">2. Collecte des Donnees</h2>
            <p>
              Nous collectons des informations lorsque vous creez un compte, demandez un devis ou utilisez nos services. Cela inclut votre nom, email, numero de telephone et informations sur votre vehicule.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">3. Utilisation des Donnees</h2>
            <p>
              Vos donnees sont utilisees pour :
            </p>
            <ul className="list-disc pl-6">
              <li>Gerer vos rendez-vous et commandes</li>
              <li>Communiquer avec vous concernant vos services</li>
              <li>Ameliorer notre application et nos offres</li>
              <li>Assurer la securite de votre compte</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold">4. Notifications SMS</h2>
            <p>
              Avec votre consentement explicite, nous pouvons vous envoyer des notifications par SMS sur votre numero de telephone mobile. Ces notifications concernent exclusivement :
            </p>
            <ul className="list-disc pl-6">
              <li>L'envoi de devis et leur validation</li>
              <li>L'emission de factures</li>
              <li>Les confirmations de paiement</li>
              <li>Les rappels de rendez-vous</li>
              <li>Les demandes d'avis apres prestation</li>
            </ul>
            <p>
              Les SMS sont envoyes uniquement si vous avez active l'option dans votre profil et renseigne un numero de mobile valide (commencant par 06 ou 07). Vous pouvez desactiver cette option a tout moment depuis les parametres de votre compte. Les SMS sont envoyes via le service Twilio. Votre numero de telephone n'est pas partage avec des tiers a des fins commerciales.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">5. Securite</h2>
            <p>
              Nous mettons en oeuvre des mesures de securite robustes, incluant le chiffrement des donnees et l'acces restreint, pour proteger vos informations contre tout acces non autorise.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">6. Vos Droits</h2>
            <p>
              Conformement au RGPD, vous disposez d'un droit d'acces, de rectification et de suppression de vos donnees personnelles. Vous pouvez exercer ces droits depuis les parametres de votre compte ou en nous contactant. Vous pouvez a tout moment retirer votre consentement aux notifications SMS.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">7. Mentions Legales</h2>
            <p>
              <strong>Raison sociale :</strong> MY JANTES<br />
              <strong>SIRET :</strong> 913 678 199 00021<br />
              <strong>TVA :</strong> FR73 913 678 199<br />
              <strong>Siege social :</strong> 46 rue de la Convention, 62800 Lievin<br />
              <strong>Telephone :</strong> 03 21 40 80 53<br />
              <strong>Email :</strong> contact@myjantes.com<br />
              <strong>Site web :</strong> www.myjantes.fr
            </p>
            <p>
              L'envoi de SMS est realise via la plateforme Twilio, sous-traitant conforme au RGPD. Les donnees sont hebergees en France/Europe.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold">8. Contact</h2>
            <p>
              Pour toute question concernant cette politique ou pour exercer vos droits, contactez-nous a contact@myjantes.com ou au 03 21 40 80 53.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
