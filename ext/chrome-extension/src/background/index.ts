import 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';
import { verifyVC } from '../../../pages/popup/shared-src/lib/vcVerification';

exampleThemeStorage.get().then(theme => {
});

// Wallet auto-lock functionality
let lockTimer: NodeJS.Timeout | null = null;
const IDLE_LOCK_MS = 5 * 60 * 1000; // 5 minutes

function resetLockTimer() {
  if (lockTimer) {
    clearTimeout(lockTimer);
  }
  
  lockTimer = setTimeout(() => {
    // Lock the wallet by clearing the runtime state
    chrome.storage.local.set({ walletLocked: true }, () => {
      // Notify all tabs that wallet is locked
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'WALLET_LOCKED' }).catch(() => {
              // Ignore errors if tab doesn't have content script
            });
          }
        });
      });
    });
  }, IDLE_LOCK_MS);
}

// Listen for user activity to reset timer
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'USER_ACTIVITY') {
    resetLockTimer();
  } else if (message.type === 'WALLET_UNLOCKED') {
    resetLockTimer();
  } else if (message.type === 'WALLET_LOCKED') {
    if (lockTimer) {
      clearTimeout(lockTimer);
      lockTimer = null;
    }
  } else if (message.type === 'REQUEST_WALLET_ADDRESS') {
    // 웹페이지에서 주소 요청이 온 경우
    handleAddressRequest(message, sender, sendResponse);
    return true; // 비동기 응답을 위해 true 반환
  } else if (message.type === 'REQUEST_VC_ISSUANCE') {
    // 웹페이지에서 VC 발급 승인 요청이 온 경우
    handleVCIssuanceRequest(message, sender, sendResponse);
    return true; // 비동기 응답을 위해 true 반환
  } else if (message.type === 'SAVE_VC' || message.type === 'DID_WALLET_SAVE_VC') {
    // 웹페이지에서 VC 저장 요청이 온 경우 (팝업 열기)
    handleSaveVC(message, sender, sendResponse);
    return true; // 비동기 응답을 위해 true 반환
  } else if (message.type === 'SAVE_VC_DIRECT') {
    // 수동 VC 추가에서 직접 저장 요청이 온 경우 (팝업 열지 않음)
    handleSaveVCDirect(message, sender, sendResponse);
    return true; // 비동기 응답을 위해 true 반환
  } else if (message.type === 'DELETE_VC') {
    // VC 삭제 요청이 온 경우
    handleDeleteVC(message, sender, sendResponse);
    return true; // 비동기 응답을 위해 true 반환
  }
});

// 주소 요청 처리 함수
async function handleAddressRequest(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
  try {
    
    // 주소 요청 정보를 storage에 저장
    await chrome.storage.local.set({
      pendingAddressRequest: {
        origin: message.origin,
        timestamp: Date.now()
      }
    });
    
    // 확장프로그램 팝업을 열어서 사용자에게 연결 승인을 요청
    try {
      await chrome.action.openPopup();
    } catch (error) {
      await chrome.storage.local.remove(['pendingAddressRequest']);
      sendResponse({
        success: false,
        error: '확장프로그램 팝업을 열 수 없습니다'
      });
      return;
    }

    // 팝업에서 응답을 기다림
    const handlePopupMessage = (popupMessage: any, popupSender: chrome.runtime.MessageSender) => {
      if (popupMessage.type === 'ADDRESS_REQUEST_RESPONSE') {
        chrome.runtime.onMessage.removeListener(handlePopupMessage);
        
        // pending address request 정보 제거
        chrome.storage.local.remove(['pendingAddressRequest']);
        
        sendResponse({
          success: popupMessage.success,
          address: popupMessage.address,
          error: popupMessage.error
        });
      }
    };

    chrome.runtime.onMessage.addListener(handlePopupMessage);

    // 타임아웃 설정 (30초)
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handlePopupMessage);
      chrome.storage.local.remove(['pendingAddressRequest']);
      sendResponse({
        success: false,
        error: '사용자 응답 시간 초과'
      });
    }, 30000);

  } catch (error: any) {
    sendResponse({
      success: false,
      error: error.message || '지갑 연결 실패'
    });
  }
}

