/**
 * Configuration des formats et colonnes pour l'import de données CSV
 */

// Importer la fonction de normalisation des dates existante
const { normalizeDateFormat } = require('../utils/date');


// ============================================================
// Configuration des colonnes
// ============================================================

const IMPORT_FORMATS = {
    'INTERNE': {
        separator: ',',
        mapping: {
            'IPP': 'ipp',
            'Nom': 'name',
            'Prenom': 'firstName',
            'Nom Naissance': 'birthName',
            'DDN': 'birthDate',
            'Sexe': 'sex',
            'Zone': 'zone',
            'DateEntree': 'entryDate'
        },
        filters: [],
        skipRows: 0
    },
    
    'MHCARE': {
        separator: ';',
        mapping: {
            'NOM': 'name',
            'PRENOM': 'firstName',
            'SEXE': 'sex',
            'DATE_DE_NAISSANCE': 'birthDate',
            'IPP': 'ipp',
            'DATE_DE_DEBUT': 'entryDate',
            'SECTEUR': 'zone'
        },
        ignored: ['SEJOUR', 'DATE_DE_FIN', 'ADRESSE', 'COMPLEMENT_ADRESSE', 'CODE_POSTAL', 'VILLE', 'TELEPHONE'],
        filters: [
            {
                field: 'STATUT',
                operator: 'in',
                values: ['Admission', 'Préadmission']
            }
        ],
        skipRows: 0
    },

    'WINPHARM': {
        separator: ';',
        mapping: {
            'N° IPP': 'ipp',
            'Nom': 'name',
            'Né(e) le': 'birthDate',
            'Entré(e) le': 'entryDate',
            'Unité Médicale': 'zone',
            'sex': 'sex'
        },
        ignored: ['N°\nDossier', 'INS', 'Sorti(e)\nle', 'Age', 'Ch.', 'Lit', 'Dernier contrôle'],
        filters: [],
        skipRows: 0
    }
};


/**
 * Colonnes pour l'import CLIENTS/PATIENTS
 * 
 * Structure : {
 *   champStandard: ['variante1', 'variante2', ...]
 * }
 */
const CLIENT_COLUMNS = {
  // ============================================================
  // CHAMPS OBLIGATOIRES
  // ============================================================
  
  /**
   * Identifiant Patient Permanent (IPP)
   * Numéro unique d'identification du patient
   */
  ipp: [
    'ipp',
    'n°ipp',
    'n° ipp',  //après nettoyage Winpharm
    'numero_ipp',
    'ipp_patient',
    'code_patient',
    'patient_id',
    'id_patient',
    'numero_patient'
  ],
  
  /**
   * Nom de famille (nom d'usage)
   */
  name: [
    'nom',
    'name',
    'nom_patient',
    'nom_usage',
    'nom_usuel',
    'lastname',
    'patient_nom',
    'nom_de_famille',
    'nom_famille',
    'surname'
  ],
  
  /**
   * Prénom
   */
  firstName: [
    'prenom',
    'prénom',
    'firstname',
    'prenom_patient',
    'patient_prenom'
  ],
  
  // ============================================================
  // CHAMPS OPTIONNELS
  // ============================================================
  
  /**
   * Nom de naissance (nom de jeune fille)
   */
  birthName: [
    'nom_naissance',
    'nom_de_naissance',
    'nom_jeune_fille',
    'nom_jf',
    'né(e)',
    'née',
    'birthname',
    'birth_name'
  ],
  
  /**
   * Date de naissance
   */
  birthDate: [
    'date_de_naissance',
    'ddn',
    'date_naissance',
    'birthdate',
    'birth_date',
    'ne_le',
    'né_le',
    'dn'
  ],
  
  /**
   * Sexe / Genre / Civilité
   */
  sex: [
    'sexe',
    'sex',
    'genre',
    'gender'
  ],
  
  /**
   * Zone géographique / Secteur
   */
  zone: [
    'zone',
    'secteur',
    'zone_geo',
    'unite_medicale',
    'um'
  ],
  
  /**
   * Date d'entrée / Date d'admission
   */
  entryDate: [
    'date_entree',
    'date_admission',
    'entrydate',
    'admission',
    'date_debut',
    'date_pec',
    'admission_date',
    'entree'
  ],
};

/**
 * Colonnes pour l'import CASIERS/LOCKERS
 * 
 * Structure identique aux clients
 */
