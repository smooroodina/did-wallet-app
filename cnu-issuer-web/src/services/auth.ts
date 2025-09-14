import { Router } from 'express'
import { SignJWT, jwtVerify } from 'jose'

const authSecret = new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret')

export const authRouter = Router()

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body || {}
  // Very basic mock login: username=studentId, password=YYYYMMDD(birth)
  if (!username || !password) return res.status(400).json({ error: 'Missing credentials' })

  // In real impl, verify against identity provider. Here we issue a short JWT.
  const token = await new SignJWT({ sub: username })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(authSecret)

  res.cookie('cnu_issuer_token', token, { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 30 * 60 * 1000 })
  res.json({ ok: true })
})

authRouter.post('/logout', async (_req, res) => {
  res.clearCookie('cnu_issuer_token')
  res.json({ ok: true })
})

export async function requireAuth(req: any, res: any, next: any) {
  try {
    const token = req.cookies?.cnu_issuer_token
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const { payload } = await jwtVerify(token, authSecret)
    req.user = { id: payload.sub }
    next()
  } catch {
    return res.status(401).json({ error: 'Unauthorized' })
  }
}


