// ============ MODE SOMBRE ===============================

function applyDarkMode(setting) {
    DARK_MODE_SETTING = setting || 'system';
    if (VERBCONSOLE>1) { console.log('Application du mode sombre:', DARK_MODE_SETTING); }
    
    if (DARK_MODE_SETTING === 'active') {
        document.body.classList.add('dark-mode');
    } else if (DARK_MODE_SETTING === 'inactive') {
        document.body.classList.remove('dark-mode');
    } else if (DARK_MODE_SETTING === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (prefersDark) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
        
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (DARK_MODE_SETTING === 'system') {
                if (e.matches) {
                    document.body.classList.add('dark-mode');
                } else {
                    document.body.classList.remove('dark-mode');
                }
            }
        });
    }
    
    // Mettre à jour l'interface du sélecteur
    updateDarkModeButtons();
    // Mettre à jour l'icône du bouton header
    updateThemeIcon();
}

function updateDarkModeButtons() {
    const buttons = document.querySelectorAll('.mode-btn');
    buttons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.mode === DARK_MODE_SETTING) {
            btn.classList.add('active');
        }
    });
}

function safeLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.warn('LocalStorage quota exceeded');
      // Fallback: cookies ou sessionStorage
    }
    return false;
  }
}

function setDarkMode(mode) {
    if (VERBCONSOLE>0) { console.log('🌓 Changement mode:', mode); }
    
    // Sauvegarder la préférence localement
    safeLocalStorage('darkMode', mode);
    
    // Appliquer immédiatement
    applyDarkMode(mode);
    
    // Afficher une notification
    const modeNames = {
        'inactive': 'Mode clair',
        'active': 'Mode sombre',
        'system': 'Mode automatique'
    };
    
    showStatus(`✓ ${modeNames[mode]} activé`, 'success');
}

function toggleDarkModeQuick() {
    // Cycle: inactive → active → inactive
    let newMode;
    
    if (DARK_MODE_SETTING === 'inactive') {
        newMode = 'active';
    } else {
        newMode = 'inactive';
    }
    
    // Animation du bouton
    const btn = document.getElementById('btnThemeToggle');
    if (btn) {
        btn.classList.add('animating');
        setTimeout(() => btn.classList.remove('animating'), 
          getState('config.ui.animationDuration')
        );
    }
    
    setDarkMode(newMode); // Appliquer le mode
    updateThemeIcon(); // Mettre à jour l'icône
}

function updateThemeIcon() {
    const btn = document.getElementById('btnThemeToggle');
    if (!btn) return;
    
    const icon = btn.querySelector('.theme-icon');
    if (!icon) return;
    
    if (DARK_MODE_SETTING === 'active') {
        icon.textContent = '🌙';
        btn.title = 'Activer le mode clair';
    } else {
        icon.textContent = '☀️';
        btn.title = 'Activer le mode sombre';
    }
}

// Rendre les fonctions globales
window.applyDarkMode = applyDarkMode;
window.updateDarkModeButtons = updateDarkModeButtons;
window.setDarkMode = setDarkMode;
window.toggleDarkModeQuick = toggleDarkModeQuick;
window.updateThemeIcon = updateThemeIcon;