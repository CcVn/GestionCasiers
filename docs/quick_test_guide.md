# ✅ Guide de Test Rapide - Application Casiers

## 🚀 Tests essentiels après installation

### 1️⃣ Test du serveur (30 secondes)

```bash
# Terminal 1 : Lancer le serveur
npm run dev

# Vérifier les messages :
✓ SQLite connecté
✓ Table lockers créée/vérifiée
✓ Table clients créée/vérifiée
✓ Table locker_history créée/vérifiée
✓ Table connection_stats créée/vérifiée
✓ Table export_logs créée/vérifiée
✓ Table client_imports créée/vérifiée
✓ Casiers initialisés: 190
✓ Serveur démarré
✓ Backups automatiques activés
```

**❌ Si erreur** : Vérifier que le port 5000 est libre

---

### 2️⃣ Test de l'interface (1 minute)

#### Ouvrir le navigateur
```
http://localhost:5000
```

**✅ Doit afficher** : Page de login avec 2 boutons
- "Se connecter" (avec champs mot de passe + nom)
- "Consultation uniquement"

---

### 3️⃣ Test mode Guest (2 minutes)

1. Cliquer sur **"Consultation uniquement"**
2. **✅ Vérifier** :
   - Message : "👁️ Mode consultation (lecture seule)"
   - 3 onglets visibles : NORD / SUD / PCA
   - Compteurs affichés : 0/75, 0/75, 0/40
   - Statut serveur : 🟢 Connecté
   - Tous les casiers visibles et vides

3. **✅ Vérifier restrictions** :
   - Boutons "Attribuer" **grisés**
   - Boutons "Importer" **grisés**
   - Bouton "Backup" **grisé**
   - Dropdown filtre **verrouillé** sur "Occupés"
   - Pas de colonne "Actions"

---

### 4️⃣ Test mode Admin (5 minutes)

#### Se déconnecter et reconnecter
1. Cliquer **"Déconnexion"**
2. Entrer mot de passe : `admin123`
3. Champ nom apparaît → Entrer vos initiales (ex: "CV")
4. Cliquer **"Se connecter"**

**✅ Vérifier** :
- Message : "🔓 Connecté - Mode modification (CV)"
- Tous les boutons **actifs**
- Colonne "Actions" visible avec menu ⋮

---

### 5️⃣ Test attribution casier (3 minutes)

1. Onglet **NORD**
2. Cliquer **"+ Attribuer"**
3. Remplir le formulaire :
   - Zone : NORD
   - N° Casier : N01
   - Nom : DUPONT
   - Prénom : Jean
   - N°IPP : 12345
   - DDN : 1980-05-15
   - ☐ Récupérable (décoché)

4. Cliquer **"Enregistrer"**

**✅ Vérifier** :
- Message : "✓ Casier enregistré" OU "⚠️ ... N°IPP non trouvé"
- Casier N01 apparaît dans le tableau
- Compteur passe à 1/75
- Nom "DUPONT" visible (ou "DUP" si anonymisation active)

---

### 6️⃣ Test recherche (1 minute)

1. Dans la barre de recherche, taper : `DUPONT`
2. **✅ Vérifier** :
   - Seul le casier N01 s'affiche
   - Détails corrects

3. Effacer la recherche
4. **✅ Vérifier** : Tous les casiers réapparaissent

---

### 7️⃣ Test modification (2 minutes)

1. Sur casier N01, cliquer sur **⋮**
2. Sélectionner **"Modifier"**
3. Changer le prénom : Jean → Pierre
4. Cocher **☑ Récupérable**
5. Cliquer **"Enregistrer"**

**✅ Vérifier** :
- Prénom mis à jour
- Statut change (pastille orange ⟳)

---

### 8️⃣ Test libération (1 minute)

1. Sur casier N01, cliquer sur **⋮**
2. Sélectionner **"Libérer"**
3. Confirmer

**✅ Vérifier** :
- Casier redevient vide
- Compteur redescend à 0/75
- Ligne affichée avec "—"

---

### 9️⃣ Test export (2 minutes)

1. Attribuer 2-3 casiers
2. Cliquer sur **"⬇ JSON"**

**✅ Vérifier** :
- Fichier téléchargé : `casiers_YYYY-MM-DD_HH-MM_CV.json`
- Contenu JSON valide avec métadonnées
- Tous les casiers occupés exportés

3. Cliquer sur **"⬇ CSV"**

**✅ Vérifier** :
- Fichier téléchargé : `casiers_YYYY-MM-DD_HH-MM_CV.csv`
- Format CSV correct (en-têtes + données)

---

### 🔟 Test backup manuel (1 minute)

1. Cliquer sur **"💾 Backup"**
2. Confirmer

