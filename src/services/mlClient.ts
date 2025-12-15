/**
 * ML Service Client
 * TypeScript client for calling the Python ML analytics service
 */

import {
    MLInteractionResult,
    FeatureImportanceResult,
    ForecastResult,
    CausalResult,
    ClusterResult,
    ComprehensiveMLResult,
    MLHealthResponse,
    MLAnalysisRequest,
    MLForecastRequest,
    MLAlignedDataPoint,
} from '@/types/mlTypes';
import { AlignedDataPoint } from '@/types/analysis';
import { ProcessedSleepMetrics, SleepMetricKey } from '@/types/oura';

// ML service URL - defaults to local development
// ML service URL - defaults to local development port 8000, or /api/ml in production
const ML_SERVICE_URL = process.env.NEXT_PUBLIC_ML_SERVICE_URL ||
    (process.env.NODE_ENV === 'production' ? '/api/ml' : 'http://localhost:8000');

/**
 * Convert snake_case keys to camelCase recursively
 */
function snakeToCamel(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(snakeToCamel);
    }

    if (typeof obj === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
            const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
            result[camelKey] = snakeToCamel(value);
        }
        return result;
    }

    return obj;
}

/**
 * Check if the ML service is available
 */
export async function checkMLServiceHealth(): Promise<MLHealthResponse | null> {
    try {
        const response = await fetch(`${ML_SERVICE_URL}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000), // 5s timeout
        });

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return snakeToCamel(data) as MLHealthResponse;
    } catch (error) {
        console.warn('ML service not available:', error);
        return null;
    }
}

/**
 * Convert frontend AlignedDataPoint to ML service format
 */
function convertAlignedData(data: AlignedDataPoint[]): MLAlignedDataPoint[] {
    return data.map(point => {
        const medications: Record<string, { taken: boolean; total_mg: number; quantity: number }> = {};

        point.medications.forEach((value, key) => {
            medications[key] = {
                taken: value.taken,
                total_mg: value.totalMg,
                quantity: value.quantity
            };
        });

        const sleep_metrics: Record<string, number | null> = {};
        point.sleepMetrics.forEach((value, key) => {
            sleep_metrics[key] = value;
        });

        return {
            date: point.date,
            medications,
            sleep_metrics
        };
    });
}

/**
 * Convert ProcessedSleepMetrics to ML service format
 */
function convertSleepMetrics(metrics: ProcessedSleepMetrics[]): MLForecastRequest['sleep_data'] {
    return metrics.map(m => ({
        date: m.date,
        total_sleep_minutes: m.totalSleepMinutes,
        deep_sleep_minutes: m.deepSleepMinutes,
        rem_sleep_minutes: m.remSleepMinutes,
        light_sleep_minutes: m.lightSleepMinutes,
        sleep_efficiency: m.sleepEfficiency,
        latency_minutes: m.latencyMinutes,
        avg_hrv: m.avgHrv,
        avg_heart_rate: m.avgHeartRate,
        lowest_heart_rate: m.lowestHeartRate,
        restless_periods: m.restlessPeriods,
        sleep_score: m.sleepScore,
        deep_sleep_percent: m.deepSleepPercent,
        rem_sleep_percent: m.remSleepPercent,
    }));
}

/**
 * Detect multi-drug interactions
 */
export async function analyzeInteractions(
    data: AlignedDataPoint[],
    targetMetrics?: SleepMetricKey[]
): Promise<MLInteractionResult[]> {
    const response = await fetch(`${ML_SERVICE_URL}/analyze/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            aligned_data: convertAlignedData(data),
            target_metrics: targetMetrics
        } as MLAnalysisRequest),
    });

    if (!response.ok) {
        throw new Error(`ML service error: ${response.statusText}`);
    }

    const result = await response.json();
    return snakeToCamel(result) as MLInteractionResult[];
}

/**
 * Get feature importance for medications
 */
export async function getFeatureImportance(
    data: AlignedDataPoint[],
    targetMetrics?: SleepMetricKey[]
): Promise<FeatureImportanceResult> {
    const response = await fetch(`${ML_SERVICE_URL}/analyze/feature-importance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            aligned_data: convertAlignedData(data),
            target_metrics: targetMetrics
        } as MLAnalysisRequest),
    });

    if (!response.ok) {
        throw new Error(`ML service error: ${response.statusText}`);
    }

    const result = await response.json();
    return snakeToCamel(result) as FeatureImportanceResult;
}

/**
 * Forecast future sleep metric values
 */
export async function forecastSleep(
    sleepData: ProcessedSleepMetrics[],
    metric: SleepMetricKey,
    forecastDays: number = 7
): Promise<ForecastResult> {
    const response = await fetch(`${ML_SERVICE_URL}/analyze/forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            sleep_data: convertSleepMetrics(sleepData),
            metric,
            forecast_days: forecastDays
        } as MLForecastRequest),
    });

    if (!response.ok) {
        throw new Error(`ML service error: ${response.statusText}`);
    }

    const result = await response.json();
    return snakeToCamel(result) as ForecastResult;
}

/**
 * Analyze causal effects of medications
 */
export async function analyzeCausal(
    data: AlignedDataPoint[],
    targetMetrics?: SleepMetricKey[]
): Promise<CausalResult[]> {
    const response = await fetch(`${ML_SERVICE_URL}/analyze/causal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            aligned_data: convertAlignedData(data),
            target_metrics: targetMetrics
        } as MLAnalysisRequest),
    });

    if (!response.ok) {
        throw new Error(`ML service error: ${response.statusText}`);
    }

    const result = await response.json();
    return snakeToCamel(result) as CausalResult[];
}

/**
 * Cluster medication regimens
 */
export async function clusterRegimens(
    data: AlignedDataPoint[]
): Promise<ClusterResult> {
    const response = await fetch(`${ML_SERVICE_URL}/analyze/clusters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            aligned_data: convertAlignedData(data)
        } as MLAnalysisRequest),
    });

    if (!response.ok) {
        throw new Error(`ML service error: ${response.statusText}`);
    }

    const result = await response.json();
    return snakeToCamel(result) as ClusterResult;
}

/**
 * Run comprehensive ML analysis
 */
export async function runComprehensiveAnalysis(
    data: AlignedDataPoint[],
    targetMetrics?: SleepMetricKey[]
): Promise<ComprehensiveMLResult> {
    const response = await fetch(`${ML_SERVICE_URL}/analyze/comprehensive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            aligned_data: convertAlignedData(data),
            target_metrics: targetMetrics
        } as MLAnalysisRequest),
    });

    if (!response.ok) {
        throw new Error(`ML service error: ${response.statusText}`);
    }

    const result = await response.json();
    return snakeToCamel(result) as ComprehensiveMLResult;
}

/**
 * Run comprehensive analysis with graceful degradation
 * Returns null if ML service is unavailable instead of throwing
 */
export async function runMLAnalysisSafe(
    data: AlignedDataPoint[],
    targetMetrics?: SleepMetricKey[]
): Promise<ComprehensiveMLResult | null> {
    try {
        // Check if service is available first
        const health = await checkMLServiceHealth();
        if (!health) {
            console.log('ML service not available, skipping ML analysis');
            return null;
        }

        return await runComprehensiveAnalysis(data, targetMetrics);
    } catch (error) {
        console.warn('ML analysis failed:', error);
        return null;
    }
}
