# GestionPro — SaaS de gestion d'entreprise (MVP multi-entreprises)

Prestations de services **et** vente de produits dans un même espace : clients, prestations, produits, stocks, ventes,
devis, factures, paiements, dépenses, fournisseurs, rapports, notifications, utilisateurs/rôles, PWA. Interface 100 % française
(JJ/MM/AAAA, FCFA/XOF, fuseau `Africa/Ouagadougou`, configurables par entreprise).

> ## ⚠️ Écart assumé avec le cahier des charges
> L'environnement de livraison fournit **Next.js (App Router) + PostgreSQL + Drizzle ORM**, pas Vite ni Supabase.
> Le MVP a donc été construit sur cette pile, avec les mêmes concepts :
>
> | Demandé | Réalisé |
> |---|---|
> | Vite + React Router | Next.js App Router (React 19, TypeScript) |
> | Supabase Auth | Authentification maison : mot de passe haché (scrypt), sessions en base (jeton hashé SHA-256), cookie `httpOnly` |
> | RLS Supabase | **Isolation multi-entreprises appliquée côté serveur** : chaque requête est filtrée par `organization_id` issu de la session vérifiée (jamais du client) + contrôle de permission par rôle. Pas de RLS PostgreSQL (voir « Pistes ») |
> | Supabase Storage | Logo, image produit, pièce justificative stockés en data-URL (< 600 Ko) dans PostgreSQL |
> | shadcn/ui, React Hook Form, TanStack Query | Composants Tailwind maison (même esprit), formulaires via Server Actions + validation **Zod** côté serveur, `useActionState` côté client |
> | PDF | Documents imprimables (« Imprimer / PDF » → *Enregistrer au format PDF* du navigateur) ; CSV généré côté serveur |
> | Edge Functions | Server Actions / Route Handlers |

## Démarrage

```bash
npm install
cp .env.example .env            # renseigner DATABASE_URL
npx drizzle-kit push            # applique le schéma (ou exécuter drizzle/0000_init.sql)
npx tsx scripts/seed.ts         # (facultatif) données de démonstration — environnement de test uniquement
npm run build && npm start
```

