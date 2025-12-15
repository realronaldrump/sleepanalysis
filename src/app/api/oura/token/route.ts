import { sql } from '@vercel/postgres';
import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
    try {
        const { rows } = await sql`
      SELECT access_token, refresh_token, expires_at 
      FROM oura_tokens 
      ORDER BY updated_at DESC 
      LIMIT 1;
    `;

        if (rows.length === 0) {
            return NextResponse.json({ found: false }, { status: 200 });
        }

        // Convert expires_at back to number if needed (Postgres bigint comes as string)
        const tokenData = {
            access_token: rows[0].access_token,
            refresh_token: rows[0].refresh_token,
            expires_at: Number(rows[0].expires_at),
            token_type: 'Bearer' // standard for Oura
        };

        return NextResponse.json({ found: true, ...tokenData }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const { access_token, refresh_token, expires_at } = await request.json();

        // Upsert or Insert. For simplicity in single user, just insert new latest.
        await sql`
      INSERT INTO oura_tokens (access_token, refresh_token, expires_at)
      VALUES (${access_token}, ${refresh_token}, ${expires_at})
    `;

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error }, { status: 500 });
    }
}
