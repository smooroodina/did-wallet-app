import { Router } from 'express'
import { SignJWT } from 'jose'
import { requireAuth } from './auth.js'
import db from '../store/students.json' assert { type: 'json' }
import { randomUUID } from 'crypto'

const issuerDid = 'did:web:cnu.ac.kr:issuer'
const vcPrivateKey = new TextEncoder().encode(process.env.VC_SECRET || 'vc-dev-secret')

export const issueRouter = Router()

issueRouter.post('/verify', requireAuth, (req: any, res) => {
  const studentId = String(req.user.id)
  const record = db.students.find(s => s.studentId === studentId)
  if (!record) return res.status(404).json({ ok: false, error: 'Student not found' })
  if (record.status !== 'graduated') return res.status(409).json({ ok: false, error: 'Not graduated' })
  res.json({ ok: true, record })
})

issueRouter.post('/vc', requireAuth, async (req: any, res) => {
  const { walletAddress } = req.body || {}
  if (!walletAddress) return res.status(400).json({ error: 'walletAddress required' })
  const studentId = String(req.user.id)
  const record = db.students.find(s => s.studentId === studentId)
  if (!record) return res.status(404).json({ error: 'Student not found' })
  if (record.status !== 'graduated') return res.status(409).json({ error: 'Not graduated' })

  const now = Math.floor(Date.now() / 1000)
  const vcPayload = {
    jti: randomUUID(),
    iss: issuerDid,
    sub: walletAddress,
    nbf: now,
    iat: now,
    vc: {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'CNUGraduationCredential'],
      credentialSubject: {
        id: walletAddress,
        studentId: record.studentId,
        name: record.name,
        college: record.college,
        department: record.department,
        program: record.program,
        graduationYear: record.graduationYear
      }
    }
  }

  const jwt = await new SignJWT(vcPayload as any)
    .setProtectedHeader({ alg: 'HS256', kid: `${issuerDid}#key-1` })
    .sign(vcPrivateKey)

  res.json({ ok: true, jwt })
})


