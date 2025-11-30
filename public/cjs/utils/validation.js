// ============ VALIDATION DES FORMULAIRES ============

/**
 * Valide le formulaire de casier
 * @returns {Array<string>} Liste des erreurs (vide si valide)
 */
function validateLockerForm() {
  const errors = [];
  
  const lastName = document.getElementById('lastName').value.trim();
  const firstName = document.getElementById('firstName').value.trim();
  const code = document.getElementById('code').value.trim();
  const birthDate = document.getElementById('birthDate').value;
  const lockerNumber = document.getElementById('lockerNumber').value;
  
  // Validation du numéro de casier
  if (!lockerNumber) {
    errors.push('Le numéro de casier est obligatoire');
  }
  
  // Validation du nom
  if (!lastName) {
    errors.push('Le nom est obligatoire');
  } else if (lastName.length < 2) {
    errors.push('Le nom doit contenir au moins 2 caractères');
  } else if (lastName.length > 50) {
    errors.push('Le nom ne peut pas dépasser 50 caractères');
  }
  
  // Validation du prénom
  if (!firstName) {
    errors.push('Le prénom est obligatoire');
  } else if (firstName.length < 2) {
    errors.push('Le prénom doit contenir au moins 2 caractères');
  } else if (firstName.length > 50) {
    errors.push('Le prénom ne peut pas dépasser 50 caractères');
  }
  
  // Validation de l'IPP
  if (!code) {
    errors.push('Le N°IPP est obligatoire');
  } else if (!/^\d+$/.test(code)) {
    errors.push('Le N°IPP doit être un nombre');
  } else if (code.length < 3 || code.length > 20) {
    errors.push('Le N°IPP doit contenir entre 3 et 20 chiffres');
  }
  
  // Validation de la date de naissance
  if (!birthDate) {
    errors.push('La date de naissance est obligatoire');
  } else {
    const date = new Date(birthDate);
    const now = new Date();
    const minDate = new Date('1900-01-01');
    
    if (isNaN(date.getTime())) {
      errors.push('La date de naissance est invalide');
    } else if (date > now) {
      errors.push('La date de naissance ne peut pas être dans le futur');
    } else if (date < minDate) {
      errors.push('La date de naissance doit être postérieure à 1900');
    }
    
    // Vérifier âge réaliste (< 120 ans)
    const age = (now - date) / (1000 * 60 * 60 * 24 * 365.25);
    if (age > 120) {
      errors.push('La date de naissance semble incorrecte (âge > 120 ans)');
    }
  }
  
  return errors;
}

/**
 * Affiche les erreurs de validation
 */
function displayValidationErrors(errors) {
  if (errors.length === 0) return;
  
  const errorMessage = '❌ Erreurs de validation :\n\n' + 
    errors.map((err, i) => `${i + 1}. ${err}`).join('\n');
  
  showStatus(errorMessage, 'error');
  
  // Optionnel : surligner les champs en erreur
  highlightInvalidFields(errors);
}

/**
 * Surligne visuellement les champs invalides
 */
function highlightInvalidFields(errors) {
  // Retirer les anciennes marques d'erreur
  document.querySelectorAll('.form-group input, .form-group textarea, .form-group select').forEach(el => {
    el.classList.remove('invalid');
  });
  
  // Marquer les champs en erreur
  if (errors.some(e => e.includes('nom'))) {
    document.getElementById('lastName')?.classList.add('invalid');
  }
  if (errors.some(e => e.includes('prénom'))) {
    document.getElementById('firstName')?.classList.add('invalid');
  }
  if (errors.some(e => e.includes('IPP'))) {
    document.getElementById('code')?.classList.add('invalid');
  }
  if (errors.some(e => e.includes('date de naissance'))) {
    document.getElementById('birthDate')?.classList.add('invalid');
  }
  if (errors.some(e => e.includes('casier'))) {
    document.getElementById('lockerNumber')?.classList.add('invalid');
  }
}

/**
 * Validation en temps réel (optionnel)
 */
function enableRealtimeValidation() {
  const fields = ['lastName', 'firstName', 'code', 'birthDate'];
  
  fields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (!field) return;
    
    field.addEventListener('blur', () => {
      // Valider et afficher les erreurs spécifiques à ce champ
      const errors = validateLockerForm().filter(err => {
        const fieldName = fieldId === 'code' ? 'IPP' : fieldId;
        return err.toLowerCase().includes(fieldName.toLowerCase());
      });
      
      if (errors.length > 0) {
        field.classList.add('invalid');
        // Optionnel : tooltip d'erreur
      } else {
        field.classList.remove('invalid');
      }
    });
    
    // Retirer l'indicateur d'erreur lors de la saisie
    field.addEventListener('input', () => {
      field.classList.remove('invalid');
    });
  });
}

// Rendre les fonctions globales
window.validateLockerForm = validateLockerForm;
window.displayValidationErrors = displayValidationErrors;
window.highlightInvalidFields = highlightInvalidFields;
window.enableRealtimeValidation = enableRealtimeValidation;

