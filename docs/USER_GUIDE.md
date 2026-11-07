# Manuel d'Utilisation Complet — Shop ERP

Guide officiel et manuel pratique d'utilisation de l'ERP pour le personnel de vente, les gestionnaires de stock, les comptables et la direction de **Shop ERP Mobilier**.

---

## Table des Matières

1. [Prise en Main & Navigation Générale](#1-prise-en-main--navigation-générale)
2. [Tableau de Bord & Indicateurs Clés](#2-tableau-de-bord--indicateurs-clés)
3. [Catalogue Produits & Gestion Multi-Dépôts](#3-catalogue-produits--gestion-multi-dépôts)
4. [Gestion des Stocks, Mouvements & Inventaires](#4-gestion-des-stocks-mouvements--inventaires)
5. [Répertoire Clients & Suivi des Créances](#5-répertoire-clients--suivi-des-créances)
6. [Ventes, Devis & Facturation](#6-ventes-devis--facturation)
7. [Achats & Réceptions Fournisseurs](#7-achats--réceptions-fournisseurs)
8. [Fournisseurs, Règlements, Versements Hors-Dette & Imputations](#8-fournisseurs-règlements-versements-hors-dette--imputations)
9. [Trésorerie Multi-Comptes (Caisse, Coffres, Banque)](#9-trésorerie-multi-comptes-caisse-coffres-banque)
10. [Caisse Journalière, Journal & Clôture](#10-caisse-journalière-journal--clôture)
11. [Charges & Dépenses d'Exploitation](#11-charges--dépenses-dexploitation)
12. [Épargne & Avoirs Clients](#12-épargne--avoirs-clients)
13. [Clôture Mensuelle & Verrouillage Comptable](#13-clôture-mensuelle--verrouillage-comptable)
14. [Centre de Documents & Impressions](#14-centre-de-documents--impressions)
15. [Rapports, Statistiques & Analyses de Marge](#15-rapports-statistiques--analyses-de-marge)
16. [Paramètres de l'Entreprise & Sauvegardes](#16-paramètres-de-lentreprise--sauvegardes)
17. [Guide de Dépannage & Résolution des Problèmes Courants](#17-guide-de-dépannage--résolution-des-problèmes-courants)

---

## 1. Prise en Main & Navigation Générale

### 1.1 Lancement de l'Application
1. Sur le bureau de l'ordinateur principal, double-cliquez sur l'icône **`run.bat`** (ou lancez le raccourci *Shop ERP*).
2. Une fenêtre noire d'initialisation s'ouvre brièvement, vérifie que le moteur est opérationnel, puis votre navigateur internet par défaut s'ouvre automatiquement à l'adresse locale :  
   `http://localhost:3000`
3. Aucune saisie de mot de passe n'est exigée au démarrage ; vous accédez immédiatement au tableau de bord.

### 1.2 Structure de l'Écran
L'interface est découpée en trois zones constantes :
- **La Barre Latérale de Gauche (Sidebar)** : Permet d'accéder à l'ensemble des modules. Le menu déroulant **Trésorerie** se développe pour faire apparaître les sous-rubriques (Journal, Comptes, Mouvements, Clôture...).
- **La Barre Supérieure (TopBar)** : Affiche le titre de la page actuelle, sa description fonctionnelle, l'icône de notification et l'avatar de l'opérateur en cours (`A`).
- **L'Espace de Travail Central** : Affiche les tableaux de données, formulaires, fiches récapitulatives et boutons d'action.

---

## 2. Tableau de Bord & Indicateurs Clés

### 2.1 Objectif & Accès
Le tableau de bord (`/`) synthétise la santé économique et opérationnelle du magasin sur une période sélectionnée.

### 2.2 Filtres Temporels Disponibles
En haut à droite de l'écran, vous pouvez sélectionner l'intervalle d'analyse :
- **Aujourd'hui** (par défaut)
- **Hier**
- **7 derniers jours**
- **Mois en cours**
- **Période personnalisée** (sélection de dates du ... au ...)

### 2.3 Indicateurs Principaux (KPI Cards)
1. **Ventes Facturées (DA)** : Montant total des ventes validées sur la période, accompagné du nombre de factures émises et de la variation en pourcentage comparée à la période antérieure.
2. **Encaissements Réels (DA)** : Total physique des espèces, virements et chèques effectivement reçus (règlements comptant, encaissements différés, acomptes et dépôts sur épargne).
3. **Dépenses d'Exploitation (DA)** : Cumul des charges et décaissements opérationnels (loyers, salaires, transports, etc.).
4. **Créances Clients (DA)** : Montant total global restant dû par l'ensemble des clients du magasin, avec le nombre de factures en attente de solde.
5. **État de la Caisse Journalière** : Indique si la session de caisse du jour est **Ouverte** ou **Fermée**, le solde théorique actuel et l'heure d'ouverture.
6. **Alertes de Stock** : Nombre d'articles en rupture totale (0 unité) et en stock critique inférieur au seuil d'alerte configuré.

### 2.4 Graphique Ventes vs Encaissements
Permet de visualiser jour par jour (ou heure par heure pour la vue quotidienne) le décalage entre la marchandise facturée et les rentrées de fonds réelles.

---

## 3. Catalogue Produits & Gestion Multi-Dépôts

### 3.1 Accès
Menu latéral : **Produits & Stock** (`/products`).

### 3.2 Création d'un Nouvel Article
1. Cliquez sur le bouton bleu **« Nouveau Produit »** en haut à droite.
2. Remplissez le formulaire :
   - **Catégorie** : Choisissez dans la liste déroulante (ex: Armoires, Salons, Tables, Chambres). La sélection d'une catégorie génère automatiquement la référence SKU suggérée.
   - **Référence / SKU** (obligatoire, unique) : Code d'identification produit (ex: `A012`, `F045`). Vous pouvez conserver le code généré automatiquement ou saisir une référence usine personnalisée.
   - **Nom de l'article** (obligatoire) : Libellé commercial clair (ex: *Chambre à Coucher Royale 6 Portes*).
   - **Modèle / Série** (optionnel) : Précision technique ou nom de collection (ex: *Modèle 2026 capitonné*).
   - **Couleur / Finition** (optionnel) : Teinte dominante (ex: *Gris Souris*, *Chêne Clair*, *Blanc Laqué*).
   - **Prix de Vente (DA)** (obligatoire) : Prix public facturé au client. Doit être $\ge 0$.
   - **Prix d'Achat Estimé / Coût (DA)** (optionnel) : Coût d'achat fournisseur servant au calcul estimatif des marges brutes.
   - **Seuil d'Alerte Stock (Min Stock)** : Nombre d'unités en dessous duquel le système déclenche une alerte de réapprovisionnement (ex: 2 unités).
   - **Description / Notes** (optionnel) : Dimensions, matières, conseils d'entretien.
3. Cliquez sur **« Enregistrer le produit »**.

> [!NOTE]
> Lors de la création initiale du produit, son stock global démarre à **0 unité**. L'injection des quantités physiques initiales se fait via l'opération de *Stock Initial* ou par une commande d'achat.

### 3.3 Modification & Archivage
- **Modifier** : Cliquez sur l'icône de crayon sur la ligne du produit. Vous pouvez mettre à jour les prix, modèles, couleurs ou seuils d'alerte.
- **Activer / Désactiver** : Cliquez sur le badge d'état. Un produit désactivé disparaît des sélecteurs de vente tout en préservant l'historique complet des ventes antérieures.

---

## 4. Gestion des Stocks, Mouvements & Inventaires

### 4.1 Les Dépôts Physiques Disponibles
Le système prend en charge nativement 4 dépôts physiques :
1. **Showroom** : Surface de vente et d'exposition principale.
2. **Garage Chaaban** : Dépôt de stockage volumineux.
3. **Garage Cheikh** : Deuxième entrepôt de réserve.
4. **3ème Garage / Dépôt** : Espace modulable ou réserve temporaire.

### 4.2 Enregistrer du Stock Initial
Réservé lors de la mise en service du magasin ou de l'intégration d'un nouvel arrivage non rattaché à une commande :
1. Dans l'onglet **Mouvements & Stock**, cliquez sur **« Stock Initial »**.
2. Choisissez l'article, le dépôt de réception (ex: *Garage Chaaban*), la quantité physique comptée et le coût d'achat unitaire.
3. Validez : le stock physique augmente immédiatement dans le dépôt sélectionné.

### 4.3 Réaliser un Transfert Inter-Dépôts
Pour déplacer un meuble d'un entrepôt vers le magasin d'exposition :
1. Cliquez sur **« Transférer du stock »**.
2. Renseignez :
   - L'article concerné.
   - **Dépôt source** (d'où part la marchandise, ex: *Garage Chaaban*).
   - **Dépôt destination** (où arrive la marchandise, ex: *Showroom*).
   - La quantité à transférer.
3. **Règle de validation** : Le système vérifie que le dépôt source possède au moins la quantité demandée. Si le stock est insuffisant, le transfert est refusé.
4. Validez : le dépôt source diminue, le dépôt destination augmente, et un mouvement de type `TRANSFER` est consigné.

### 4.4 Ajustements d'Inventaire
En cas de meuble abîmé, d'erreur de comptage ou d'écart constaté :
1. Cliquez sur **« Ajustement / Régularisation »**.
2. Sélectionnez l'article, le dépôt, la nouvelle quantité réelle constatée ou le différentiel (+ ou -), ainsi que le motif obligatoire (ex: *Casse lors de la manutention*, *Inventaire physique de printemps*).
3. Le stock est mis à jour avec traçabilité complète.

---

## 5. Répertoire Clients & Suivi des Créances

### 5.1 Accès
Menu latéral : **Clients** (`/customers`).

### 5.2 Créer une Fiche Client
1. Cliquez sur **« Nouveau Client »**.
2. Renseignez :
   - **Nom et Prénom / Raison Sociale** (obligatoire).
   - **Téléphone principal** (recommandé pour les notifications et livraisons).
   - **Téléphone secondaire** (très utile pour joindre un membre de la famille ou le chauffeur).
   - **Adresse de livraison**.
   - **Notes** (ex: *Préfère être livré le matin*).
3. Cliquez sur **« Enregistrer »**.

### 5.3 Suivi du Solde et Relevé de Compte
En cliquant sur un client dans la liste, vous visualisez :
- **Total des achats** réalisés depuis le premier jour.
- **Reste Dû (Dette Client)** : Solde des factures non payées.
- **Acomptes disponibles** : Argent déjà versé en avance.
- **Solde Cagnotte Épargne** : Avoirs disponibles.
- **Bouton « Relevé de Compte »** : Génère un document récapitulant toutes les factures, tous les règlements et le solde net à date, imprimable en un clic.

---

## 6. Ventes, Devis & Facturation

### 6.1 Accès
Menu latéral : **Ventes** (`/sales`).

### 6.2 Création d'une Vente Pas-à-Pas

#### Étape 1 : Sélection du Client
- Choisissez un client existant dans la liste de recherche, ou cliquez sur **« + Nouveau Client »** pour l'ajouter instantanément sans quitter la vente.
- Pour un achat comptoir rapide sans coordonnée, laissez le client par défaut (*Client Comptoir / Passager*).

#### Étape 2 : Ajout des Articles et Choix du Dépôt de Retrait
- Tapez le nom, la référence ou le modèle de l'article dans le sélecteur intelligent.
- **Point crucial** : Sélectionnez le **Dépôt de prélèvement** pour chaque ligne (ex: retirer la table du *Showroom* et les 6 chaises du *Garage Chaaban*).
- Indiquez la quantité vendue. Le système affiche en temps réel le stock disponible dans le dépôt sélectionné.
- **Prix Unitaire & Remise** : Vous pouvez accorder une remise exceptionnelle en DA sur une ligne d'article.

#### Étape 3 : Frais de Livraison
- Indiquez si la livraison est assurée par le magasin.
- Renseignez le montant des frais de livraison et cochez s'ils doivent être inclus dans le total facturé au client.

#### Étape 4 : Mode de Clôture de la Vente
- **Enregistrer comme Devis (Brouillon)** : Ne déduit aucun stock et ne crée aucune dette. Le document peut être imprimé comme devis ou proforma.
- **Valider la Vente (Facture Définitive)** :
  1. Déduit immédiatement le stock dans les dépôts respectifs.
  2. Ouvre la fenêtre de règlement immédiat :
     - **Mode de règlement** : Espèces (Caisse), Chèque, Virement bancaire, Prélèvement sur acompte ou Cagnotte épargne.
     - **Montant versé** : Saisissez la somme remise par le client (versement partiel ou paiement total comptant).
     - Si le versement est inférieur au montant total, le solde restant alimente automatiquement la dette du client.

### 6.3 Annulation d'une Vente
En cas de désistement ou de retour complet :
1. Ouvrez la fiche de la vente et cliquez sur **« Annuler la vente »**.
2. Saisissez le motif de l'annulation (obligatoire).
3. **Conséquences automatiques** :
   - Le stock des meubles vendus est réintégré à l'unité près dans les dépôts d'origine.
   - Les montants réglés sont remboursés ou recrédités.
   - La créance du client est annulée.

---

## 7. Achats & Réceptions Fournisseurs

### 7.1 Accès
Menu latéral : **Achats & Fournisseurs** (`/purchases`).

### 7.2 Passer une Commande d'Achat
1. Cliquez sur **« Nouvelle Commande d'Achat »**.
2. Sélectionnez le fournisseur.
3. Ajoutez les meubles commandés en indiquant la quantité convenue et le prix d'achat unitaire négocié en DA.
4. Validez la commande.  
   *Note : À cette étape, la commande est à l'état `ordered` : la dette envers le fournisseur augmente, mais le stock physique n'est pas encore incrémenté.*

### 7.3 Réceptionner la Marchandise au Dépôt
Lorsque le camion de livraison du fournisseur arrive au magasin ou au dépôt :
1. Dans la liste des achats, cliquez sur l'icône de réception **« Réceptionner les articles »**.
2. Pour chaque article livré :
   - Indiquez le nombre d'unités effectivement déchargées (réception totale ou partielle).
   - Choisissez le dépôt d'entreposage (ex: *Garage Chaaban*).
3. Cliquez sur **« Confirmer la réception »**.
4. Le système génère un **Bon de Réception** (`REC-YYYYMM-XXXX`) et incrémente immédiatement le stock disponible.

---

## 8. Fournisseurs, Règlements, Versements Hors-Dette & Imputations

### 8.1 Accès
Menu latéral : **Fournisseurs** (`/suppliers`).

### 8.2 Comprendre les 3 Soldes Fournisseurs
Sur la fiche de chaque fournisseur, l'ERP sépare clairement :
1. **Dette Fournisseur (Reste Dû)** : Ce que le magasin doit au fournisseur au titre des commandes d'achats passées et de la dette initiale.
2. **Total versé hors dette** : Sommes d'argent liquide ou virements remis au fournisseur sans affectation à une commande spécifique.
3. **Solde disponible à imputer** : Part des versements hors-dette qui n'a pas encore été utilisée pour amortir la dette.

### 8.3 Enregistrer un Paiement Ordinaire de Facture
Pour payer une commande ou régler une partie de la dette :
1. Cliquez sur **« Effectuer un règlement »**.
2. Choisissez le compte source de trésorerie (Caisse du jour, Coffre magasin, Banque...).
3. Saisissez le montant et la date.
4. **Effet** : La trésorerie diminue, la dette du fournisseur diminue immédiatement.

### 8.4 Donner de l'Argent au Fournisseur (Versement Hors-Dette)
Opération permettant d'avancer de l'argent ou de constituer une réserve chez le fournisseur sans que cela ne modifie sa dette :
1. Cliquez sur le bouton violet **« Donner de l'argent au fournisseur »**.
2. Sélectionnez le compte de trésorerie débité (ex: *Coffre magasin*), le montant en DA et le motif.
3. Confirmez.
4. **Résultat garanti** :
   - L'argent sort de votre trésorerie.
   - **La dette du fournisseur reste rigoureusement inchangée**.
   - Le *Solde disponible à imputer* augmente d'autant.

### 8.5 Imputer un Versement sur la Dette Fournisseur
Lorsque vous décidez d'utiliser l'argent préalablement donné pour éteindre une dette :
1. Cliquez sur le bouton vert **« Imputer un versement »** (`FileCheck2`).
2. Sélectionnez le versement source parmi ceux disposant d'un solde restant.
3. Indiquez le montant à imputer (le système vous empêche de dépasser le solde disponible et la dette actuelle).
4. Vous pouvez facultativement lier cette imputation à une facture d'achat précise.
5. Validez.
6. **Résultat comptable garanti** :
   - **Impact sur la trésorerie = STRICTEMENT 0 DA** (aucune nouvelle sortie d'argent).
   - La dette du fournisseur diminue du montant imputé.
   - Le solde restant disponible du versement diminue.

### 8.6 Annuler une Imputation
Si une erreur d'imputation a été commise :
1. Rendez-vous dans l'onglet **« Imputations sur Dette »** de la fiche fournisseur.
2. Cliquez sur **« Annuler »** en face de la ligne d'imputation.
3. Saisissez un motif d'annulation (minimum 5 caractères).
4. L'opération est compensée : la dette fournisseur remonte, le solde disponible réaugmente, avec un impact de trésorerie égal à **0 DA**.

---

## 9. Trésorerie Multi-Comptes (Caisse, Coffres, Banque)

### 9.1 Accès
Menu latéral : **Trésorerie** (`/cash`) et sous-rubriques :
- `/cash/accounts` (Gestion des comptes)
- `/cash/transfers` (Virements internes)
- `/cash/deposits` (Apports)
- `/cash/withdrawals` (Retraits)

### 9.2 Comptes Configurés
1. **Caisse Principale (Espèces)** : Caisse de vente physique synchronisée avec la session de caisse journalière.
2. **Coffre Magasin** : Coffre-fort sécurisé dans les locaux du magasin pour conserver les liquidités excédentaires.
3. **Coffre Maison** : Coffre externe de réserve de sécurité.
4. **Compte Bancaire / CCP** : Pour les encaissements par chèques, virements et TPE.

### 9.3 Effectuer un Virement Inter-Comptes
Pour transférer des espèces de la Caisse vers le Coffre :
1. Allez dans **Trésorerie** > **Mouvement** (`/cash/transfers`).
2. Cliquez sur **« Nouveau Virement Inter-Comptes »**.
3. Sélectionnez :
   - **Compte Source** (ex: *Caisse Principale*).
   - **Compte Destination** (ex: *Coffre Magasin*).
   - Le montant et le motif (ex: *Évacuation de recette du weekend*).
4. Validez : le compte source est débité et le compte destination est crédité instantanément.

---

## 10. Caisse Journalière, Journal & Clôture

### 10.1 Ouverture de Session (Le Matin)
1. Allez dans **Trésorerie** > **Clôture Caisse** (`/cash/closing`).
2. Si aucune session n'est ouverte, un bandeau vous invite à ouvrir la journée.
3. Vérifiez le fond de caisse physique en tiroir et saisissez le **Montant d'Ouverture** (généralement le report de la veille, ex: *20 000 DA*).
4. Cliquez sur **« Ouvrir la session de caisse »**.

### 10.2 Consultation du Journal en Cours de Journée
Sous la rubrique **Journal journalier** (`/cash/journal`), vous visualisez en direct la chronologie complète de toutes les opérations de la journée :
- Ventes au comptant (+)
- Règlements de créances (+)
- Acomptes clients reçus (+)
- Charges réglées en espèces (-)
- Règlements fournisseurs (-)

### 10.3 Clôture de Session (Le Soir)
1. Rendez-vous dans **Clôture Caisse** (`/cash/closing`).
2. Cliquez sur **« Clôturer la session de caisse »**.
3. **Comptage Physique** : Comptez physiquement l'argent présent dans le tiroir-caisse et tapez le montant exact dans **Montant Compté**.
4. Le système calcule automatiquement :
   $$\text{Écart} = \text{Montant Compté} - \text{Montant Théorique}$$
   - Si un écart apparaît (positif ou négatif), saisissez une explication dans les notes de clôture.
5. **Report à Nouveau** : Indiquez la somme laissée dans le tiroir pour le lendemain matin (ex: *20 000 DA*). Le reste est généralement transféré vers le coffre.
6. Cliquez sur **« Confirmer et verrouiller la clôture »**.
7. Imprimez la fiche de clôture de caisse pour signature.

---

## 11. Charges & Dépenses d'Exploitation

### 11.1 Accès
Menu latéral : **Trésorerie** > **Charges** (`/cash/expenses`).

### 11.2 Saisir une Charge
1. Cliquez sur **« Nouvelle Dépense »**.
2. Remplissez les champs :
   - **Compte payeur** : Caisse principale, Coffre ou Banque.
   - **Catégorie** : Choisissez la nature exacte (Loyer, Transport, Électricité, Salaires, Entretien, Fournitures...).
   - **Montant en DA**.
   - **Bénéficiaire** (ex: *Bailleur local commercial*, *Société de transport X*).
   - **N° de reçu / Bon justificatif**.
   - **Description détaillée**.
3. Cliquez sur **« Enregistrer »**. Le compte source est immédiatement débité.

---

## 12. Épargne & Avoirs Clients

### 12.1 Accès
Menu latéral : **Épargne Client** (`/savings`).

### 12.2 Principe
Ce module gère les sommes confiées par des clients qui souhaitent constituer une cagnotte d'épargne progressive avant de commander leurs meubles (ex: préparation de mariage).

### 12.3 Opérations Possibles
1. **Dépôt libre** : Cliquez sur **« Nouveau Dépôt »**, sélectionnez le client et le compte d'encaissement. Le solde du client augmente, et un reçu de dépôt imprimable est généré.
2. **Utilisation lors d'une vente** : Lors de la confirmation d'une facture de vente pour ce client, le système propose de déduire tout ou partie de sa cagnotte pour solder la facture.
3. **Remboursement de cagnotte** : Si le client renonce à son projet, cliquez sur **« Rembourser le client »**. L'argent sort de la caisse ou du coffre et le solde d'épargne est ramené à zéro.

---

## 13. Clôture Mensuelle & Verrouillage Comptable

### 13.1 Accès
Menu latéral : **Clôture mensuelle** (`/closing/monthly`).

### 13.2 Procédure de Fin de Mois
1. **Sélection du Mois** : Choisissez le mois à clôturer (ex: `2026-10`).
2. **Checklist de Vérification** :
   - Pointez chaque rubrique (Caisse physique, Rapprochement bancaire, Inventaire des stocks, Vérification des créances et dettes).
   - Marquez chaque point comme *Validé*, *Anomalie documentée* ou *Non applicable*.
3. **Génération de l'Instantané (Snapshot)** :
   - Cliquez sur **« Créer un instantané »**. Le système fige l'ensemble des chiffres du mois dans une archive immuable.
4. **Approbation & Verrouillage Définitif** :
   - Cliquez sur **« Approuver et verrouiller le mois »**.
   - **Conséquence majeure (Period-Lock)** : Le mois devient complètement verrouillé. Il est désormais formellement impossible de créer, modifier ou supprimer une vente, un achat, une dépense ou un mouvement de stock dont la date se situe dans ce mois.

### 13.3 Réouverture Exceptionnelle
Si une régularisation tardive est impérative :
1. Cliquez sur **« Demande de réouverture exceptionnelle »**.
2. Renseignez obligatoirement un **motif précis d'au moins 10 caractères**.
3. Le système déverrouille temporairement le mois et inscrit l'incident dans le registre d'audit permanent (`MonthlyClosingAuditLog`).

---

## 14. Centre de Documents & Impressions

### 14.1 Accès
Menu latéral : **Documents** (`/documents`).

### 14.2 Fonctionnalités
- Moteur de recherche et filtres par type de document : Factures, Devis, Commandes d'achat, Bons de réception, Reçus clients, Bons de caisse, Bons de transfert.
- **Visualisation et Réimpression immédiate** : Cliquez sur l'icône d'imprimante pour rééditer n'importe quel document au format officiel du magasin.
- **Export PDF** : Téléchargement instantané de documents au format PDF standard A4 propre avec coordonnées de l'entreprise et logo.

---

## 15. Rapports, Statistiques & Analyses de Marge

### 15.1 Accès
Menu latéral : **Rapports** (`/reports`).

### 15.2 Tableaux & Analyses Fournis
1. **Chiffre d'Affaires & Encaissements** : Total facturé, total des remises consenties, frais de livraison perçus, taux de recouvrement des factures.
2. **Marge Brute Estimée** : Calcul de la marge commerciale ($Prix de Vente - Coût d'Achat$) avec affichage transparent du taux de couverture des coûts (pourcentage des ventes ayant un prix d'achat connu).
3. **Valorisation des Stocks par Dépôt** : Valeur financière du stock entreposé au Showroom, au Garage Chaaban, au Garage Cheikh et au 3ème Garage, au coût d'achat et au prix de vente potentiel.
4. **Top Ventes & Alertes de Réassort** : Liste des meubles les plus vendus et liste prioritaire des articles sous le seuil d'alerte.

---

## 16. Paramètres de l'Entreprise & Sauvegardes

### 16.1 Accès
Menu latéral : **Paramètres** (`/settings`).

### 16.2 Onglet Identité Commerciale
- Nom du magasin (*Shop ERP Mobilier*).
- Activité et slogan.
- Adresse complète, téléphones et email de contact.
- Identifiants légaux : **NIF / RC** et **NIS**.
- Texte de pied de page des factures (mentions de garantie, conditions SAV).
- **Logo du magasin** : Téléversez une image PNG ou JPEG carrée/rectangulaire pour personnaliser l'en-tête de toutes les impressions.

### 16.3 Onglet Sauvegardes (Backups)
- **Créer une sauvegarde maintenant** : Cliquez sur le bouton bleu. Le système crée instantanément un fichier `shop_backup_YYYYMMDD_HHMMSS.db` dans le dossier `prisma/backups/`.
- **Historique des sauvegardes** : Permet de vérifier l'intégrité de chaque fichier présent sur le disque.
- **Restaurer une sauvegarde** :
  1. Cliquez sur **« Restaurer »** à côté du fichier choisi.
  2. Tapez scrupuleusement le nom exact du fichier pour confirmer votre volonté.
  3. Le système crée d'abord une sauvegarde de secours de la base active (`pre_restore_*.db`), puis charge les données de l'archive.

---

## 17. Guide de Dépannage & Résolution des Problèmes Courants

| Symptôme / Message d'Erreur | Cause Probable | Solution Recommandée |
|---|---|---|
| **`PeriodLockedError : Le mois YYYY-MM est définitivement clôturé...`** | Vous tentez de créer ou modifier une facture, dépense ou mouvement daté d'un mois déjà verrouillé. | Vérifiez la date saisie (choisissez une date du mois en cours) ou demandez une réouverture exceptionnelle motivée dans le module *Clôture Mensuelle*. |
| **`Stock insuffisant pour [Produit] au dépôt [Nom]...`** | Le dépôt sélectionné dans la ligne de vente ne contient pas assez d'unités physiques. | 1. Sélectionnez le bon dépôt contenant les meubles (ex: *Garage Chaaban*).<br>2. Effectuez au préalable un transfert inter-dépôts.<br>3. Vérifiez les réceptions fournisseurs en attente. |
| **Le solde de caisse du soir ne correspond pas au comptage physique.** | Un paiement par chèque/carte a été saisi en espèces, une dépense n'a pas été enregistrée, ou une erreur de rendu de monnaie a eu lieu. | Consultez le **Journal journalier** (`/cash/journal`) pour pointer chaque ligne avec les tickets physiques. Consignez l'écart dans les notes de clôture. |
| **Impossible d'annuler un versement supplémentaire fournisseur.** | Ce versement d'argent a déjà été utilisé pour amortir une dette via une ou plusieurs imputations actives. | Rendez-vous dans l'onglet **« Imputations sur Dette »** de la fiche fournisseur, annulez d'abord les imputations liées, puis annulez le versement d'origine. |
| **Le serveur ne répond pas lors du clic sur `run.bat`.** | Le port 3000 est peut-être occupé par une autre application ou la compilation Next.js n'a pas été réalisée. | 1. Fermez les fenêtres de commandes ouvertes.<br>2. Ouvrez PowerShell et lancez `npm run build` puis réessayez `run.bat`. |
| **L'impression PDF n'affiche pas le logo.** | Le fichier de logo téléversé est trop lourd ou n'est pas au format PNG/JPEG standard. | Retournez dans **Paramètres** > **Logo**, supprimez le logo actuel et téléversez une image de dimensions raisonnables (ex: 400x400 px, < 1 Mo). |

