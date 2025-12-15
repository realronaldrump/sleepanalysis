import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        // Create Table for Oura Tokens
        // We'll store one row per user (or just one global row if single user app)
        // For this single-user app, we can just use a fixed ID or assume single entry
        await sql`
      CREATE TABLE IF NOT EXISTS oura_tokens (
        id SERIAL PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at BIGINT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

        // Create Table for Medication Logs
        // Storing the entire JSON blob is easiest for now, or we can normalize. 
        // Given the CSV structure, a JSON blob for the entire import is flexible.
        await sql`
      CREATE TABLE IF NOT EXISTS medication_logs (
        id SERIAL PRIMARY KEY,
        data JSONB NOT NULL,
        date_range_start DATE,
        date_range_end DATE,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

        // Create Table for Oura Sleep Data Cache
        // We can store daily summaries to avoid refetching
        await sql`
      CREATE TABLE IF NOT EXISTS oura_sleep_cache (
        date DATE PRIMARY KEY,
        data JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;

        return NextResponse.json({ message: 'Database initialized successfully' }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error }, { status: 500 });
    }
}
