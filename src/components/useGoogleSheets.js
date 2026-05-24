const STORAGE_KEY = 'neo4j_gsheets_settings'

export const DEFAULT_SETTINGS = { apiKey: '', credentialsJson: null, sheets: [] }

export function loadSheetsSettings() {
  try { const s = localStorage.getItem(STORAGE_KEY); return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS }
  catch { return DEFAULT_SETTINGS }
}
export function saveSheetsSettings(s) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) }
export function extractSheetId(v) { const m = v.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/); return m ? m[1] : v.trim() }

// ============================================================
// 純粋 JS 実装: SHA-256 + RSA-PKCS1v1.5（crypto.subtle 不要）
// ============================================================

// ---- SHA-256 ----------------------------------------------------------------
const _K = [
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]

function sha256(data /* Uint8Array */) {
  const r = (n, k) => ((n >>> k) | (n << (32 - k))) >>> 0
  let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]
  const len = data.length
  const padded = new Uint8Array(Math.ceil((len + 9) / 64) * 64)
  padded.set(data); padded[len] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 4, len * 8, false)
  for (let off = 0; off < padded.length; off += 64) {
    const W = new Uint32Array(64)
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4, false)
    for (let i = 16; i < 64; i++) {
      const s0 = r(W[i-15],7) ^ r(W[i-15],18) ^ (W[i-15] >>> 3)
      const s1 = r(W[i-2],17) ^ r(W[i-2],19) ^ (W[i-2] >>> 10)
      W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0
    }
    let [a,b,c,d,e,f,g,h] = H
    for (let i = 0; i < 64; i++) {
      const S1 = r(e,6)^r(e,11)^r(e,25), ch = (e&f)^(~e&g)
      const t1 = (h + S1 + ch + _K[i] + W[i]) >>> 0
      const S0 = r(a,2)^r(a,13)^r(a,22), maj = (a&b)^(a&c)^(b&c)
      const t2 = (S0 + maj) >>> 0
      h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0
    }
    H = H.map((v,i) => (v + [a,b,c,d,e,f,g,h][i]) >>> 0)
  }
  const out = new Uint8Array(32)
  const odv = new DataView(out.buffer)
  H.forEach((v,i) => odv.setUint32(i*4,v,false))
  return out
}

// ---- ASN.1 DER パーサ -------------------------------------------------------

function derLen(b, pos) {
  if (b[pos] < 0x80) return { len: b[pos], next: pos + 1 }
  const n = b[pos] & 0x7f
  let len = 0
  for (let i = 0; i < n; i++) len = (len << 8) | b[pos+1+i]
  return { len, next: pos+1+n }
}
function derSkipSeq(b, pos) { pos++; const { len, next } = derLen(b, pos); return next + len }
function derReadInt(b, pos) {
  pos++ // skip 0x02 INTEGER tag
  const { len, next } = derLen(b, pos)
  const raw = b.slice(next, next + len)
  const start = raw[0] === 0 ? 1 : 0
  const hex = Array.from(raw.slice(start)).map(x => x.toString(16).padStart(2,'0')).join('')
  return { value: hex ? BigInt('0x'+hex) : 0n, next: next + len }
}

function parsePKCS8RSA(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')
  const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  let pos = 0
  // PKCS#8 PrivateKeyInfo 構造:
  // SEQUENCE { version INTEGER, AlgorithmIdentifier SEQUENCE, OCTET STRING { RSAPrivateKey } }
  pos++; pos = derLen(der, pos).next          // outer SEQUENCE → content へ
  const v0 = derReadInt(der, pos); pos = v0.next  // version INTEGER (0) ← 必須ステップ
  pos = derSkipSeq(der, pos)                  // AlgorithmIdentifier SEQUENCE → スキップ
  pos++; pos = derLen(der, pos).next          // OCTET STRING → content へ
  pos++; pos = derLen(der, pos).next          // RSAPrivateKey SEQUENCE → content へ
  const ver = derReadInt(der, pos); pos = ver.next  // version
  const n   = derReadInt(der, pos); pos = n.next
  const e   = derReadInt(der, pos); pos = e.next
  const d   = derReadInt(der, pos); pos = d.next
  const p   = derReadInt(der, pos); pos = p.next
  const q   = derReadInt(der, pos); pos = q.next
  const dp  = derReadInt(der, pos); pos = dp.next
  const dq  = derReadInt(der, pos); pos = dq.next
  const qi  = derReadInt(der, pos)
  const keyLen = Math.ceil(n.value.toString(16).length / 2)
  return { n:n.value, d:d.value, p:p.value, q:q.value, dp:dp.value, dq:dq.value, qi:qi.value, keyLen }
}

// ---- RSA (CRT 高速化) -------------------------------------------------------

function modPow(base, exp, mod) {
  let r = 1n; base %= mod
  while (exp > 0n) { if (exp & 1n) r = r * base % mod; exp >>= 1n; base = base * base % mod }
  return r
}

