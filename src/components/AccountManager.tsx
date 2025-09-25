import React, { useState, useEffect } from 'react';
import { WalletAccount } from '../types/hdWallet';
import { hdWalletService } from '../lib/hdWalletService';
import { toastManager } from '../utils/toast';

interface AccountManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountChange?: (account: WalletAccount) => void;
  walletType?: 'mnemonic' | 'privateKey' | null;
}

export const AccountManager: React.FC<AccountManagerProps> = ({ isOpen, onClose, onAccountChange, walletType }: AccountManagerProps) => {
  console.log('AccountManager rendered:', { isOpen, walletType, hdInitialized: hdWalletService.isInitialized() });
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<WalletAccount | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<WalletAccount | null>(null);
  const [newAccountName, setNewAccountName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadAccounts();
    }
  }, [isOpen]);

  const loadAccounts = () => {
    if (hdWalletService.isInitialized()) {
      const allAccounts = hdWalletService.getAccounts();
      const currentActive = hdWalletService.getActiveAccount();
      setAccounts(allAccounts);
      setActiveAccount(currentActive);
    } else {
      // HD 지갑이 초기화되지 않은 경우 기본 계정 표시
      setAccounts([]);
      setActiveAccount(null);
    }
  };

  const handleAddAccount = async () => {
    if (!newAccountName.trim()) {
      toastManager.show('계정 이름을 입력해주세요.');
      return;
    }

    setIsLoading(true);
    try {
      // For now, we'll use a placeholder password - in real implementation, 
      // this should prompt for password or use stored session
      const result = await hdWalletService.createAccount(newAccountName.trim(), '');
      
      if (result.success) {
        toastManager.show('새 계정이 생성되었습니다.');
        loadAccounts();
        setShowAddModal(false);
        setNewAccountName('');
      } else {
        toastManager.show(result.error || '계정 생성에 실패했습니다.');
      }
    } catch (error) {
      toastManager.show('계정 생성 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRenameAccount = async () => {
    if (!editingAccount || !newAccountName.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await hdWalletService.updateAccountName(editingAccount.id, newAccountName.trim());
      
      if (result.success) {
        toastManager.show('계정 이름이 변경되었습니다.');
        loadAccounts();
        setShowRenameModal(false);
        setEditingAccount(null);
        setNewAccountName('');
      } else {
        toastManager.show(result.error || '계정 이름 변경에 실패했습니다.');
      }
    } catch (error) {
      toastManager.show('계정 이름 변경 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveAccount = async (account: WalletAccount) => {
    if (accounts.length <= 1) {
      toastManager.show('마지막 계정은 삭제할 수 없습니다.');
      return;
    }

    if (!confirm(`"${account.name}" 계정을 삭제하시겠습니까?`)) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await hdWalletService.removeAccount(account.id);
      
      if (result.success) {
        toastManager.show('계정이 삭제되었습니다.');
        loadAccounts();
        if (onAccountChange) {
          const newActive = hdWalletService.getActiveAccount();
          if (newActive) {
            onAccountChange(newActive);
          }
        }
      } else {
        toastManager.show(result.error || '계정 삭제에 실패했습니다.');
      }
    } catch (error) {
      toastManager.show('계정 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchAccount = async (account: WalletAccount) => {
    setIsLoading(true);
    try {
      const success = await hdWalletService.setActiveAccount(account.id);
      
      if (success) {
        setActiveAccount(account);
        if (onAccountChange) {
          onAccountChange(account);
        }
        toastManager.show(`"${account.name}" 계정으로 전환되었습니다.`);
      } else {
        toastManager.show('계정 전환에 실패했습니다.');
      }
    } catch (error) {
      toastManager.show('계정 전환 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  const openRenameModal = (account: WalletAccount) => {
    setEditingAccount(account);
    setNewAccountName(account.name);
    setShowRenameModal(true);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay visible" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>계정 관리</h3>
          <div className="modal-header-actions">
            <button 
              className="btn btn-sm btn-primary"
              onClick={() => setShowAddModal(true)}
              disabled={isLoading || accounts.length >= 10}
              title="새 계정 추가"
            >
              + 계정 추가
            </button>
            <button className="modal-close" onClick={onClose}>×</button>
          </div>
        </div>

        <div className="modal-body">
          {walletType === 'privateKey' ? (
            <div className="account-empty-state">
              <div className="empty-state-icon">🔐</div>
              <h4>HD 지갑 기능을 사용할 수 없습니다</h4>
              <p>개인키로 등록된 지갑은 HD 지갑 기능을 지원하지 않습니다.<br/>니모닉으로 지갑을 생성하거나 가져와야 합니다.</p>
            </div>
          ) : !hdWalletService.isInitialized() ? (
            <div className="account-empty-state">
              <div className="empty-state-icon">🔐</div>
              <h4>HD 지갑이 초기화되지 않았습니다</h4>
              <p>니모닉으로 지갑을 생성하거나 가져와야 합니다.</p>
            </div>
          ) : accounts.length === 0 ? (
            <div className="account-empty-state">
              <div className="empty-state-icon">👤</div>
              <h4>계정이 없습니다</h4>
              <p>새 계정을 추가해보세요.</p>
            </div>
          ) : (
            <div className="account-list">
              {accounts.map((account: WalletAccount) => (
              <div key={account.id} className={`account-item ${account.id === activeAccount?.id ? 'active' : ''}`}>
                <div className="account-info">
                  <div className="account-name">{account.name}</div>
                  <div className="account-address">{account.address}</div>
                  <div className="account-index">파생 인덱스: {account.derivationIndex}</div>
                </div>
                <div className="account-actions">
                  {account.id !== activeAccount?.id ? (
                    <button 
                      className="btn btn-sm btn-primary"
                      onClick={() => handleSwitchAccount(account)}
                      disabled={isLoading}
                      title="이 계정으로 전환"
                    >
                      전환
                    </button>
                  ) : (
                    <div className="account-status">
                      <span className="status-badge active">현재 계정</span>
                    </div>
                  )}
                  <button 
                    className="btn btn-sm btn-ghost"
                    onClick={() => openRenameModal(account)}
                    disabled={isLoading}
                    title="계정 이름 변경"
                  >
                    ✏️
                  </button>
                  {accounts.length > 1 && (
                    <button 
                      className="btn btn-sm btn-danger"
                      onClick={() => handleRemoveAccount(account)}
                      disabled={isLoading}
                      title="계정 삭제"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
              ))}
            </div>
          )}

          {hdWalletService.isInitialized() && (
            <div className="account-actions-footer">
              <button 
                className="btn btn-primary"
                onClick={() => setShowAddModal(true)}
                disabled={isLoading || accounts.length >= 10}
              >
                새 계정 추가
              </button>
            </div>
          )}
        </div>

        {/* Add Account Modal */}
        {showAddModal && (
          <div className="modal-overlay visible">
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>새 계정 추가</h3>
                <button className="modal-close" onClick={() => setShowAddModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="new-account-name">계정 이름</label>
                  <input
                    id="new-account-name"
                    type="text"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    placeholder="예: Account 2"
                    maxLength={20}
                  />
                </div>
                <div className="modal-actions">
                  <button className="btn btn-ghost" onClick={() => setShowAddModal(false)}>
                    취소
                  </button>
                  <button 
                    className="btn btn-primary"
                    onClick={handleAddAccount}
                    disabled={isLoading || !newAccountName.trim()}
                  >
                    {isLoading ? '생성 중...' : '생성'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rename Account Modal */}
        {showRenameModal && editingAccount && (
          <div className="modal-overlay visible">
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>계정 이름 변경</h3>
                <button className="modal-close" onClick={() => setShowRenameModal(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="rename-account-name">새 계정 이름</label>
                  <input
                    id="rename-account-name"
                    type="text"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    placeholder="예: My Wallet"
                    maxLength={20}
                  />
                </div>
                <div className="modal-actions">
                  <button className="btn btn-ghost" onClick={() => setShowRenameModal(false)}>
                    취소
                  </button>
                  <button 
                    className="btn btn-primary"
                    onClick={handleRenameAccount}
                    disabled={isLoading || !newAccountName.trim()}
                  >
                    {isLoading ? '변경 중...' : '변경'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
