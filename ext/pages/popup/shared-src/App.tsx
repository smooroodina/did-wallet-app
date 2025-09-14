import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import { createAndStoreWallet, getAddress, getProvider, getSelectedNetwork, isUnlocked, lockWallet, readStoredState, setSelectedNetwork, unlockWithPassword, type SupportedNetwork } from './lib/wallet';

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
  const idleTimerRef = useRef<number | null>(null);
  const IDLE_LOCK_MS = 2 * 60 * 1000; // 2 minutes for now

  useEffect(() => {
    try { localStorage.setItem('theme', theme); } catch {}
    onThemeChange?.(theme);
  }, [theme, onThemeChange]);

  const toggleTheme = () => setTheme((prev: 'light' | 'dark') => (prev === 'light' ? 'dark' : 'light'));

  const appClassName = useMemo(() => `app app--${platform} theme--${theme}`, [platform, theme]);

  // idle auto-lock
  useEffect(() => {
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
  }, [unlocked]);

  const handleUnlock = async () => {
    setError(undefined);
    try {
      if (isFirstRun) {
        if (!password || password !== confirm) {
          setError('비밀번호가 일치하지 않습니다.');
          return;
        }
        const addr = await createAndStoreWallet(password);
        setAddress(addr);
        setUnlocked(true);
        setIsFirstRun(false);
      } else {
        const addr = await unlockWithPassword(password);
        setAddress(addr);
        setUnlocked(true);
      }
      setPassword('');
      setConfirm('');
      void getProvider();
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
          <select
            className="mm-header__network"
            aria-label="Network selector"
            value={selectedNet}
            onChange={(e) => handleNetworkChange(e.target.value as SupportedNetwork)}
          >
            <option value="mainnet">Ethereum Mainnet</option>
            <option value="sepolia">Sepolia Testnet</option>
          </select>
          <div className="mm-header__account">
            <div className="mm-header__avatar" aria-hidden>🦊</div>
            <div className="mm-header__account-info">
              <div className="mm-header__account-name">Account 1</div>
              <div className="mm-header__account-address">{address ? `${address.slice(0,6)}…${address.slice(-4)}` : '잠김'}</div>
            </div>
          </div>
          <button className="mm-theme-toggle" onClick={toggleTheme} type="button" aria-label="Toggle theme" title={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
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
        </header>

        <main className="mm-main">
          {/* unlock / create flow */}
          {!unlocked && (
            <div className="auth-overlay" role="dialog" aria-modal>
              <div className="auth-modal">
                <h3>{isFirstRun ? '지갑 생성' : '지갑 잠금 해제'}</h3>
                <p>{isFirstRun ? '앱 전용 비밀번호를 설정하세요.' : '앱 전용 비밀번호를 입력하세요.'}</p>
                <div className="auth-field">
                  <label htmlFor="wallet-password">비밀번호</label>
                  <input id="wallet-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                {isFirstRun && (
                  <div className="auth-field">
                    <label htmlFor="wallet-password-confirm">비밀번호 확인</label>
                    <input id="wallet-password-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                  </div>
                )}
                {error && <div className="error-text" role="alert">{error}</div>}
                <div className="auth-actions">
                  <button className="btn" onClick={() => { setPassword(''); setConfirm(''); setError(undefined); }}>취소</button>
                  <button className="btn primary" onClick={handleUnlock}>{isFirstRun ? '생성' : '해제'}</button>
                </div>
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
      </div>
    </div>
  );
};

export default App;
