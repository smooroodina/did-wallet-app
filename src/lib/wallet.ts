import type { JsonRpcProvider } from 'ethers'
import { Wallet, JsonRpcProvider as EthersJsonRpcProvider, type HDNodeWallet } from 'ethers'
import { DEV_CONFIG, isDevModeEnabled } from '../config/dev.config'
import { validatePassword, validateMnemonic, validatePrivateKey, validateWalletConfig } from './validation'
import { DEFAULT_NETWORKS, type NetworkConfig } from '../types/network'
export type SupportedNetwork = 'mainnet' | 'sepolia'

export interface StoredState {
  keystoreJson?: string
  address?: string
  selectedNetwork?: SupportedNetwork
}

const STORAGE_KEY = 'wallet.state.v1'

let runtimeWallet: Wallet | HDNodeWallet | null = null
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

export function resetStoredState() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
  runtimeWallet = null
}

export function clearRuntimeWallet() {
  runtimeWallet = null
}

export function isUnlocked(): boolean {
  if (isDevModeEnabled()) {
    return true // Always unlocked in dev mode
  }
  return !!runtimeWallet
}

export function getAddress(): string | undefined {
  if (isDevModeEnabled()) {
    return DEV_CONFIG.wallet.address
  }
  return runtimeWallet?.address || readStoredState().address
}

export function getSelectedNetwork(): SupportedNetwork {
  if (isDevModeEnabled()) {
    return DEV_CONFIG.network
  }
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
    const networks = DEFAULT_NETWORKS.filter(n => n.name.toLowerCase().includes(net))
    if (!networks.length) throw new Error(`Network ${net} not found`)
    const cfg = networks[0]
    currentProvider = new EthersJsonRpcProvider(cfg.rpcUrl, cfg.chainId)
  }
  return currentProvider
}

export async function createAndStoreWallet(password: string) {
  // Validate password
  const passwordValidation = validatePassword(password)
  if (!passwordValidation.isValid) {
    throw new Error(passwordValidation.error)
  }
  
  const wallet = Wallet.createRandom()
  const keystoreJson = await wallet.encrypt(password)
  writeStoredState({ keystoreJson, address: wallet.address })
  runtimeWallet = wallet
  return wallet.address
}

export async function storeWalletWithPassword(wallet: Wallet | HDNodeWallet, password: string) {
  // Validate password
  const passwordValidation = validatePassword(password)
  if (!passwordValidation.isValid) {
    throw new Error(passwordValidation.error)
  }
  
  const keystoreJson = await wallet.encrypt(password)
  writeStoredState({ keystoreJson, address: wallet.address })
  runtimeWallet = wallet
  return wallet.address
}

export async function unlockWithPassword(password: string): Promise<string> {
  const { keystoreJson } = readStoredState()
  if (!keystoreJson) throw new Error('Keystore not found')
  const wallet = await Wallet.fromEncryptedJson(keystoreJson, password)
  const addr = wallet.address
  runtimeWallet = wallet.connect(getProvider()) as Wallet | HDNodeWallet
  return addr
}

export function lockWallet() {
  runtimeWallet = null
}

export function getRuntimeWallet(): Wallet | HDNodeWallet | null {
  return runtimeWallet
}

export async function reencryptWithNewPassword(oldPassword: string, newPassword: string) {
  const { keystoreJson } = readStoredState()
  if (!keystoreJson) throw new Error('Keystore not found')
  const wallet = await Wallet.fromEncryptedJson(keystoreJson, oldPassword)
  const nextJson = await wallet.encrypt(newPassword)
  writeStoredState({ keystoreJson: nextJson, address: wallet.address })
  runtimeWallet = wallet as Wallet | HDNodeWallet
  return wallet.address
}

export async function importWalletFromMnemonic(mnemonic: string, password: string) {
  // Validate inputs
  const passwordValidation = validatePassword(password)
  if (!passwordValidation.isValid) {
    throw new Error(passwordValidation.error)
  }
  
  const mnemonicValidation = validateMnemonic(mnemonic)
  if (!mnemonicValidation.isValid) {
    throw new Error(mnemonicValidation.error)
  }
  
  const wallet = Wallet.fromPhrase(mnemonic.trim().toLowerCase())
  return storeWalletWithPassword(wallet, password)
}

export async function importWalletFromPrivateKey(privateKey: string, password: string) {
  // Validate inputs
  const passwordValidation = validatePassword(password)
  if (!passwordValidation.isValid) {
    throw new Error(passwordValidation.error)
  }
  
  const privateKeyValidation = validatePrivateKey(privateKey)
  if (!privateKeyValidation.isValid) {
    throw new Error(privateKeyValidation.error)
  }
  
  const cleanKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`
  const wallet = new Wallet(cleanKey)
  return storeWalletWithPassword(wallet, password)
}

export async function initDevWallet() {
  if (!isDevModeEnabled()) return false
  
  try {
    // Validate dev config first
    const configValidation = validateWalletConfig(DEV_CONFIG.wallet)
    if (!configValidation.isValid) {
      console.error('❌ Dev config validation failed:', configValidation.error)
      throw new Error(`개발 설정 오류: ${configValidation.error}`)
    }
    
    // Create wallet from dev mnemonic or private key
    let wallet: Wallet | HDNodeWallet
    if ('mnemonic' in DEV_CONFIG.wallet) {
      wallet = Wallet.fromPhrase((DEV_CONFIG.wallet as {mnemonic: string}).mnemonic)
      console.log('🔧 Dev mode: Wallet created from mnemonic')
    } else if (DEV_CONFIG.wallet.privateKey) {
      const cleanKey = DEV_CONFIG.wallet.privateKey.startsWith('0x') 
        ? DEV_CONFIG.wallet.privateKey 
        : `0x${DEV_CONFIG.wallet.privateKey}`
      wallet = new Wallet(cleanKey)
      console.log('🔧 Dev mode: Wallet created from private key')
    } else {
      throw new Error('Dev config must contain either mnemonic or privateKey')
    }
    
    runtimeWallet = wallet.connect(getProvider())
    console.log('🔧 Dev mode: Wallet auto-initialized with address:', wallet.address)
    return true
  } catch (error) {
    console.error('Failed to initialize dev wallet:', error)
    // Reset to force manual setup
    resetStoredState()
    throw error
  }
}