**✅ Vérifier** :
- Message : "✓ Backup créé avec succès !"
- Nom du fichier affiché
- Taille du fichier affichée
- Dossier `backups/` créé à la racine
- Fichier `.db` présent dedans

---

### 1️⃣1️⃣ Test import CSV casiers (3 minutes)

#### Créer un fichier test : `test_casiers.csv`
```csv
"N° Casier","Zone","Nom","Prénom","N°IPP","DDN","Récupérable"
"N10","NORD","MARTIN","Paul","11111","1985-03-20","0"
"S05","SUD","BERNARD","Marie","22222","1990-07-15","0"
"PCA03","PCA","PETIT","Luc","33333","1978-11-30","1"
```

1. Cliquer **"⬆️ Importer CSV"**
2. Sélectionner `test_casiers.csv`
3. Confirmer l'import

**✅ Vérifier** :
- Message : "Import terminé ! ✓ Importés : 3 ..."
- Les 3 casiers apparaissent dans leurs zones respectives
- Compteurs mis à jour

---

### 1️⃣2️⃣ Test import clients (3 minutes)

#### Créer un fichier test : `test_clients.csv`
```csv
ipp,name,firstName,birthName,birthDate,sex,zone,entryDate
11111,MARTIN,Paul,MARTIN,1985-03-20,M,NORD,2024-01-01
22222,BERNARD,Marie,DURAND,1990-07-15,F,SUD,2024-01-15
33333,PETIT,Luc,PETIT,1978-11-30,M,PCA,2024-02-01
```

1. Cliquer **"⬆️ Importer Clients"**
2. Sélectionner `test_clients.csv`
3. **ATTENTION** : Confirmer (remplace toute la base clients)

**✅ Vérifier** :
- Message : "Import clients terminé ! ✓ Importés : 3 ..."
- Bouton "Importer Clients" redevient normal (pas orange)

---

### 1️⃣3️⃣ Test validation IPP (2 minutes)

1. Ouvrir **"+ Attribuer"**
2. Choisir casier N15
3. Entrer N°IPP : `11111`
4. Cliquer **"🔍 Rechercher"**

**✅ Vérifier** :
- Message : "✓ Client trouvé et champs remplis"
- Nom : MARTIN
- Prénom : Paul
- DDN : 1985-03-20 (remplis automatiquement)

5. Tester avec IPP inexistant : `99999`
6. Cliquer **"🔍 Rechercher"**

**✅ Vérifier** :
- Message : "⚠️ N°IPP non trouvé dans la base clients"

---

### 1️⃣4️⃣ Test filtres (2 minutes)

1. Attribuer quelques casiers (3-4)
2. Marquer 1 ou 2 comme "Récupérable"

#### Tester chaque filtre :
- **Tous** : Affiche tous les casiers (vides + occupés)
- **Occupés** : Seulement les casiers attribués
- **Vides** : Seulement les casiers libres
- **Récupérables** : Seulement les casiers récupérables

**✅ Vérifier** : Chaque filtre affiche le bon sous-ensemble

---

### 1️⃣5️⃣ Test tri (1 minute)

1. Dans le dropdown "Trier par..." :
   - **Trier par numéro** : N01, N02, N03...
   - **Trier par nom** : Ordre alphabétique

**✅ Vérifier** : Le tri fonctionne correctement

---

### 1️⃣6️⃣ Test mode sombre (30 secondes)

#### Modifier `.env`
```env
DARK_MODE=active
```

1. Redémarrer le serveur
2. Se reconnecter
3. **✅ Vérifier** : Interface en mode sombre

#### Tester les 3 modes :
- `DARK_MODE=active` → Toujours sombre
- `DARK_MODE=inactive` → Toujours clair
- `DARK_MODE=system` → Suit l'OS

---

### 1️⃣7️⃣ Test anonymisation (1 minute)

#### Modifier `.env`
```env
ANONYMIZE_GUEST=true
ANONYMIZE_ADMIN=true
```

1. Redémarrer le serveur
2. Se reconnecter en **admin**
3. **✅ Vérifier** :
   - Noms tronqués : DUPONT → DUP
   - Prénoms tronqués : Jean → JE

---

### 1️⃣8️⃣ Test responsive mobile (2 minutes)

1. Ouvrir DevTools (F12)
2. Activer mode mobile (Ctrl+Shift+M)
3. Tester avec différentes tailles :
   - iPhone SE (375px)
   - iPad (768px)
   - Desktop (1200px)

**✅ Vérifier** :
- Colonnes masquées sur mobile
- Onglets défilables
- Boutons adaptés
- Tableau lisible

---

### 1️⃣9️⃣ Test backup automatique (5 minutes)

