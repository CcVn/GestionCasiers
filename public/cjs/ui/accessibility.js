// ============ ACCESSIBILITÉ CLAVIER - VERSION AVEC SOUS-MENUS ============

/**
 * Fonction générique pour Focus trap dans les modals
 */
function trapFocus(modal) {
    const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    modal.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            if (e.shiftKey && document.activeElement === firstElement) {
                lastElement.focus();
                e.preventDefault();
            } else if (!e.shiftKey && document.activeElement === lastElement) {
                firstElement.focus();
                e.preventDefault();
            }
        }
    });
    
    // Focus auto sur premier élément
    setTimeout(() => firstElement?.focus(), 100);
}

/**
 * Rend un dropdown accessible au clavier
 */
function makeDropdownAccessible(buttonEl, menuEl) {
  if (!buttonEl || !menuEl) return;
  
  let currentIndex = -1;
  // Ne prendre QUE les items de premier niveau (pas ceux du sous-menu)
  const items = Array.from(menuEl.querySelectorAll(':scope > button:not([disabled]), .dropdown-submenu > .has-submenu'));
  
  if (items.length === 0) return;
  
  // Attributs ARIA
  buttonEl.setAttribute('aria-haspopup', 'true');
  buttonEl.setAttribute('aria-expanded', 'false');
  menuEl.setAttribute('role', 'menu');
  items.forEach(item => {
    if (!item.classList.contains('has-submenu')) {
      item.setAttribute('role', 'menuitem');
    }
    item.setAttribute('tabindex', '-1');
  });
  
  // Observer les changements
  const observer = new MutationObserver(() => {
    const isOpen = menuEl.classList.contains('active');
    buttonEl.setAttribute('aria-expanded', isOpen);
  });
  observer.observe(menuEl, { attributes: true, attributeFilter: ['class'] });
  
  // Gestion clavier sur le bouton ⋮
  buttonEl.addEventListener('keydown', (e) => {
    const isOpen = menuEl.classList.contains('active');
    
    switch(e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        e.stopPropagation(); // emêche de remonter au parent
        buttonEl.click();
        requestAnimationFrame(() => {
          if (menuEl.classList.contains('active')) {
            currentIndex = 0;
            items[0].focus();
          }
        });
        break;
        
      case 'ArrowDown':
        if (!isOpen) {
          e.preventDefault();
          buttonEl.click();
          requestAnimationFrame(() => {
            currentIndex = 0;
            items[0].focus();
          });
        }
        break;
        
      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          buttonEl.click();
          buttonEl.focus();
          currentIndex = -1;
        }
        break;
    }
  });
  
  // Gestion clavier dans le menu principal
  items.forEach((item, index) => {
    // Ne pas ajouter de listeners sur les items avec sous-menu (ils seront gérés par makeSubmenuAccessible)
    if (item.classList.contains('has-submenu')) {
      Logger.debug('⏭️ Item ignoré (a un sous-menu):', item.textContent.trim());
      return; // SKIP cet item
    }
    
    item.addEventListener('keydown', (e) => {
      switch(e.key) {
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          menuEl.classList.remove('active');
          buttonEl.focus();
          currentIndex = -1;
          break;
          
        case 'ArrowDown':
          e.preventDefault();
          currentIndex = (index + 1) % items.length;
          items[currentIndex].focus();
          break;
          
        case 'ArrowUp':
          e.preventDefault();
          currentIndex = index - 1;
          if (currentIndex < 0) currentIndex = items.length - 1;
          items[currentIndex].focus();
          break;
          
        case 'Home':
          e.preventDefault();
          currentIndex = 0;
          items[currentIndex].focus();
          break;
          
        case 'End':
          e.preventDefault();
          currentIndex = items.length - 1;
          items[currentIndex].focus();
          break;
          
        case 'Tab':
          menuEl.classList.remove('active');
          currentIndex = -1;
          break;
          
        case 'Enter':
        case ' ':
          e.preventDefault();
          e.stopPropagation();
          item.click();
          menuEl.classList.remove('active');
          currentIndex = -1;
          break;
      }
    });
  });
}

// ============ GESTION DES SOUS-MENUS ============

/**
 * Rend un sous-menu accessible au clavier
 */
