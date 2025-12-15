/**
 * Correlation Engine Service
 * High-level orchestration of medication-sleep correlation analysis
 */

import {
    AlignedDataPoint,
    CorrelationResult,
    MedicationAnalysis,
    InteractionResult,
    AnalysisConfig,
    DEFAULT_ANALYSIS_CONFIG,
} from '@/types/analysis';
import { DailyMedicationSummary, MedicationEntry } from '@/types/medication';
import { ProcessedSleepMetrics, SleepMetricKey, SLEEP_METRICS } from '@/types/oura';
import { groupMedicationsBySleepNight, getUniqueMedications } from './medicationParser';
import {
    analyzeCorrelation,
    analyzeDoseResponse,
    analyzeLagEffect,
    calculateDescriptiveStats,
} from './statisticalAnalysis';

/**
 * Main analysis result containing all insights
 */
export interface AnalysisResults {
    // Overall stats
    totalNights: number;
    dateRange: { start: string; end: string };
    medicationsAnalyzed: number;

    // Per-medication results
    medicationAnalyses: MedicationAnalysis[];

    // All significant correlations
    significantCorrelations: CorrelationResult[];

    // Top insights
    topPositiveCorrelations: CorrelationResult[];
    topNegativeCorrelations: CorrelationResult[];

    // Interaction effects
    interactions: InteractionResult[];

    // Summary statistics for sleep metrics
    sleepStats: Map<SleepMetricKey, ReturnType<typeof calculateDescriptiveStats>>;
}

/**
 * Align medication data with sleep data by date
 */
export function alignData(
    medicationSummaries: Map<string, DailyMedicationSummary>,
    sleepMetrics: ProcessedSleepMetrics[]
): AlignedDataPoint[] {
    const aligned: AlignedDataPoint[] = [];

    // Create map of sleep data by date
    const sleepByDate = new Map<string, ProcessedSleepMetrics>();
    for (const sleep of sleepMetrics) {
        sleepByDate.set(sleep.date, sleep);
    }

    // Get all unique dates
    const allDates = new Set<string>([
        ...medicationSummaries.keys(),
        ...sleepByDate.keys(),
    ]);

    for (const date of [...allDates].sort()) {
        const medSummary = medicationSummaries.get(date) || null;
        const sleep = sleepByDate.get(date) || null;

        // Only include if we have sleep data
        if (!sleep) continue;

        // Build medication features
        const medications = new Map<string, { taken: boolean; totalMg: number; quantity: number }>();

        if (medSummary) {
            for (const entry of medSummary.entries) {
                const existing = medications.get(entry.normalizedName);
                if (existing) {
                    existing.totalMg += entry.totalMg;
                    existing.quantity += entry.quantity;
                } else {
                    medications.set(entry.normalizedName, {
                        taken: true,
                        totalMg: entry.totalMg,
                        quantity: entry.quantity,
                    });
                }
            }
        }

        // Build sleep metrics map
        const sleepMetricsMap = new Map<SleepMetricKey, number>();
        for (const metricKey of SLEEP_METRICS) {
            const value = sleep[metricKey as keyof ProcessedSleepMetrics];
            if (typeof value === 'number' && !isNaN(value)) {
                sleepMetricsMap.set(metricKey, value);
            }
        }

        aligned.push({
            date,
            medications,
            sleepMetrics: sleepMetricsMap,
            medicationSummary: medSummary,
            sleepSession: sleep,
        });
    }

    return aligned;
}

/**
 * Run complete correlation analysis
 */
