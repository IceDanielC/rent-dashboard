import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

export const dynamic = 'force-dynamic'

const AUTH_PATH = path.join(process.cwd(), 'data', 'auth.json')

interface AuthConfig {
  token: string
  cookie: string
}

function readAuthConfig(): AuthConfig {
  try {
    if (fs.existsSync(AUTH_PATH)) {
      return JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'))
    }
  } catch {}
  return {
    token: process.env.YOUPIN_TOKEN ?? '',
    cookie: process.env.YOUPIN_COOKIE ?? '',
  }
}

export async function GET(): Promise<Response> {
  const config = readAuthConfig()
  return NextResponse.json({ ok: true, token: config.token, cookie: config.cookie })
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json() as Partial<AuthConfig>
    const current = readAuthConfig()
    const next: AuthConfig = {
      token: typeof body.token === 'string' ? body.token.trim() : current.token,
      cookie: typeof body.cookie === 'string' ? body.cookie.trim() : current.cookie,
    }
    fs.writeFileSync(AUTH_PATH, JSON.stringify(next, null, 2), 'utf-8')
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
