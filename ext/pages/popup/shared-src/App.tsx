import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import './styles/network.css';

// Chrome Extension API 타입 선언
declare global {
  const chrome: {
    storage: {
      local: {
        get: (keys: string | string[] | null) => Promise<{ [key: string]: any }>;
        set: (items: { [key: string]: any }) => Promise<void>;
        remove: (keys: string | string[]) => Promise<void>;
        clear: () => Promise<void>;
      };
    };
    runtime: {
      sendMessage: (message: any) => Promise<any>;
      onMessage: {
        addListener: (callback: (message: any, sender: any, sendResponse: any) => void) => void;
        removeListener: (callback: (message: any, sender: any, sendResponse: any) => void) => void;
      };
      id: string;
      lastError?: { message: string };
    };
    action: {
      openPopup: () => Promise<void>;
    };
    tabs?: {
      query: (queryInfo: any) => Promise<any[]>;
      sendMessage: (tabId: number, message: any) => Promise<any>;
    };
  };
}
import { createAndStoreWallet, getAddress, getProvider, importWalletFromMnemonic, importWalletFromPrivateKey, initDevWallet, isUnlocked, lockWallet, resetStoredState, unlockWithPassword, clearAllStorageData, hasEncryptedKeystore } from './lib/wallet';
import { hdWalletService } from './lib/hdWalletService';
import { isDevModeEnabled } from './config/dev.config';
import { STORAGE_KEYS } from './config/storage';
import { APP_CONFIG } from './config/app.config';
import { storageAdapter } from './lib/storageAdapter';
import { NetworkSelector } from './components/NetworkSelector';
import { NetworkConfig } from './types/network';
import { toastManager } from './utils/toast';
import { networkService } from './lib/networkService';
import { AddressRequestModal } from './components/AddressRequestModal';
import { SensitiveInput, SensitiveTextarea } from './components/SensitiveField';
import { AccountSelector } from './components/AccountSelector';
import { AccountManager } from './components/AccountManager';
import { WalletAccount } from './types/hdWallet';
import { VCModal } from './components/VCModal';
import { VCIssuanceModal } from './components/VCIssuanceModal';
import { AddVCModal } from './components/AddVCModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { VerifiableCredential } from './types/vc';
import { verifyVC } from './lib/vcVerification';

// Type reference for Electron API
/// <reference path="./types/electron.d.ts" />

interface AppProps {
  platform?: 'desktop' | 'extension';
  extensionActions?: React.ReactNode;
  onThemeChange?: (theme: 'light' | 'dark') => void;
}

