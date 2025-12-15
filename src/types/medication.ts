/**
 * Medication data types for the sleep analysis application
 */

/**
 * Raw medication entry as parsed from CSV
 */
export interface MedicationEntry {
    date: string;           // YYYY-MM-DD
    time: string;           // HH:MM
    timestamp: Date;        // Combined datetime
    name: string;           // Original name from CSV
    normalizedName: string; // Standardized drug name (lowercase, no variants)
    drugClass: DrugClass;   // Classification category
    quantity: number;       // Dose count (can be fractional like 0.5)
    dosageMg: number;       // Extracted mg dosage from name
    totalMg: number;        // quantity * dosageMg
}

/**
 * Drug classification categories
 */
export type DrugClass =
    | 'sleep_aid'           // Temazepam, Ambien, Zaleplon, etc.
    | 'stimulant'           // Adderall, Methylphenidate, etc.
    | 'beta_blocker'        // Propranolol
    | 'antipsychotic'       // Quetiapine
    | 'anxiolytic'          // Gabapentin, Clonidine
    | 'antidepressant'      // Bupropion, Luvox, Lamotrigine
    | 'supplement'          // Magnesium, Omega 3, Melatonin, etc.
    | 'other';              // Antibiotics, PPIs, etc.

/**
 * Drug classification configuration for normalization
 */
export interface DrugClassConfig {
    patterns: RegExp[];     // Regex patterns to match drug names
    className: DrugClass;
    displayName: string;
}

/**
 * Summary of medications taken for a specific sleep night
 * (window: bedtime -6hrs to +2hrs)
 */
export interface DailyMedicationSummary {
    date: string;           // Sleep date (YYYY-MM-DD)
    entries: MedicationEntry[];

    // Aggregated by drug class
    sleepAids: MedicationAggregate[];
    stimulants: MedicationAggregate[];
    betaBlockers: MedicationAggregate[];
    antipsychotics: MedicationAggregate[];
    anxiolytics: MedicationAggregate[];
    antidepressants: MedicationAggregate[];
    supplements: MedicationAggregate[];
    others: MedicationAggregate[];

    // Summary metrics
    totalSleepAidMg: number;
    totalStimulantMg: number;
    sleepAidCount: number;
    stimulantCount: number;
    uniqueDrugsCount: number;
}

/**
 * Aggregated medication data for a single drug on a given day
 */
export interface MedicationAggregate {
    normalizedName: string;
    displayName: string;
    drugClass: DrugClass;
    totalQuantity: number;
    totalMg: number;
    timings: string[];      // Array of HH:MM times taken
    entries: MedicationEntry[];
}

/**
 * Parsed medication log result
 */
export interface MedicationLogResult {
    entries: MedicationEntry[];
    uniqueDrugs: Set<string>;
    dateRange: {
        start: string;
        end: string;
    };
    totalEntries: number;
    parsingErrors: ParsingError[];
}

/**
 * CSV parsing error
 */
export interface ParsingError {
    line: number;
    rawData: string;
    error: string;
}

/**
 * Drug normalization mapping
 */
export const DRUG_CLASSIFICATIONS: DrugClassConfig[] = [
    {
        patterns: [/temazepam/i, /ambien/i, /zolpidem/i, /zaleplon/i, /sonata/i, /dayvigo/i, /doxylamine/i],
        className: 'sleep_aid',
        displayName: 'Sleep Aids'
    },
    {
        patterns: [/adderall/i, /dextroamphetamine/i, /amphetamine/i, /methylphenidate/i, /ritalin/i, /concerta/i, /vyvanse/i],
        className: 'stimulant',
        displayName: 'Stimulants'
    },
    {
        patterns: [/propranolol/i],
        className: 'beta_blocker',
        displayName: 'Beta Blockers'
    },
    {
        patterns: [/quetiapine/i, /seroquel/i],
        className: 'antipsychotic',
        displayName: 'Antipsychotics'
    },
    {
        patterns: [/gabapentin/i, /clonidine/i, /tizanidine/i, /theanine/i],
        className: 'anxiolytic',
        displayName: 'Anxiolytics'
    },
    {
        patterns: [/bupropion/i, /wellbutrin/i, /luvox/i, /fluvoxamine/i, /lamotrigine/i, /lamictal/i, /sertraline/i, /seroplus/i],
        className: 'antidepressant',
        displayName: 'Antidepressants'
    },
    {
        patterns: [/magnesium/i, /omega/i, /vitamin/i, /zinc/i, /coq10/i, /melatonin/i, /cherry/i, /beet/i, /uridine/i, /choline/i, /sulbutiamine/i],
        className: 'supplement',
        displayName: 'Supplements'
    }
];

/**
 * Extract normalized drug name from raw name
 */
export function extractNormalizedName(rawName: string): string {
    // Remove dosage info, special characters, and normalize
    return rawName
        .toLowerCase()
        .replace(/\d+(\.\d+)?(\s*)?(mg|mcg|ml|iu|capsule|tablet|oral|er|xr|xl|sr|hr|extended\s*release|24\s*hr)/gi, '')
        .replace(/[,\s]+/g, ' ')
        .trim()
        .split(' ')[0]; // Take first word as drug name
}

/**
 * Classify a drug based on its name
 */
export function classifyDrug(normalizedName: string): DrugClass {
    for (const config of DRUG_CLASSIFICATIONS) {
        for (const pattern of config.patterns) {
            if (pattern.test(normalizedName)) {
                return config.className;
            }
        }
    }
    return 'other';
}

/**
 * Extract dosage in mg from medication name
 */
export function extractDosageMg(name: string): number {
    const match = name.match(/(\d+(?:\.\d+)?)\s*(?:mg|MG)/i);
    return match ? parseFloat(match[1]) : 0;
}
