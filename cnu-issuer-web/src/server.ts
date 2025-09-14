import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import path from 'path'
import { fileURLToPath } from 'url'
import { authRouter } from './services/auth.js'
import { studentsRouter } from './services/students.js'
import { issueRouter } from './services/issue.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use(cookieParser())

app.use('/api/auth', authRouter)
app.use('/api/students', studentsRouter)
app.use('/api/issue', issueRouter)

// Static frontend
app.use('/', express.static(path.join(__dirname, 'static')))

const port = process.env.PORT || 5175
app.listen(port, () => {
  console.log(`CNU Issuer running on http://localhost:${port}`)
})


