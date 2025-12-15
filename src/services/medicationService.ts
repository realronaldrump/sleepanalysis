import { MedicationEntry, MedicationLogResult } from '@/types/medication';

export async function saveMedicationLog(
    entries: MedicationEntry[],
    dateRange: { start: string; end: string }
): Promise<void> {
    const response = await fetch('/api/medications', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ entries, dateRange }),
    });

    if (!response.ok) {
        throw new Error('Failed to save medication log');
    }
}

export async function fetchMedicationLog(): Promise<MedicationLogResult | null> {
    const response = await fetch('/api/medications');

    if (!response.ok) {
        throw new Error('Failed to fetch medication log');
    }

    const result = await response.json();

    if (!result.found) {
        return null;
    }

    // Recalculate totalEntries since it's not stored
    const medicationEntries = result.data as MedicationEntry[];
    return {
        entries: medicationEntries,
        dateRange: result.dateRange,
        totalEntries: medicationEntries.length,
        uniqueDrugs: new Set(medicationEntries.map(e => e.normalizedName)),
        parsingErrors: [] // We don't store errors, assume stored data is valid
    };
}
