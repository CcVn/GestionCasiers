#!/bin/bash

# Script d'installation automatique - Application Casiers
# Usage: bash setup.sh

echo "=================================="
echo "🏥 HADO - Gestion des Casiers"
echo "    Installation automatique"
echo "=================================="
echo ""

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction pour afficher les messages
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# Vérifier Node.js
echo "1️⃣  Vérification des prérequis..."
echo ""

if ! command -v node &> /dev/null; then
    print_error "Node.js n'est pas installé"
    echo "   Téléchargez Node.js depuis: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
print_success "Node.js installé: $NODE_VERSION"

if ! command -v npm &> /dev/null; then
    print_error "npm n'est pas installé"
    exit 1
fi

NPM_VERSION=$(npm -v)
print_success "npm installé: $NPM_VERSION"
echo ""

# Vérifier la structure
echo "2️⃣  Vérification de la structure du projet..."
echo ""

if [ ! -f "package.json" ]; then
    print_error "package.json introuvable"
    echo "   Êtes-vous dans le bon dossier ?"
    exit 1
fi
print_success "package.json trouvé"

if [ ! -f "server.js" ]; then
    print_error "server.js introuvable"
    exit 1
fi
print_success "server.js trouvé"

# Créer le dossier public si nécessaire
if [ ! -d "public" ]; then
    print_warning "Dossier public/ manquant, création..."
    mkdir public
fi
print_success "Dossier public/ vérifié"

# Vérifier les fichiers frontend
MISSING_FILES=0
for file in "index.html" "app.js" "styles.css"; do
    if [ ! -f "public/$file" ]; then
        print_error "public/$file manquant"
        MISSING_FILES=1
    else
        print_success "public/$file trouvé"
    fi
done

if [ $MISSING_FILES -eq 1 ]; then
    echo ""
    print_warning "Copiez les fichiers manquants dans public/"
    read -p "Voulez-vous continuer quand même ? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi
echo ""

# Installer les dépendances
echo "3️⃣  Installation des dépendances npm..."
echo ""

if [ -d "node_modules" ]; then
    print_info "node_modules existe déjà"
    read -p "Réinstaller les dépendances ? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf node_modules package-lock.json
        npm install
    else
        print_success "Dépendances déjà installées"
    fi
else
    npm install
    if [ $? -eq 0 ]; then
        print_success "Dépendances installées"
    else
        print_error "Erreur lors de l'installation"
        exit 1
    fi
fi
echo ""

# Créer le fichier .env
echo "4️⃣  Configuration (.env)..."
echo ""

if [ -f ".env" ]; then
    print_warning ".env existe déjà"
    read -p "Voulez-vous le recréer ? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_success "Configuration existante conservée"
        SKIP_ENV=1
    fi
fi

if [ -z "$SKIP_ENV" ]; then
    echo "Configuration du serveur..."
    echo ""
    
    # Port
    read -p "Port du serveur [5000]: " PORT
    PORT=${PORT:-5000}
    
    # Mot de passe admin
    echo ""
    print_warning "IMPORTANT: Définissez un mot de passe admin sécurisé"
    read -s -p "Mot de passe admin [admin123]: " ADMIN_PASS
    echo ""
    ADMIN_PASS=${ADMIN_PASS:-admin123}
    
    if [ "$ADMIN_PASS" == "admin123" ]; then
        print_warning "Vous utilisez le mot de passe par défaut (non sécurisé)"
    fi
    
    # Anonymisation
    echo ""
    read -p "Activer l'anonymisation en mode Guest ? (y/n) [y]: " ANON_GUEST
    ANON_GUEST=${ANON_GUEST:-y}
    if [[ $ANON_GUEST =~ ^[Yy]$ ]]; then
        ANON_GUEST="true"
    else
        ANON_GUEST="false"
    fi
    
    read -p "Activer l'anonymisation en mode Admin ? (y/n) [n]: " ANON_ADMIN
    ANON_ADMIN=${ANON_ADMIN:-n}
    if [[ $ANON_ADMIN =~ ^[Yy]$ ]]; then
        ANON_ADMIN="true"
    else
        ANON_ADMIN="false"
    fi
    
    # Mode sombre
    echo ""
    echo "Mode sombre:"
    echo "  1) system  - Suit les préférences du système"
    echo "  2) active  - Toujours en mode sombre"
    echo "  3) inactive - Toujours en mode clair"
    read -p "Choix [1]: " DARK_CHOICE
    DARK_CHOICE=${DARK_CHOICE:-1}
    
    case $DARK_CHOICE in
        1) DARK_MODE="system" ;;
        2) DARK_MODE="active" ;;
        3) DARK_MODE="inactive" ;;
        *) DARK_MODE="system" ;;
    esac
    
    # Backup
    echo ""
    read -p "Fréquence des backups automatiques (heures, 0=désactivé) [24]: " BACKUP_FREQ
    BACKUP_FREQ=${BACKUP_FREQ:-24}
    
    read -p "Nombre de backups à conserver [7]: " BACKUP_COUNT
    BACKUP_COUNT=${BACKUP_COUNT:-7}
    
    # Alerte import clients
    echo ""
    read -p "Alerte si pas d'import clients depuis (jours) [4]: " IMPORT_WARNING
    IMPORT_WARNING=${IMPORT_WARNING:-4}
    
    # Créer le fichier .env
    cat > .env << EOF
