import { Router } from 'express'
import db from '../store/students.json' assert { type: 'json' }
import { requireAuth } from './auth.js'

export const studentsRouter = Router()

// Get own student profile by cookie auth
studentsRouter.get('/me', requireAuth, (req: any, res) => {
  const studentId = String(req.user.id)
  const student = db.students.find(s => s.studentId === studentId)
  if (!student) return res.status(404).json({ error: 'Student not found' })
  res.json({ student })
})

// Admin lookup (mock)
studentsRouter.get('/:studentId', requireAuth, (req, res) => {
  const student = db.students.find(s => s.studentId === req.params.studentId)
  if (!student) return res.status(404).json({ error: 'Student not found' })
  res.json({ student })
})


