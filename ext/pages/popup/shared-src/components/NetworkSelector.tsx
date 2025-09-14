import React, { useState, useEffect } from 'react';
import { networkService } from '../lib/networkService';
import { NetworkConfig } from '../types/network';
import { AddNetworkModal } from './AddNetworkModal';

interface NetworkSelectorProps {
  onNetworkChange?: (network: NetworkConfig) => void;
}

export const NetworkSelector: React.FC<NetworkSelectorProps> = ({ onNetworkChange }) => {
  const [networks, setNetworks] = useState<NetworkConfig[]>([]);
  const [currentNetwork, setCurrentNetwork] = useState<NetworkConfig | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState<NetworkConfig | null>(null);

  useEffect(() => {
    loadNetworks();
  }, []);

  const loadNetworks = () => {
    setNetworks(networkService.getNetworks());
    setCurrentNetwork(networkService.getCurrentNetwork());
  };

  const handleNetworkSwitch = async (chainId: number) => {
    try {
      const ok = await networkService.switchNetwork(chainId);
      if (ok) {
        const newNetwork = networkService.getCurrentNetwork();
        setCurrentNetwork(newNetwork);
        setIsDropdownOpen(false);
        if (newNetwork && onNetworkChange) onNetworkChange(newNetwork);
      }
    } catch (e: any) {
      alert(e?.message || '네트워크 전환에 실패했습니다.');
    }
  };

  const handleRemoveNetwork = (chainId: number, event: React.MouseEvent) => {
    event.stopPropagation();
    if (networkService.removeCustomNetwork(chainId)) {
      loadNetworks();
    }
  };

  const handleAddNetwork = () => {
    setEditTarget(null);
    setShowAddModal(true);
    setIsDropdownOpen(false);
  };

  const handleEditNetwork = (network: NetworkConfig, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTarget(network);
    setShowAddModal(true);
    setIsDropdownOpen(false);
  };

  const handleNetworkAdded = () => {
    loadNetworks();
    setShowAddModal(false);
  };

  return (
    <div className="network-selector">
      <div className="network-current" onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
        <div className="network-info">
          <div className="network-name">{currentNetwork?.name || 'No Network'}</div>
          <div className="network-chain">Chain ID: {currentNetwork?.chainId || 'N/A'}</div>
        </div>
        <div className={`dropdown-arrow ${isDropdownOpen ? 'open' : ''}`}>▼</div>
      </div>

      {isDropdownOpen && (
        <div className="network-dropdown">
          <div className="network-list">
            {networks.map((network) => (
              <div
                key={network.chainId}
                className={`network-item ${currentNetwork?.chainId === network.chainId ? 'active' : ''}`}
                onClick={() => handleNetworkSwitch(network.chainId)}
              >
                <div className="network-details">
                  <div className="network-name">{network.name}</div>
                  <div className="network-chain">Chain ID: {network.chainId}</div>
                  <div className="network-symbol">{network.symbol}</div>
                </div>
                <div style={{ display: 'grid', gridAutoFlow: 'column', gap: 6 }}>
                  <button
                    className="remove-network"
                    onClick={(e) => handleEditNetwork(network, e)}
                    title="Edit network"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="feather feather-edit-3">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    </svg>
                  </button>
                  {network.isCustom && (
                    <button
                      className="remove-network"
                      onClick={(e) => handleRemoveNetwork(network.chainId, e)}
                      title="Remove custom network"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="feather feather-x">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <div className="network-actions">
            <button className="add-network-btn" onClick={handleAddNetwork}>
              + Add Custom Network
            </button>
          </div>
        </div>
      )}

      {showAddModal && (
        <AddNetworkModal
          onClose={() => setShowAddModal(false)}
          onNetworkAdded={handleNetworkAdded}
          editTarget={editTarget}
        />
      )}
    </div>
  );
};