# Configuration du serveur
PORT=$PORT
NODE_ENV=development

# Authentification
# ⚠️ IMPORTANT : Changez ce mot de passe !
ADMIN_PASSWORD=$ADMIN_PASS

# Pseudo-anonymisation
# Active l'anonymisation en mode consultation (guest)
ANONYMIZE_GUEST=$ANON_GUEST

# Active l'anonymisation en mode modification (admin)
ANONYMIZE_ADMIN=$ANON_ADMIN

# Mode sombre
# Valeurs possibles: active, inactive, system
DARK_MODE=$DARK_MODE

# Alerte import clients
# Durée en jours après laquelle une alerte s'affiche si aucun import
CLIENT_IMPORT_WARNING_DAYS=$IMPORT_WARNING

# Backup automatique
# Fréquence des backups automatiques en heures (0 = désactivé)
BACKUP_FREQUENCY_HOURS=$BACKUP_FREQ

# Nombre de backups à conserver
BACKUP_RETENTION_COUNT=$BACKUP_COUNT
EOF

    print_success "Fichier .env créé"
fi
echo ""

# Créer le dossier backups
echo "5️⃣  Création des dossiers nécessaires..."
echo ""

if [ ! -d "backups" ]; then
    mkdir backups
    print_success "Dossier backups/ créé"
else
    print_success "Dossier backups/ existe"
fi
echo ""

# Résumé
echo "=================================="
echo "✅ Installation terminée !"
echo "=================================="
echo ""
echo "📋 Résumé de la configuration:"
echo "   • Port: $PORT"
echo "   • Anonymisation Guest: $ANON_GUEST"
echo "   • Anonymisation Admin: $ANON_ADMIN"
echo "   • Mode sombre: $DARK_MODE"
echo "   • Backup automatique: ${BACKUP_FREQ}h"
echo "   • Backups conservés: $BACKUP_COUNT"
echo ""

# Obtenir l'IP locale
if command -v hostname &> /dev/null; then
    LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}')
    if [ -z "$LOCAL_IP" ]; then
        LOCAL_IP=$(ifconfig 2>/dev/null | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
    fi
fi

if [ -z "$LOCAL_IP" ]; then
    LOCAL_IP="[IP_LOCAL]"
fi

echo "🚀 Pour démarrer l'application:"
echo ""
echo "   npm start        # Mode production"
echo "   npm run dev      # Mode développement (auto-reload)"
echo ""
echo "📱 Accès à l'application:"
echo "   Local:  http://localhost:$PORT"
echo "   Réseau: http://$LOCAL_IP:$PORT"
echo ""

# Proposer de démarrer
read -p "Voulez-vous démarrer le serveur maintenant ? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    print_info "Démarrage du serveur..."
    echo ""
    npm start
else
    echo ""
    print_success "Installation terminée. Lancez 'npm start' quand vous êtes prêt."
    echo ""
fi