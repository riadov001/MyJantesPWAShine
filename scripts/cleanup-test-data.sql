-- Cleanup script: suppression des comptes test MyJantes
-- Exécuté le 2026-05-12
-- Comptes supprimés (cascades automatiques sur quotes, invoices, reservations, notifications, etc.) :
--   sasmyjantes@gmail.com     (Riad Belmahi - client test)
--   mytoolsgroup26@gmail.com  (Riad Belmahi - client test)
--   appmytools@gmail.com      (Riad Belmahi - client test)
--   appmyjantes0@gmail.com    (Riad Belmahi - client test)
--   admin@myjantes.fr         (Riad Belmahi - superadmin test)
--   mytoolsgroup@gmail.com    (TestClientPart Dupont - client test)
--   mytoolsapp@gmail.com      (TestClientPart Dupont - client test)
--   saasmyjantes@gmail.com    (TestClientPart Dupont - client test)
-- Compte conservé : rbelmahi90@gmail.com (root réel)

DELETE FROM users WHERE email IN (
  'sasmyjantes@gmail.com',
  'mytoolsgroup26@gmail.com',
  'appmytools@gmail.com',
  'appmyjantes0@gmail.com',
  'admin@myjantes.fr',
  'mytoolsgroup@gmail.com',
  'mytoolsapp@gmail.com',
  'saasmyjantes@gmail.com'
);
