/**
 * Statistical Analysis Service
 * Core statistical functions for correlation and regression analysis
 * Uses simple-statistics library for calculations
 */

import * as ss from 'simple-statistics';
import {
    CorrelationResult,
    DescriptiveStats,
    RegressionResult,
    RegressionCoefficient,
    DoseResponseResult,
    LagAnalysisResult,
    interpretCohenD,
    EffectSize,
} from '@/types/analysis';
import { SleepMetricKey } from '@/types/oura';
import { DrugClass } from '@/types/medication';

// ============ Descriptive Statistics ============

/**
 * Calculate descriptive statistics for an array of numbers
 */
export function calculateDescriptiveStats(values: number[]): DescriptiveStats {
    if (values.length === 0) {
        return {
            mean: 0,
            median: 0,
            stdDev: 0,
            variance: 0,
            min: 0,
            max: 0,
            count: 0,
            quartiles: { q1: 0, q2: 0, q3: 0 },
        };
    }

    const sorted = [...values].sort((a, b) => a - b);

    return {
        mean: ss.mean(values),
        median: ss.median(sorted),
        stdDev: ss.standardDeviation(values),
        variance: ss.variance(values),
        min: ss.min(values),
        max: ss.max(values),
        count: values.length,
        quartiles: {
            q1: ss.quantile(sorted, 0.25),
            q2: ss.quantile(sorted, 0.5),
            q3: ss.quantile(sorted, 0.75),
        },
    };
}

// ============ Correlation Analysis ============

/**
 * Calculate Pearson correlation coefficient
 * Measures linear correlation between two variables
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length < 3) {
        return 0;
    }

    try {
        return ss.sampleCorrelation(x, y);
    } catch {
        return 0;
    }
}

/**
 * Calculate Spearman rank correlation
 * More robust to outliers and non-linear relationships
 */
export function spearmanCorrelation(x: number[], y: number[]): number {
    if (x.length !== y.length || x.length < 3) {
        return 0;
    }

    // Convert to ranks
    const xRanks = toRanks(x);
    const yRanks = toRanks(y);

    // Pearson on ranks = Spearman
    return pearsonCorrelation(xRanks, yRanks);
}

/**
 * Convert array of values to ranks
 */
function toRanks(values: number[]): number[] {
    const indexed = values.map((v, i) => ({ value: v, index: i }));
    indexed.sort((a, b) => a.value - b.value);

    const ranks = new Array(values.length);
    let i = 0;
    while (i < indexed.length) {
        // Handle ties by averaging ranks
        let j = i;
        while (j < indexed.length && indexed[j].value === indexed[i].value) {
            j++;
        }
        const avgRank = (i + j + 1) / 2;
        for (let k = i; k < j; k++) {
            ranks[indexed[k].index] = avgRank;
        }
        i = j;
    }

    return ranks;
}

/**
 * Calculate p-value for a correlation coefficient
 * Uses t-distribution transformation
 */
export function correlationPValue(r: number, n: number): number {
    if (n <= 2 || Math.abs(r) >= 1) {
        return 1;
    }

    // t-statistic for correlation
    const t = r * Math.sqrt((n - 2) / (1 - r * r));
    const df = n - 2;

    // Approximate p-value using t-distribution
    // Two-tailed test
    return 2 * (1 - tDistributionCDF(Math.abs(t), df));
}

/**
 * Approximate CDF of t-distribution using normal approximation for large df
 */
function tDistributionCDF(t: number, df: number): number {
    // For large df, t-distribution approaches normal
    if (df > 100) {
        return normalCDF(t);
    }

    // Simple approximation for smaller df
    const x = df / (df + t * t);
    return 1 - 0.5 * incompleteBeta(df / 2, 0.5, x);
}

/**
 * Normal CDF approximation
 */
function normalCDF(x: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
}

/**
 * Incomplete beta function approximation
 */