const LOCKER_COLUMNS = {
  // ============================================================
  // CHAMPS OBLIGATOIRES
  // ============================================================
  
  /**
   * Numéro de casier
   */
  number: [
    'numero',
    'numéro',
    'number',
    'n°casier',
    'nocasier',
    'numero_casier',
    'casier',
    'locker',
    'locker_number',
    'num'
  ],
  
  /**
   * Zone du casier
   */
  zone: [
    'zone',
    'secteur',
    'area',
    'zone_casier',
    'emplacement'
  ],
  
  /**
   * Nom du patient
   */
  name: [
    'nom',
    'name',
    'nom_patient',
    'lastname'
  ],
  
  /**
   * Prénom du patient
   */
  firstName: [
    'prenom',
    'prénom',
    'firstname',
    'prenom_patient'
  ],
  
  /**
   * Numéro IPP
   */
  code: [
    'ipp',
    'code',
    'n°ipp',
    'noipp',
    'numero_ipp',
    'patient_id'
  ],
  
  /**
   * Date de naissance
   */
  birthDate: [
    'date_de_naissance',
    'ddn',
    'birthdate',
    'date_naissance'
  ],
  
  // ============================================================
  // CHAMPS OPTIONNELS / MARQUEURS
  // ============================================================
  
  /**
   * Casier récupérable
   */
  recoverable: [
    'recuperable',
    'récupérable',
    'recoverable',
    'recuper',
    'recup'
  ],
  
  /**
   * Casier marqué
   */
  marque: [
    'marque',
    'marqué',
    'marked',
    'flag',
    'flagged'
  ],
  
  /**
   * Patient hospitalisé
   */
  hosp: [
    'hospitalisation',
    'hosp',
    'hospitalise',
    'hospitalisé',
    'hospitalized'
  ],
  
  /**
   * Date d'hospitalisation
   */
  hospDate: [
    'date_hospitalisation',
    'date_hosp',
    'hosp_date',
    'hospitalization_date'
  ],
  
  /**
   * Stupéfiants
   */
  stup: [
    'stupefiants',
    'stupéfiants',
    'stup',
    'narcotics',
    'controlled_substances'
  ],
  
  /**
   * IDEL (Infirmier libéral)
   */
  idel: [
    'idel',
    'infirmier_liberal',
    'infirmier_liberaux',
    'nurse',
    'home_nurse'
  ],
  
  /**
   * Réfrigérateur
   */
  frigo: [
    'frigo',
    'refrigerateur',
    'réfrigérateur',
    'fridge',
    'refrigerator',
    'cold_storage'
  ],
  
  /**
   * PCA (Pompe à analgésie contrôlée)
   */
  pca: [
    'pca',
    'pompe',
    'pompe_pca',
    'analgesie',
    'analgésie',
    'pain_pump'
  ],
  
  /**
   * MEOPA (Mélange Équimolaire Oxygène Protoxyde d'Azote)
   */
  meopa: [
    'meopa',
    'kalinox',
    'protoxyde',
    'gaz',
    'laughing_gas'
  ],
  
  /**
   * Commentaire
   */
  comment: [
    'commentaire',
    'comment',
    'remarque',
    'note',
    'notes',
    'observations',
    'observation'
  ]
};

/**
 * Configuration des champs obligatoires par type d'import
 */
const REQUIRED_FIELDS = {
  clients: ['ipp', 'name', 'firstName', 'birthDate'],
  lockers: ['number', 'zone', 'name', 'firstName', 'code', 'birthDate']
};

/**
 * Normalise un nom de colonne
 * Retire accents, espaces, caractères spéciaux
 */
function normalizeColumnName(rawName, columnConfig) {
  if (!rawName) return null;
  
  // Nettoyer le nom : minuscules, sans accents, espaces → underscores
  const cleaned = rawName
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Supprimer accents
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[°º]/g, '') // Supprimer symboles degré
    .replace(/[^\w_]/g, ''); // Garder uniquement lettres, chiffres, underscore
  
  // Chercher dans les variantes
  for (const [standardName, variants] of Object.entries(columnConfig)) {
    if (variants.some(variant => {
      const cleanVariant = variant
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^\w_]/g, '');
      
      return cleaned === cleanVariant || 
             cleaned.includes(cleanVariant) ||
             cleanVariant.includes(cleaned);
    })) {
      return standardName;
    }
  }
  
  return null;
}

/**
 * Crée un mapping des index de colonnes vers les noms standardisés
 */
function createColumnMapping(headers, columnConfig) {
  const mapping = {};
  const unmappedColumns = [];
  
  headers.forEach((header, index) => {
    const standardName = normalizeColumnName(header, columnConfig);
    
    if (standardName) {
      mapping[index] = standardName;
    } else {
      unmappedColumns.push({ index, name: header });
    }
  });
  
  return { mapping, unmappedColumns };
}

/**
 * Valide que les colonnes obligatoires sont présentes
 */
function validateRequiredColumns(mapping, importType) {
  const requiredFields = REQUIRED_FIELDS[importType] || [];
  const mappedFields = Object.values(mapping);
  const missingFields = requiredFields.filter(field => !mappedFields.includes(field));
  
  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}

/**
 * Obtient les variantes acceptées pour un champ
 */
function getFieldVariants(fieldName, importType) {
  const config = importType === 'clients' ? CLIENT_COLUMNS : LOCKER_COLUMNS;
  return config[fieldName] || [];
}

/**
 * Génère un rapport de mapping pour debug
 */
function generateMappingReport(headers, mapping, unmappedColumns, importType) {
  const report = {
    totalColumns: headers.length,
    mappedColumns: Object.keys(mapping).length,
    unmappedColumns: unmappedColumns.length,
    details: {
      mapped: Object.entries(mapping).map(([index, field]) => ({
        index: parseInt(index),
        originalName: headers[index],
        standardName: field
      })),
      unmapped: unmappedColumns.map(col => ({
        index: col.index,
        name: col.name
      }))
    }
  };
  
  // Validation des champs requis
  const validation = validateRequiredColumns(mapping, importType);
  report.validation = {
    isValid: validation.isValid,
    missingFields: validation.missingFields
  };
  
  return report;
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  IMPORT_FORMATS,

  // Configuration des colonnes
  CLIENT_COLUMNS,
  LOCKER_COLUMNS,
  REQUIRED_FIELDS,
  
  // Fonctions utilitaires
  normalizeColumnName,
  createColumnMapping,
  validateRequiredColumns,
  getFieldVariants,
  generateMappingReport,
  
  // Ré-exporter la fonction de normalisation des dates
  normalizeDateFormat
};