function makeSubmenuAccessible(parentItem, submenu) {
  if (!parentItem || !submenu) return;
  
  const submenuItems = Array.from(submenu.querySelectorAll('button:not([disabled])'));
  
  // Attributs ARIA
  parentItem.setAttribute('aria-haspopup', 'true');
  parentItem.setAttribute('aria-expanded', 'false');
  submenu.setAttribute('role', 'menu');
  submenuItems.forEach(item => {
    item.setAttribute('role', 'menuitem');
    item.setAttribute('tabindex', '-1');
  });
  
  let submenuIndex = -1;
  
  // Gestion clavier sur l'item parent
  parentItem.addEventListener('keydown', (e) => {
    const isOpen = submenu.classList.contains('active');
    
    switch(e.key) {
      case 'ArrowRight':
      case 'Enter':
      case ' ':
        e.preventDefault();
        e.stopPropagation();
        
        submenu.classList.add('active');
        parentItem.setAttribute('aria-expanded', 'true');
        
        submenuIndex = 0;
        submenuItems[0].focus();
        break;
        
      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          e.stopPropagation();
          submenu.classList.remove('active');
          parentItem.setAttribute('aria-expanded', 'false');
          parentItem.focus();
          submenuIndex = -1;
        }
        break;
        
      // Permettre navigation haut/bas même sur l'item parent
      case 'ArrowDown':
      case 'ArrowUp':
        // Laisser le gestionnaire du menu principal gérer
        break;
    }
  });
  
  // Gestion clavier dans le sous-menu
  submenuItems.forEach((item, index) => {
    item.addEventListener('keydown', (e) => {
      switch(e.key) {
        case 'ArrowLeft':
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          
          submenu.classList.remove('active');
          parentItem.setAttribute('aria-expanded', 'false');
          parentItem.focus();
          submenuIndex = -1;
          break;
          
        case 'ArrowDown':
          e.preventDefault();
          submenuIndex = (index + 1) % submenuItems.length;
          submenuItems[submenuIndex].focus();
          break;
          
        case 'ArrowUp':
          e.preventDefault();
          submenuIndex = index - 1;
          if (submenuIndex < 0) submenuIndex = submenuItems.length - 1;
          submenuItems[submenuIndex].focus();
          break;
          
        case 'Home':
          e.preventDefault();
          submenuIndex = 0;
          submenuItems[submenuIndex].focus();
          break;
          
        case 'End':
          e.preventDefault();
          submenuIndex = submenuItems.length - 1;
          submenuItems[submenuIndex].focus();
          break;
          
        case 'Enter':
        case ' ':
          e.preventDefault();
          e.stopPropagation();
          item.click();
          
          // Fermer les deux menus
          submenu.classList.remove('active');
          const mainMenu = submenu.closest('.dropdown-menu');
          if (mainMenu) mainMenu.classList.remove('active');
          submenuIndex = -1;
          break;
      }
    });
  });
}

/**
 * Initialiser l'accessibilité de tous les dropdowns ET sous-menus
 */
function initDropdownAccessibility() {
  const containers = document.querySelectorAll('.menu-dot');
  Logger.debug(`♿ Initialisation accessibilité : ${containers.length} dropdown(s)`);
  
  containers.forEach((container, i) => {
    const button = container.querySelector('button[onclick*="toggleDropdown"]');
    const menu = container.querySelector('.dropdown-menu');
    
    if (button && menu) {
      makeDropdownAccessible(button, menu);
      
      // Gérer les sous-menus
      const submenus = menu.querySelectorAll('.dropdown-submenu');
      submenus.forEach(submenuContainer => {
        const parentButton = submenuContainer.querySelector('.has-submenu');
        const submenu = submenuContainer.querySelector('.dropdown-submenu-content');
        
        if (parentButton && submenu) {
          makeSubmenuAccessible(parentButton, submenu);
          Logger.debug('  ↳ Sous-menu initialisé');
        }
      });
    }
  });
  
  Logger.info('✓ Accessibilité dropdowns + sous-menus initialisée');
}

// Faire disparaître le menu si on clique en dehors
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-dot')) {
    // Fermer tous les dropdowns sauf celui cliqué
    document.querySelectorAll('.dropdown-menu.active').forEach(menu => {
      menu.classList.remove('active');
      const button = menu.closest('.menu-dot')?.querySelector('.dropdown-trigger');
      if (button) {
        button.setAttribute('aria-expanded', 'false');
      }
    });
  }
});

// --- Gestion du menu dropdown Actions, avec support raccourcis clavier
document.addEventListener('keydown', function(e) {
    const activeDropdown = document.querySelector('.dropdown-menu.active');
    
    if (activeDropdown) {
        const items = Array.from(activeDropdown.querySelectorAll('button:not([disabled])'));
        const currentIndex = items.findIndex(item => item === document.activeElement);
        
        switch(e.key) {
            case 'Escape':
                activeDropdown.classList.remove('active');
                e.preventDefault();
                break;
                
            case 'ArrowDown':
                if (currentIndex < items.length - 1) {
                    items[currentIndex + 1].focus();
                }
                e.preventDefault();
                break;
                
            case 'ArrowUp':
                if (currentIndex > 0) {
                    items[currentIndex - 1].focus();
                }
                e.preventDefault();
                break;
        }
    }
});

// Toggle dropdown , version historique
function toggleDropdown(e) {
    e.stopPropagation();
    const menu = e.target.nextElementSibling;
    const wasActive = menu.classList.contains('active');
    
    document.querySelectorAll('.dropdown-menu.active').forEach(m => {
        if (m !== menu) m.classList.remove('active');
    });
    
    menu.classList.toggle('active');
    
    // Focus premier élément si ouvert
    if (!wasActive && menu.classList.contains('active')) {
        const firstItem = menu.querySelector('button:not([disabled])');
        if (firstItem) firstItem.focus();
    }
}


// Rendre les fonctions globales
window.trapFocus = trapFocus;
window.toggleDropdown = toggleDropdown;
window.makeDropdownAccessible = makeDropdownAccessible;
window.makeSubmenuAccessible = makeSubmenuAccessible;
window.initDropdownAccessibility = initDropdownAccessibility;
