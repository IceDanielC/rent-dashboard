import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { getDb } from '@/lib/db'

export async function GET() {
  try {
    const db = getDb()
    db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`)

    const lastSync = (db.prepare(`SELECT value FROM meta WHERE key = 'last_sync'`).get() as { value: string } | undefined)?.value ?? null
    const lastAdded = (db.prepare(`SELECT value FROM meta WHERE key = 'last_sync_added'`).get() as { value: string } | undefined)?.value ?? null

    return NextResponse.json({ last_sync: lastSync, last_added: lastAdded ? parseInt(lastAdded) : null })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
