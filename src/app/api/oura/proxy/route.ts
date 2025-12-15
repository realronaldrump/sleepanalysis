import { NextRequest, NextResponse } from 'next/server';

const OURA_API_BASE = 'https://api.ouraring.com';

/**
 * Proxy requests to Oura API to avoid CORS issues
 * POST /api/oura/proxy
 * Body: { endpoint: string, accessToken: string, startDate: string, endDate: string }
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { endpoint, accessToken, startDate, endDate, nextToken } = body;

        if (!endpoint || !accessToken) {
            return NextResponse.json(
                { error: 'Missing required fields: endpoint, accessToken' },
                { status: 400 }
            );
        }

        // Build URL with query params
        const params = new URLSearchParams();
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (nextToken) params.append('next_token', nextToken);

        const url = `${OURA_API_BASE}${endpoint}?${params.toString()}`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json(
                { error: `Oura API error: ${response.status}`, details: errorText },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Proxy error:', error);
        return NextResponse.json(
            { error: 'Failed to proxy request to Oura API' },
            { status: 500 }
        );
    }
}
