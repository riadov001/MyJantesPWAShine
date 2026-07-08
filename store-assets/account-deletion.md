# Suppression de compte — exigence App Store §5.1.1(v)

Apple impose qu'une application proposant la création de compte permette
**aussi** la suppression du compte directement depuis l'app.

## Parcours dans l'app MyJantes v2

1. Onglet **Profil** → bouton « Supprimer mon compte »
2. Écran de confirmation rappelant que :
   - Toutes les données personnelles seront effacées.
   - Les documents légaux (factures) sont conservés conformément à la loi
     (article L123-22 du Code de commerce — 10 ans).
3. Saisie du mot de passe **ou** réauthentification Apple / Google.
4. Appel `DELETE /api/mobile/account` (existant côté backend).
5. Déconnexion automatique + retour à l'écran de connexion.

## URL alternative (App Store Connect)

Si la suppression in-app n'est pas opérationnelle au moment de la review,
fournir l'URL : **https://app.myjantes.fr/compte/supprimer**