#### Modifier `.env` pour tester rapidement
```env
BACKUP_FREQUENCY_HOURS=0.016  # = 1 minute
BACKUP_RETENTION_COUNT=3
```

1. Redémarrer le serveur
2. Attendre 1-2 minutes
3. Vérifier le dossier `backups/`

**✅ Vérifier** :
- Plusieurs fichiers `backup_auto_*.db` créés
- Après 4 backups, les plus anciens sont supprimés (max 3)

---

### 2️⃣0️⃣ Test alerte import clients (2 minutes)

#### Modifier `.env`
```env
CLIENT_IMPORT_WARNING_DAYS=0  # Alerte immédiate
```

1. Redémarrer le serveur
2. Se connecter en **admin**

**✅ Vérifier** :
- Alerte : "⚠️ ATTENTION : Aucun import de clients trouvé..."
- Bouton "Importer Clients" en **orange** avec animation

---

## 🧪 Tests de robustesse (optionnel)

### Test session expirée
1. Se connecter
2. Attendre 24h (ou modifier le code pour 1 minute)
3. Essayer une action
4. **✅ Vérifier** : Redirection vers login

### Test double connexion
1. Ouvrir 2 onglets
2. Se connecter en admin sur les 2
3. Modifier un casier sur chaque onglet
4. **✅ Vérifier** : Pas de conflit, les 2 fonctionnent

### Test perte de connexion
1. Se connecter
2. Arrêter le serveur
3. **✅ Vérifier** : Statut passe à "🔴 Déconnecté"
4. Redémarrer le serveur
5. **✅ Vérifier** : Reconnexion automatique après 60s

---

## 📊 Checklist complète

| Test | Durée | Statut |
|------|-------|--------|
| 1. Serveur démarre | 30s | ☐ |
| 2. Interface s'affiche | 1m | ☐ |
| 3. Mode Guest fonctionne | 2m | ☐ |
| 4. Mode Admin fonctionne | 5m | ☐ |
| 5. Attribution casier | 3m | ☐ |
| 6. Recherche | 1m | ☐ |
| 7. Modification | 2m | ☐ |
| 8. Libération | 1m | ☐ |
| 9. Export JSON/CSV | 2m | ☐ |
| 10. Backup manuel | 1m | ☐ |
| 11. Import CSV casiers | 3m | ☐ |
| 12. Import clients | 3m | ☐ |
| 13. Validation IPP | 2m | ☐ |
| 14. Filtres | 2m | ☐ |
| 15. Tri | 1m | ☐ |
| 16. Mode sombre | 30s | ☐ |
| 17. Anonymisation | 1m | ☐ |
| 18. Responsive | 2m | ☐ |
| 19. Backup auto | 5m | ☐ |
| 20. Alerte import | 2m | ☐ |

**Temps total** : ~40 minutes

---

## 🐛 Problèmes courants et solutions

### Erreur : "Port 5000 already in use"
```bash
# Trouver le processus
lsof -i :5000  # macOS/Linux
netstat -ano | findstr :5000  # Windows

# Tuer le processus ou changer le port dans .env
PORT=5001
```

### Erreur : "Cannot find module 'dotenv'"
```bash
npm install
```

### Serveur démarre mais page blanche
- Vérifier que le dossier `public/` existe
- Vérifier que `index.html`, `app.js`, `styles.css` sont dedans
- Vérifier la console (F12) pour les erreurs JS

### Backup automatique ne fonctionne pas
- Vérifier `BACKUP_FREQUENCY_HOURS` dans `.env`
- Vérifier les logs du serveur
- Vérifier les permissions du dossier

### Import CSV échoue
- Vérifier l'encodage du fichier (UTF-8)
- Vérifier le format des en-têtes
- Vérifier qu'il n'y a pas de lignes vides

---

## ✅ Validation finale

**L'application est prête si** :
- ✓ Tous les tests de base (1-10) passent
- ✓ Import/Export fonctionnent
- ✓ Mode guest et admin fonctionnels
- ✓ Pas d'erreur dans les logs serveur
- ✓ Pas d'erreur dans la console navigateur

**Félicitations ! Votre application est opérationnelle ! 🎉**

---

## 📝 Prochaines étapes

1. **Personnaliser** : Modifier le mot de passe admin dans `.env`
2. **Importer** : Charger votre vraie base clients
3. **Sauvegarder** : Configurer les backups selon vos besoins
4. **Déployer** : Rendre accessible sur le réseau local
5. **Former** : Former les utilisateurs aux deux modes

---

**Version du guide** : 1.0  
**Compatible avec** : Application Casiers v1.0.0 (Corrigée)  
**Dernière mise à jour** : 25 octobre 2025