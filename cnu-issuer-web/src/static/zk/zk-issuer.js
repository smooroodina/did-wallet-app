// Minimal zk VC issuer wrapper.
// Expects assets copied to /zk:
//  - snarkjs.min.js, circuit.wasm, circuit_final.zkey, verification_key.json
//  - input.json (template or dynamic)

window.ZkIssuer = (function () {
  const ASSET_BASE = '/zk'

  async function fetchJson(path) {
    const res = await fetch(path)
    if (!res.ok) throw new Error(`Failed to fetch ${path}`)
    return res.json()
  }

  async function buildInput(student, walletAddress) {
    // Load template input.json if present, else build minimal input
    try {
      const template = await fetchJson(`${ASSET_BASE}/input.json`)
      // Merge with dynamic fields
      template.studentId = student.studentId
      template.birth = student.birth
      template.degree = student.degree
      template.wallet = walletAddress
      return template
    } catch {
      return {
        studentId: student.studentId,
        birth: student.birth,
        degree: student.degree,
        wallet: walletAddress
      }
    }
  }

  async function generateProof(student, walletAddress) {
    if (typeof window.snarkjs === 'undefined') {
      throw new Error('snarkjs not loaded')
    }

    const input = await buildInput(student, walletAddress)
    const { proof, publicSignals } = await window.snarkjs.groth16.fullProve(
      input,
      `${ASSET_BASE}/circuit.wasm`,
      `${ASSET_BASE}/circuit_final.zkey`
    )

    const vkey = await fetchJson(`${ASSET_BASE}/verification_key.json`)
    const ok = await window.snarkjs.groth16.verify(vkey, publicSignals, proof)
    if (!ok) throw new Error('ZK verification failed')

    return { proof, publicSignals }
  }

  async function issueZkVc(student, walletAddress) {
    const { proof, publicSignals } = await generateProof(student, walletAddress)
    // Return a simple VC-like payload embedding the proof. In production, sign server-side.
    const vc = {
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'CNUGraduationZkCredential'],
      credentialSubject: {
        id: walletAddress,
        studentId: student.studentId,
        degree: student.degree,
        admissionYear: student.admissionYear,
        graduationYear: student.graduationYear
      },
      proof: {
        type: 'zkSNARK',
        protocol: 'groth16',
        publicSignals,
        proof
      },
      issuedAt: new Date().toISOString()
    }
    return vc
  }

  return { issueZkVc }
})()


