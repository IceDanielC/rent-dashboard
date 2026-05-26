import { randomBytes } from 'crypto'
import path from 'path'
import fs from 'fs'

const AUTH_PATH = path.join(process.cwd(), 'data', 'auth.json')

function readAuthConfig(): { token: string; cookie: string } {
  try {
    if (fs.existsSync(AUTH_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf-8'))
      return {
        token: cfg.token || process.env.YOUPIN_TOKEN || '',
        cookie: cfg.cookie || process.env.YOUPIN_COOKIE || '',
      }
    }
  } catch {}
  return {
    token: process.env.YOUPIN_TOKEN ?? '',
    cookie: process.env.YOUPIN_COOKIE ?? '',
  }
}

function createRequestTag(): string {
  const ts = Date.now().toString(16)
  const rand = randomBytes(12).toString('hex')
  return `${ts}${rand}`
}

export function getApiHeaders(): Record<string, string> {
  const requestTag = createRequestTag()
  const auth = readAuthConfig()
  const headers: Record<string, string> = {
    'Host': 'api.youpin898.com',
    'Accept': '*/*',
    'AppType': '3',
    'User-Agent': 'iOS/26.4.1 AppleStore com.uu898.uusteam/5.43.0 Alamofire/5.2.2',
    'DeviceToken': process.env.YOUPIN_DEVICE_TOKEN || '26BB80E5-871E-4D70-AF0C-1BEF32CAA284',
    'DeviceSysVersion': '26.4.1',
    'requesttag': requestTag,
    'requestTag': requestTag,
    'signature': randomBytes(64).toString('hex'),
    'version': '5.43.0',
    'Gameid': '730',

    'package-type': 'uuyp',
    'platform': 'ios',
    'Connection': 'keep-alive',
    'Authorization': auth.token,
    'api-version': '1.0',
    'Accept-Language': 'zh-Hans-CN;q=1.0, en-GB;q=0.9, zh-Hant-CN;q=0.8',
    'deviceUk': process.env.YOUPIN_DEVICE_UK || '5FJocoeaaepIP1l3NdirQE2yuRz2Aetd2PuwNLqyqkrRuwuU2GYRz8IlCztTd9B1P',
    'Content-Type': 'application/json',
    'App-Version': '5.43.0',
    'Accept-Encoding': 'gzip, deflate',
    'currentTheme': 'Light',
  }
  if (auth.cookie) {
    headers['Cookie'] = auth.cookie
  }
  return headers
}
