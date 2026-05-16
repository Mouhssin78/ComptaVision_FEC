const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Configure multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(express.static('public'));
app.use(express.json());

// Endpoint to handle Excel upload
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier fourni' });
    }

    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Convert sheet to JSON
        let rawData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
        
        // Trouver la ligne d'en-tête (cherche "JournalCode" ou "CompteNum" dans les 10 premières lignes)
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(20, rawData.length); i++) {
            const row = rawData[i] || [];
            const rowString = row.map(String).join('').toLowerCase();
            if (rowString.includes('journalcode') || rowString.includes('comptenum')) {
                headerRowIndex = i;
                break;
            }
        }

        // Isoler les données utiles (en-tête + lignes)
        const data = rawData.slice(headerRowIndex);
        
        // Validation des colonnes
        const expectedHeaders = [
            "JournalCode","JournalLib","EcritureNum","EcritureDate",
            "CompteNum","CompteLib","CompAuxNum","CompAuxLib",
            "PieceRef","PieceDate","EcritureLib","Debit","Credit",
            "EcritureLet","DateLet","ValidDate","Montantdevise",
            "Idevise","DateEcheance","SectionCode","SectionNom",
            "Reference","FEC SIMPLIFIE"
        ];
        const headers = data[0] || [];
        
        // Normalisation pour la comparaison (minuscules et sans espaces superflus)
        const normalize = str => String(str).trim().toLowerCase();
        const normalizedHeaders = headers.map(normalize);
        
        // Filtrer les colonnes manquantes en comparant les versions normalisées
        const missingHeaders = expectedHeaders.filter(h => !normalizedHeaders.includes(normalize(h)));
        
        if (missingHeaders.length > 0) {
            if (missingHeaders.length <= 2) {
                return res.status(400).json({ 
                    error: `Fichier non conforme. Colonne(s) manquante(s) : ${missingHeaders.join(', ')}` 
                });
            } else {
                return res.status(400).json({ 
                    error: "Fichier non conforme : Les colonnes ne correspondent pas au format attendu." 
                });
            }
        }
        
        // Optional: Check if there are completely different headers not expected (if user implied exact match)
        // But the prompt says: "s'il manque 2 colonnes ou moins... dans le cas contraire il faut dire que son fichier n'est pas conforme"
        // This handles both missing <= 2 and missing > 2.

        // Anonymisation des colonnes CompteLib et EcritureLib
        const compteLibIndex = headers.indexOf('CompteLib');
        const ecritureLibIndex = headers.indexOf('EcritureLib');
        
        if (compteLibIndex !== -1 || ecritureLibIndex !== -1) {
            let nextId = 1;
            const anonymizedMap = new Map();
            
            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                if (!row) continue;
                
                // Anonymisation CompteLib
                if (compteLibIndex !== -1) {
                    const originalValue = row[compteLibIndex];
                    if (originalValue !== undefined && originalValue !== null && originalValue !== '') {
                        if (!anonymizedMap.has(originalValue)) {
                            anonymizedMap.set(originalValue, `CompteLib_${nextId}`);
                            nextId++;
                        }
                        row[compteLibIndex] = anonymizedMap.get(originalValue);
                    }
                }

                // Anonymisation EcritureLib pour la Paie (ex: Paie2023 Dupont -> Paie2023)
                if (ecritureLibIndex !== -1) {
                    const ecritureLibValue = row[ecritureLibIndex];
                    if (typeof ecritureLibValue === 'string') {
                        // Cherche "Paie" suivi de 4 chiffres au début de la chaîne
                        const match = ecritureLibValue.match(/^(Paie\d{4})/i);
                        if (match) {
                            row[ecritureLibIndex] = match[1]; // Garde uniquement "PaieXXXX"
                        }
                    }
                }
            }
        }

        res.json({ 
            success: true, 
            filename: req.file.originalname,
            data: data
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erreur lors de la lecture du fichier Excel.' });
    }
});

app.listen(port, () => {
    console.log(`Serveur démarré sur http://localhost:${port}`);
});
