import { Router, Request, Response } from 'express'
import { randomUUID, createHash, createHmac } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

// Load student database
const dbPath = path.join(__dirname, '../database/students.json')
const dbContent = fs.readFileSync(dbPath, 'utf-8')
const db = JSON.parse(dbContent)

interface Student {
  studentId: string
  name: string
  sex: 'male' | 'female'
  birth: string
  department: string
  college: string
  degree: string
  admissionYear: number
  graduationYear: number | null
  status: string
  nationalId: string
  email: string
}

// Issuer information matching the original format
const issuerInfo = {
  id: "https://infosec.chungnam.ac.kr",
  name: "Chungnam National University Information Security Lab",
  publicKey: {
    Ax: "13277427435165878497778222415993513565335242147425444199013288855685581939618",
    Ay: "13622229784656158136036771217484571176836296686641868549125388198837476602820"
  }
}

export const issueRouter = Router()

issueRouter.post('/vc', async (req: Request, res: Response) => {
  const { studentId, birth, walletAddress } = req.body || {}
  if (!studentId || !birth || !walletAddress) {
    return res.status(400).json({ error: 'studentId, birth, and walletAddress are required' })
  }

  const record: Student = db.students.find((s: Student) => s.studentId === studentId && s.birth === birth)
  if (!record) {
    return res.status(404).json({ error: 'Student not found or birth date mismatch' })
  }
  
  if (record.status !== '졸업') {
    return res.status(409).json({ error: 'Not graduated - VC can only be issued for graduated students' })
  }

  const vcId = Math.floor(Math.random() * 10000) + 1000
  const nowIso = new Date().toISOString()
  const oneYearMs = 365 * 24 * 60 * 60 * 1000
  const validUntilIso = new Date(Date.now() + oneYearMs).toISOString()

  const vcBase = {
    "@context": [
      "https://www.w3.org/ns/credentials/v2",
      "https://www.w3.org/ns/credentials/examples/v2"
    ],
    "id": `http://chungnam.ac.kr/credentials/${vcId}`,
    "type": [
      "VerifiableCredential", 
      "AlumniCredential"
    ],
    "issuer": issuerInfo,
    "issuanceDate": nowIso,
    "validFrom": nowIso,
    "validUntil": validUntilIso,
    "credentialSubject": {
      "id": `did:ethr:${walletAddress}`,
      "walletAddress": walletAddress,
      "name": record.name,
      "age": calculateAge(record.birth),
      "studentNumber": record.studentId,
      "alumniOf": {
        "id": "did:example:c34fb4561237890",
        "name": "Chungnam National University",
        "department": record.department
      }
    }
  }

  // Compute deterministic root from VC content (excluding proof)
  const merkleRoot = computeDeterministicRoot(vcBase)
  const signature = generateDeterministicSignature(merkleRoot)

  const vc = {
    ...vcBase,
    "proof": {
      "type": "BabyJubJubSMTSignature2024",
      "created": new Date().toISOString(),
      "proofPurpose": "verificationMethod", 
      "verificationMethod": "https://infosec.chungnam.ac.kr",
      "merkleRoot": merkleRoot,
      "signature": signature
    }
  }

  console.log('Generated VC:', vc)
  res.json({ ok: true, vc })
})

// Helper functions for VC generation
function calculateAge(birthDate: string): number {
  const birth = new Date(birthDate)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

function canonicalize(value: any): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => canonicalize(v)).join(',') + ']'
  }
  const keys = Object.keys(value).sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}'
}

function computeDeterministicRoot(vc: any): string {
  const canonical = canonicalize(vc)
  const digest = createHash('sha256').update(canonical).digest()
  return Array.from(digest).join(',')
}

function generateDeterministicSignature(root: string): { R8x: string, R8y: string, S: string } {
  // Derive deterministic big integers from HMAC over the root and issuer key
  const key = 'vc-issuer-secret'
  const h1 = createHmac('sha256', key).update(root).update(issuerInfo.publicKey.Ax).digest()
  const h2 = createHmac('sha256', key + ':S').update(root).update(issuerInfo.publicKey.Ay).digest()

  const r8xHex = Buffer.from(h1.slice(0, 16)).toString('hex')
  const r8yHex = Buffer.from(h1.slice(16, 32)).toString('hex')
  const sHex = Buffer.from(h2).toString('hex')

  return {
    R8x: (BigInt('0x' + r8xHex)).toString(),
    R8y: (BigInt('0x' + r8yHex)).toString(),
    S: (BigInt('0x' + sHex)).toString()
  }
}
