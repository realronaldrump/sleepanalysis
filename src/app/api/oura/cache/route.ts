import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const start = searchParams.get('start');
        const end = searchParams.get('end');

        if (!start || !end) {
            return NextResponse.json({ error: 'Missing date range' }, { status: 400 });
        }

        const { rows } = await sql`
      SELECT date, data
      FROM oura_sleep_cache
      WHERE date >= ${start} AND date <= ${end}
    `;

        // Map rows to just the data objects
        const data = rows.map(r => r.data);

        return NextResponse.json({ data }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { data } = await request.json(); // Array of sleep metrics

        // Upsert each day
        // This is inefficient loop but fine for small batch sizes (typical 1-30 days)
        for (const dayData of data) {
            await sql`
            INSERT INTO oura_sleep_cache (date, data)
            VALUES (${dayData.date}, ${JSON.stringify(dayData)})
            ON CONFLICT (date) 
            DO UPDATE SET data = ${JSON.stringify(dayData)}, updated_at = CURRENT_TIMESTAMP;
        `;
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Cache save error:', error);
        return NextResponse.json({ error }, { status: 500 });
    }
}
