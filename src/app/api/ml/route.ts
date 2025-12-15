/**
 * ML Service API Proxy
 * Proxies requests to the Python ML service for CORS handling
 */

import { NextRequest, NextResponse } from 'next/server';

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
    try {
        const { endpoint, data } = await request.json();

        if (!endpoint) {
            return NextResponse.json(
                { error: 'Missing endpoint parameter' },
                { status: 400 }
            );
        }

        // Forward request to ML service
        const response = await fetch(`${ML_SERVICE_URL}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json(
                { error: `ML service error: ${errorText}` },
                { status: response.status }
            );
        }

        const result = await response.json();
        return NextResponse.json(result);

    } catch (error) {
        console.error('ML proxy error:', error);
        return NextResponse.json(
            { error: 'ML service unavailable' },
            { status: 503 }
        );
    }
}

export async function GET() {
    try {
        // Health check
        const response = await fetch(`${ML_SERVICE_URL}/health`, {
            method: 'GET',
        });

        if (!response.ok) {
            return NextResponse.json(
                { status: 'unhealthy', error: 'ML service not responding' },
                { status: 503 }
            );
        }

        const health = await response.json();
        return NextResponse.json(health);

    } catch (error) {
        return NextResponse.json(
            { status: 'unhealthy', error: 'ML service unavailable' },
            { status: 503 }
        );
    }
}
