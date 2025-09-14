import type { JsonRpcProvider } from 'ethers'
import { Wallet, JsonRpcProvider as EthersJsonRpcProvider } from 'ethers'

export type SupportedNetwork = 'mainnet' | 'sepolia'

export interface NetworkConfig {
  key: SupportedNetwork
  name: string
  rpcUrl: string
  chainId: number
  explorer?: string
}

export interface StoredState {
  keystoreJson?: string
  address?: string
  selectedNetwork?: SupportedNetwork
}

const STORAGE_KEY = 'wallet.state.v1'

export const DEFAULT_NETWORKS: Record<SupportedNetwork, NetworkConfig> = {
  mainnet: {
    key: 'mainnet',
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://cloudflare-eth.com',
    chainId: 1,
    explorer: 'https://etherscan.io',
  },
  sepolia: {
    key: 'sepolia',
    name: 'Sepolia Testnet',
    rpcUrl: 'https://rpc.sepolia.org',
    chainId: 11155111,
    explorer: 'https://sepolia.etherscan.io',
  },
}

let runtimeWallet: Wallet | null = null
let currentProvider: JsonRpcProvider | null = null

export function readStoredState(): StoredState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredState) : {}
  } catch {
    return {}
  }
}

export function writeStoredState(update: Partial<StoredState>) {
  const current = readStoredState()
  const next = { ...current, ...update }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function clearRuntimeWallet() {
  runtimeWallet = null
}

export function isUnlocked(): boolean {
  return !!runtimeWallet
}

export function getAddress(): string | undefined {
  return runtimeWallet?.address || readStoredState().address
}

export function getSelectedNetwork(): SupportedNetwork {
  const state = readStoredState()
  return state.selectedNetwork || 'mainnet'
}

export function setSelectedNetwork(net: SupportedNetwork) {
  writeStoredState({ selectedNetwork: net })
  if (currentProvider) currentProvider = null
}

export function getProvider(): JsonRpcProvider {
  if (!currentProvider) {
    const net = getSelectedNetwork()
    const cfg = DEFAULT_NETWORKS[net]
    currentProvider = new EthersJsonRpcProvider(cfg.rpcUrl, cfg.chainId)
  }
  return currentProvider
}

export async function createAndStoreWallet(password: string) {
  const wallet = Wallet.createRandom()
  const keystoreJson = await wallet.encrypt(password)
  writeStoredState({ keystoreJson, address: wallet.address })
  runtimeWallet = wallet
  return wallet.address
}

export async function unlockWithPassword(password: string): Promise<string> {
  const { keystoreJson } = readStoredState()
  if (!keystoreJson) throw new Error('Keystore not found')
  const wallet = await Wallet.fromEncryptedJson(keystoreJson, password)
  runtimeWallet = wallet.connect(getProvider())
  return runtimeWallet.address
}

export function lockWallet() {
  runtimeWallet = null
}

export function getRuntimeWallet(): Wallet | null {
  return runtimeWallet
}


