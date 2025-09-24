async function json(path, opts = {}) {
  const res = await fetch(path, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...opts })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

let currentStudent = null

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, setting up event listeners...')
  
  // Auto-format birth date input
  const birthInput = document.getElementById('birth')
  if (birthInput) {
    birthInput.addEventListener('input', (e) => {
      let value = e.target.value.replace(/\D/g, '') // Remove non-digits
      let formattedValue = ''
      
      if (value.length > 0) {
        // Add year (max 4 digits)
        formattedValue = value.substring(0, 4)
        
        if (value.length > 4) {
          // Add month with dash
          formattedValue += '-' + value.substring(4, 6)
          
          if (value.length > 6) {
            // Add day with dash
            formattedValue += '-' + value.substring(6, 8)
          }
        }
      }
      
      e.target.value = formattedValue
    })

    // Allow only numbers and some control keys
    birthInput.addEventListener('keydown', (e) => {
      // Allow: backspace, delete, tab, escape, enter, home, end, left, right
      if ([8, 9, 27, 13, 46, 35, 36, 37, 39].indexOf(e.keyCode) !== -1 ||
          // Allow Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+Z
          (e.ctrlKey && [65, 67, 86, 88, 90].indexOf(e.keyCode) !== -1)) {
        return
      }
      // Prevent if not a number
      if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
        e.preventDefault()
      }
    })
  }
  
  const verifyBtn = document.getElementById('verifyBtn')
  console.log('verifyBtn found:', verifyBtn)
  
  if (verifyBtn) {
    verifyBtn.addEventListener('click', async () => {
      console.log('button clicked: "verifyBtn"')
      try {
        const studentId = document.getElementById('studentId').value.trim()
        const birth = document.getElementById('birth').value.trim()
        
        if (!studentId || !birth) {
          showError('학번과 생년월일을 모두 입력해주세요.')
          return
        }

        const data = await json('/api/students/verify', { 
          method: 'POST', 
          body: JSON.stringify({ studentId, birth }) 
        })
        
        if (data.ok) {
          currentStudent = data.student
          displayCertificate(data.student)
          hideError()
        } else {
          showError('학적 정보를 찾을 수 없습니다.')
        }
      } catch (e) {
        showError(`조회 실패: ${e.message || e}`)
      }
    })
  }

  const issueBtn = document.getElementById('issueBtn')
  const genAddrBtn = document.getElementById('genAddrBtn')
  if (issueBtn) {
    issueBtn.addEventListener('click', async () => {
      console.log('button clicked: "issueBtn"')
      try {
         const walletAddress = document.getElementById('walletAddress').value.trim()
         if (!walletAddress) {
           showError('지갑 주소를 입력해주세요.', false)
           return
         }
         
         if (!currentStudent) {
           showError('먼저 학적 정보를 조회해주세요.', false)
           return
         }

        // Issue VC (JWT format) from server
        const data = await json('/api/issue/vc', { 
          method: 'POST', 
          body: JSON.stringify({ 
            studentId: currentStudent.studentId,
            birth: currentStudent.birth,
            walletAddress 
          }) 
        })
        
        console.log('VC issued:', data)
        
        // 확장프로그램에 VC 발급 승인 요청
        try {
          await requestVCIssuanceApproval(data.vc, currentStudent)
        } catch (error) {
          console.log('VC 발급 승인 실패:', error)
          // 승인 실패 시에도 화면에 표시
          displayVcResult(data.vc)
        }
       } catch (e) {
         showError(`VC 발급 실패: ${e.message || e}`, false)
       }
    })
  }

  if (genAddrBtn) {
    genAddrBtn.addEventListener('click', async () => {
      try {
        await connectWallet()
      } catch (e) {
        showError('지갑 연결 실패: ' + (e.message || e), false)
      }
    })
  }
})

