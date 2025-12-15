/**
 * Oura API data types matching the official API schema
 * Based on OpenAPI spec version 2.0 (API v1.27)
 */

/**
 * Sleep session from /v2/usercollection/sleep
 * Contains detailed sleep data including stages, HRV, heart rate
 */
export interface SleepSession {
    id: string;
    day: string;                    // YYYY-MM-DD
    bedtime_start: string;          // ISO datetime
    bedtime_end: string;            // ISO datetime

    // Duration metrics (in seconds)
    time_in_bed: number;
    total_sleep_duration: number | null;
    awake_time: number | null;
    light_sleep_duration: number | null;
    deep_sleep_duration: number | null;
    rem_sleep_duration: number | null;

    // Quality metrics
    efficiency: number | null;      // 1-100
    latency: number | null;         // seconds to fall asleep
    restless_periods: number | null;

    // Heart metrics
    average_heart_rate: number | null;
    lowest_heart_rate: number | null;
    average_hrv: number | null;
    average_breath: number | null;

    // Time series data
    heart_rate?: SampleModel | null;
    hrv?: SampleModel | null;

    // Sleep staging (5-min intervals)
    // '1' = deep, '2' = light, '3' = REM, '4' = awake
    sleep_phase_5_min: string | null;

    // Movement (30-sec intervals)  
    // '1' = no motion, '2' = restless, '3' = tossing, '4' = active
    movement_30_sec: string | null;

    // Score impacts
    sleep_score_delta: number | null;
    readiness_score_delta: number | null;

    // Type of sleep session
    type: SleepType;
    period: number;
    low_battery_alert: boolean;
}

/**
 * Time-series sample data (heart rate, HRV, etc.)
 */
export interface SampleModel {
    interval: number;               // Seconds between samples
    items: number[];                // Sample values
    timestamp: string;              // Start timestamp
}

/**
 * Sleep session type
 */
export type SleepType =
    | 'deleted'
    | 'sleep'
    | 'long_sleep'
    | 'late_nap'
    | 'rest';

/**
 * Daily sleep score from /v2/usercollection/daily_sleep
 * Contains score and contributors
 */
export interface DailySleep {
    id: string;
    day: string;                    // YYYY-MM-DD
    score: number | null;           // 1-100
    timestamp: string;              // ISO datetime
    contributors: SleepContributors;
}

/**
 * Sleep score contributors
 */
export interface SleepContributors {
    deep_sleep: number | null;      // 1-100
    efficiency: number | null;      // 1-100
    latency: number | null;         // 1-100
    rem_sleep: number | null;       // 1-100
    restfulness: number | null;     // 1-100
    timing: number | null;          // 1-100
    total_sleep: number | null;     // 1-100
}

/**
 * Heart rate reading from /v2/usercollection/heartrate
 */
export interface HeartRateReading {
    bpm: number;
    source: HeartRateSource;
    timestamp: string;
}

export type HeartRateSource =
    | 'awake'
    | 'rest'
    | 'sleep'
    | 'session'
    | 'live'
    | 'workout';

/**
 * API response wrapper for multiple documents
 */
export interface MultiDocumentResponse<T> {
    data: T[];
    next_token: string | null;
}

/**
 * Oura OAuth tokens
 */
export interface OuraTokens {
    access_token: string;
    refresh_token: string;
    expires_at: number;             // Unix timestamp
    token_type: string;
}

/**
 * Oura API configuration
 */
export interface OuraConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

// ============ Computed/Derived Types ============

/**
 * Processed sleep metrics for analysis
 * Normalized and computed values for correlation
 */
export interface ProcessedSleepMetrics {
    date: string;

    // Core duration metrics (converted to minutes)
    totalSleepMinutes: number;
    deepSleepMinutes: number;
    lightSleepMinutes: number;
    remSleepMinutes: number;
    awakeMinutes: number;
    timeInBedMinutes: number;

    // Percentages
    deepSleepPercent: number;
    lightSleepPercent: number;
    remSleepPercent: number;
    sleepEfficiency: number;

    // Quality metrics
    latencyMinutes: number;
    restlessPeriods: number;
    sleepScore: number | null;

    // Heart metrics
    avgHeartRate: number | null;
    lowestHeartRate: number | null;
    avgHrv: number | null;
    avgBreathRate: number | null;

    // Timing
    bedtimeStart: Date;
    bedtimeEnd: Date;
    midpointTime: Date;

    // Score contributors
    contributors: SleepContributors | null;

