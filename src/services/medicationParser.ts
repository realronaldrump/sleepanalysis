/**
 * Medication CSV Parser Service
 * Parses medication logs exported from Guava Health
 */

import Papa from 'papaparse';
import {
    MedicationEntry,
    MedicationLogResult,
    ParsingError,
    DailyMedicationSummary,
    MedicationAggregate,
    DrugClass,
    extractNormalizedName,
    classifyDrug,
    extractDosageMg,
} from '@/types/medication';

interface CsvRow {
    date: string;
    time: string;
    name: string;
    quantity: string;
}

/**
 * Parse a medication CSV file
 */
export function parseMedicationCsv(csvContent: string): MedicationLogResult {
    const entries: MedicationEntry[] = [];
    const errors: ParsingError[] = [];
    const uniqueDrugs = new Set<string>();

    const result = Papa.parse<CsvRow>(csvContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase(),
    });

    result.data.forEach((row, index) => {
        try {
            // Validate required fields
            if (!row.date || !row.time || !row.name) {
                errors.push({
                    line: index + 2, // +2 for header and 0-indexing
                    rawData: JSON.stringify(row),
                    error: 'Missing required fields (date, time, or name)',
                });
                return;
            }

            const normalizedName = extractNormalizedName(row.name);
            const drugClass = classifyDrug(row.name); // Use full name for better matching
            const dosageMg = extractDosageMg(row.name);
            const quantity = parseFloat(row.quantity) || 1;

            // Parse date and time
            const [year, month, day] = row.date.split('-').map(Number);
            const [hours, minutes] = row.time.split(':').map(Number);
            const timestamp = new Date(year, month - 1, day, hours, minutes);

            if (isNaN(timestamp.getTime())) {
                errors.push({
                    line: index + 2,
                    rawData: JSON.stringify(row),
                    error: `Invalid date/time: ${row.date} ${row.time}`,
                });
                return;
            }

            const entry: MedicationEntry = {
                date: row.date,
                time: row.time,
                timestamp,
                name: row.name.trim(),
                normalizedName,
                drugClass,
                quantity,
                dosageMg,
                totalMg: dosageMg * quantity,
            };

            entries.push(entry);
            uniqueDrugs.add(normalizedName);
        } catch (error) {
            errors.push({
                line: index + 2,
                rawData: JSON.stringify(row),
                error: error instanceof Error ? error.message : 'Unknown parsing error',
            });
        }
    });

    // Sort by timestamp
    entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Get date range
    const dates = entries.map((e) => e.date);
    const dateRange = {
        start: dates[0] || '',
        end: dates[dates.length - 1] || '',
    };

    return {
        entries,
        uniqueDrugs,
        dateRange,
        totalEntries: entries.length,
        parsingErrors: errors,
    };
}

/**
 * Group medications by the sleep night they affect
 * A "sleep night" is defined as medications taken within a window before/after bedtime
 * 
 * @param entries - All medication entries
 * @param bedtimes - Map of date -> bedtime for alignment
 * @param windowHoursBefore - Hours before bedtime to include
 * @param windowHoursAfter - Hours after bedtime to include
 */
export function groupMedicationsBySleepNight(
    entries: MedicationEntry[],
    bedtimes?: Map<string, Date>,
    windowHoursBefore: number = 6,
    windowHoursAfter: number = 2
): Map<string, DailyMedicationSummary> {
    const summaries = new Map<string, DailyMedicationSummary>();

    // If no bedtimes provided, use a default approach:
    // Consider medications taken between 6pm and 2am as affecting that night's sleep
    // Night date is determined by the date of sleep (medications taken after midnight
    // belong to the previous calendar day's sleep)

    for (const entry of entries) {
        // Determine which sleep night this medication affects
        const hour = entry.timestamp.getHours();
        let sleepDate = entry.date;

        // If taken between midnight and 6am, it affects the previous day's sleep
        if (hour < 6) {
            const prevDay = new Date(entry.timestamp);
            prevDay.setDate(prevDay.getDate() - 1);
            sleepDate = formatDate(prevDay);
        }
        // If taken before 6pm (18:00), might be a daytime medication - check if it's a stimulant
        else if (hour < 18 && entry.drugClass !== 'stimulant') {
            // Skip non-stimulant daytime medications for sleep correlation
            continue;
        }

        // Initialize summary if needed
        if (!summaries.has(sleepDate)) {
            summaries.set(sleepDate, createEmptySummary(sleepDate));
        }

        const summary = summaries.get(sleepDate)!;
        summary.entries.push(entry);

        // Add to appropriate drug class array
        addToAggregate(summary, entry);
    }

    // Calculate totals for each summary
    for (const summary of summaries.values()) {
        summary.totalSleepAidMg = calculateTotalMg(summary.sleepAids);
        summary.totalStimulantMg = calculateTotalMg(summary.stimulants);
        summary.sleepAidCount = summary.sleepAids.length;
        summary.stimulantCount = summary.stimulants.length;
        summary.uniqueDrugsCount = new Set(summary.entries.map((e) => e.normalizedName)).size;
    }

    return summaries;
}

