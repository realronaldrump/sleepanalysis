/**
 * Oura API Client
 * Handles OAuth2 authentication and data fetching
 */

import {
    SleepSession,
    DailySleep,
    MultiDocumentResponse,
    OuraTokens,
    ProcessedSleepMetrics,
    processSleepSession,
} from '@/types/oura';

const OURA_AUTH_URL = 'https://cloud.ouraring.com/oauth/authorize';
const OURA_TOKEN_URL = 'https://api.ouraring.com/oauth/token';

/**
 * Get OAuth2 authorization URL
 */
export function getOuraAuthUrl(clientId: string, redirectUri: string, state: string): string {
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'personal daily sleep heartrate',
        state,
    });

    return `${OURA_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
): Promise<OuraTokens> {
    const response = await fetch(OURA_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
        }),
    });

    if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.status}`);
    }

    const data = await response.json();

    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + data.expires_in * 1000,
        token_type: data.token_type,
    };
}

/**
 * Refresh access token
 */
export async function refreshTokens(
    refreshToken: string,
    clientId: string,
    clientSecret: string
): Promise<OuraTokens> {
    const response = await fetch(OURA_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: clientId,
            client_secret: clientSecret,
        }),
    });

    if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = await response.json();

    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + data.expires_in * 1000,
        token_type: data.token_type,
    };
}

/**
 * Fetch data from Oura API with pagination via server proxy
 */
async function fetchWithPagination<T>(
    endpoint: string,
    accessToken: string,
    startDate: string,
    endDate: string
): Promise<T[]> {
    const allData: T[] = [];
    let nextToken: string | null = null;

    do {
        // Use server-side proxy to avoid CORS issues
        const response = await fetch('/api/oura/proxy', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                endpoint,
                accessToken,
                startDate,
                endDate,
                nextToken,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (response.status === 429) {
                // Rate limited - wait and retry
                await new Promise(resolve => setTimeout(resolve, 60000));
                continue;
            }
            throw new Error(errorData.error || `API request failed: ${response.status}`);
        }

        const data: MultiDocumentResponse<T> = await response.json();
        allData.push(...data.data);
        nextToken = data.next_token;

    } while (nextToken);

    return allData;
}

/**
 * Fetch sleep sessions from Oura API
 */
export async function fetchSleepSessions(
    accessToken: string,
    startDate: string,
    endDate: string
): Promise<SleepSession[]> {
    return fetchWithPagination<SleepSession>(
        '/v2/usercollection/sleep',
        accessToken,
        startDate,
        endDate
    );
}

/**
 * Fetch daily sleep scores from Oura API
 */
export async function fetchDailySleep(
    accessToken: string,
    startDate: string,
    endDate: string
): Promise<DailySleep[]> {
    return fetchWithPagination<DailySleep>(
        '/v2/usercollection/daily_sleep',
        accessToken,
        startDate,
        endDate
    );
}

/**
 * Fetch and process all sleep data
 */
export async function fetchAndProcessSleepData(
    accessToken: string,
    startDate: string,
    endDate: string
): Promise<ProcessedSleepMetrics[]> {
    // Fetch both sleep sessions and daily scores
    const [sessions, dailySleeps] = await Promise.all([
        fetchSleepSessions(accessToken, startDate, endDate),
        fetchDailySleep(accessToken, startDate, endDate),
    ]);

    // Create map of daily sleep scores by date
    const dailyByDate = new Map<string, DailySleep>();
    for (const daily of dailySleeps) {
        dailyByDate.set(daily.day, daily);
    }

    // Filter to main sleep sessions only (not naps)
    const mainSleepSessions = sessions.filter(
        s => s.type === 'long_sleep' || s.type === 'sleep'
    );

    // Process each session
    return mainSleepSessions.map(session =>
        processSleepSession(session, dailyByDate.get(session.day))
    );
}

/**
 * Check if tokens are expired
 */
export function isTokenExpired(tokens: OuraTokens): boolean {
    // Add 5 minute buffer
    return Date.now() > tokens.expires_at - 5 * 60 * 1000;
}
