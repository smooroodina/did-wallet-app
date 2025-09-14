import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import './styles/network.css';
import { createAndStoreWallet, getAddress, getProvider, getSelectedNetwork, importWalletFromMnemonic, importWalletFromPrivateKey, initDevWallet, isUnlocked, lockWallet, readStoredState, resetStoredState, setSelectedNetwork, unlockWithPassword, type SupportedNetwork } from './lib/wallet';
import { isDevModeEnabled } from './config/dev.config';
import { NetworkSelector } from './components/NetworkSelector';
import { NetworkConfig } from './types/network';

// Type reference for Electron API
/// <reference path="./types/electron.d.ts" />

interface AppProps {
  platform?: 'desktop' | 'extension';
  extensionActions?: React.ReactNode;
  onThemeChange?: (theme: 'light' | 'dark') => void;
}

const App = ({ platform = 'desktop', extensionActions, onThemeChange }: AppProps) => {
  const getInitialTheme = () => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved as 'light' | 'dark';
    } catch {}
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  };

  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [activeTab, setActiveTab] = useState<'tokens' | 'vc' | 'nft' | 'activity'>('tokens');
  const [unlocked, setUnlocked] = useState<boolean>(isUnlocked());
  const [address, setAddress] = useState<string | undefined>(getAddress());
  const [selectedNet, setSelectedNet] = useState<SupportedNetwork>(getSelectedNetwork());
  const [isFirstRun, setIsFirstRun] = useState<boolean>(() => !readStoredState().keystoreJson);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [showMenu, setShowMenu] = useState(false);
  type WizardStep = 'login' | 'setPassword' | 'chooseAddr' | 'connect';
  const initialStep: WizardStep = readStoredState().keystoreJson ? 'login' : 'setPassword';
  const [step, setStep] = useState<WizardStep>(initialStep);
  const [addressMode, setAddressMode] = useState<'create' | 'reuse'>('create');
  const [importMode, setImportMode] = useState<'mnemonic' | 'privateKey'>('mnemonic');
  const [mnemonic, setMnemonic] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const IDLE_LOCK_MS = 5 * 60 * 1000; // 5 minutes

  useEffect(() => {
    try { localStorage.setItem('theme', theme); } catch {}
    onThemeChange?.(theme);
  }, [theme, onThemeChange]);

  // Initialize dev wallet on mount
  useEffect(() => {
    if (isDevModeEnabled()) {
      initDevWallet().then((initialized) => {
        if (initialized) {
          setUnlocked(true);
          setAddress(getAddress());
          setSelectedNet(getSelectedNetwork());
        }
      }).catch((error) => {
        console.error('Dev wallet initialization failed:', error);
        setError(`개발 모드 초기화 실패: ${error.message}`);
        setUnlocked(false);
        // Force user to go through normal setup
      });
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
        setIsFirstRun(false);
        setStep('chooseAddr');
        return;
      } else if (step === 'chooseAddr') {
        if (addressMode === 'create') {
          const addr = await createAndStoreWallet(password);
          setToast(`새 지갑 생성됨: ${addr.slice(0,6)}…${addr.slice(-4)}`);
          setAddress(addr);
          setUnlocked(true);
        } else {
          setStep('connect');
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
          setToast(`기존 주소 등록됨: ${addr.slice(0,6)}…${addr.slice(-4)}`);
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
      setError(e?.message || '잠금 해제 실패');
    }
  };

  const handleNetworkChange = (net: SupportedNetwork) => {
    setSelectedNet(net);
    setSelectedNetwork(net);
  };

  return (
    <div className={appClassName}>
      <div className="wallet-window" role="dialog" aria-label="Wallet Window">
        <header className="mm-header">
          <NetworkSelector 
            onNetworkChange={(network: NetworkConfig) => {
              console.log('Network changed to:', network);
              // TODO: Integrate with existing wallet network system
            }}
          />
          <div className="mm-header__account">
            <div className="mm-header__avatar" aria-hidden>🦊</div>
            <div className="mm-header__account-info">
              <div className="mm-header__account-name">Account 1</div>
              <div className="mm-header__account-address">{address ? `${address.slice(0,6)}…${address.slice(-4)}` : '잠김'}</div>
            </div>
          </div>
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
            <button className="mm-menu__btn" onClick={() => setShowMenu((v: boolean) => !v)} aria-haspopup="menu" aria-expanded={showMenu} aria-label="열기">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="feather feather-menu">
                <line x1="3" y1="12" x2="21" y2="12"></line>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <line x1="3" y1="18" x2="21" y2="18"></line>
              </svg>
              </button>
            {showMenu && (
              <div className="mm-menu__list" role="menu">
                <button className="mm-menu__item" role="menuitem" onClick={() => { setShowMenu(false); setActiveTab('activity'); }}>설정</button>
                <button className="mm-menu__item" role="menuitem" onClick={() => { 
                  setShowMenu(false); 
                  lockWallet(); 
                  setUnlocked(false);
                  // Notify background script that wallet is locked
                  if (platform === 'extension' && typeof chrome !== 'undefined' && chrome.runtime) {
                    chrome.runtime.sendMessage({ type: 'WALLET_LOCKED' }).catch(() => {
                      // Ignore errors if background script is not available
                    });
                  }
                }}>로그아웃</button>
              </div>
            )}
          </div>
        </header>

        <main className="mm-main">
          {/* unlock / create flow */}
          {!unlocked && (
            <div className="auth-overlay" role="dialog" aria-modal>
              <div className="auth-modal">
                {step !== 'login' && (
                  <button className="back" onClick={() => setStep('login')}>← 뒤로</button>
                )}
                {step === 'login' && (
                  <>
                    <h3>지갑 잠금 해제</h3>
                    {readStoredState().keystoreJson ? (
                      <>
                        <div className="auth-field">
                          <label htmlFor="wallet-password">비밀번호</label>
                          <input id="wallet-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                        </div>
                        {error && <div className="error-text" role="alert">{password !== confirm ? "비밀번호가 일치하지 않습니다" : error}</div>}
                        <div className="auth-actions">
                          <button className="btn" onClick={() => setStep('setPassword')}>새로 등록</button>
                          <button className="btn primary" onClick={handleUnlock}>로그인</button>
                        </div>
                      </>
                    ) : (
                      <div className="auth-actions">
                        <button className="btn primary" onClick={() => setStep('setPassword')}>새로 등록</button>
                      </div>
                    )}
                  </>
                )}

                {step === 'setPassword' && (
                  <>
                    <h3>비밀번호 설정</h3>
                    <p>앱 전용 비밀번호를 설정하세요.</p>
                    <div className="auth-field">
                      <label htmlFor="wallet-password">비밀번호</label>
                      <input id="wallet-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <div className="auth-field">
                      <label htmlFor="wallet-password-confirm">비밀번호 확인</label>
                      <input id="wallet-password-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                    </div>
                    {error && <div className="error-text" role="alert">{password !== confirm ? "비밀번호가 일치하지 않습니다" : error}</div>}
                    <div className="auth-actions">
                      <button className="btn" onClick={() => setStep('login')}>취소</button>
                      <button className="btn primary" onClick={handleUnlock}>다음</button>
                    </div>
                  </>
                )}

                {step === 'chooseAddr' && (
                  <>
                    <h3>지갑 선택</h3>
                    <div className="auth-options">
                      <button className={`btn ${addressMode === 'create' ? 'primary' : ''}`} onClick={() => setAddressMode('create')}>새 지갑 생성</button>
                      <button className={`btn ${addressMode === 'reuse' ? 'primary' : ''}`} onClick={() => setAddressMode('reuse')}>기존 지갑 등록</button>
                    </div>
                    <div className="auth-actions">
                      <button className="btn" onClick={() => setStep('login')}>취소</button>
                      <button className="btn primary" onClick={handleUnlock}>{addressMode === 'create' ? '생성' : '다음'}</button>
                    </div>
                  </>
                )}

                {step === 'connect' && (
                  <>
                    <h3>지갑 연결</h3>
                    <div className="auth-options">
                      <button className={`btn ${importMode === 'mnemonic' ? 'primary' : ''}`} onClick={() => setImportMode('mnemonic')}>니모닉</button>
                      <button className={`btn ${importMode === 'privateKey' ? 'primary' : ''}`} onClick={() => setImportMode('privateKey')}>개인키</button>
                    </div>
                    {importMode === 'mnemonic' ? (
                      <div className="auth-field">
                        <label htmlFor="mnemonic">니모닉</label>
                        <textarea id="mnemonic" value={mnemonic} onChange={(e) => setMnemonic(e.target.value)} placeholder="word1 word2 ..." />
                      </div>
                    ) : (
                      <div className="auth-field">
                        <label htmlFor="private-key">개인키</label>
                        <textarea id="private-key" value={privateKey} onChange={(e) => setPrivateKey(e.target.value)} placeholder="0x..." />
                      </div>
                    )}
                    {error && <div className="error-text" role="alert">{error}</div>}
                    <div className="auth-actions">
                      <button className="btn" onClick={() => setStep('chooseAddr')}>뒤로</button>
                      <button className="btn primary" onClick={handleUnlock}>지갑 연결</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          <section className="mm-balance" aria-label="Balance">
            <div className="mm-balance__amount">0.0000 ETH</div>
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
              토큰
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
              <ul className="mm-list" aria-label="토큰 목록">
                <li className="mm-list__item">
                  <div className="mm-token">ETH</div>
                  <div className="mm-token__amount">0.0000</div>
                </li>
                <li className="mm-list__item is-muted">토큰 추가…</li>
              </ul>
            )}

            {activeTab === 'vc' && (
              <ul className="mm-list" aria-label="VC 목록">
                <li className="mm-list__item is-muted">저장된 VC가 없습니다</li>
              </ul>
            )}

            {activeTab === 'nft' && (
              <ul className="mm-list" aria-label="NFT/SBT 목록">
                <li className="mm-list__item is-muted">발급된 SBT 또는 NFT가 없습니다</li>
              </ul>
            )}

            {activeTab === 'activity' && (
              <ul className="mm-list" aria-label="활동 목록">
                <li className="mm-list__item is-muted">최근 활동 없음</li>
              </ul>
            )}
          </section>

          {extensionActions && (
            <section className="mm-extension-actions" aria-label="Extension only actions">
              {extensionActions}
            </section>
          )}
        </main>
        {toast && (
          <div className="toast" role="status" onAnimationEnd={() => setToast(null)}>{toast}</div>
        )}
      </div>
    </div>
  );
};

export default App;