function createEmptySummary(date: string): DailyMedicationSummary {
    return {
        date,
        entries: [],
        sleepAids: [],
        stimulants: [],
        betaBlockers: [],
        antipsychotics: [],
        anxiolytics: [],
        antidepressants: [],
        supplements: [],
        others: [],
        totalSleepAidMg: 0,
        totalStimulantMg: 0,
        sleepAidCount: 0,
        stimulantCount: 0,
        uniqueDrugsCount: 0,
    };
}

function addToAggregate(summary: DailyMedicationSummary, entry: MedicationEntry): void {
    const classArrays: Record<DrugClass, MedicationAggregate[]> = {
        sleep_aid: summary.sleepAids,
        stimulant: summary.stimulants,
        beta_blocker: summary.betaBlockers,
        antipsychotic: summary.antipsychotics,
        anxiolytic: summary.anxiolytics,
        antidepressant: summary.antidepressants,
        supplement: summary.supplements,
        other: summary.others,
    };

    const targetArray = classArrays[entry.drugClass];

    // Find existing aggregate or create new one
    let aggregate = targetArray.find((a) => a.normalizedName === entry.normalizedName);

    if (!aggregate) {
        aggregate = {
            normalizedName: entry.normalizedName,
            displayName: formatDisplayName(entry.name),
            drugClass: entry.drugClass,
            totalQuantity: 0,
            totalMg: 0,
            timings: [],
            entries: [],
        };
        targetArray.push(aggregate);
    }

    aggregate.totalQuantity += entry.quantity;
    aggregate.totalMg += entry.totalMg;
    aggregate.timings.push(entry.time);
    aggregate.entries.push(entry);
}

function calculateTotalMg(aggregates: MedicationAggregate[]): number {
    return aggregates.reduce((sum, a) => sum + a.totalMg, 0);
}

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function formatDisplayName(rawName: string): string {
    // Extract the main drug name and dosage for display
    const match = rawName.match(/^([a-zA-Z\s]+)\s*(\d+(?:\.\d+)?\s*(?:mg|mcg)?)?/i);
    if (match) {
        const name = match[1].trim();
        const dose = match[2] ? ` ${match[2].trim()}` : '';
        return `${name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()}${dose}`;
    }
    return rawName;
}

/**
 * Get unique medications across all entries
 */
export function getUniqueMedications(entries: MedicationEntry[]): Map<string, {
    normalizedName: string;
    displayName: string;
    drugClass: DrugClass;
    occurrences: number;
    totalMg: number;
}> {
    const medications = new Map<string, {
        normalizedName: string;
        displayName: string;
        drugClass: DrugClass;
        occurrences: number;
        totalMg: number;
    }>();

    for (const entry of entries) {
        const existing = medications.get(entry.normalizedName);
        if (existing) {
            existing.occurrences++;
            existing.totalMg += entry.totalMg;
        } else {
            medications.set(entry.normalizedName, {
                normalizedName: entry.normalizedName,
                displayName: formatDisplayName(entry.name),
                drugClass: entry.drugClass,
                occurrences: 1,
                totalMg: entry.totalMg,
            });
        }
    }

    return medications;
}
