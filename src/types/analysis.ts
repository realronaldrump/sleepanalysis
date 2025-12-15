/**
 * Statistical analysis and correlation types
 */

import { SleepMetricKey } from './oura';
import { DrugClass } from './medication';

/**
 * Correlation result between a medication and sleep metric
 */
export interface CorrelationResult {
    medication: string;
    drugClass: DrugClass;
    metric: SleepMetricKey;

    // Correlation coefficients
    pearsonR: number;              // -1 to 1, linear correlation
    spearmanRho: number;           // -1 to 1, rank correlation

    // Statistical significance
    pValue: number;                // Lower = more significant
    isSignificant: boolean;        // p < 0.05
    isHighlySignificant: boolean;  // p < 0.01

    // Effect size
    cohensD: number;               // Effect magnitude
    effectSize: EffectSize;        // Small/Medium/Large

    // Confidence interval for Pearson r
    confidenceInterval: {
        lower: number;
        upper: number;
        level: number;               // e.g., 0.95 for 95% CI
    };

    // Sample info
    sampleSize: number;
    medicationNights: number;      // Nights where medication was taken
    noMedicationNights: number;    // Nights without medication

    // Direction
    direction: 'positive' | 'negative' | 'none';

    // Mean values for comparison
    meansComparison: {
        withMedication: number;
        withoutMedication: number;
        difference: number;
        percentChange: number;
    };
}

export type EffectSize = 'negligible' | 'small' | 'medium' | 'large';

/**
 * Interpret Cohen's d effect size
 */
export function interpretCohenD(d: number): EffectSize {
    const absD = Math.abs(d);
    if (absD < 0.2) return 'negligible';
    if (absD < 0.5) return 'small';
    if (absD < 0.8) return 'medium';
    return 'large';
}

/**
 * Multi-variable interaction result
 */
export interface InteractionResult {
    medications: string[];         // Combination of drugs
    metric: SleepMetricKey;

    // Individual effects
    individualCorrelations: CorrelationResult[];

    // Combined effect
    combinedCorrelation: number;
    interactionEffect: number;     // Difference from sum of individual effects

    // Is the combination synergistic, antagonistic, or additive?
    interactionType: 'synergistic' | 'antagonistic' | 'additive';

    // Significance
    pValue: number;
    isSignificant: boolean;

    // Sample size for the combination
    combinationNights: number;
}

/**
 * Regression analysis result for multi-variable effects
 */
export interface RegressionResult {
    metric: SleepMetricKey;

    // Model fit
    rSquared: number;              // Variance explained (0-1)
    adjustedRSquared: number;      // Adjusted for number of predictors

    // Coefficients for each medication
    coefficients: RegressionCoefficient[];

    // Model significance
    fStatistic: number;
    pValue: number;

    // Sample size
    sampleSize: number;
}

export interface RegressionCoefficient {
    medication: string;
    coefficient: number;           // Beta (effect per unit)
    standardError: number;
    tStatistic: number;
    pValue: number;
    isSignificant: boolean;
}

/**
 * Dose-response analysis result
 */
export interface DoseResponseResult {
    medication: string;
    metric: SleepMetricKey;

    // Dose levels analyzed
    doseLevels: number[];

    // Mean outcome at each dose level
    outcomes: number[];

    // Is relationship linear, quadratic, threshold, or no pattern?
    pattern: 'linear' | 'quadratic' | 'threshold' | 'inverted_u' | 'none';

    // Optimal dose (if there's a peak)
    optimalDose?: number;

    // Correlation with dose
    doseCorrelation: number;
    pValue: number;
}

/**
 * Lag analysis result (effects over multiple days)
 */
export interface LagAnalysisResult {
    medication: string;
    metric: SleepMetricKey;

    // Correlation at each lag (0 = same night, 1 = next night, etc.)
    lagCorrelations: {
        lag: number;
        correlation: number;
        pValue: number;
    }[];

    // Optimal lag (strongest effect)
    optimalLag: number;
    maxCorrelation: number;
}

/**
 * Timing analysis result
 */
export interface TimingAnalysisResult {
    medication: string;
    metric: SleepMetricKey;

    // Effect by timing window
    timingEffects: {
        window: string;              // e.g., "6-4 hrs before bed"
        correlation: number;
        sampleSize: number;
    }[];

    // Optimal timing
    optimalWindow: string;
    optimalCorrelation: number;
}

/**
 * Complete analysis result for a medication
 */
export interface MedicationAnalysis {
    medication: string;
    displayName: string;
    drugClass: DrugClass;

    // Sample info
    totalNights: number;
    nightsWithMedication: number;
    nightsWithoutMedication: number;

    // Correlations with all metrics
    correlations: CorrelationResult[];

    // Top significant findings
    significantFindings: CorrelationResult[];

    // Dose-response if applicable
    doseResponse?: DoseResponseResult;

    // Lag analysis
    lagAnalysis?: LagAnalysisResult;
}

/**
 * Aligned data point for correlation analysis
 * Combines medication data with sleep outcome
 */
export interface AlignedDataPoint {
    date: string;

    // Medication features
    medications: Map<string, {
        taken: boolean;
        totalMg: number;
        quantity: number;
    }>;

    // Sleep outcome
    sleepMetrics: Map<SleepMetricKey, number>;

    // Raw references
    medicationSummary: import('./medication').DailyMedicationSummary | null;
    sleepSession: import('./oura').ProcessedSleepMetrics | null;
}

/**
 * Analysis configuration
 */
export interface AnalysisConfig {
    // Minimum sample size for correlation
    minSampleSize: number;

    // Significance threshold (default 0.05)
    significanceLevel: number;

    // Hours before bedtime to consider medications
    medicationWindowHoursBefore: number;

    // Hours after bedtime to consider medications
    medicationWindowHoursAfter: number;

    // Include lag analysis
    analyzeLags: boolean;
    maxLagDays: number;

    // Include dose-response
    analyzeDoseResponse: boolean;

    // Include timing analysis
    analyzeTiming: boolean;
}

export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
    minSampleSize: 10,
    significanceLevel: 0.05,
    medicationWindowHoursBefore: 6,
    medicationWindowHoursAfter: 2,
    analyzeLags: true,
    maxLagDays: 3,
    analyzeDoseResponse: true,
    analyzeTiming: true,
};

/**
 * Summary statistics for an array of numbers
 */
export interface DescriptiveStats {
    mean: number;
    median: number;
    stdDev: number;
    variance: number;
    min: number;
    max: number;
    count: number;
    quartiles: {
        q1: number;
        q2: number;
        q3: number;
    };
}