// SHA-256 DigestInfo プレフィックス (PKCS#1 v1.5)
const SHA256_DI = new Uint8Array([
  0x30,0x31,0x30,0x0d,0x06,0x09,0x60,0x86,0x48,0x01,0x65,0x03,0x04,0x02,0x01,0x05,0x00,0x04,0x20
])

function rsaSign(message, privateKeyPem) {
  const hash = sha256(new TextEncoder().encode(message))
  const key  = parsePKCS8RSA(privateKeyPem)
  const L    = key.keyLen

  // PKCS#1 v1.5 エンコード
  const di = new Uint8Array(SHA256_DI.length + 32)
  di.set(SHA256_DI); di.set(hash, SHA256_DI.length)
  const em = new Uint8Array(L)
  em[0]=0x00; em[1]=0x01
  em.fill(0xff, 2, L - di.length - 1)
  em[L - di.length - 1] = 0x00
  em.set(di, L - di.length)

  // RSA-CRT 署名
  const m  = BigInt('0x' + Array.from(em).map(b => b.toString(16).padStart(2,'0')).join(''))
  const m1 = modPow(m % key.p, key.dp, key.p)
  const m2 = modPow(m % key.q, key.dq, key.q)
  const h  = key.qi * ((m1 - m2 + key.p) % key.p) % key.p
  const sig = m2 + h * key.q

  const sigHex = sig.toString(16).padStart(L * 2, '0')
  const sigBytes = Uint8Array.from(sigHex.match(/.{2}/g).map(x => parseInt(x, 16)))
  return btoa(String.fromCharCode(...sigBytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
}

// ---- サービスアカウント JWT 生成 + トークン取得 --------------------------------

const tokenCache = { email:'', token:'', expiry: 0 }

function b64url(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
}

async function getServiceAccountToken(cred) {
  if (tokenCache.email === cred.client_email && tokenCache.token && Date.now() < tokenCache.expiry - 60_000) {
    return tokenCache.token
  }
  const now = Math.floor(Date.now() / 1000)
  const hdr = b64url({ alg:'RS256', typ:'JWT' })
  const pay = b64url({ iss:cred.client_email, scope:'https://www.googleapis.com/auth/spreadsheets.readonly', aud: cred.token_uri || 'https://oauth2.googleapis.com/token', iat:now, exp:now+3600 })
  const sigInput = `${hdr}.${pay}`
  const sig = rsaSign(sigInput, cred.private_key)
  const jwt = `${sigInput}.${sig}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error_description || `トークン取得失敗 (${res.status})`) }
  const data = await res.json()
  tokenCache.email = cred.client_email
  tokenCache.token = data.access_token
  tokenCache.expiry = Date.now() + (data.expires_in || 3600) * 1000
  return data.access_token
}

// ---- シートデータ取得 ---------------------------------------------------------

export async function fetchSheetData(settings, spreadsheetId, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`
  let fetchOptions = {}
  if (settings.credentialsJson) {
    const token = await getServiceAccountToken(settings.credentialsJson)
    fetchOptions = { headers: { Authorization: `Bearer ${token}` } }
  } else if (settings.apiKey) {
    return parseSheetResp(await fetch(`${url}?key=${settings.apiKey}`))
  } else {
    throw new Error('認証情報が設定されていません')
  }
  return parseSheetResp(await fetch(url, fetchOptions))
}

// スプレッドシートのシート名一覧を取得
export async function fetchSpreadsheetMeta(settings, spreadsheetId) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`
  let fetchOptions = {}
  if (settings.credentialsJson) {
    const token = await getServiceAccountToken(settings.credentialsJson)
    fetchOptions = { headers: { Authorization: `Bearer ${token}` } }
  } else if (settings.apiKey) {
    return parseMetaResp(await fetch(`${url}&key=${settings.apiKey}`))
  } else {
    throw new Error('認証情報が設定されていません')
  }
  return parseMetaResp(await fetch(url, fetchOptions))
}

async function parseMetaResp(res) {
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message || `HTTP ${res.status}`) }
  const data = await res.json()
  return (data.sheets || []).map(s => s.properties?.title).filter(Boolean)
}

async function parseSheetResp(res) {
  if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message || `HTTP ${res.status}`) }
  const data = await res.json()
  const values = data.values || []
  const headers = values[0] ?? []
  const rows = values.slice(1).map(row => { const r=[...row]; while(r.length<headers.length)r.push(''); return r })
  return { headers, rows, range: data.range ?? '' }
}

// credentials.json のバリデーション
export function parseCredentialsJson(text) {
  const obj = JSON.parse(text)
  if (obj.type === 'service_account') {
    if (!obj.client_email || !obj.private_key) throw new Error('client_email / private_key が見つかりません')
    return { type: 'service_account', data: obj }
  }
  const inner = obj.web || obj.installed
  if (inner?.client_id) return { type: 'oauth', data: inner }
  throw new Error('サポートされていない credentials.json 形式です（service_account のみ対応）')
}
