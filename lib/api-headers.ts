export function getApiHeaders(): Record<string, string> {
  const requesttag = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return {
    'Host': 'api.youpin898.com',
    'Accept': '*/*',
    'AppType': '3',
    'User-Agent': 'iOS/26.4.1 AppleStore com.uu898.uusteam/5.43.0 Alamofire/5.2.2',
    'DeviceToken': process.env.YOUPIN_DEVICE_TOKEN || '26BB80E5-871E-4D70-AF0C-1BEF32CAA284',
    'DeviceSysVersion': '26.4.1',
    'requesttag': requesttag,
    // 'signature': '...',
    'version': '5.43.0',
    'Gameid': '730',
    // 'uk': process.env.YOUPIN_UK || '...',
    'package-type': 'uuyp',
    'platform': 'ios',
    'Connection': 'keep-alive',
    'Authorization': process.env.YOUPIN_TOKEN ?? '',
    // 'Cookie': process.env.YOUPIN_COOKIE || '...',
    'api-version': '1.0',
    'Accept-Language': 'zh-Hans-CN;q=1.0, en-GB;q=0.9, zh-Hant-CN;q=0.8',
    'deviceUk': process.env.YOUPIN_DEVICE_UK || '5FJocoeaaepIP1l3NdirQE2yuRz2Aetd2PuwNLqyqkrRuwuU2GYRz8IlCztTd9B1P',
    'Content-Type': 'application/json',
    'App-Version': '5.43.0',
    'Accept-Encoding': 'gzip, deflate',
    'currentTheme': 'Light',
  }
}