function incompleteBeta(a: number, b: number, x: number): number {
    // Simple continued fraction approximation
    if (x === 0) return 0;
    if (x === 1) return 1;

    const bt = Math.exp(
        logGamma(a + b) - logGamma(a) - logGamma(b) +
        a * Math.log(x) + b * Math.log(1 - x)
    );

    if (x < (a + 1) / (a + b + 2)) {
        return bt * betaCF(a, b, x) / a;
    } else {
        return 1 - bt * betaCF(b, a, 1 - x) / b;
    }
}

function betaCF(a: number, b: number, x: number): number {
    const maxIterations = 100;
    const epsilon = 1e-10;

    let c = 1;
    let d = 1 - (a + b) * x / (a + 1);
    if (Math.abs(d) < epsilon) d = epsilon;
    d = 1 / d;
    let h = d;

    for (let m = 1; m <= maxIterations; m++) {
        const m2 = 2 * m;
        let aa = m * (b - m) * x / ((a + m2 - 1) * (a + m2));

        d = 1 + aa * d;
        if (Math.abs(d) < epsilon) d = epsilon;
        c = 1 + aa / c;
        if (Math.abs(c) < epsilon) c = epsilon;
        d = 1 / d;
        h *= d * c;

        aa = -(a + m) * (a + b + m) * x / ((a + m2) * (a + m2 + 1));
        d = 1 + aa * d;
        if (Math.abs(d) < epsilon) d = epsilon;
        c = 1 + aa / c;
        if (Math.abs(c) < epsilon) c = epsilon;
        d = 1 / d;
        const delta = d * c;
        h *= delta;

        if (Math.abs(delta - 1) < epsilon) break;
    }

    return h;
}