export function runCorrelationAnalysis(
    medicationEntries: MedicationEntry[],
    sleepMetrics: ProcessedSleepMetrics[],
    config: AnalysisConfig = DEFAULT_ANALYSIS_CONFIG
): AnalysisResults {
    // Group medications by sleep night
    const medicationSummaries = groupMedicationsBySleepNight(
        medicationEntries,
        undefined,
        config.medicationWindowHoursBefore,
        config.medicationWindowHoursAfter
    );

    // Align data
    const alignedData = alignData(medicationSummaries, sleepMetrics);

    // Get unique medications
    const uniqueMeds = getUniqueMedications(medicationEntries);

    // Calculate sleep stats
    const sleepStats = new Map<SleepMetricKey, ReturnType<typeof calculateDescriptiveStats>>();
    for (const metricKey of SLEEP_METRICS) {
        const values = alignedData
            .map(d => d.sleepMetrics.get(metricKey))
            .filter((v): v is number => v !== undefined);
        sleepStats.set(metricKey, calculateDescriptiveStats(values));
    }

    // Analyze each medication
    const medicationAnalyses: MedicationAnalysis[] = [];
    const allCorrelations: CorrelationResult[] = [];

    for (const [medName, medInfo] of uniqueMeds) {
        // Skip medications with too few occurrences
        if (medInfo.occurrences < config.minSampleSize) continue;

        const correlations: CorrelationResult[] = [];

        for (const metricKey of SLEEP_METRICS) {
            // Build parallel arrays
            const medValues: number[] = [];
            const metricValues: number[] = [];
            const medByDate = new Map<string, number>();
            const metricByDate = new Map<string, number>();

            for (const dataPoint of alignedData) {
                const metricVal = dataPoint.sleepMetrics.get(metricKey);
                if (metricVal === undefined) continue;

                const medData = dataPoint.medications.get(medName);
                const medVal = medData?.totalMg ?? 0;

                medValues.push(medVal);
                metricValues.push(metricVal);
                medByDate.set(dataPoint.date, medVal);
                metricByDate.set(dataPoint.date, metricVal);
            }

            // Run correlation analysis
            const result = analyzeCorrelation(
                medName,
                medInfo.drugClass,
                metricKey,
                medValues,
                metricValues,
                config.significanceLevel
            );

            if (result) {
                correlations.push(result);
                allCorrelations.push(result);

                // Run dose-response if applicable
                if (config.analyzeDoseResponse && result.isSignificant) {
                    const doseResponse = analyzeDoseResponse(medName, metricKey, medValues, metricValues);
                    // Could attach to result if needed
                }

                // Run lag analysis if applicable
                if (config.analyzeLags && result.isSignificant) {
                    const lagResult = analyzeLagEffect(
                        medName,
                        metricKey,
                        medByDate,
                        metricByDate,
                        config.maxLagDays
                    );
                    // Could attach to result if needed
                }
            }
        }

        const significantFindings = correlations.filter(c => c.isSignificant);

        const nightsWithMed = alignedData.filter(d => d.medications.has(medName)).length;

        medicationAnalyses.push({
            medication: medName,
            displayName: medInfo.displayName,
            drugClass: medInfo.drugClass,
            totalNights: alignedData.length,
            nightsWithMedication: nightsWithMed,
            nightsWithoutMedication: alignedData.length - nightsWithMed,
            correlations,
            significantFindings,
        });
    }

    // Get significant correlations
    const significantCorrelations = allCorrelations.filter(c => c.isSignificant);

    // Sort by effect size and get tops
    const sorted = [...significantCorrelations].sort(
        (a, b) => Math.abs(b.pearsonR) - Math.abs(a.pearsonR)
    );

    const topPositive = sorted
        .filter(c => c.pearsonR > 0)
        .slice(0, 10);

    const topNegative = sorted
        .filter(c => c.pearsonR < 0)
        .slice(0, 10);

    // Get date range
    const dates = alignedData.map(d => d.date).sort();

    return {
        totalNights: alignedData.length,
        dateRange: {
            start: dates[0] || '',
            end: dates[dates.length - 1] || '',
        },
        medicationsAnalyzed: medicationAnalyses.length,
        medicationAnalyses,
        significantCorrelations,
        topPositiveCorrelations: topPositive,
        topNegativeCorrelations: topNegative,
        interactions: [], // Would require additional analysis
        sleepStats,
    };
}

/**
 * Detect multi-drug interactions
 */
export function analyzeInteractions(
    alignedData: AlignedDataPoint[],
    medications: string[],
    metric: SleepMetricKey,
    config: AnalysisConfig = DEFAULT_ANALYSIS_CONFIG
): InteractionResult[] {
    const interactions: InteractionResult[] = [];

    // Check pairs of medications
    for (let i = 0; i < medications.length; i++) {
        for (let j = i + 1; j < medications.length; j++) {
            const med1 = medications[i];
            const med2 = medications[j];

            // Find nights where both were taken
            const bothNights: number[] = [];
            const justMed1: number[] = [];
            const justMed2: number[] = [];
            const neither: number[] = [];

            for (const point of alignedData) {
                const metricVal = point.sleepMetrics.get(metric);
                if (metricVal === undefined) continue;

                const hasMed1 = point.medications.has(med1);
                const hasMed2 = point.medications.has(med2);

                if (hasMed1 && hasMed2) {
                    bothNights.push(metricVal);
                } else if (hasMed1) {
                    justMed1.push(metricVal);
                } else if (hasMed2) {
                    justMed2.push(metricVal);
                } else {
                    neither.push(metricVal);
                }
            }

            // Need enough samples
            if (bothNights.length < config.minSampleSize) continue;
            if (neither.length < config.minSampleSize) continue;

            // Calculate effects
            const baselineMean = neither.length > 0 ?
                neither.reduce((a, b) => a + b, 0) / neither.length : 0;

            const med1Effect = justMed1.length > 0 ?
                (justMed1.reduce((a, b) => a + b, 0) / justMed1.length) - baselineMean : 0;

            const med2Effect = justMed2.length > 0 ?
                (justMed2.reduce((a, b) => a + b, 0) / justMed2.length) - baselineMean : 0;

            const combinedEffect = bothNights.length > 0 ?
                (bothNights.reduce((a, b) => a + b, 0) / bothNights.length) - baselineMean : 0;

            const expectedAdditive = med1Effect + med2Effect;
            const interactionEffect = combinedEffect - expectedAdditive;

            // Determine interaction type
            let interactionType: 'synergistic' | 'antagonistic' | 'additive' = 'additive';
            if (Math.abs(interactionEffect) > 0.1 * Math.abs(expectedAdditive)) {
                interactionType = interactionEffect > 0 ? 'synergistic' : 'antagonistic';
            }

            // This is a placeholder - would need proper statistical test
            interactions.push({
                medications: [med1, med2],
                metric,
                individualCorrelations: [], // Would need to include these
                combinedCorrelation: combinedEffect / Math.abs(baselineMean || 1),
                interactionEffect,
                interactionType,
                pValue: 0.05, // Placeholder
                isSignificant: Math.abs(interactionEffect) > 0.1 * Math.abs(expectedAdditive),
                combinationNights: bothNights.length,
            });
        }
    }

    return interactions.filter(i => i.isSignificant);
}