// VC 발급 승인 처리 함수
async function handleVCIssuanceRequest(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
  try {
    
    // 기존 VC 목록 가져오기
    const result = await chrome.storage.local.get(['savedVCs']);
    const savedVCs = result.savedVCs || [];
    
    // 중복 VC 체크
    const duplicateVC = checkDuplicateVC(message.vc, savedVCs);
    
    // VC 발급 요청 정보를 storage에 저장
    await chrome.storage.local.set({
      pendingVCIssuance: {
        vc: message.vc,
        student: message.student,
        origin: message.origin,
        isDuplicate: !!duplicateVC,
        duplicateId: duplicateVC?.id || null,
        timestamp: Date.now()
      }
    });

    // 확장프로그램 팝업을 열어서 사용자에게 VC 발급 승인을 요청
    try {
      await chrome.action.openPopup();
    } catch (error) {
      sendResponse({
        approved: false,
        error: '확장프로그램 팝업을 열 수 없습니다'
      });
      return;
    }

    // 팝업에서 응답을 기다림
    const handlePopupMessage = (popupMessage: any, popupSender: chrome.runtime.MessageSender) => {
      if (popupMessage.type === 'VC_ISSUANCE_RESPONSE') {
        chrome.runtime.onMessage.removeListener(handlePopupMessage);
        
        // pending VC issuance 정보 제거
        chrome.storage.local.remove(['pendingVCIssuance']);
        
        sendResponse({
          approved: popupMessage.approved,
          error: popupMessage.error
        });
      }
    };

    chrome.runtime.onMessage.addListener(handlePopupMessage);

    // 타임아웃 설정 (30초)
    setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handlePopupMessage);
      chrome.storage.local.remove(['pendingVCIssuance']);
      sendResponse({
        approved: false,
        error: '사용자 응답 시간 초과'
      });
    }, 30000);

  } catch (error: any) {
    sendResponse({
      approved: false,
      error: error.message || 'VC 발급 승인 실패'
    });
  }
}

// VC 중복 체크 함수 (발급자, 소유자, 타입 기준)
function checkDuplicateVC(newVC: any, savedVCs: any[]): any | null {
  for (const savedVC of savedVCs) {
    // 1. 발급자 비교 (issuer ID 또는 public key)
    const newIssuer = newVC.issuer?.id || newVC.issuer;
    const savedIssuer = savedVC.issuer?.id || savedVC.issuer;
    
    // 2. 소유자 비교 (credentialSubject의 식별자)
    const newSubject = newVC.credentialSubject?.id || 
                      newVC.credentialSubject?.name || 
                      newVC.credentialSubject?.studentName;
    const savedSubject = savedVC.credentialSubject?.id || 
                        savedVC.credentialSubject?.name || 
                        savedVC.credentialSubject?.studentName;
    
    // 3. VC 타입 비교 (VerifiableCredential 제외한 실제 타입)
    const newVCType = newVC.type?.find((t: string) => t !== 'VerifiableCredential');
    const savedVCType = savedVC.type?.find((t: string) => t !== 'VerifiableCredential');
    
    // 세 조건이 모두 일치하면 중복으로 판단
    if (newIssuer && savedIssuer && newIssuer === savedIssuer &&
        newSubject && savedSubject && newSubject === savedSubject &&
        newVCType && savedVCType && newVCType === savedVCType) {
      
      console.log('🔄 중복 VC 발견 - 덮어쓰기 대상:', {
        issuer: newIssuer,
        subject: newSubject,
        type: newVCType,
        existingId: savedVC.id
      });
      return savedVC;
    }
  }
  return null;
}