// 지갑 연결 함수
async function connectWallet() {
  console.log('🔗 지갑 연결 시작...')
  
  return new Promise((resolve, reject) => {
    let extensionDetected = false
    let addressReceived = false
    
    // 통합 메시지 핸들러
    const handleMessage = (event) => {
      // 보안 체크
      if (event.source !== window) return
      
      const { type, success, address, error } = event.data || {}
      
      switch (type) {
        case 'DID_WALLET_EXTENSION_DETECTED':
          console.log('✅ DID Wallet 확장프로그램 감지됨')
          extensionDetected = true
          break
          
        case 'DID_WALLET_ADDRESS_RESPONSE':
          console.log('📨 지갑 주소 응답 받음:', { success, address, error })
          addressReceived = true
          
          // 이벤트 리스너 정리
          window.removeEventListener('message', handleMessage)
          
          if (success) {
            console.log('✅ 지갑 연결 성공:', address)
            document.getElementById('walletAddress').value = address
            resolve(address)
          } else {
            console.log('❌ 지갑 연결 실패:', error)
            reject(new Error(error || '지갑 연결이 거절되었습니다'))
          }
          break
          
        case 'DID_WALLET_VC_SAVE_RESPONSE':
          console.log('💾 VC 저장 응답 받음:', { success, error })
          if (success) {
            showTemporaryMessage('VC가 확장프로그램에 성공적으로 저장되었습니다! 📱')
          } else {
            showError('VC 저장 실패: ' + (error || '알 수 없는 오류'), false)
          }
          break
          
        default:
          // 다른 메시지들은 무시 (React DevTools 등)
          break
      }
    }
    
    // 이벤트 리스너 등록
    window.addEventListener('message', handleMessage)
    
    // 1단계: 확장프로그램 감지
    console.log('📤 확장프로그램 감지 요청...')
    window.postMessage({ type: 'DID_WALLET_PING' }, '*')
    
    // 확장프로그램 감지 대기 (2초)
    setTimeout(() => {
      if (!extensionDetected) {
        console.log('❌ DID Wallet 확장프로그램이 감지되지 않음')
        window.removeEventListener('message', handleMessage)
        reject(new Error('DID Wallet 확장프로그램이 설치되지 않았습니다'))
        return
      }
      
      // 2단계: 지갑 주소 요청
      console.log('📤 지갑 주소 요청...')
      window.postMessage({ type: 'DID_WALLET_REQUEST_ADDRESS' }, '*')
      
      // 주소 응답 대기 (30초)
      setTimeout(() => {
        if (!addressReceived) {
          console.log('⏰ 지갑 주소 요청 시간 초과')
          window.removeEventListener('message', handleMessage)
          reject(new Error('지갑 주소 요청 시간이 초과되었습니다'))
        }
      }, 30000)
    }, 2000)
  })
}

function displayCertificate(student) {
  Array.from(document.getElementsByClassName('student-info')).forEach(element => {
    switch (element.id) {
      case 'profileImage': element.src = student.profileImage; break
      case 'studentName': element.textContent = student.name; break
      case 'studentId': element.textContent = student.studentId; break
      case 'birth': element.textContent = student.birth; break
      case 'department': element.textContent = student.department; break
      case 'college': element.textContent = student.college; break
      case 'degree': element.textContent = student.degree; break
      case 'admissionYear': element.textContent = student.admissionYear + '년'; break
      case 'graduationYear': element.textContent = student.graduationYear ? student.graduationYear + '년' : '재학 중'; break
      case 'status': element.textContent = student.status; break
    }
  })

  document.getElementById('profileImage').src = student.profileImage

  const statusElement = document.getElementById('status')
  statusElement.textContent = student.status
  statusElement.className = `value status-badge ${student.status}`
  
  document.getElementById('issueDate').textContent = new Date().toLocaleDateString('ko-KR')
  
  document.getElementById('certificateSection').style.display = 'block'
}

function showError(message, hideCertificate = true) {
  document.getElementById('errorMessage').textContent = message
  document.getElementById('errorMessage').style.display = 'block'
  if (hideCertificate) {
    document.getElementById('certificateSection').style.display = 'none'
  }
}

function hideError() {
  document.getElementById('errorMessage').style.display = 'none'
}

