async function json(path: string, opts: RequestInit = {}) {
  const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

const $ = (id: string) => document.getElementById(id) as HTMLElement

$('#loginBtn')?.addEventListener('click', async () => {
  try {
    const username = (document.getElementById('username') as HTMLInputElement).value
    const password = (document.getElementById('password') as HTMLInputElement).value
    await json('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
    $('#authStatus').textContent = '로그인 완료'
  } catch (e: any) {
    $('#authStatus').textContent = `로그인 실패: ${e?.message || e}`
  }
})

$('#logoutBtn')?.addEventListener('click', async () => {
  await json('/api/auth/logout', { method: 'POST' })
  $('#authStatus').textContent = '로그아웃됨'
})

$('#fetchProfileBtn')?.addEventListener('click', async () => {
  try {
    const data = await json('/api/students/me')
    $('#profile').textContent = JSON.stringify(data.student, null, 2)
  } catch (e: any) {
    $('#profile').textContent = `오류: ${e?.message || e}`
  }
})

$('#verifyBtn')?.addEventListener('click', async () => {
  try {
    const data = await json('/api/issue/verify', { method: 'POST' })
    $('#verifyStatus').textContent = data.ok ? '졸업 상태 확인 완료' : '졸업 상태 확인 실패'
  } catch (e: any) {
    $('#verifyStatus').textContent = `검증 실패: ${e?.message || e}`
  }
})

$('#issueBtn')?.addEventListener('click', async () => {
  try {
    const walletAddress = (document.getElementById('walletAddress') as HTMLInputElement).value
    const data = await json('/api/issue/vc', { method: 'POST', body: JSON.stringify({ walletAddress }) })
    $('#vcOut').textContent = data.jwt
  } catch (e: any) {
    $('#vcOut').textContent = `발급 실패: ${e?.message || e}`
  }
})


