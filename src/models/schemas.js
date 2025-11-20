// Schémas de validation Zod

const { z } = require('zod');

// Schéma pour créer/modifier un casier
const lockerSchema = z.object({
    number: z.string().min(1, 'Numéro de casier requis').regex(/^[A-Z]+\d{1,3}$/, 'Format numéro invalide'),
    zone: z.string().min(1, 'Zone requise'),
    name: z.string().max(100, 'Nom trop long').optional().default(''),
    firstName: z.string().max(100, 'Prénom trop long').optional().default(''),
    code: z.string().max(50, 'Code IPP trop long').optional().default(''),
    birthDate: z.string().optional().default(''),
    recoverable: z.boolean().optional().default(false),
    hosp: z.boolean().optional().default(false),
    hospDate: z.string().optional().default(''),
    idel: z.boolean().optional().default(false),
    stup: z.boolean().optional().default(false),
    frigo: z.boolean().optional().default(false),
    PCA: z.boolean().optional().default(false),
    MEOPA: z.boolean().optional().default(false),
    comment: z.string().max(500, 'Commentaire trop long').optional().default(''),
    marque: z.boolean().optional().default(false),
    expectedVersion: z.union([z.number(), z.null()]).optional()
});

// Schéma pour import clients
const clientSchema = z.object({
    ipp: z.string().min(1, 'IPP requis'),
    name: z.string().max(50).optional().default(''),
    firstName: z.string().max(20).optional().default(''),
    birthName: z.string().max(50).optional().default(''),
    birthDate: z.string().optional().default(''),
    sex: z.enum(['M', 'F', '']).optional().default(''),
    zone: z.string().max(15).optional().default(''),
    entryDate: z.string().optional().default('')
});

// Schéma pour import CSV casiers
const importCasierSchema = z.object({
    number: z.string().min(1),
    zone: z.string().min(1),
    name: z.string().max(50).optional().default(''),
    firstName: z.string().max(20).optional().default(''),
    code: z.string().max(50).optional().default(''),
    birthDate: z.string().optional().default(''),
    recoverable: z.boolean().optional().default(false),
    marque: z.boolean().optional().default(false),
    hosp: z.boolean().optional().default(false),
    hospDate: z.string().optional().default(''),
    idel: z.boolean().optional().default(false),
    stup: z.boolean().optional().default(false),
    frigo: z.boolean().optional().default(false),
    PCA: z.boolean().optional().default(false),
    MEOPA: z.boolean().optional().default(false),
    comment: z.string().max(200).optional().default('')
});

// Schéma pour restauration backup
const restoreSchema = z.object({
    filename: z.string().optional(),
    fileData: z.string().optional()
}).refine(
    data => data.filename || data.fileData,
    {
        message: 'Un fichier ou un nom de backup doit être fourni'
    }
);

// Schéma pour login
const loginSchema = z.object({
    password: z.string()
        .max(100, 'Mot de passe trop long')
        .optional()
        .default(''),
    userName: z.string()
        .max(50, 'Nom/initiales trop long')
        .optional()
        .default('')
        .transform(val => val.trim())
}).refine(data => {
    if (!data.userName || data.userName === '') {
        return true;
    }
    return /^[a-zA-Z0-9\s\-_.]+$/.test(data.userName);
}, {
    message: 'Caractères invalides dans le nom',
    path: ['userName']
});

module.exports = {
    lockerSchema,
    clientSchema,
    importCasierSchema,
    restoreSchema,
    loginSchema
};
