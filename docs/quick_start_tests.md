# 🚀 Démarrage rapide - Tests

## ⚡ Installation en 3 commandes

```bash
# 1. Installer les dépendances
npm install

# 2. Lancer les tests
npm test

# 3. Voir la couverture
npm run test:coverage
```

## ✅ Résultat attendu

```
PASS  tests/utils.test.js
  ✓ normalizeIPP - devrait supprimer les zéros (3 ms)
  ✓ normalizeIPP - devrait rejeter invalides (2 ms)
  ...

PASS  tests/api.test.js
  ✓ POST /api/login - admin success (45 ms)
  ✓ POST /api/login - guest success (12 ms)
  ...

PASS  tests/frontend.test.js
  ✓ anonymizeName - devrait tronquer (1 ms)
  ✓ filtres - devrait filtrer occupés (2 ms)
  ...

Test Suites: 3 passed, 3 total
Tests:       98 passed, 98 total
Time:        3.457 s
```

## 🎯 Tests principaux

### Fonctions critiques testées

| Fonction | Tests | Statut |
|----------|-------|--------|
| `normalizeIPP()` | 20 | ✅ |
| `normalizeDate()` | 12 | ✅ |
| `POST /api/login` | 15 | ✅ |
| Anonymisation | 12 | ✅ |
| Filtres | 6 | ✅ |
| Validation | 8 | ✅ |

**Total : ~100 tests automatisés**

## 📊 Couverture de code

```bash
# Générer rapport HTML
npm run test:coverage

# Ouvrir le rapport
open coverage/lcov-report/index.html
```

**Objectif : > 80% de couverture**

## 🐛 Si ça ne marche pas

### Problème : `jest: command not found`

```bash
# Réinstaller
rm -rf node_modules package-lock.json
npm install
```

### Problème : Tests échouent

```bash
# Mode verbose
npm test -- --verbose

# Un seul fichier
npx jest tests/utils.test.js
```

### Problème : `Cannot find module`

```bash
# Vérifier package.json
cat package.json | grep jest

# Devrait contenir :
# "jest": "^29.7.0"
```

## 🔄 Développement avec tests

### Mode watch (recommandé)

```bash
npm run test:watch
```

→ Les tests se relancent automatiquement à chaque modification

### Tester une fonction spécifique

```bash
npx jest -t "normalizeIPP"
```

### Déboguer un test

```bash
node --inspect-brk node_modules/.bin/jest tests/utils.test.js
```

## 📝 Ajouter un test rapidement

```javascript
// tests/montest.test.js
describe('MaFonction', () => {
  test('devrait fonctionner', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Puis :
```bash
npm test
```

## ✨ Bonnes pratiques

### ✅ À faire
- Lancer tests avant chaque commit
- Ajouter tests pour nouvelles fonctions
- Viser > 80% de couverture
- Utiliser `test:watch` en développement

### ❌ À éviter
- Commiter sans lancer tests
- Ignorer tests qui échouent
- Supprimer tests sans raison
- Tests trop longs (> 5s)

## 🎓 Ressources

- **Documentation Jest** : https://jestjs.io
- **Tests du projet** : `tests/README.md`
- **Exemples** : Voir `tests/*.test.js`

---

**Prêt en 5 minutes ! 🚀**