### Comptes de démonstration (mot de passe `Demo1234!`)
| Email | Rôle | Entreprise |
|---|---|---|
| demo@gestionpro.test | Propriétaire | Faso Info Services |
| gestionnaire@gestionpro.test | Gestionnaire | Faso Info Services |
| caissier@gestionpro.test | Caissier | Faso Info Services |
| technicien@gestionpro.test | Technicien | Faso Info Services |
| autre@gestionpro.test | Propriétaire | **Boutique Autre Entreprise** (test d'isolation) |

Les données de démo ne sont **jamais** créées automatiquement : un nouveau compte démarre avec un espace vide et un tableau de bord à zéro.

## Architecture

```
src/db/schema.ts         Schéma Drizzle (30 tables, relations, index) → drizzle/0000_init.sql
src/lib/core.ts          Hachage, jetons, UserError (sans dépendance Next)
src/lib/auth.ts          Sessions, contexte (utilisateur + entreprise active + rôle), gardes pageCtx/actCtx
src/lib/permissions.ts   Matrice rôles → permissions, navigation filtrée
src/lib/biz.ts           RÈGLES MÉTIER TRANSACTIONNELLES (stock, ventes, paiements, factures, avoirs, achats, alertes)
src/lib/stats.ts         Tableau de bord, finances et 7 rapports (SQL sur données réelles)
src/app/actions/*.ts     Server Actions (validation Zod + permissions + transactions)
src/app/(app)/*          Modules : dashboard, clients, prestations, produits, stocks, ventes, devis, factures,
                         finances, fournisseurs, rapports, notifications, utilisateurs, paramètres, reçus
public/                  manifest, service worker, page hors connexion, icônes
scripts/seed.ts          Données de démonstration (via les mêmes fonctions métier)
```

Tables : `profiles, sessions, password_resets, organizations, organization_members, organization_settings, customers, suppliers,
categories, products, stock_locations, stock_movements, services, service_orders, service_order_items, sales, sale_items, quotes,
quote_items, invoices, invoice_items, payments, expenses, expense_categories, purchase_orders, purchase_order_items, notifications, audit_logs`.
Les tables `roles`, `permissions`, `role_permissions` sont **remplacées par la matrice typée `src/lib/permissions.ts`** (versionnée, testable, non modifiable par un utilisateur).

## Rôles et sécurité
* **Propriétaire** : tout, y compris règle de stock négatif et nomination de propriétaires. **Administrateur** : tout sauf ce qui touche au rôle propriétaire.
  **Gestionnaire** : commercial, stocks, prestations, finances, achats, rapports. **Caissier** : ventes, encaissements, clients (pas de remise).
  **Technicien** : uniquement ses prestations (statut, progression, notes, coûts).
* Personne ne peut modifier son propre rôle ni se désactiver ; l'entreprise garde toujours au moins un propriétaire.
* Toutes les autorisations sont vérifiées **dans les Server Actions et les pages** (jamais seulement dans l'interface). Les montants, quantités, remises, prix
  et références croisées (client, produit, employé…) sont revalidés côté serveur et rattachés à l'entreprise active.
* Actions importantes tracées dans `audit_logs` (visible dans Paramètres et dans l'historique d'une prestation).
* Limitation des tentatives de connexion (en mémoire, par email) ; sessions de 14 jours ; cookie `Secure` via `COOKIE_SECURE=true`.

## Règles métier (implémentées dans `src/lib/biz.ts`, toutes en transaction PostgreSQL)
1. **Numérotation** : compteurs par entreprise incrémentés atomiquement (`UPDATE … RETURNING`) → `FAC-2026-0001`, `DEV-…`, `VTE-…`, `PRS-…`, `CMD-…`, `AV-…`, `REC-…`.
2. **Vente validée** : verrouille les produits, refuse si stock insuffisant (sauf stock négatif autorisé par le propriétaire), crée les lignes, les mouvements de stock `vente`,
   puis l'écriture de paiement (`payments` + reçu). Ventes payée / partielle / non payée.
3. **Paiements** : montant ≤ reste à payer ; remboursements = paiements négatifs. Un paiement sur une facture issue d'une vente met à jour les deux documents.
4. **Annulation d'une vente** : stock réintégré (`retour`), paiements remboursés, facture liée annulée. Motif obligatoire.
5. **Factures** : jamais supprimées. Annulation = statut `annulee` + **avoir** (`AV-…`) + réintégration du stock déduit + remboursements. Produits et prestations combinables.
   Facture directe ou issue d'un devis : stock déduit à l'émission ; facture issue d'une vente : pas de double déduction.
6. **Devis** → brouillon / envoyé / accepté / refusé / converti ; conversion en facture en un clic.
7. **Réception d'achat** : entrées de stock automatiques, mise à jour du prix d'achat, notification. **Règlement fournisseur** : crée une dépense (donc visible en finances et en trésorerie).
8. **Inventaire physique** : l'écart entre quantité comptée et théorique est enregistré comme mouvement `ajustement`. **Transferts** : deux mouvements (−/+) entre emplacements.
9. **Définitions financières** (ne jamais les confondre) :
   * *Chiffre d'affaires* = ventes validées + factures émises non annulées (hors factures issues d'une vente, déjà comptées) + prestations terminées non facturées ;
   * *Encaissements* = somme des paiements (net des remboursements) sur la période ;
   * *Résultat estimé* = CA − dépenses enregistrées de la période ;
   * *Trésorerie enregistrée* = tous les encaissements − toutes les dépenses (cumul) ;
   * *Créances* = reste dû sur ventes non facturées + factures émises/partielles.
10. **Notifications** : stock faible/épuisé, nouveau paiement, échéance dépassée, nouvelle prestation / retard, commande fournisseur reçue (déduplication par clé).

## PWA et hors connexion
Manifeste + icônes + service worker (cache des ressources statiques `/_next/static` et page `/offline.html`), bouton « Installer l'application »
(Android, Windows/Chrome/Edge). **Aucune saisie hors connexion n'est enregistrée** : une bannière l'indique, et les données métier ne sont jamais servies depuis le cache.
Architecture prête pour une file de synchronisation ultérieure (les écritures passent toutes par des Server Actions idempotentes à ajouter : clé d'idempotence).

## Déploiement
Tout hébergeur Node.js + PostgreSQL (Render, Railway, VPS, Docker…) : définir `DATABASE_URL`, `COOKIE_SECURE=true` (HTTPS), exécuter les migrations
(`drizzle/0000_init.sql` ou `npx drizzle-kit push`), puis `npm run build && npm start`. Sonde de santé : `GET /api/health`.
**Sauvegardes** : `pg_dump -Fc $DATABASE_URL > backup.dump` quotidien (+ rétention), restauration : `pg_restore -c -d $DATABASE_URL backup.dump`. Tester la restauration régulièrement.

## Fonctionnalités terminées
Auth (inscription, connexion, déconnexion, mot de passe oublié/réinitialisation, changement de mot de passe) · création d'entreprises multiples et bascule · paramètres entreprise (logo, coordonnées,
devise, fuseau, taxes, préfixes, délais) · utilisateurs & rôles · tableau de bord (12 indicateurs, 6 graphiques, 6 périodes) · clients (CRUD/archivage, fiche complète avec solde) ·
catalogue de services + ordres de prestation (assignation, progression, coûts, historique, facturation) · produits & catégories · stocks (mouvements, inventaire, emplacements, transferts, alertes) ·
ventes multi-produits · devis · factures · avoirs · reçus · dépenses (pièce jointe), autres recettes, créances, trésorerie · fournisseurs, commandes d'achat, réception, règlements, factures fournisseurs ·
7 rapports avec filtres, export CSV et PDF (impression) · notifications · journal d'audit · PWA.

## Reste à développer / pistes
* **Réinitialisation de mot de passe par email** : aucun fournisseur d'email n'est branché ; le lien est affiché à l'écran (mode démo). **À remplacer avant production** (puis `RESET_LINK_MODE=hidden`).
* **RLS PostgreSQL** en défense en profondeur (`SET LOCAL app.org_id` par transaction + politiques) ; limitation de débit distribuée (Redis).
* Génération PDF côté serveur (aujourd'hui : impression navigateur) ; envoi des documents par email/WhatsApp.
* Stockage objet pour les fichiers (S3/Supabase Storage) ; saisie hors connexion avec synchronisation sécurisée et clés d'idempotence.
* Retours partiels de vente, stock par emplacement dans les ventes, multi-taxes par ligne, tests automatisés E2E, comptabilité générale / paie / banques / abonnements (hors périmètre MVP).
