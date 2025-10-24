# 🏥 HADO - Application de Gestion des Casiers Zone Départ

Application web full-stack pour gérer l'attribution et le suivi des casiers dans un établissement de santé.

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)
![License](https://img.shields.io/badge/license-ISC-lightgrey)

---

## 📋 Table des matières

- [Aperçu](#aperçu)
- [Fonctionnalités](#fonctionnalités)
- [Technologies](#technologies)
- [Installation](#installation)
- [Configuration](#configuration)
- [Utilisation](#utilisation)
- [API Reference](#api-reference)
- [Sécurité](#sécurité)
- [Maintenance](#maintenance)
- [FAQ](#faq)
- [Support](#support)

---

## 📸 Aperçu

Application permettant de gérer **190 casiers** répartis en 3 zones :
- **NORD** : 75 casiers (N01 à N75)
- **SUD** : 75 casiers (S01 à S75)
- **PCA** : 40 casiers (PCA01 à PCA40)

### Modes d'accès
- 🔓 **Mode Admin** : Gestion complète (attribution, modification, suppression)
- 👁️ **Mode Guest** : Consultation en lecture seule

---

## ✨ Fonctionnalités

### Gestion des casiers
- ✅ Attribution avec validation IPP
- ✅ Modification des informations
- ✅ Libération de casiers
- ✅ Marquage "récupérable"
- ✅ Commentaires personnalisés
- ✅ Historique des modifications

### Import / Export
- 📥 Import CSV casiers
- 📥 Import CSV clients (base de référence)
- 📤 Export JSON avec métadonnées
- 📤 Export CSV
- 💾 Backup automatique et manuel

### Interface
- 📱 Responsive (mobile/tablette/desktop)
- 🌓 Mode sombre (auto/manuel)
- 🔍 Recherche en temps réel
- 🔢 Compteurs d'occupation
- 📊 Filtres et tris
- 👁️ Pseudo-anonymisation configurable

### Traçabilité
- 📝 Logs de toutes les modifications
- 📈 Statistiques de connexion
- 📦 Historique des exports
- ⏰ Horodatage automatique

---

## 🛠️ Technologies

### Backend
- **Node.js** (≥14.0.0)
- **Express** 4.18.2
- **SQLite3** 5.1.6
- **dotenv** 16.3.1

### Frontend
- **HTML5 / CSS3**
- **JavaScript Vanilla**
- **Responsive Design**

### Base de données
- **SQLite** (fichier local)
- 6 tables principales
- Indexes automatiques

---

## 🚀 Installation

### Prérequis
```bash
node --version  # ≥ v14.0.0
npm --version   # ≥ 6.0.0
```

### 1. Cloner ou télécharger le projet
```bash
git clone [URL_DU_REPO]
cd locker-management-app
```

### 2. Installer les dépendances
```bash
npm install
```

### 3. Créer le dossier public
```bash
mkdir public
# Copier index.html, app.js, styles.css dans public/
```

### 4. Configuration (voir section suivante)

### 5. Lancer l'application
```bash
# Production
npm start

# Développement (avec auto-reload)
npm run dev
```

### 6. Accéder à l'application
```
Local:  http://localhost:5000
Réseau: http://[IP_LOCAL]:5000
```

---

## ⚙️ Configuration

### Fichier `.env`

Créer un fichier `.env` à la racine :

```env
# ============ SERVEUR ============
PORT=5000
NODE_ENV=development

# ============ AUTHENTIFICATION ============
# ⚠️ IMPORTANT : Changez ce mot de passe !
ADMIN_PASSWORD=admin123

# ============ ANONYMISATION ============
# Active l'anonymisation en mode consultation (guest)
# Noms tronqués à 3 caractères, prénoms à 2
ANONYMIZE_GUEST=true

# Active l'anonymisation en mode modification (admin)
ANONYMIZE_ADMIN=false

# ============ INTERFACE ============
# Mode sombre
# Valeurs : active | inactive | system
DARK_MODE=system

# ============ ALERTES ============
# Durée en jours après laquelle une alerte s'affiche si aucun import clients
# Recommandé : 4 jours pour une mise à jour hebdomadaire
CLIENT_IMPORT_WARNING_DAYS=4

# ============ BACKUP ============
# Fréquence des backups automatiques en heures
# 0 = désactivé, 24 = quotidien, 12 = 2x/jour
BACKUP_FREQUENCY_HOURS=24

# Nombre de backups à conserver (les plus anciens sont supprimés)
BACKUP_RETENTION_COUNT=7
```

### Variables détaillées

| Variable | Type | Défaut | Description |
|----------|------|--------|-------------|
| `PORT` | number | 5000 | Port du serveur |
| `ADMIN_PASSWORD` | string | admin123 | Mot de passe admin ⚠️ |
| `ANONYMIZE_GUEST` | boolean | true | Anonymisation mode guest |
| `ANONYMIZE_ADMIN` | boolean | false | Anonymisation mode admin |
| `DARK_MODE` | enum | system | active/inactive/system |
| `CLIENT_IMPORT_WARNING_DAYS` | number | 4 | Seuil alerte import |
| `BACKUP_FREQUENCY_HOURS` | number | 24 | Fréquence backup (0=off) |
| `BACKUP_RETENTION_COUNT` | number | 7 | Nb backups conservés |

---

## 📖 Utilisation

### Connexion

#### Mode Admin
1. Entrer le mot de passe (défini dans `.env`)
2. Saisir votre nom ou initiales
3. Cliquer "Se connecter"

**Fonctionnalités disponibles** :
- Attribution/modification/suppression
- Import/export
- Création de backups
- Tous les filtres

#### Mode Guest (Consultation)
1. Cliquer "Consultation uniquement"
2. Aucun mot de passe requis

**Restrictions** :
- Lecture seule
- Pas d'import/export
- Filtre fixé sur "Occupés"
- Anonymisation activée

### Gestion des casiers

#### Attribuer un casier
1. Cliquer "➕ Attribuer" dans la zone souhaitée
2. Remplir le formulaire :
   - Sélectionner le n° de casier
   - Nom, Prénom
   - N°IPP (optionnel : bouton 🔍 pour rechercher)
   - Date de naissance
   - Commentaire (optionnel)
   - Cocher "Récupérable" si nécessaire
3. Enregistrer

#### Modifier un casier
1. Cliquer sur ⋮ à côté du casier
2. Sélectionner "Modifier"
3. Modifier les informations
4. Enregistrer

#### Libérer un casier
1. Cliquer sur ⋮ à côté du casier
2. Sélectionner "Libérer"
3. Confirmer

### Import de données

#### Import casiers (CSV)
Format attendu :
```csv
"N° Casier","Zone","Nom","Prénom","N°IPP","DDN","Récupérable"
"N01","NORD","DUPONT","Jean","12345","1980-05-15","0"
```

1. Cliquer "⬆️ Importer CSV"
2. Sélectionner votre fichier
3. Confirmer

#### Import clients (CSV)
Format attendu :
```csv
ipp,name,firstName,birthName,birthDate,sex,zone,entryDate
12345,DUPONT,Jean,MARTIN,1980-05-15,M,NORD,2024-01-01
```

1. Cliquer "⬆️ Importer Clients"
2. Sélectionner votre fichier
3. **⚠️ ATTENTION** : Remplace toute la base clients
4. Confirmer

### Export de données

#### Export JSON
- Cliquer "⬇ JSON"
- Fichier : `casiers_YYYY-MM-DD_HH-MM_UTILISATEUR.json`
- Contient métadonnées + données

#### Export CSV
- Cliquer "⬇ CSV"
- Fichier : `casiers_YYYY-MM-DD_HH-MM_UTILISATEUR.csv`
- Format standard pour tableur

### Backup

#### Backup manuel
- Cliquer "💾 Backup"
- Fichier créé dans `backups/`
- Format : `backup_YYYY-MM-DD_HH-MM-SS.db`

#### Backup automatique
- Configuré via `BACKUP_FREQUENCY_HOURS`
- Exécuté au démarrage puis périodiquement
- Nettoyage automatique selon `BACKUP_RETENTION_COUNT`

---

## 🔌 API Reference

### Authentification

#### POST `/api/login`
Connexion utilisateur
```json
{
  "password": "admin123",
  "userName": "CV"  // optionnel pour guest
}
```

#### GET `/api/auth/check`
Vérifier la session
```
Authorization: Bearer {token}
```

#### POST `/api/logout`
Déconnexion
```
Authorization: Bearer {token}
```

### Casiers

#### GET `/api/lockers`
Liste tous les casiers

#### GET `/api/lockers/zone/:zone`
Casiers d'une zone (NORD/SUD/PCA)

#### GET `/api/lockers/:number`
Détails d'un casier

#### POST `/api/lockers`
Créer/modifier un casier
```json
{
  "number": "N01",
  "zone": "NORD",
  "name": "DUPONT",
  "firstName": "Jean",
  "code": "12345",
  "birthDate": "1980-05-15",
  "comment": "Note...",
  "recoverable": false
}
```

#### DELETE `/api/lockers/:number`
Libérer un casier

### Clients

#### GET `/api/clients/:ipp`
Rechercher un client par IPP

#### GET `/api/clients/import-status`
Statut du dernier import clients

#### POST `/api/clients/import`
Importer la base clients
```json
{
  "data": [
    {
      "ipp": "12345",
      "name": "DUPONT",
      "firstName": "Jean",
      // ...
    }
  ]
}
```

### Statistiques

#### GET `/api/stats`
Statistiques globales

#### GET `/api/stats/connections?days=30`
Stats de connexion

#### GET `/api/lockers/:number/history`
Historique d'un casier

### Export

#### POST `/api/exports/log`
Logger un export

#### GET `/api/exports/history?days=30`
Historique des exports

### Backup

#### POST `/api/backup`
Créer un backup manuel

### Utilitaires

#### GET `/api/health`
Health check serveur

#### GET `/api/config`
Configuration serveur

---

## 🔒 Sécurité

### Authentification
- Sessions en mémoire avec tokens aléatoires (32 bytes)
- Expiration automatique après 24h
- Pas de stockage de mots de passe en base

### Données
- Base SQLite locale (pas d'exposition réseau)
- Pseudo-anonymisation configurable
- Backups automatiques

### Réseau
- CORS activé pour tous les origins
- Pas de HTTPS (à ajouter si exposition internet)
- Logs des connexions et actions

### Recommandations
1. **Changer le mot de passe admin** dans `.env`
2. **Ne pas exposer sur internet** sans HTTPS
3. **Sauvegarder régulièrement** la base de données
4. **Restreindre l'accès réseau** si possible
5. **Former les utilisateurs** aux bonnes pratiques

---

## 🔧 Maintenance

### Backups

#### Localisation
```
backups/
├── backup_auto_2024-10-25_10-00-00.db
├── backup_auto_2024-10-24_10-00-00.db
└── backup_2024-10-25_15-30-00.db  (manuel)
```

#### Restauration
```bash
# Arrêter le serveur
# Remplacer app.db par le backup
cp backups/backup_YYYY-MM-DD_HH-MM-SS.db app.db
# Redémarrer
npm start
```

### Nettoyage

#### Vider les casiers
```sql
sqlite3 app.db
UPDATE lockers SET occupied = 0, name = '', firstName = '', code = '', birthDate = '', comment = '', recoverable = 0;
```

#### Réinitialiser la base
```bash
rm app.db
npm start  # Recrée la base vide
```

### Logs

#### Serveur
```bash
npm run dev  # Affiche logs en temps réel
```

#### Exports
```sql
SELECT * FROM export_logs ORDER BY timestamp DESC LIMIT 10;
```

#### Connexions
```sql
SELECT * FROM connection_stats ORDER BY date DESC;
```

### Mise à jour

1. Sauvegarder `app.db` et `backups/`
2. Télécharger la nouvelle version
3. `npm install` pour mettre à jour les dépendances
4. Copier l'ancienne base de données
5. Redémarrer

---

## ❓ FAQ

### Q : Puis-je changer le nombre de casiers ?
**R** : Oui, modifier la fonction `initializeDatabase()` dans `server.js` et supprimer `app.db` pour recréer.

### Q : Comment ajouter un utilisateur admin ?
**R** : Actuellement, un seul mot de passe admin. Pour plusieurs utilisateurs, implémenter une table `users`.

### Q : Les données sont-elles sauvegardées en temps réel ?
**R** : Oui, chaque action modifie immédiatement la base SQLite.

### Q : Peut-on accéder depuis un téléphone ?
**R** : Oui ! Interface responsive, accessible via `http://[IP_SERVEUR]:5000` sur le réseau local.

### Q : Comment exporter vers Excel ?
**R** : Exporter en CSV puis ouvrir avec Excel/LibreOffice.

### Q : Que se passe-t-il si deux personnes modifient en même temps ?
**R** : Pas de conflit,

 SQLite gère les accès concurrents. Mais pas de temps réel (rafraîchir pour voir les changements).

### Q : Comment sécuriser l'accès ?
**R** : 
1. Changer le mot de passe dans `.env`
2. Ne pas exposer sur internet
3. Utiliser un VPN si accès distant nécessaire

---

## 📞 Support

### En cas de problème

1. **Vérifier les logs** :
   ```bash
   npm run dev
   ```

2. **Console navigateur** (F12) :
   - Onglet "Console" pour les erreurs JS
   - Onglet "Network" pour les erreurs API

3. **Vérifier la configuration** :
   - Fichier `.env` présent et correct
   - Port 5000 disponible
   - Dossier `public/` avec les 3 fichiers

4. **Réinitialiser** :
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### Erreurs courantes

| Erreur | Solution |
|--------|----------|
| Port 5000 in use | Changer PORT dans `.env` |
| Cannot find module | `npm install` |
| Database locked | Fermer autres connexions SQLite |
| 404 sur routes | Vérifier chemins `public/` |

---

## 📄 License

ISC © 2025 C.Vinson + Claude.ai

---

## 🙏 Crédits

- **Développement** : C.Vinson + Claude.ai (Anthropic)
- **Stack** : Node.js, Express, SQLite
- **Design** : CSS Vanilla, Responsive

---

**Version** : 1.0.0  
**Dernière mise à jour** : 25 octobre 2025