# Mode Sombre - Documentation

## 🌙 Vue d'ensemble

Le mode sombre est maintenant disponible avec trois options configurables via le fichier `.env`.

## ⚙️ Configuration

### Fichier `.env`

```bash
# Mode sombre
# Valeurs possibles: active, inactive, system
DARK_MODE=system
```

### Options disponibles

| Valeur | Comportement |
|--------|--------------|
| `active` | Mode sombre **toujours activé** |
| `inactive` | Mode clair **toujours activé** |
| `system` | **Suit les préférences du système** d'exploitation |

## 🎨 Thèmes

### Mode Clair (par défaut)
- Fond : Gris clair (#f5f5f5)
- Cartes : Blanc (#ffffff)
- Texte : Gris foncé (#333)
- Bordures : Gris (#ddd)

### Mode Sombre
- Fond : Gris très foncé (#1a1a1a)
- Cartes : Gris foncé (#2d2d2d)
- Texte : Blanc cassé (#e0e0e0)
- Bordures : Gris moyen (#404040)

## 🔧 Implémentation technique

### Variables CSS (CSS Custom Properties)

```css
:root {
    /* Mode clair */
    --bg-primary: #f5f5f5;
    --bg-secondary: #ffffff;
    --text-primary: #333;
    /* ... */
}

body.dark-mode {
    /* Mode sombre */
    --bg-primary: #1a1a1a;
    --bg-secondary: #2d2d2d;
    --text-primary: #e0e0e0;
    /* ... */
}
```

### Variables CSS disponibles

- `--bg-primary` : Fond principal de la page
- `--bg-secondary` : Fond des cartes/sections
- `--bg-tertiary` : Fond des en-têtes
- `--text-primary` : Texte principal
- `--text-secondary` : Texte secondaire
- `--text-tertiary` : Texte tertiaire (désactivé)
- `--border-color` : Couleur des bordures
- `--border-light` : Bordures claires
- `--shadow` : Ombres
- `--input-bg` : Fond des inputs
- `--button-secondary-bg` : Fond boutons secondaires

## 🔄 Changement automatique

### Option `system`

Quand `DARK_MODE=system` :

1. **Au chargement** : Détecte les préférences système
   ```javascript
   const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
   ```

2. **En temps réel** : Écoute les changements
   ```javascript
   window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ...)
   ```

3. **Exemple** : Si l'utilisateur passe son OS en mode sombre, l'application bascule automatiquement

## 📱 Compatibilité

### Navigateurs supportés
- ✅ Chrome/Edge (79+)
- ✅ Firefox (67+)
- ✅ Safari (12.1+)
- ✅ Opera (66+)

### Systèmes d'exploitation
- ✅ Windows 10/11 (paramètres de couleur système)
- ✅ macOS (mode sombre système)
- ✅ iOS/iPadOS (mode sombre)
- ✅ Android (mode sombre)
- ✅ Linux (selon le gestionnaire de fenêtres)

## 🎯 Cas d'usage

### Scénario 1 : Mode sombre permanent
```bash
# .env
DARK_MODE=active
```
**Utilisation** : Équipes de nuit, services d'urgence

### Scénario 2 : Mode clair permanent
```bash
# .env
DARK_MODE=inactive
```
**Utilisation** : Environnements très lumineux, impression

### Scénario 3 : Automatique (recommandé)
```bash
# .env
DARK_MODE=system
```
**Utilisation** : S'adapte aux préférences de chaque utilisateur

## 🔍 Détection des préférences système

### Windows 10/11
`Paramètres > Personnalisation > Couleurs > Choisir votre mode`

### macOS
`Préférences Système > Général > Apparence`

### iOS/iPadOS
`Réglages > Luminosité et affichage > Apparence`

### Android
`Paramètres > Affichage > Thème sombre`

## 🎨 Éléments adaptés

### Interface complète
- ✅ En-têtes et navigation
- ✅ Tableaux et lignes
- ✅ Formulaires et modales
- ✅ Boutons et contrôles
- ✅ Menus déroulants
- ✅ Inputs et selects
- ✅ Bordures et ombres
- ✅ Page de connexion

### Éléments préservés
- 🔵 Boutons primaires (bleu)
- 🟢 Statuts "Libre" (vert)
- 🔴 Statuts "Occupé" (rouge)
- 🟠 Statuts "Récupérable" (orange)

## 💡 Transitions fluides

Tous les changements de couleur ont une transition CSS :
```css
transition: background-color 0.3s ease, color 0.3s ease;
```

Résultat : Passage en douceur entre les modes.

## 🚀 Déploiement

### Étape 1 : Configurer `.env`
```bash
DARK_MODE=system  # ou active, inactive
```

### Étape 2 : Redémarrer le serveur
```bash
npm run dev
```

### Étape 3 : Tester
- Se connecter
- Le mode sombre s'applique automatiquement selon la config

### Étape 4 : Vérifier
- Tester en changeant les préférences système (si `system`)
- Vérifier tous les écrans (login, tableaux, modales)

## 🐛 Dépannage

### Le mode ne s'applique pas
1. Vérifier le fichier `.env` : valeur correcte ?
2. Redémarrer le serveur après modification
3. Vider le cache du navigateur (Ctrl+F5)
4. Vérifier la console : "Application du mode sombre: ..."

### Le mode ne suit pas le système
1. Vérifier `DARK_MODE=system` dans `.env`
2. Vérifier que le navigateur supporte `prefers-color-scheme`
3. Console : logs "Application du mode sombre: system"

### Éléments mal colorés
1. Vérifier l'utilisation des variables CSS
2. Utiliser `var(--nom-variable)` au lieu de couleurs fixes
3. Ajouter la transition si manquante

## 📊 Avantages

✅ **Confort visuel** : Réduit la fatigue oculaire  
✅ **Économie d'énergie** : Sur écrans OLED/AMOLED  
✅ **Préférences utilisateur** : Respecte les choix système  
✅ **Accessibilité** : Meilleure lisibilité pour certains  
✅ **Modernité** : Standard actuel des applications web  

## 🔐 Sécurité

Le mode sombre est géré :
- ✅ Côté serveur : Variable d'environnement
- ✅ Envoyé lors du login
- ✅ Appliqué côté client (CSS)
- ✅ Pas de données sensibles

## 📝 Notes

- Le mode est **global** (tous les utilisateurs ont le même)
- Pour un contrôle par utilisateur, il faudrait stocker la préférence en base
- Les couleurs des badges de statut restent identiques (identité visuelle)
- Les graphiques et images ne sont pas affectés

## ✅ Checklist de validation

- [ ] `.env` configuré avec valeur correcte
- [ ] Serveur redémarré
- [ ] Mode clair fonctionne (`inactive`)
- [ ] Mode sombre fonctionne (`active`)
- [ ] Détection système fonctionne (`system`)
- [ ] Transitions fluides
- [ ] Tous les écrans testés
- [ ] Login page en mode sombre
- [ ] Modales en mode sombre
- [ ] Tableaux lisibles
- [ ] Boutons visibles

---

**Version** : 1.2.0  
**Date** : Octobre 2025  
**Auteurs** : C.Vinson + Claude.ai