    // Original session reference
    sessionId: string;
}

/**
 * Convert SleepSession to ProcessedSleepMetrics
 */
export function processSleepSession(session: SleepSession, dailySleep?: DailySleep): ProcessedSleepMetrics {
    const totalSleep = session.total_sleep_duration ?? 0;
    const deepSleep = session.deep_sleep_duration ?? 0;
    const lightSleep = session.light_sleep_duration ?? 0;
    const remSleep = session.rem_sleep_duration ?? 0;

    const bedtimeStart = new Date(session.bedtime_start);
    const bedtimeEnd = new Date(session.bedtime_end);
    const midpoint = new Date((bedtimeStart.getTime() + bedtimeEnd.getTime()) / 2);

    return {
        date: session.day,

        totalSleepMinutes: totalSleep / 60,
        deepSleepMinutes: deepSleep / 60,
        lightSleepMinutes: lightSleep / 60,
        remSleepMinutes: remSleep / 60,
        awakeMinutes: (session.awake_time ?? 0) / 60,
        timeInBedMinutes: session.time_in_bed / 60,

        deepSleepPercent: totalSleep > 0 ? (deepSleep / totalSleep) * 100 : 0,
        lightSleepPercent: totalSleep > 0 ? (lightSleep / totalSleep) * 100 : 0,
        remSleepPercent: totalSleep > 0 ? (remSleep / totalSleep) * 100 : 0,
        sleepEfficiency: session.efficiency ?? 0,

        latencyMinutes: (session.latency ?? 0) / 60,
        restlessPeriods: session.restless_periods ?? 0,
        sleepScore: dailySleep?.score ?? null,

        avgHeartRate: session.average_heart_rate,
        lowestHeartRate: session.lowest_heart_rate,
        avgHrv: session.average_hrv,
        avgBreathRate: session.average_breath,

        bedtimeStart,
        bedtimeEnd,
        midpointTime: midpoint,

        contributors: dailySleep?.contributors ?? null,
        sessionId: session.id,
    };
}

/**
 * Sleep metric keys for analysis
 */
export const SLEEP_METRICS = [
    'totalSleepMinutes',
    'deepSleepMinutes',
    'remSleepMinutes',
    'lightSleepMinutes',
    'sleepEfficiency',
    'latencyMinutes',
    'avgHrv',
    'avgHeartRate',
    'lowestHeartRate',
    'restlessPeriods',
    'sleepScore',
    'deepSleepPercent',
    'remSleepPercent',
] as const;

export type SleepMetricKey = typeof SLEEP_METRICS[number];

/**
 * Human-readable metric labels
 */
export const SLEEP_METRIC_LABELS: Record<SleepMetricKey, string> = {
    totalSleepMinutes: 'Total Sleep',
    deepSleepMinutes: 'Deep Sleep',
    remSleepMinutes: 'REM Sleep',
    lightSleepMinutes: 'Light Sleep',
    sleepEfficiency: 'Sleep Efficiency',
    latencyMinutes: 'Sleep Latency',
    avgHrv: 'Average HRV',
    avgHeartRate: 'Avg Heart Rate',
    lowestHeartRate: 'Lowest HR',
    restlessPeriods: 'Restless Periods',
    sleepScore: 'Sleep Score',
    deepSleepPercent: 'Deep Sleep %',
    remSleepPercent: 'REM Sleep %',
};

/**
 * Metric descriptions for tooltips
 */
export const SLEEP_METRIC_DESCRIPTIONS: Record<SleepMetricKey, string> = {
    totalSleepMinutes: 'Total time spent asleep in minutes',
    deepSleepMinutes: 'Time in deep (N3) sleep stage',
    remSleepMinutes: 'Time in REM sleep stage',
    lightSleepMinutes: 'Time in light (N1+N2) sleep stages',
    sleepEfficiency: 'Percentage of time in bed spent asleep',
    latencyMinutes: 'Time taken to fall asleep after getting into bed',
    avgHrv: 'Average heart rate variability during sleep (higher is generally better)',
    avgHeartRate: 'Average heart rate during sleep',
    lowestHeartRate: 'Lowest recorded heart rate during sleep',
    restlessPeriods: 'Number of restless periods during sleep',
    sleepScore: 'Overall sleep quality score (1-100)',
    deepSleepPercent: 'Percentage of total sleep spent in deep sleep',
    remSleepPercent: 'Percentage of total sleep spent in REM',
};