// Display VC with copy-to-clipboard functionality
function displayVcResult(vc) {
  const vcResultDiv = document.getElementById('vcResult')
  const vcJson = JSON.stringify(vc, null, 2)
  
  // VC를 전역 변수로 저장하여 복사 함수에서 접근 가능하게 함
  window.currentVC = vcJson
  
  vcResultDiv.innerHTML = `
    <div class="vc-display">
      <h4>발급된 VC (Verifiable Credential)</h4>
      <div class="vc-content" onclick="copyCurrentVC()" title="클릭하여 VC JSON 복사" style="cursor: pointer; border: 1px solid #ddd; padding: 10px; border-radius: 5px; background: #f9f9f9;">
        <pre>${vcJson}</pre>
      </div>
      <p class="copy-hint">💡 위 VC를 클릭하면 클립보드에 복사됩니다</p>
    </div>
  `
  
  vcResultDiv.style.display = 'block'
}

// 현재 VC를 클립보드에 복사하는 함수
async function copyCurrentVC() {
  if (window.currentVC) {
    await copyToClipboard(window.currentVC, 'VC')
  }
}

// VC 발급 승인 요청 함수
async function requestVCIssuanceApproval(vc, student) {
  console.log('📤 VC 발급 승인 요청...')
  
  return new Promise((resolve, reject) => {
    let responseReceived = false
    
    const handleApprovalResponse = (event) => {
      if (event.source !== window) return
      
      const { type, approved, error } = event.data || {}
      
      if (type === 'DID_WALLET_VC_ISSUANCE_RESPONSE') {
        responseReceived = true
        window.removeEventListener('message', handleApprovalResponse)
        
        if (approved) {
          console.log('✅ VC 발급 승인됨')
          // 승인되면 화면에 표시하고 자동 저장
          displayVcResult(vc)
          // 자동으로 확장프로그램에 저장
          setTimeout(() => {
            saveVCToExtension()
          }, 1000)
          resolve()
        } else {
          console.log('❌ VC 발급 거절됨:', error)
          reject(new Error(error || 'VC 발급이 거절되었습니다'))
        }
      }
    }
    
    window.addEventListener('message', handleApprovalResponse)
    
    // 확장프로그램에 VC 발급 승인 요청
    window.postMessage({
      type: 'DID_WALLET_REQUEST_VC_ISSUANCE',
      vc: vc,
      student: student,
      origin: window.location.origin
    }, '*')
    
    // 응답 대기 타임아웃 (30초)
    setTimeout(() => {
      if (!responseReceived) {
        console.log('⏰ VC 발급 승인 요청 시간 초과')
        window.removeEventListener('message', handleApprovalResponse)
        reject(new Error('VC 발급 승인 요청 시간이 초과되었습니다'))
      }
    }, 30000)
  })
}

// VC를 확장프로그램에 저장하는 함수
async function saveVCToExtension() {
  if (!window.currentVC) {
    showError('저장할 VC가 없습니다.', false)
    return
  }
  
  try {
    console.log('📤 VC를 확장프로그램에 저장 요청...')
    
    // 확장프로그램에 VC 저장 요청
    window.postMessage({
      type: 'DID_WALLET_SAVE_VC',
      vc: JSON.parse(window.currentVC)
    }, '*')
    
    showTemporaryMessage('VC가 확장프로그램에 저장되었습니다! 📱')
  } catch (error) {
    console.error('VC 저장 실패:', error)
    showError('VC 저장에 실패했습니다: ' + error.message, false)
  }
}

// Copy text to clipboard
async function copyToClipboard(text, label = '') {
  try {
    await navigator.clipboard.writeText(text)
    showTemporaryMessage(`${label} 클립보드에 복사되었습니다! 📋`)
  } catch (err) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea')
    textArea.value = text
    document.body.appendChild(textArea)
    textArea.select()
    document.execCommand('copy')
    document.body.removeChild(textArea)
    showTemporaryMessage(`${label} 클립보드에 복사되었습니다! 📋`)
  }
}

// Show temporary success message
function showTemporaryMessage(message) {
  const existingMsg = document.getElementById('tempMessage')
  if (existingMsg) existingMsg.remove()
  
  const msgDiv = document.createElement('div')
  msgDiv.id = 'tempMessage'
  msgDiv.textContent = message
  msgDiv.style.cssText = `
    position: fixed; top: 20px; right: 20px; z-index: 1000;
    background: #10b981; color: white; padding: 12px 20px;
    border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-weight: 600; animation: fadeInOut 3s ease-in-out;
  `
  
  document.body.appendChild(msgDiv)
  setTimeout(() => msgDiv.remove(), 3000)
}