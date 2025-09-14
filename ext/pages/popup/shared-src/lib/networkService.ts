import { JsonRpcProvider } from 'ethers';
import { NetworkConfig, NetworkValidationResult, DEFAULT_NETWORKS } from '../types/network';

export class NetworkService {
  private networks: NetworkConfig[] = [];
  private currentNetwork: NetworkConfig | null = null;

  constructor() {
    this.loadNetworks();
  }

  // Load networks from storage
  private loadNetworks() {
    try {
      const stored = localStorage.getItem('did_wallet_networks');
      if (stored) {
        this.networks = JSON.parse(stored);
      } else {
        this.networks = [...DEFAULT_NETWORKS];
        this.saveNetworks();
      }
      
      // Load current network
      const currentChainId = localStorage.getItem('did_wallet_current_network');
      if (currentChainId) {
        this.currentNetwork = this.networks.find(n => n.chainId === parseInt(currentChainId)) || null;
      }
      
      if (!this.currentNetwork && this.networks.length > 0) {
        this.currentNetwork = this.networks.find(n => n.chainId === 11155111) || this.networks[0]; // Default to Sepolia
      }
    } catch (error) {
      console.error('Failed to load networks:', error);
      this.networks = [...DEFAULT_NETWORKS];
      this.currentNetwork = this.networks.find(n => n.chainId === 11155111) || this.networks[0];
    }
  }

  // Save networks to storage
  private saveNetworks() {
    localStorage.setItem('did_wallet_networks', JSON.stringify(this.networks));
    if (this.currentNetwork) {
      localStorage.setItem('did_wallet_current_network', this.currentNetwork.chainId.toString());
    }
  }

  // Get all networks
  getNetworks(): NetworkConfig[] {
    return [...this.networks];
  }

  // Get current network
  getCurrentNetwork(): NetworkConfig | null {
    return this.currentNetwork;
  }

  // Switch to network
  async switchNetwork(chainId: number): Promise<boolean> {
    const network = this.networks.find(n => n.chainId === chainId);
    if (!network) return false;

    // validate selected network before switching
    const validation = await this.validateNetwork(network.rpcUrl);
    if (!validation.isValid || validation.chainId !== network.chainId) {
      throw new Error(`선택한 네트워크가 유효하지 않습니다: ${validation.error || '불일치'}`);
    }

    this.currentNetwork = network;
    this.saveNetworks();
    return true;
  }

  // Validate RPC URL and get chain ID
  async validateNetwork(rpcUrl: string): Promise<NetworkValidationResult> {
    try {
      const provider = new JsonRpcProvider(rpcUrl);
      
      // Test connection with timeout
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 10000)
      );

      const networkInfo = await Promise.race([
        provider.getNetwork(),
        timeoutPromise
      ]);

      return {
        isValid: true,
        chainId: Number(networkInfo.chainId),
      };
    } catch (error) {
      console.error('Network validation failed:', error);
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // Add custom network
  async addCustomNetwork(network: Omit<NetworkConfig, 'isCustom'>): Promise<boolean> {
    try {
      // Validate RPC URL
      const validation = await this.validateNetwork(network.rpcUrl);
      if (!validation.isValid) {
        throw new Error(`RPC validation failed: ${validation.error}`);
      }

      // Check if chain ID matches
      if (validation.chainId !== network.chainId) {
        throw new Error(`Chain ID mismatch: Expected ${network.chainId}, got ${validation.chainId}`);
      }

      // Check if network already exists
      const existingIndex = this.networks.findIndex(n => n.chainId === network.chainId);
      
      const newNetwork: NetworkConfig = {
        ...network,
        isCustom: true,
      };

      if (existingIndex >= 0) {
        // Update existing network
        this.networks[existingIndex] = newNetwork;
      } else {
        // Add new network
        this.networks.push(newNetwork);
      }

      this.saveNetworks();
      return true;
    } catch (error) {
      console.error('Failed to add custom network:', error);
      throw error;
    }
  }

  // Update existing network (including defaults)
  async updateNetwork(updated: NetworkConfig): Promise<boolean> {
    // Validate RPC URL and chain ID
    const validation = await this.validateNetwork(updated.rpcUrl);
    if (!validation.isValid) {
      throw new Error(`RPC validation failed: ${validation.error}`);
    }
    if (validation.chainId !== updated.chainId) {
      throw new Error(`Chain ID mismatch: Expected ${updated.chainId}, got ${validation.chainId}`);
    }

    const idx = this.networks.findIndex(n => n.chainId === updated.chainId);
    if (idx === -1) {
      throw new Error('네트워크를 찾을 수 없습니다.');
    }

    this.networks[idx] = { ...updated, isCustom: this.networks[idx].isCustom };
    this.saveNetworks();
    return true;
  }

  // Remove custom network
  removeCustomNetwork(chainId: number): boolean {
    const networkIndex = this.networks.findIndex(n => n.chainId === chainId && n.isCustom);
    if (networkIndex >= 0) {
      this.networks.splice(networkIndex, 1);
      
      // If current network was removed, switch to default
      if (this.currentNetwork?.chainId === chainId) {
        this.currentNetwork = this.networks.find(n => n.chainId === 11155111) || this.networks[0];
      }
      
      this.saveNetworks();
      return true;
    }
    return false;
  }

  // Get provider for current network
  getProvider(): JsonRpcProvider | null {
    if (!this.currentNetwork) return null;
    return new JsonRpcProvider(this.currentNetwork.rpcUrl);
  }

  // Reset to default networks
  resetToDefaults() {
    this.networks = [...DEFAULT_NETWORKS];
    this.currentNetwork = this.networks.find(n => n.chainId === 11155111) || this.networks[0];
    this.saveNetworks();
  }
}

// Singleton instance
export const networkService = new NetworkService();
