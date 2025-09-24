console.log('[CEB] All content script loaded');

// Simple function without external imports
const sampleFunction = () => {
  console.log('content script - sampleFunction() called from another module');
};

sampleFunction();

// 웹페이지와 확장프로그램 간 통신을 위한 이벤트 리스너
window.addEventListener('message', async (event) => {
  // 보안을 위해 origin 체크 (필요시 특정 도메인으로 제한)
  if (event.source !== window) return;
  
  // Issuer 웹에서 핑을 보내면 즉시 감지 신호를 재전송
  if (event.data.type === 'DID_WALLET_PING') {
    console.log('📣 [Content Script] 감지 핑 수신 → 감지 신호 재전송');
    window.postMessage({
      type: 'DID_WALLET_EXTENSION_DETECTED',
    }, '*');
    return;
  }

  if (event.data.type === 'DID_WALLET_REQUEST_ADDRESS') {
    console.log('🔗 [Content Script] 지갑 주소 요청 받음:', event.data);
    
    try {
      // 백그라운드 스크립트를 통해 popup과 통신
      console.log('📤 [Content Script] 백그라운드로 요청 전송...');
      const response = await chrome.runtime.sendMessage({
        type: 'REQUEST_WALLET_ADDRESS',
        origin: window.location.origin
      });
      
      console.log('📨 [Content Script] 백그라운드 응답 받음:', response);
      
      // 웹페이지로 응답 전송
      window.postMessage({
        type: 'DID_WALLET_ADDRESS_RESPONSE',
        success: response.success,
        address: response.address,
        error: response.error
      }, '*');
    } catch (error) {
      console.log('❌ [Content Script] 오류 발생:', error);
      window.postMessage({
        type: 'DID_WALLET_ADDRESS_RESPONSE',
        success: false,
        error: error.message || '지갑 연결 실패'
      }, '*');
    }
  }

  if (event.data.type === 'DID_WALLET_REQUEST_VC_ISSUANCE') {
    console.log('📋 [Content Script] VC 발급 승인 요청 받음:', event.data);
    
    try {
      // 백그라운드 스크립트로 VC 발급 승인 요청
      console.log('📤 [Content Script] 백그라운드로 VC 발급 승인 요청 전송...');
      const response = await chrome.runtime.sendMessage({
        type: 'REQUEST_VC_ISSUANCE',
        vc: event.data.vc,
        student: event.data.student,
        origin: window.location.origin
      });
      
      console.log('📨 [Content Script] VC 발급 승인 응답 받음:', response);
      
      // 웹페이지로 응답 전송
      window.postMessage({
        type: 'DID_WALLET_VC_ISSUANCE_RESPONSE',
        approved: response.approved,
        error: response.error
      }, '*');
    } catch (error) {
      console.log('❌ [Content Script] VC 발급 승인 오류 발생:', error);
      window.postMessage({
        type: 'DID_WALLET_VC_ISSUANCE_RESPONSE',
        approved: false,
        error: error.message || 'VC 발급 승인 실패'
      }, '*');
    }
  }

  if (event.data.type === 'DID_WALLET_SAVE_VC') {
    console.log('💾 [Content Script] VC 저장 요청 받음:', event.data);
    
    try {
      // 백그라운드 스크립트로 VC 저장 요청
      console.log('📤 [Content Script] 백그라운드로 VC 저장 요청 전송...');
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_VC',
        vc: event.data.vc,
        origin: window.location.origin
      });
      
      console.log('📨 [Content Script] VC 저장 응답 받음:', response);
      
      // 웹페이지로 응답 전송
      window.postMessage({
        type: 'DID_WALLET_VC_SAVE_RESPONSE',
        success: response.success,
        error: response.error
      }, '*');
    } catch (error) {
      console.log('❌ [Content Script] VC 저장 오류 발생:', error);
      window.postMessage({
        type: 'DID_WALLET_VC_SAVE_RESPONSE',
        success: false,
        error: error.message || 'VC 저장 실패'
      }, '*');
    }
  }
});

// 확장프로그램이 설치되어 있음을 웹페이지에 알림
console.log('📢 [Content Script] 확장프로그램 감지 신호 전송');
window.postMessage({
  type: 'DID_WALLET_EXTENSION_DETECTED'
}, '*');