const AppContent = ({ platform = 'desktop', extensionActions, onThemeChange }: AppProps) => {
  
  const getInitialTheme = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.theme);
      if (saved === 'light' || saved === 'dark') return saved as 'light' | 'dark';
      if (APP_CONFIG.defaults.theme === 'system' && typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return APP_CONFIG.defaults.theme === 'system' ? 'light' : APP_CONFIG.defaults.theme;
    } catch { return 'light'; }
  };

  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  // 마지막으로 열었던 탭을 localStorage에서 복원
  const getInitialTab = (): 'tokens' | 'vc' | 'nft' | 'activity' => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.lastActiveTab);
      if (saved === 'tokens' || saved === 'vc' || saved === 'nft' || saved === 'activity') return saved as any;
    } catch {}
    return APP_CONFIG.defaults.lastActiveTab;
  };

  const [activeTab, setActiveTab] = useState<'tokens' | 'vc' | 'nft' | 'activity'>(getInitialTab);
  const [currentNetwork, setCurrentNetwork] = useState<NetworkConfig | null>(null);
  const [networksInitialized, setNetworksInitialized] = useState(false);
  const [unlocked, setUnlocked] = useState<boolean>(isUnlocked());
  const [address, setAddress] = useState<string | undefined>(getAddress());
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [showMenu, setShowMenu] = useState(false);
  const [forceCloseDropdowns, setForceCloseDropdowns] = useState(false);
  const [savedVCs, setSavedVCs] = useState<VerifiableCredential[]>([]);
  const [selectedVC, setSelectedVC] = useState<VerifiableCredential | null>(null);
  const [vcIssuanceRequest, setVcIssuanceRequest] = useState<{
    vc: VerifiableCredential;
    student: any;
    origin: string;
    isDuplicate: boolean;
    duplicateId?: string;
  } | null>(null);
  const [vcSaveRequest, setVcSaveRequest] = useState<{
    vc: VerifiableCredential;
    origin: string;
    isDuplicate: boolean;
    duplicateId?: string;
    duplicateVC?: VerifiableCredential;
  } | null>(null);
  const [showAddVCModal, setShowAddVCModal] = useState(false);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    vcId: string;
    vcName: string;
  }>({
    isOpen: false,
    vcId: '',
    vcName: ''
  });
  
  // HD Wallet states
  const [activeAccount, setActiveAccount] = useState<WalletAccount | null>(null);
  const [showAccountManager, setShowAccountManager] = useState(false);
  const [addressRequest, setAddressRequest] = useState<{
    origin: string;
  } | null>(null);
  type WizardStep = 'login' | 'setPassword' | 'chooseAddr' | 'connect';
  const [step, setStep] = useState<WizardStep>('setPassword'); // 기본값으로 설정, useEffect에서 실제 상태 확인
  const [stepHistory, setStepHistory] = useState<WizardStep[]>([]);

  const goToStep = (next: WizardStep) => {
    setStepHistory((h: WizardStep[]) => (step ? [...h, step] : h));
    setStep(next);
  };

  const goBack = () => {
    setStepHistory((h: WizardStep[]) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setStep(prev);
      return h.slice(0, -1);
    });
  };
  const [addressMode, setAddressMode] = useState<'create' | 'reuse'>('create');
  const [importMode, setImportMode] = useState<'mnemonic' | 'privateKey'>('mnemonic');
  const [mnemonic, setMnemonic] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [showDataResetConfirm, setShowDataResetConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastVisible, setToastVisible] = useState(false);
  const [showAddressRequest, setShowAddressRequest] = useState(false);
  const [requestOrigin, setRequestOrigin] = useState<string>('');
  const idleTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const IDLE_LOCK_MS = 5 * 60 * 1000; // 5 minutes
  const TOAST_DURATION_MS = 5000; // 5 seconds

  useEffect(() => {
    (async () => {
      try { await storageAdapter.set(STORAGE_KEYS.theme, theme); } catch {}
      onThemeChange?.(theme);
    })();
  }, [theme, onThemeChange]);

  // activeTab 변경 시 localStorage에 저장
  useEffect(() => {
    (async () => { try { await storageAdapter.set(STORAGE_KEYS.lastActiveTab, activeTab); } catch {} })();
  }, [activeTab]);

  // Detect standalone mode (when opened directly in browser)
  useEffect(() => {
    const isStandalone = window.location.protocol === 'chrome-extension:' && 
                        !window.location.search.includes('popup=true') &&
                        window.parent === window; // not in iframe
    
    if (isStandalone) {
      document.body.classList.add('standalone');
    } else {
      document.body.classList.remove('standalone');
    }
  }, []);
  // 토스트 매니저 연결
  useEffect(() => {
    const unsubscribe = toastManager.addListener((message: string) => {
      setToast(message);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // 백그라운드에서 VC 저장 알림 받기
  useEffect(() => {
    if (platform === 'extension') {
      const handleBackgroundMessage = (message: any) => {
        if (message.type === 'VC_SAVED') {
          // VC 목록 새로고침
          loadSavedVCs();
          
          // 토스트 메시지 표시
          if (message.isDuplicate) {
            toastManager.show('기존 VC가 새 VC로 갱신되었습니다');
          } else {
            toastManager.show('새 VC가 성공적으로 추가되었습니다');
          }
        }
      };

      chrome.runtime.onMessage.addListener(handleBackgroundMessage);
      
      return () => {
        chrome.runtime.onMessage.removeListener(handleBackgroundMessage);
      };
    }
  }, [platform]);

  // Load saved VCs function
  const loadSavedVCs = useCallback(async () => {
    try {
      if (platform === 'extension') {
        const result = await chrome.storage.local.get(['savedVCs']);
        const vcs = result.savedVCs || [];
        setSavedVCs(vcs);
      } else {
        // Desktop: localStorage 사용
        const savedVCsJson = localStorage.getItem('savedVCs');
        const vcs = savedVCsJson ? JSON.parse(savedVCsJson) : [];
        setSavedVCs(vcs);
      }
    } catch (error) {
      console.error('VC 로드 실패:', error);
    }
  }, [platform]);

  // Load saved VCs on mount
  useEffect(() => {
    loadSavedVCs();
  }, [loadSavedVCs]);

  // Handle pending requests from storage
  useEffect(() => {
    if (platform === 'extension') {
      const checkPendingRequests = async () => {
        try {
          const result = await chrome.storage.local.get(['pendingVCIssuance', 'pendingVCSave', 'pendingAddressRequest']);
          
          // VC 발급 요청 확인
          const pendingVCIssuance = result.pendingVCIssuance;
          if (pendingVCIssuance) {
            const now = Date.now();
            const requestAge = now - pendingVCIssuance.timestamp;
            
            if (requestAge < 5 * 60 * 1000) { // 5분
              setVcIssuanceRequest({
                vc: pendingVCIssuance.vc,
                student: pendingVCIssuance.student,
                origin: pendingVCIssuance.origin,
                isDuplicate: pendingVCIssuance.isDuplicate,
                duplicateId: pendingVCIssuance.duplicateId
              });
              
            } else {
              await chrome.storage.local.remove(['pendingVCIssuance']);
            }
          }
          
          // VC 저장 요청 확인 (근본적 해결)
          const pendingVCSave = result.pendingVCSave;
          if (pendingVCSave) {
            const now = Date.now();
            const requestAge = now - pendingVCSave.timestamp;
            
            if (requestAge < 5 * 60 * 1000) { // 5분
              // 모달 표시
              setVcSaveRequest({
                vc: pendingVCSave.vc,
                origin: pendingVCSave.origin,
                isDuplicate: pendingVCSave.isDuplicate,
                duplicateId: pendingVCSave.duplicateId,
                duplicateVC: pendingVCSave.duplicateVC
              });
              
              
              // 즉시 pendingVCSave 제거 (중복 표시 방지)
              await chrome.storage.local.remove(['pendingVCSave']);
            } else {
              await chrome.storage.local.remove(['pendingVCSave']);
            }
          }
          
          // 주소 요청 확인
          const pendingAddressRequest = result.pendingAddressRequest;
          if (pendingAddressRequest) {
            const now = Date.now();
            const requestAge = now - pendingAddressRequest.timestamp;
            
            if (requestAge < 5 * 60 * 1000) { // 5분
              setAddressRequest({
                origin: pendingAddressRequest.origin
              });
              
            } else {
              await chrome.storage.local.remove(['pendingAddressRequest']);
            }
          }
        } catch (error) {
          console.error('대기 중인 요청 확인 실패:', error);
        }
      };
      
      checkPendingRequests();
    }
  }, [platform]);

  // VC 발급 승인/거절 핸들러
  const handleVCIssuanceApprove = async () => {
    if (!vcIssuanceRequest) return;
    
    try {
      // 백그라운드에 승인 응답 전송
      await chrome.runtime.sendMessage({
        type: 'VC_ISSUANCE_RESPONSE',
        approved: true
      });
      
      // VC 목록 새로고침
      if (platform === 'extension') {
        const result = await chrome.storage.local.get(['savedVCs']);
        setSavedVCs(result.savedVCs || []);
      } else {
        const savedVCsJson = localStorage.getItem('savedVCs');
        const vcs = savedVCsJson ? JSON.parse(savedVCsJson) : [];
        setSavedVCs(vcs);
      }
      
      setVcIssuanceRequest(null);
    } catch (error) {
      console.error('VC 발급 승인 실패:', error);
    }
  };

  const handleVCIssuanceReject = async () => {
    if (!vcIssuanceRequest) return;
    
    try {
      // 백그라운드에 거절 응답 전송
      await chrome.runtime.sendMessage({
        type: 'VC_ISSUANCE_RESPONSE',
        approved: false,
        error: '사용자가 거절했습니다'
      });
      
      setVcIssuanceRequest(null);
    } catch (error) {
      console.error('VC 발급 거절 실패:', error);
    }
  };

  // VC 저장 승인/거절 핸들러
  const handleVCSaveApprove = async () => {
    if (!vcSaveRequest) return;
    
    try {
      // 직접 VC 저장 (백그라운드 통신 없이)
      await saveVC(vcSaveRequest.vc, vcSaveRequest.origin);
      
      // pendingVCSave는 이미 팝업 시작 시 제거되었으므로 제거하지 않음
      setVcSaveRequest(null);
    } catch (error) {
      console.error('VC 저장 승인 실패:', error);
    }
  };

  const handleVCSaveReject = async () => {
    if (!vcSaveRequest) return;
    
    try {
      // pendingVCSave는 이미 팝업 시작 시 제거되었으므로 제거하지 않음
      setVcSaveRequest(null);
    } catch (error) {
      console.error('VC 저장 거절 실패:', error);
    }
  };

  // 수동 VC 추가 핸들러
  const handleAddVC = async (vc: VerifiableCredential) => {
    try {
      // 모든 플랫폼에서 동일한 처리: VC 검증 후 중복 체크
      const verification = await verifyVC(vc, address);
      
      if (!verification.isValid) {
        toastManager.show(`VC 검증 실패: ${verification.errors.join(', ')}`);
        return;
      }

      // 중복 VC 체크
      const duplicateVC = checkDuplicateVC(vc, savedVCs);
      
      if (duplicateVC) {
        // 중복된 VC가 있으면 사용자에게 확인 요청
        setVcSaveRequest({
          vc: vc,
          origin: 'manual-import',
          isDuplicate: true,
          duplicateId: duplicateVC.id,
          duplicateVC: duplicateVC
        });
        setShowAddVCModal(false);
      } else {
        // 중복이 없으면 바로 저장
        await saveVC(vc, 'manual-import');
        setShowAddVCModal(false);
      }
    } catch (error: any) {
      console.error('VC 추가 실패:', error);
      toastManager.show(`VC 추가 실패: ${error.message}`);
    }
  };

  // VC 저장 함수 (플랫폼별 처리)
  const saveVC = async (vc: VerifiableCredential, origin: string) => {
    if (platform === 'extension') {
      // Extension: 백그라운드 스크립트를 통해 저장
      const response = await chrome.runtime.sendMessage({
        type: 'SAVE_VC_DIRECT',
        vc: vc,
        origin: origin,
        currentWalletAddress: address
      });
      
      if (response && response.success) {
        // 백그라운드에서 VC_SAVED 알림이 올 때까지 대기
        // VC 목록 새로고침은 백그라운드 알림에서 처리됨
      } else {
        toastManager.show(`VC 추가 실패: ${response?.error || '알 수 없는 오류'}`);
      }
    } else {
      // Desktop: 직접 저장
      const duplicateVC = checkDuplicateVC(vc, savedVCs);
      
      if (duplicateVC) {
        // 중복된 VC가 있으면 덮어쓰기
        const updatedVC = {
          ...vc,
          id: duplicateVC.id,
          savedAt: new Date().toISOString(),
          origin: origin,
          previousSavedAt: duplicateVC.savedAt
        };
        
        const updatedVCs = savedVCs.map((savedVC: VerifiableCredential) => 
          savedVC.id === duplicateVC.id ? updatedVC : savedVC
        );
        
        setSavedVCs(updatedVCs);
        // localStorage에 저장
        localStorage.setItem('savedVCs', JSON.stringify(updatedVCs));
        toastManager.show('기존 VC가 새 VC로 덮어쓰기되었습니다');
      } else {
        // 새로운 VC 추가
        const newVC = {
          ...vc,
          id: Date.now().toString(),
          savedAt: new Date().toISOString(),
          origin: origin
        };
        
        const updatedVCs = [...savedVCs, newVC];
        setSavedVCs(updatedVCs);
        // localStorage에 저장
        localStorage.setItem('savedVCs', JSON.stringify(updatedVCs));
        toastManager.show('VC가 성공적으로 추가되었습니다');
      }
    }
  };

  // 중복 VC 체크 함수 (Desktop용)
  const checkDuplicateVC = (newVC: VerifiableCredential, savedVCs: VerifiableCredential[]): VerifiableCredential | null => {
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
        return savedVC;
      }
    }
    return null;
  };

  // VC 삭제 핸들러
  const handleDeleteVC = async (vcId: string) => {
    try {
      if (platform === 'extension') {
        // Extension: 백그라운드 스크립트에 삭제 요청
        const response = await chrome.runtime.sendMessage({
          type: 'DELETE_VC',
          vcId: vcId
        });
        
        if (response && response.success) {
          // VC 목록 새로고침
          const result = await chrome.storage.local.get(['savedVCs']);
          setSavedVCs(result.savedVCs || []);
          toastManager.show('VC가 삭제되었습니다');
        } else {
          toastManager.show(`VC 삭제 실패: ${response?.error || '알 수 없는 오류'}`);
        }
      } else {
        // Desktop: 직접 삭제
        const updatedVCs = savedVCs.filter((vc: VerifiableCredential) => vc.id !== vcId);
        setSavedVCs(updatedVCs);
        // localStorage에 저장
        localStorage.setItem('savedVCs', JSON.stringify(updatedVCs));
        toastManager.show('VC가 삭제되었습니다');
      }
    } catch (error: any) {
      console.error('VC 삭제 실패:', error);
      toastManager.show(`VC 삭제 실패: ${error.message}`);
    }
  };

  // VC 삭제 확인 모달 핸들러
  const handleDeleteConfirm = (vcId: string, vcName: string) => {
    setDeleteConfirmModal({
      isOpen: true,
      vcId: vcId,
      vcName: vcName
    });
  };

  const handleDeleteConfirmApprove = async () => {
    if (deleteConfirmModal.vcId) {
      await handleDeleteVC(deleteConfirmModal.vcId);
    }
    setDeleteConfirmModal({
      isOpen: false,
      vcId: '',
      vcName: ''
    });
  };

  const handleDeleteConfirmCancel = () => {
    setDeleteConfirmModal({
      isOpen: false,
      vcId: '',
      vcName: ''
    });
  };

  // Toast management
  useEffect(() => {
    if (toast) {
      setToastVisible(true);
      
      // Clear any existing timer
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
      
      // Set timer to fade out after duration
      toastTimerRef.current = window.setTimeout(() => {
        setToastVisible(false);
        
        // Remove toast after fade animation completes (300ms)
        setTimeout(() => {
          setToast(null);
        }, 300);
      }, TOAST_DURATION_MS);
    }
    
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [toast, TOAST_DURATION_MS]);

  // Initialize app state from LevelDB
  useEffect(() => {
    (async () => {
      await networkService.init();
      const currentNet = networkService.getCurrentNetwork();
      if (currentNet) {
        setCurrentNetwork(currentNet);
      }
      setNetworksInitialized(true);
      
      // Initialize HD wallet
      await hdWalletService.loadState();
      const currentAccount = hdWalletService.getActiveAccount();
      if (currentAccount) {
        setActiveAccount(currentAccount);
      }
      
      // Check if wallet exists to determine initial step
      const hasKeystore = await hasEncryptedKeystore();
      if (hasKeystore) {
        setStep('login');
      } else {
        setStep('setPassword');
      }
    })();
  }, []);

  // Step 전환 시 에러 초기화 (뒤로가기/탭 이동 시 잔여 에러 제거)
  useEffect(() => {
    setError(undefined);
  }, [step]);

  const formatUnlockError = (e: any): string => {
    const msg = (e && (e.message || e.toString()))?.toLowerCase?.() || '';
    if (msg.includes('keystore not found')) return '등록된 지갑이 없습니다. 먼저 지갑을 등록하세요.';
    if (msg.includes('invalid password') || msg.includes('incorrect password') || msg.includes('bad decrypt')) return '비밀번호가 올바르지 않습니다. 다시 시도해 주세요.';
    if (msg.includes('timeout')) return '네트워크 지연으로 잠금 해제에 실패했습니다. 잠시 후 다시 시도해 주세요.';
    return '잠금 해제에 실패했습니다. 비밀번호를 확인하고 다시 시도해 주세요.';
  };

  // Check for address request from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const requestAddress = urlParams.get('requestAddress');
    const origin = urlParams.get('origin');
    
    
    if (requestAddress === 'true' && origin) {
      setRequestOrigin(decodeURIComponent(origin));
      setShowAddressRequest(true);
    }
  }, []);

  // Initialize dev wallet on mount
  useEffect(() => {
    if (isDevModeEnabled()) {
      initDevWallet().then((initialized) => {
        if (initialized) {
          setUnlocked(true);
          setAddress(getAddress());
          // setSelectedNet('sepolia'); // Default to sepolia
        }
      }).catch((error) => {
        console.error('Dev wallet initialization failed:', error);
        setError(`개발 모드 초기화 실패: ${error.message}`);
        setUnlocked(false);
        // Force user to go through normal setup
      });
    }
  }, []);

  // 개발자 도구에서 사용할 수 있도록 전역 함수 등록
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__DID_WALLET_DEBUG__ = {
        clearAllStorageData,
        resetStoredState,
        hasEncryptedKeystore,
        getStorageInfo: async () => {
          try {
            const allData = await storageAdapter.getAll();
            console.log('All storage data:', allData);
            return allData;
          } catch (error) {
            console.error('Failed to get storage info:', error);
            return null;
          }
        },
        getHDWalletData: async () => {
          try {
            const hdData = await storageAdapter.get(STORAGE_KEYS.hdWalletState);
            console.log('HD Wallet data:', hdData);
            return hdData;
          } catch (error) {
            console.error('Failed to get HD wallet data:', error);
            return null;
          }
        },
        getChromeStorage: async () => {
          if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            return new Promise((resolve) => {
              chrome.storage.local.get(null, (result) => {
                console.log('Chrome storage data:', result);
                resolve(result);
              });
            });
          }
          return null;
        }
      };
    }
  }, []);

  const toggleTheme = () => setTheme((prev: 'light' | 'dark') => (prev === 'light' ? 'dark' : 'light'));

  const appClassName = useMemo(() => `app app--${platform} theme--${theme}`, [platform, theme]);

  // Background auto-lock integration
  useEffect(() => {
    if (platform === 'extension') {
      // Send user activity to background script
      const sendActivity = () => {
        if (unlocked && typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.sendMessage({ type: 'USER_ACTIVITY' }).catch(() => {
            // Ignore errors if background script is not available
          });
        }
      };

      const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
      events.forEach((e) => window.addEventListener(e, sendActivity, { passive: true }));

      // Listen for lock messages from background
      const handleMessage = (message: any) => {
        if (message.type === 'WALLET_LOCKED') {
          lockWallet();
          setUnlocked(false);
          setShowMenu(false); // Close menu dropdown
          setForceCloseDropdowns((prev: boolean) => !prev); // Force close all dropdowns
        }
      };

      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.onMessage.addListener(handleMessage);
      }

      return () => {
        events.forEach((e) => window.removeEventListener(e, sendActivity));
        if (typeof chrome !== 'undefined' && chrome.runtime) {
          chrome.runtime.onMessage.removeListener(handleMessage);
        }
      };
    } else {
      // Desktop app - use local timer
      const resetTimer = () => {
        if (!unlocked) return;
        if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
        idleTimerRef.current = window.setTimeout(() => {
          lockWallet();
          setUnlocked(false);
          setShowMenu(false); // Close menu dropdown
          setForceCloseDropdowns((prev: boolean) => !prev); // Force close all dropdowns
        }, IDLE_LOCK_MS);
      };
      const events: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
      events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
      resetTimer();
      return () => {
        if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
        events.forEach((e) => window.removeEventListener(e, resetTimer));
      };
    }
  }, [unlocked, platform]);

  const handleUnlock = async () => {
    setError(undefined);
    try {
      if (step === 'login') {
        const addr = await unlockWithPassword(password);
        setAddress(addr);
        setUnlocked(true);
      } else if (step === 'setPassword') {
        if (!password || password !== confirm) {
          setError('비밀번호가 일치하지 않습니다.');
          return;
        }
        if (password.length < 8) {
          setError('비밀번호는 최소 8글자 이상이어야 합니다.');
          return;
        }
        resetStoredState();
        // setIsFirstRun(false);
        goToStep('chooseAddr');
        return;
      } else if (step === 'chooseAddr') {
        if (addressMode === 'create') {
          const addr = await createAndStoreWallet(password);
          toastManager.show(`새 지갑 생성됨: ${addr.slice(0,6)}…${addr.slice(-4)}`);
          setAddress(addr);
          setUnlocked(true);
        } else {
          goToStep('connect');
          return;
        }
      } else if (step === 'connect') {
        if (addressMode === 'reuse') {
          let addr: string
          if (importMode === 'mnemonic') {
            if (!mnemonic.trim()) { setError('니모닉을 입력하세요'); return; }
            addr = await importWalletFromMnemonic(mnemonic.trim(), password)
          } else {
            if (!privateKey.trim()) { setError('개인키를 입력하세요'); return; }
            addr = await importWalletFromPrivateKey(privateKey.trim(), password)
          }
          toastManager.show(`기존 주소 등록됨: ${addr.slice(0,6)}…${addr.slice(-4)}`);
          setAddress(addr);
          setUnlocked(true);
        }
      }
      setPassword('');
      setConfirm('');
      setMnemonic('');
      setPrivateKey('');
      void getProvider();
      
      // Notify background script that wallet is unlocked
      if (platform === 'extension' && typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage({ type: 'WALLET_UNLOCKED' }).catch(() => {
          // Ignore errors if background script is not available
        });
      }
    } catch (e: any) {
      console.error('Unlock error:', e);
      setError(formatUnlockError(e));
    }
  };

  const handleLogoutRequest = () => {
    setShowMenu(false);
    handleLogoutConfirm();
  };

  const handleDataResetRequest = () => {
    setShowMenu(false);
    setShowDataResetConfirm(true);
  };

  const handleLockOnly = () => {
    // 런타임 잠금만 수행 (저장 데이터는 유지)
    lockWallet();
    setUnlocked(false);
    setStep('login');
    setShowMenu(false);
    setForceCloseDropdowns((prev: boolean) => !prev);
    if (platform === 'extension' && typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'WALLET_LOCKED' }).catch(() => {});
    }
    toastManager.show('지갑이 잠금되었습니다.');
  };

  const handleLogoutConfirm = () => {
    // 지갑 잠금만 수행 (데이터는 유지)
    lockWallet();
    setUnlocked(false);
    setPassword('');
    setConfirm('');
    setMnemonic('');
    setPrivateKey('');
    setStep('login');
    setForceCloseDropdowns((prev: boolean) => !prev);
    if (platform === 'extension' && typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'WALLET_LOCKED' }).catch(() => {});
    }
    toastManager.show('지갑이 잠금되었습니다.');
  };

  const handleDataResetConfirm = () => {
    // 모든 저장소 데이터 초기화 (지갑 연결 정보 포함)
    clearAllStorageData();

    // 상태 초기화
    setUnlocked(false);
    setAddress('');
    setPassword('');
    setConfirm('');
    setMnemonic('');
    setPrivateKey('');
    // Step will be set by useEffect based on hasEncryptedKeystore()
    setShowDataResetConfirm(false);
    setForceCloseDropdowns((prev: boolean) => !prev);

    // 백그라운드 스크립트에 잠금 알림
    if (platform === 'extension' && typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({ type: 'WALLET_LOCKED' }).catch(() => {
        // Ignore errors if background script is not available
      });
    }

    toastManager.show('모든 데이터가 초기화되었습니다.');
  };

  const handleLogoutCancel = () => {
    setShowDataResetConfirm(false);
  };

  const handleAddressCopy = async () => {
    if (!address) return;
    
    try {
      await navigator.clipboard.writeText(address);
      toastManager.show('클립보드에 복사되었습니다');
    } catch (error) {
      // Fallback for older browsers or when clipboard API is not available
      const textArea = document.createElement('textarea');
      textArea.value = address;
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        toastManager.show('클립보드에 복사되었습니다');
      } catch (fallbackError) {
        toastManager.show('복사 실패');
      }
      document.body.removeChild(textArea);
    }
  };

  const handleAddressRequestApprove = (approvedAddress: string) => {
    // 백그라운드 스크립트에 승인 응답 전송
    chrome.runtime.sendMessage({
      type: 'ADDRESS_REQUEST_RESPONSE',
      success: true,
      address: approvedAddress
    });
    
    setShowAddressRequest(false);
    toastManager.show(`${requestOrigin}에 주소가 연결되었습니다`);
  };

  const handleAddressRequestReject = () => {
    // 백그라운드 스크립트에 거절 응답 전송
    chrome.runtime.sendMessage({
      type: 'ADDRESS_REQUEST_RESPONSE',
      success: false,
      error: '사용자가 연결을 거절했습니다'
    });
    
    setShowAddressRequest(false);
  };

  // const handleNetworkChange = (net: SupportedNetwork) => {
  //   setSelectedNet(net);
  //   setSelectedNetwork(net);
  // };

  return (
    <div className={appClassName}>
      <div className="wallet-window" role="dialog" aria-label="Wallet Window">
        <header className="mm-header">
          {unlocked && networksInitialized && (
             <NetworkSelector 
               onNetworkChange={(network: NetworkConfig) => {
                 setCurrentNetwork(network);
               }}
               forceClose={forceCloseDropdowns}
               onDropdownOpen={() => setShowMenu(false)} // Close menu when network dropdown opens
             />
          )}
          {unlocked && activeAccount ? (
            <AccountSelector 
              onAccountChange={(account: WalletAccount) => {
                setActiveAccount(account);
                setAddress(account.address);
              }}
              onManageAccounts={() => setShowAccountManager(true)}
              forceClose={forceCloseDropdowns}
            />
          ) : (
            <div className="mm-header__account">
              <div className="mm-header__avatar" aria-hidden>🦊</div>
              <div 
                className="mm-header__account-info" 
                onClick={() => {
                  console.log('Account info clicked:', { unlocked, activeAccount, hdInitialized: hdWalletService.isInitialized() });
                  setShowAccountManager(true);
                }}
                title={unlocked ? "계정 관리" : ""}
              >
                <div className="mm-header__account-name clickable">
                  {activeAccount ? activeAccount.name : "Account 1"}
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="feather feather-chevron-down">
                  <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </div>
                <button 
                  className="mm-header__account-address" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddressCopy();
                  }}
                  disabled={!address}
                  title={address ? `클릭하여 주소 복사: ${address}` : ''}
                >
                  {address ? `${address.slice(0,6)}…${address.slice(-4)}` : '잠김'}
                </button>
              </div>
            </div>
          )}
          {unlocked && (
            <div className="mm-menu">
              <button className="mm-theme-toggle mm-menu__btn" onClick={toggleTheme} type="button" aria-label="Toggle theme" title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
              {theme === 'light' ? 
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="feather feather-moon">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>  : 
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="feather feather-sun">
                  <circle cx="12" cy="12" r="5"></circle>
                  <line x1="12" y1="1" x2="12" y2="3"></line>
                  <line x1="12" y1="21" x2="12" y2="23"></line>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                  <line x1="1" y1="12" x2="3" y2="12"></line>
                  <line x1="21" y1="12" x2="23" y2="12"></line>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>}
              </button>
              <button className="mm-menu__btn" onClick={() => {
                setShowMenu((v: boolean) => !v);
                setForceCloseDropdowns((prev: boolean) => !prev); // Force close dropdowns when menu opens
              }} aria-haspopup="menu" aria-expanded={showMenu} aria-label="열기">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="feather feather-menu">
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
                </button>
              {showMenu && (
                <div className="menu-dropdown" role="menu">
                  <button className="mm-menu__item" role="menuitem" onClick={() => { setShowMenu(false); setActiveTab('activity'); }}>설정</button>
                  {activeAccount && (
                    <button className="mm-menu__item" role="menuitem" onClick={() => { setShowMenu(false); setShowAccountManager(true); }}>계정 관리</button>
                  )}
                  <button className="mm-menu__item" role="menuitem" onClick={handleLogoutRequest}>로그아웃</button>
                  <button className="mm-menu__item warning" role="menuitem" onClick={handleDataResetRequest}>데이터 초기화</button>
                </div>
              )}
              </div>
            )}
          </header>

        <main className="mm-main">
          {/* unlock / create flow */}
          {!unlocked && (
            <div className="modal-overlay visible" role="dialog" aria-modal>
              <div className="auth-modal modal-content">
                {stepHistory.length > 0 && (
                  <button className="back" onClick={goBack}>← 뒤로</button>
                )}
                {step === 'login' && (
                  <>
                    <h3>지갑 잠금 해제</h3>
                    <div className="auth-field">
                      <label htmlFor="wallet-password">비밀번호</label>
                      <input id="wallet-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    {error && <div className="error-text" role="alert">{password !== confirm ? "비밀번호가 일치하지 않습니다" : error}</div>}
                    <div className="auth-actions">
                      <button className="btn btn-ghost" onClick={() => goToStep('setPassword')}>새로 등록</button>
                      <button className="btn btn-primary" onClick={handleUnlock}>로그인</button>
                    </div>
                  </>
                )}

                {step === 'setPassword' && (
                  <>
                    <h3>비밀번호 설정</h3>
                    <p>앱 전용 비밀번호를 설정하세요.</p>
                    <div className="auth-field">
                      <label htmlFor="wallet-password">비밀번호</label>
                      <SensitiveInput id="wallet-password" value={password} onChange={setPassword} />
                    </div>
                    <div className="auth-field">
                      <label htmlFor="wallet-password-confirm">비밀번호 확인</label>
                      <SensitiveInput id="wallet-password-confirm" value={confirm} onChange={setConfirm} />
                    </div>
                    {error && <div className="error-text" role="alert">{password !== confirm ? "비밀번호가 일치하지 않습니다" : error}</div>}
                    <div className="auth-actions">
                      <button className="btn btn-ghost" onClick={goBack}>취소</button>
                      <button className="btn btn-primary" onClick={handleUnlock}>다음</button>
                    </div>
                  </>
                )}

                {step === 'chooseAddr' && (
                  <>
                    <h3>지갑 선택</h3>
                    <div className="auth-options">
                      <button className={`btn ${addressMode === 'create' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAddressMode('create')}>새 지갑 생성</button>
                      <button className={`btn ${addressMode === 'reuse' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAddressMode('reuse')}>기존 지갑 등록</button>
                    </div>
                    <div className="auth-actions">
                      <button className="btn btn-ghost" onClick={() => setStep('login')}>취소</button>
                      <button className="btn btn-primary" onClick={handleUnlock}>{addressMode === 'create' ? '생성' : '다음'}</button>
                    </div>
                  </>
                )}

                {step === 'connect' && (
                  <>
                    <h3>지갑 연결</h3>
                    <div className="auth-options">
                      <button className={`btn ${importMode === 'mnemonic' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setImportMode('mnemonic')}>니모닉</button>
                      <button className={`btn ${importMode === 'privateKey' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setImportMode('privateKey')}>개인키</button>
                    </div>
                    {importMode === 'mnemonic' ? (
                      <div className="auth-field">
                        <label htmlFor="mnemonic">니모닉</label>
                        <SensitiveTextarea id="mnemonic" value={mnemonic} onChange={setMnemonic} placeholder="word1 word2 ..." rows={5} />
                      </div>
                    ) : (
                      <div className="auth-field">
                        <label htmlFor="private-key">개인키</label>
                        <SensitiveTextarea id="private-key" value={privateKey} onChange={setPrivateKey} placeholder="0x..." rows={4} />
                      </div>
                    )}
                    {error && <div className="error-text" role="alert">{error}</div>}
                    <div className="auth-actions">
                      <button className="btn btn-ghost" onClick={goBack}>뒤로</button>
                      <button className="btn btn-primary" onClick={handleUnlock}>지갑 연결</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* 데이터 초기화 확인 모달 */}
          {showDataResetConfirm && (
            <div className="modal-overlay visible">
              <div className="auth-modal modal-content">
                <h3>데이터 초기화</h3>
                <p>정말로 모든 저장 데이터를 초기화하시겠습니까?</p>
                <div className="warning-area">
                  다음 정보가 삭제/초기화됩니다.
                  <ul>
                  <li>등록된 지갑 주소</li>
                  <li>네트워크 설정</li>
                  <li>자격증명</li>
                  <li>자산 정보</li>
                  </ul>
                  이 작업은 되돌릴 수 없습니다.
                </div>
                <div className="auth-actions">
                  <button className="btn btn-ghost" onClick={handleLogoutCancel}>취소</button>
                  <button className="btn btn-danger" onClick={handleDataResetConfirm}>초기화</button>
                </div>
              </div>
            </div>
          )}

          {/* 주소 요청 모달 */}
          {showAddressRequest && (
            <AddressRequestModal
              origin={requestOrigin}
              onApprove={handleAddressRequestApprove}
              onReject={handleAddressRequestReject}
            />
          )}

           <section className="mm-balance" aria-label="Balance">
             <div className="mm-balance__amount">0.0000 {currentNetwork?.symbol || 'ETH'}</div>
             <div className="mm-balance__fiat">≈ $0.00</div>
           </section>

          <section className="mm-actions" aria-label="Quick actions">
            <button className="mm-action" type="button">Buy</button>
            <button className="mm-action" type="button">Send</button>
            <button className="mm-action" type="button">Swap</button>
          </section>

          <nav className="mm-tabs" aria-label="메인 탭">
             <button
               className={`mm-tab flat ${activeTab === 'tokens' ? 'is-active' : ''}`}
               onClick={() => setActiveTab('tokens')}
               type="button">
               자산
             </button>
            <button
              className={`mm-tab flat ${activeTab === 'vc' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('vc')}
              type="button">
              VC
            </button>
            <button
              className={`mm-tab flat ${activeTab === 'nft' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('nft')}
              type="button">
              NFT/SBT
            </button>
            <button
              className={`mm-tab flat ${activeTab === 'activity' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('activity')}
              type="button">
              활동
            </button>
          </nav>

          <section className="mm-content" aria-live="polite">
             {activeTab === 'tokens' && (
              <div className="tab-content-container">
                  <ul className="mm-list" aria-label="자산 목록">
                  <li className="mm-list__item">
                    <div className="mm-token">{currentNetwork?.symbol || 'ETH'}</div>
                    <div className="mm-token__amount">0.0000</div>
                  </li>
                  <li className="mm-list__item is-muted">자산 추가…</li>
                </ul>
              </div>
            )}

            {activeTab === 'vc' && (
              <div className="vc-tab-content">
                <div className="vc-tab-header">
                  <button 
                    className="btn btn-primary btn-small"
                    onClick={() => setShowAddVCModal(true)}
                  >
                    📋 VC 추가
                  </button>
                </div>
                <div className="vc-list-container">
                  <ul className="mm-list" aria-label="VC 목록">
                    {savedVCs.length === 0 ? (
                      <li className="mm-list__item is-muted">저장된 VC가 없습니다</li>
                    ) : (
                      savedVCs.map((vc: VerifiableCredential) => (
                        <li key={vc.id} className="mm-list__item">
                          <div className="mm-list__item-content" onClick={() => setSelectedVC(vc)}>
                            <div className="mm-list__item-primary">
                              <div className="mm-list__item-title">
                                {vc.credentialSubject?.name || vc.credentialSubject?.studentName || 'VC'}
                              </div>
                              <div className="mm-list__item-subtitle">
                                {vc.issuer?.name || vc.issuer?.id}
                              </div>
                            </div>
                            <div className="mm-list__item-secondary">
                              <div className="mm-list__item-detail">
                                {new Date(vc.issuanceDate).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <div className="mm-list__item-actions">
                            <button 
                              className="mm-list__item-action-btn delete-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                const vcName = vc.credentialSubject?.name || vc.credentialSubject?.studentName || 'VC';
                                handleDeleteConfirm(vc.id || '', vcName);
                              }}
                              title="VC 삭제"
                            >
                              🗑️
                            </button>
                          </div>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'nft' && (
              <div className="tab-content-container">
                <ul className="mm-list" aria-label="NFT/SBT 목록">
                  <li className="mm-list__item is-muted">발급된 SBT 또는 NFT가 없습니다</li>
                </ul>
              </div>
            )}

            {activeTab === 'activity' && (
              <div className="tab-content-container">
                <ul className="mm-list" aria-label="활동 목록">
                  <li className="mm-list__item is-muted">최근 활동 없음</li>
                </ul>
              </div>
            )}
          </section>

          {extensionActions && (
            <section className="mm-extension-actions" aria-label="Extension only actions">
              {extensionActions}
            </section>
          )}
        </main>
        {toast && (
          <div className={`toast ${toastVisible ? 'toast--visible' : 'toast--hidden'}`} role="status"><p>{toast}</p></div>
        )}
        
        {/* VC 상세 모달 */}
        <VCModal 
          vc={selectedVC} 
          onClose={() => setSelectedVC(null)} 
        />
        
        {/* VC 발급 승인 모달 */}
        {vcIssuanceRequest && (
          <VCIssuanceModal
            vc={vcIssuanceRequest.vc}
            student={vcIssuanceRequest.student}
            origin={vcIssuanceRequest.origin}
            isDuplicate={vcIssuanceRequest.isDuplicate}
            duplicateId={vcIssuanceRequest.duplicateId}
            onApprove={handleVCIssuanceApprove}
            onReject={handleVCIssuanceReject}
          />
        )}
        
        {/* VC 저장 승인 모달 */}
        {vcSaveRequest && (
          <VCIssuanceModal
            vc={vcSaveRequest.vc}
            student={null}
            origin={vcSaveRequest.origin}
            isDuplicate={vcSaveRequest.isDuplicate}
            duplicateId={vcSaveRequest.duplicateId}
            onApprove={handleVCSaveApprove}
            onReject={handleVCSaveReject}
          />
        )}
        
        {/* 수동 VC 추가 모달 */}
        {showAddVCModal && (
          <AddVCModal
            onClose={() => setShowAddVCModal(false)}
            onAddVC={handleAddVC}
          />
        )}
        
        {/* VC 삭제 확인 모달 */}
        <DeleteConfirmModal
          isOpen={deleteConfirmModal.isOpen}
          vcName={deleteConfirmModal.vcName}
          onConfirm={handleDeleteConfirmApprove}
          onCancel={handleDeleteConfirmCancel}
        />
        
        {/* 주소 요청 모달 */}
        {addressRequest && (
          <AddressRequestModal
            origin={addressRequest.origin}
            onApprove={async () => {
              try {
                await chrome.runtime.sendMessage({
                  type: 'ADDRESS_REQUEST_RESPONSE',
                  success: true,
                  address: getAddress()
                });
                setAddressRequest(null);
              } catch (error) {
                console.error('주소 요청 승인 실패:', error);
              }
            }}
            onReject={async () => {
              try {
                await chrome.runtime.sendMessage({
                  type: 'ADDRESS_REQUEST_RESPONSE',
                  success: false,
                  error: '사용자가 거절했습니다'
                });
                setAddressRequest(null);
              } catch (error) {
                console.error('주소 요청 거절 실패:', error);
              }
            }}
          />
        )}

        {/* 계정 관리 모달 */}
        <AccountManager
          isOpen={showAccountManager}
          onClose={() => setShowAccountManager(false)}
          onAccountChange={(account: WalletAccount) => {
            setActiveAccount(account);
            setAddress(account.address);
          }}
        />
      </div>
    </div>
  );
};

export default AppContent;