function logGamma(x: number): number {
    const c = [
        76.18009172947146, -86.50532032941677, 24.01409824083091,
        -1.231739572450155, 0.001208650973866179, -0.000005395239384953
    ];

    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;

    for (let j = 0; j < 6; j++) {
        ser += c[j] / ++y;
    }

    return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/**
 * Calculate Fisher transformation confidence interval for correlation
 */
export function correlationConfidenceInterval(
    r: number,
    n: number,
    level: number = 0.95
): { lower: number; upper: number } {
    if (n <= 3) {
        return { lower: -1, upper: 1 };
    }

    // Fisher z-transformation
    const z = 0.5 * Math.log((1 + r) / (1 - r));
    const se = 1 / Math.sqrt(n - 3);

    // Z-score for confidence level
    const zScore = ss.probit((1 + level) / 2);

    const zLower = z - zScore * se;
    const zUpper = z + zScore * se;

    // Back-transform
    return {
        lower: (Math.exp(2 * zLower) - 1) / (Math.exp(2 * zLower) + 1),
        upper: (Math.exp(2 * zUpper) - 1) / (Math.exp(2 * zUpper) + 1),
    };
}

// ============ Effect Size ============

/**
 * Calculate Cohen's d effect size
 * Compares means between two groups
 */
export function cohensD(group1: number[], group2: number[]): number {
    if (group1.length === 0 || group2.length === 0) {
        return 0;
    }

    const mean1 = ss.mean(group1);
    const mean2 = ss.mean(group2);

    const var1 = ss.variance(group1);
    const var2 = ss.variance(group2);

    // Pooled standard deviation
    const n1 = group1.length;
    const n2 = group2.length;
    const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
    const pooledSd = Math.sqrt(pooledVar);

    if (pooledSd === 0) return 0;

    return (mean1 - mean2) / pooledSd;
}

// ============ Complete Correlation Analysis ============

/**
 * Perform complete correlation analysis between a medication and sleep metric
 */
export function analyzeCorrelation(
    medication: string,
    drugClass: DrugClass,
    metric: SleepMetricKey,
    medicationValues: number[],  // Dosage/quantity when taken (0 for nights not taken)
    metricValues: number[],       // Sleep metric values
    significanceLevel: number = 0.05
): CorrelationResult | null {
    const n = medicationValues.length;

    if (n < 10) {
        return null; // Not enough samples
    }

    // Calculate correlations
    const pearsonR = pearsonCorrelation(medicationValues, metricValues);
    const spearmanRho = spearmanCorrelation(medicationValues, metricValues);

    // Calculate p-value
    const pValue = correlationPValue(pearsonR, n);

    // Calculate confidence interval
    const ci = correlationConfidenceInterval(pearsonR, n, 0.95);

    // Split into with/without medication groups for effect size
    const withMed: number[] = [];
    const withoutMed: number[] = [];

    for (let i = 0; i < n; i++) {
        if (medicationValues[i] > 0) {
            withMed.push(metricValues[i]);
        } else {
            withoutMed.push(metricValues[i]);
        }
    }

    // Effect size
    const d = cohensD(withMed, withoutMed);
    const effectSize = interpretCohenD(d);

    // Means comparison
    const meanWith = withMed.length > 0 ? ss.mean(withMed) : 0;
    const meanWithout = withoutMed.length > 0 ? ss.mean(withoutMed) : 0;
    const difference = meanWith - meanWithout;
    const percentChange = meanWithout !== 0 ? (difference / meanWithout) * 100 : 0;

    return {
        medication,
        drugClass,
        metric,
        pearsonR,
        spearmanRho,
        pValue,
        isSignificant: pValue < significanceLevel,
        isHighlySignificant: pValue < 0.01,
        cohensD: d,
        effectSize,
        confidenceInterval: {
            lower: ci.lower,
            upper: ci.upper,
            level: 0.95,
        },
        sampleSize: n,
        medicationNights: withMed.length,
        noMedicationNights: withoutMed.length,
        direction: pearsonR > 0.05 ? 'positive' : pearsonR < -0.05 ? 'negative' : 'none',
        meansComparison: {
            withMedication: meanWith,
            withoutMedication: meanWithout,
            difference,
            percentChange,
        },
    };
}

// ============ Multiple Regression ============

/**
 * Perform multiple linear regression
 * Predicts sleep metric from multiple medication doses
 */
export function multipleRegression(
    metric: SleepMetricKey,
    medications: string[],
    medicationMatrix: number[][],  // rows = nights, cols = medication doses
    metricValues: number[]
): RegressionResult | null {
    const n = metricValues.length;
    const p = medications.length;

    if (n < p + 10) {
        return null; // Need enough samples for reliable regression
    }

    // Using simple-statistics linear regression for each predictor
    // For full multiple regression, we'd need matrix operations
    // This is a simplified version using individual correlations

    const coefficients: RegressionCoefficient[] = [];
    let totalRSquared = 0;

    for (let j = 0; j < p; j++) {
        const x = medicationMatrix.map(row => row[j]);
        const regression = ss.linearRegression(x.map((xi, i) => [xi, metricValues[i]]));

        const predicted = x.map(xi => regression.m * xi + regression.b);
        const residuals = metricValues.map((y, i) => y - predicted[i]);

        // Calculate t-statistic (simplified)
        const se = ss.standardDeviation(residuals) / (ss.standardDeviation(x) * Math.sqrt(n));
        const t = regression.m / (se || 1);
        const pVal = correlationPValue(pearsonCorrelation(x, metricValues), n);

        coefficients.push({
            medication: medications[j],
            coefficient: regression.m,
            standardError: se,
            tStatistic: t,
            pValue: pVal,
            isSignificant: pVal < 0.05,
        });

        // Accumulate explained variance (simplified)
        const r = pearsonCorrelation(x, metricValues);
        totalRSquared += r * r / p;
    }

    // Overall model R²
    const rSquared = Math.min(totalRSquared, 1);
    const adjustedRSquared = 1 - ((1 - rSquared) * (n - 1)) / (n - p - 1);

    return {
        metric,
        rSquared,
        adjustedRSquared,
        coefficients,
        fStatistic: (rSquared / p) / ((1 - rSquared) / (n - p - 1)),
        pValue: 0.05, // Placeholder - would need F-distribution
        sampleSize: n,
    };
}

// ============ Dose-Response Analysis ============

/**
 * Analyze dose-response relationship
 */
export function analyzeDoseResponse(
    medication: string,
    metric: SleepMetricKey,
    doses: number[],
    outcomes: number[]
): DoseResponseResult {
    // Get unique dose levels
    const doseSet = new Set(doses.filter(d => d > 0));
    const doseLevels = [...doseSet].sort((a, b) => a - b);

    // Calculate mean outcome at each dose level
    const outcomesByDose: number[][] = doseLevels.map(() => []);

    for (let i = 0; i < doses.length; i++) {
        if (doses[i] > 0) {
            const idx = doseLevels.indexOf(doses[i]);
            if (idx >= 0) {
                outcomesByDose[idx].push(outcomes[i]);
            }
        }
    }

    const meanOutcomes = outcomesByDose.map(arr =>
        arr.length > 0 ? ss.mean(arr) : 0
    );

    // Detect pattern
    const doseCorrelation = pearsonCorrelation(doses, outcomes);
    const pValue = correlationPValue(doseCorrelation, doses.length);

    // Simple pattern detection
    let pattern: 'linear' | 'quadratic' | 'threshold' | 'inverted_u' | 'none' = 'none';

    if (Math.abs(doseCorrelation) > 0.3 && pValue < 0.05) {
        // Check for inverted-U by seeing if middle doses have different effect
        if (doseLevels.length >= 3) {
            const midIdx = Math.floor(doseLevels.length / 2);
            const lowMean = ss.mean(meanOutcomes.slice(0, midIdx));
            const midMean = meanOutcomes[midIdx];
            const highMean = ss.mean(meanOutcomes.slice(midIdx + 1));

            if (midMean > lowMean && midMean > highMean) {
                pattern = 'inverted_u';
            } else if (midMean < lowMean && midMean < highMean) {
                pattern = 'quadratic';
            } else {
                pattern = 'linear';
            }
        } else {
            pattern = 'linear';
        }
    }

    return {
        medication,
        metric,
        doseLevels,
        outcomes: meanOutcomes,
        pattern,
        optimalDose: pattern === 'inverted_u' ? doseLevels[meanOutcomes.indexOf(Math.max(...meanOutcomes))] : undefined,
        doseCorrelation,
        pValue,
    };
}

// ============ Lag Analysis ============

/**
 * Analyze lagged effects of medication on sleep
 */
export function analyzeLagEffect(
    medication: string,
    metric: SleepMetricKey,
    medicationByDate: Map<string, number>,
    metricByDate: Map<string, number>,
    maxLag: number = 3
): LagAnalysisResult {
    const lagCorrelations: { lag: number; correlation: number; pValue: number }[] = [];

    const dates = [...metricByDate.keys()].sort();

    for (let lag = 0; lag <= maxLag; lag++) {
        const medValues: number[] = [];
        const metricValues: number[] = [];

        for (let i = lag; i < dates.length; i++) {
            const metricDate = dates[i];
            const medDate = dates[i - lag];

            const metricVal = metricByDate.get(metricDate);
            const medVal = medicationByDate.get(medDate) ?? 0;

            if (metricVal !== undefined) {
                medValues.push(medVal);
                metricValues.push(metricVal);
            }
        }

        if (medValues.length >= 10) {
            const correlation = pearsonCorrelation(medValues, metricValues);
            const pValue = correlationPValue(correlation, medValues.length);

            lagCorrelations.push({ lag, correlation, pValue });
        }
    }

    // Find optimal lag
    let optimalLag = 0;
    let maxCorr = 0;

    for (const lc of lagCorrelations) {
        if (Math.abs(lc.correlation) > Math.abs(maxCorr)) {
            maxCorr = lc.correlation;
            optimalLag = lc.lag;
        }
    }

    return {
        medication,
        metric,
        lagCorrelations,
        optimalLag,
        maxCorrelation: maxCorr,
    };
}
