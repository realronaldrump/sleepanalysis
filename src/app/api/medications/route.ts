import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
    try {
        const { rows } = await sql`
      SELECT data, date_range_start, date_range_end 
      FROM medication_logs 
      ORDER BY updated_at DESC 
      LIMIT 1;
    `;

        if (rows.length === 0) {
            return NextResponse.json({ found: false }, { status: 200 });
        }

        return NextResponse.json({
            found: true,
            data: rows[0].data,
            dateRange: {
                start: rows[0].date_range_start,
                end: rows[0].date_range_end
            }
        }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { entries, dateRange } = await request.json();

        // Replace the existing log (single user mode)
        // We'll just insert a new one and the GET picks the latest
        // Optional: cleanup old ones

        await sql`
      INSERT INTO medication_logs (data, date_range_start, date_range_end)
      VALUES (${JSON.stringify(entries)}, ${dateRange.start}, ${dateRange.end})
    `;

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error }, { status: 500 });
    }
}