// Verification Method에서 public key 추출
function extractPublicKeyFromVerificationMethod(verificationMethod: string): string | null {
  if (!verificationMethod) return null;
  
  // did:key:z6Mk... 형태에서 public key 부분 추출
  const match = verificationMethod.match(/did:key:([^#]+)/);
  return match ? match[1] : null;
}

// DID에서 지갑 주소 추출
function extractAddressFromDID(did: string): string | null {
  try {
    // did:ethr:0x... 형태에서 주소 추출
    const ethrMatch = did.match(/did:ethr:([^#]+)/);
    if (ethrMatch) {
      return ethrMatch[1];
    }
    
    // did:key:z6Mk... 형태에서 주소 추출 (다른 DID 형식들)
    const keyMatch = did.match(/did:key:([^#]+)/);
    if (keyMatch) {
      // did:key 형식에서는 주소 추출이 복잡하므로 일단 null 반환
      // 실제로는 더 복잡한 디코딩이 필요할 수 있음
      return null;
    }
    
    // 기타 DID 형식들
    const otherMatch = did.match(/did:([^:]+):([^#]+)/);
    if (otherMatch) {
      // did:method:identifier 형태에서 identifier가 주소일 수 있음
      const identifier = otherMatch[2];
      if (identifier.startsWith('0x') && identifier.length === 42) {
        return identifier;
      }
    }
    
    return null;
  } catch (error) {
    console.error('DID에서 주소 추출 실패:', error);
    return null;
  }
}

// VC 저장 처리 함수 (중복 체크 후 사용자 확인)
async function handleSaveVC(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
  try {
    
    // VC 서명 검증 (간단한 버전)
    const verificationResult = await verifyVC(message.vc);
    if (!verificationResult.isValid) {
      sendResponse({
        success: false,
        error: `VC 검증 실패: ${verificationResult.errors.join(', ')}`
      });
      return;
    }
    
    
    // 기존 VC 목록 가져오기
    const result = await chrome.storage.local.get(['savedVCs']);
    const savedVCs = result.savedVCs || [];
    
    // 중복 VC 체크
    const duplicateVC = checkDuplicateVC(message.vc, savedVCs);
    
    if (duplicateVC) {
      // 중복된 VC가 있으면 사용자에게 확인 요청
      
      // VC 저장 요청 정보를 storage에 저장 (단순화)
      const pendingData = {
        vc: message.vc,
        origin: message.origin || 'manual-import',
        isDuplicate: true,
        duplicateId: duplicateVC.id,
        duplicateVC: duplicateVC,
        verificationResult,
        timestamp: Date.now()
      };
      
      await chrome.storage.local.set({
        pendingVCSave: pendingData
      });
      

      // 팝업 열기만 하고 응답은 기다리지 않음
      try {
        await chrome.action.openPopup();
        sendResponse({
          success: true,
          message: '팝업에서 확인해주세요'
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: '확장프로그램 팝업을 열 수 없습니다'
        });
      }
      
    } else {
      // 중복이 없으면 바로 저장
      await saveVCToStorage(message.vc, message.origin, null, verificationResult, sendResponse);
    }
    
  } catch (error: any) {
    sendResponse({
      success: false,
      error: error.message || 'VC 저장 실패'
    });
  }
}

// 실제 VC 저장 함수
async function saveVCToStorage(vc: any, origin: string, duplicateVC: any, verificationResult: any, sendResponse: (response: any) => void) {
  try {
    
    // 기존 VC 목록 가져오기
    const result = await chrome.storage.local.get(['savedVCs']);
    const savedVCs = result.savedVCs || [];
    
    let savedVC;
    
    if (duplicateVC) {
      // 중복된 VC가 있으면 덮어쓰기
      
      savedVC = {
        ...vc,
        id: duplicateVC.id, // 기존 ID 유지
        savedAt: new Date().toISOString(),
        origin: origin,
        previousSavedAt: duplicateVC.savedAt, // 이전 저장 시간 보존
        verificationResult // 검증 결과 저장
      };
      
      // 기존 VC를 새 VC로 교체
      const index = savedVCs.findIndex((vc: any) => vc.id === duplicateVC.id);
      if (index !== -1) {
        savedVCs[index] = savedVC;
      }
    } else {
      // 새로운 VC 추가
      const newId = Date.now().toString();
      
      savedVC = {
        ...vc,
        id: newId, // 고유 ID 생성
        savedAt: new Date().toISOString(),
        origin: origin,
        verificationResult // 검증 결과 저장
      };
      
      savedVCs.push(savedVC);
    }
    
    // 저장
    await chrome.storage.local.set({ savedVCs });
    
    
    if (duplicateVC) {
    } else {
    }
    
    // 팝업에 VC 저장 완료 알림 전송
    try {
      chrome.runtime.sendMessage({
        type: 'VC_SAVED',
        vcId: savedVC.id,
        isDuplicate: !!duplicateVC
      });
    } catch (error) {
    }
    
    sendResponse({
      success: true,
      vcId: savedVC.id
    });
    
  } catch (error: any) {
    sendResponse({
      success: false,
      error: error.message || 'VC 저장 실패'
    });
  }
}


// VC 직접 저장 처리 함수 (팝업 열지 않음)
async function handleSaveVCDirect(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
  try {
    
    // VC 서명 검증 (간단한 버전)
    const verificationResult = await verifyVC(message.vc, message.currentWalletAddress);
    if (!verificationResult.isValid) {
      sendResponse({
        success: false,
        error: `VC 검증 실패: ${verificationResult.errors.join(', ')}`
      });
      return;
    }
    
    
    // 기존 VC 목록 가져오기
    const result = await chrome.storage.local.get(['savedVCs']);
    const savedVCs = result.savedVCs || [];
    
    // 중복 VC 체크
    const duplicateVC = checkDuplicateVC(message.vc, savedVCs);
    
    let savedVC;
    
    if (duplicateVC) {
      // 중복된 VC가 있으면 덮어쓰기
      console.log('🔄 [Background] 중복된 VC 덮어쓰기:', duplicateVC.id);
      
      savedVC = {
        ...message.vc,
        id: duplicateVC.id, // 기존 ID 유지
        savedAt: new Date().toISOString(),
        origin: message.origin,
        previousSavedAt: duplicateVC.savedAt, // 이전 저장 시간 보존
        verificationResult // 검증 결과 저장
      };
      
      // 기존 VC를 새 VC로 교체
      const index = savedVCs.findIndex((vc: any) => vc.id === duplicateVC.id);
      if (index !== -1) {
        savedVCs[index] = savedVC;
      }
    } else {
      // 새로운 VC 추가
      savedVC = {
        ...message.vc,
        id: Date.now().toString(), // 고유 ID 생성
        savedAt: new Date().toISOString(),
        origin: message.origin,
        verificationResult // 검증 결과 저장
      };
      
      savedVCs.push(savedVC);
    }
    
    // 저장
    await chrome.storage.local.set({ savedVCs });
    
    if (duplicateVC) {
      console.log('✅ [Background] VC 덮어쓰기 완료:', {
        vcId: savedVC.id,
        issuer: message.vc.issuer?.id || message.vc.issuer,
        subject: message.vc.credentialSubject?.name || message.vc.credentialSubject?.studentName,
        type: message.vc.type?.find((t: string) => t !== 'VerifiableCredential')
      });
    } else {
      console.log('✅ [Background] 새 VC 저장 완료:', {
        vcId: savedVC.id,
        issuer: message.vc.issuer?.id || message.vc.issuer,
        subject: message.vc.credentialSubject?.name || message.vc.credentialSubject?.studentName,
        type: message.vc.type?.find((t: string) => t !== 'VerifiableCredential')
      });
    }
    
    // 팝업에 VC 저장 완료 알림 전송
    try {
      chrome.runtime.sendMessage({
        type: 'VC_SAVED',
        vcId: savedVC.id,
        isDuplicate: !!duplicateVC
      });
    } catch (error) {
      console.log('⚠️ 팝업에 VC 저장 알림 전송 실패 (팝업이 열려있지 않을 수 있음):', error);
    }
    
    sendResponse({
      success: true,
      vcId: savedVC.id
    });
    
  } catch (error: any) {
    console.log('❌ [Background] VC 직접 저장 오류:', error);
    sendResponse({
      success: false,
      error: error.message || 'VC 저장 실패'
    });
  }
}

// VC 삭제 처리 함수
async function handleDeleteVC(message: any, sender: chrome.runtime.MessageSender, sendResponse: (response: any) => void) {
  try {
    console.log('🗑️ [Background] VC 삭제 처리 시작...');
    
    const { vcId } = message;
    if (!vcId) {
      sendResponse({
        success: false,
        error: 'VC ID가 필요합니다'
      });
      return;
    }
    
    // 기존 VC 목록 가져오기
    const result = await chrome.storage.local.get(['savedVCs']);
    const savedVCs = result.savedVCs || [];
    
    // VC 찾기
    const vcIndex = savedVCs.findIndex((vc: any) => vc.id === vcId);
    if (vcIndex === -1) {
      sendResponse({
        success: false,
        error: '삭제할 VC를 찾을 수 없습니다'
      });
      return;
    }
    
    // VC 삭제
    const deletedVC = savedVCs[vcIndex];
    savedVCs.splice(vcIndex, 1);
    
    // 저장
    await chrome.storage.local.set({ savedVCs });
    
    console.log('✅ [Background] VC 삭제 완료:', {
      vcId: vcId,
      issuer: deletedVC.issuer?.id || deletedVC.issuer,
      subject: deletedVC.credentialSubject?.name || deletedVC.credentialSubject?.studentName,
      type: deletedVC.type?.find((t: string) => t !== 'VerifiableCredential')
    });
    
    sendResponse({
      success: true,
      vcId: vcId
    });
    
  } catch (error: any) {
    console.log('❌ [Background] VC 삭제 오류:', error);
    sendResponse({
      success: false,
      error: error.message || 'VC 삭제 실패'
    });
  }
}

// Initialize timer when extension loads
chrome.storage.local.get(['walletLocked'], (result) => {
  if (!result.walletLocked) {
    resetLockTimer();
  }
});

console.log('Background loaded');
console.log("Edit 'chrome-extension/src/background/index.ts' and save to reload.");
