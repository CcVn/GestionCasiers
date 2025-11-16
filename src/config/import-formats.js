// Configuration des formats d'import CSV

const IMPORT_FORMATS = {
    'INTERNE': {
        separator: ',',
        mapping: {
            'IPP': 'ipp',
            'Nom': 'name',
            'Prénom': 'firstName',
            'Nom Naissance': 'birthName',
            'DDN': 'birthDate',
            'Sexe': 'sex',
            'Zone': 'zone',
            'Date Entrée': 'entryDate'
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
            'N°\nIPP': 'ipp',
            'Nom': 'name',
            'Né(e) le': 'birthDate',
            'Entré(e)\nle': 'entryDate',
            'Unité Médicale': 'zone'
        },
        ignored: ['N°\nDossier', 'INS', 'Sorti(e)\nle', '', 'Age', 'Ch.', 'Lit', 'Dernier contrôle'],
        filters: [],
        skipRows: 0
    }
};

module.exports = {
    IMPORT_FORMATS
};
