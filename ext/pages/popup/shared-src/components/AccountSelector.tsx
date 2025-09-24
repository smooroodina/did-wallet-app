import { useState, useEffect } from 'react';
import { WalletAccount } from '../types/hdWallet';
import { hdWalletService } from '../lib/hdWalletService';

interface AccountSelectorProps {
  onAccountChange?: (account: WalletAccount) => void;
  onManageAccounts?: () => void;
  forceClose?: boolean;
}

export const AccountSelector = ({ onAccountChange, onManageAccounts, forceClose }: AccountSelectorProps) => {
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [activeAccount, setActiveAccount] = useState<WalletAccount | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  useEffect(() => {
    if (forceClose) {
      setIsDropdownOpen(false);
    }
  }, [forceClose]);

  const loadAccounts = () => {
    const allAccounts = hdWalletService.getAccounts();
    const currentActive = hdWalletService.getActiveAccount();
    setAccounts(allAccounts);
    setActiveAccount(currentActive);
  };

  const handleAccountSwitch = async (account: WalletAccount) => {
    const success = await hdWalletService.setActiveAccount(account.id);
    if (success) {
      setActiveAccount(account);
      setIsDropdownOpen(false);
      if (onAccountChange) {
        onAccountChange(account);
      }
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (!activeAccount) {
    return null;
  }

  return (
    <div className="account-selector">
      <div 
        className="account-current" 
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
      >
        <div className="account-avatar">👤</div>
        <div className="account-info">
          <div className="account-name">{activeAccount.name}</div>
          <div className="account-address">{formatAddress(activeAccount.address)}</div>
        </div>
        <div className="account-arrow">
          {isDropdownOpen ? '▲' : '▼'}
        </div>
      </div>

      {isDropdownOpen && (
        <div className="account-dropdown">
          <div className="account-list">
            {accounts.map((account: WalletAccount) => (
              <div
                key={account.id}
                className={`account-item ${account.id === activeAccount.id ? 'active' : ''}`}
                onClick={() => handleAccountSwitch(account)}
              >
                <div className="account-avatar">👤</div>
                <div className="account-info">
                  <div className="account-name">{account.name}</div>
                  <div className="account-address">{formatAddress(account.address)}</div>
                </div>
                {account.id === activeAccount.id && (
                  <div className="account-check">✓</div>
                )}
              </div>
            ))}
          </div>
          
          {onManageAccounts && (
            <div className="account-dropdown-footer">
              <button 
                className="btn btn-sm btn-ghost account-manage-btn"
                onClick={() => {
                  setIsDropdownOpen(false);
                  onManageAccounts();
                }}
              >
                ⚙️ 계정 관리
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
