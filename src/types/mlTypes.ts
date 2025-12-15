/**
 * TypeScript types for ML service responses
 * These mirror the Python Pydantic schemas
 */

import { SleepMetricKey } from './oura';

/**
 * Result of multi-drug interaction detection
 */
export interface MLInteractionResult {
    medications: string[];
    interactionScore: number;  // 0-1 strength
    interactionType: 'synergistic' | 'antagonistic' | 'additive';
    affectedMetrics: SleepMetricKey[];
    confidence: number;  // 0-1
    shapValues: Record<string, number>;
    description: string;
}

/**
 * Feature importance for a single medication
 */
export interface MedicationImportance {
    medication: string;
    importance: number;
    direction: 'positive' | 'negative' | 'mixed';
    shapValue: number;
}

/**
 * Feature importance analysis result
 */
export interface FeatureImportanceResult {
    byMetric: Record<string, MedicationImportance[]>;
    topMedications: string[];
    modelR2: number;
}

/**
 * A single forecast point with confidence interval
 */
export interface ForecastPoint {
    date: string;
    predicted: number;
    lower: number;
    upper: number;
}

/**
 * Time-series forecast result
 */
export interface ForecastResult {
    metric: SleepMetricKey;
    predictions: ForecastPoint[];
    trend: 'improving' | 'declining' | 'stable';
    trendSlope: number;
    confidence: number;
    modelUsed: string;
}

/**
 * Causal inference analysis result
 */
export interface CausalResult {
    medication: string;
    metric: SleepMetricKey;
    causalEffect: number;
    confidenceInterval: [number, number];
    isCausal: boolean;
    pValue: number;
    refutationPassed: boolean;
    method: string;
    conditionalInsight?: string;
}

/**
 * Profile of a medication cluster
 */
export interface ClusterProfile {
    id: number;
    medications: string[];
    avgOutcomes: Record<string, number>;
    nightCount: number;
    description: string;
}

/**
 * Clustering analysis result
 */
export interface ClusterResult {
    clusters: ClusterProfile[];
    optimalCluster: number;
    silhouetteScore: number;
    recommendation: string;
}

/**
 * Complete ML analysis result
 */
export interface ComprehensiveMLResult {
    interactions: MLInteractionResult[];
    featureImportance: FeatureImportanceResult;
    causalResults: CausalResult[];
    clusters: ClusterResult;
    summary: string;
    recommendations: string[];
}

/**
 * Health check response
 */
export interface MLHealthResponse {
    status: string;
    version: string;
    modelsLoaded: boolean;
}

/**
 * Request format for aligned data
 */
export interface MLAlignedDataPoint {
    date: string;
    medications: Record<string, {
        taken: boolean;
        total_mg: number;
        quantity: number;
        doses?: Array<{ mg: number; time: string }>;
    }>;
    sleep_metrics: Record<string, number | null>;
}

/**
 * Request for analysis endpoints
 */
export interface MLAnalysisRequest {
    aligned_data: MLAlignedDataPoint[];
    target_metrics?: SleepMetricKey[];
}

/**
 * Request for forecast endpoint
 */
export interface MLForecastRequest {
    sleep_data: {
        date: string;
        total_sleep_minutes: number;
        deep_sleep_minutes: number;
        rem_sleep_minutes: number;
        light_sleep_minutes: number;
        sleep_efficiency: number;
        latency_minutes: number;
        avg_hrv?: number | null;
        avg_heart_rate?: number | null;
        lowest_heart_rate?: number | null;
        restless_periods?: number | null;
        sleep_score?: number | null;
        deep_sleep_percent: number;
        rem_sleep_percent: number;
    }[];
    metric: SleepMetricKey;
    forecast_days?: number;
}


/**
 * Optimization suggestion
 */
export interface OptimizationSuggestion {
    medication: string;
    doseMg: number;
    time: string;
    predictedImpact: number;
    confidence: number;
}

/**
 * Result of Bayesian Optimization
 */
export interface OptimizationResult {
    targetMetric: SleepMetricKey;
    recommendations: OptimizationSuggestion[];
    predictedScore: number;
    confidence: number;
}

/**
 * Request for simulation
 */
export interface SimulationRequest {
    medications: Array<{
        name: string;
        normalized_name: string;
        drug_class: string;
        quantity: number;
        dosage_mg: number;
        total_mg: number;
        time: string;
    }>;
    target_metric?: SleepMetricKey;
}

/**
 * Result of simulation
 */
export interface SimulationResult {
    predictedValue: number;
    confidenceInterval: [number, number];
    percentile: number;
}
