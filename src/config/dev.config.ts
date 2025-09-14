// Development configuration - DO NOT USE IN PRODUCTION
export const DEV_CONFIG = {
  // Set to true to skip authentication in development
  skipAuth: true,
  
  // Development wallet credentials
  // NOTE: You can provide either mnemonic OR privateKey (or both for validation)
  wallet: {
    password: '1q2w3e4r',
    // mnemonic: 'outdoor valve rural kiwi shrug cook orange subway limit globe skate mesh pilot honey master nation flavor swim jungle better infant alert proud believe',
    privateKey: '0x03876aefca453f41d300c855c237e83291fcf51c6c32746cfc9e53b645be8393',
    address: '0x83f03255fC8bBd37Ca7326d6CC79baF056470c9d',
  },
  
  // Network settings for development
  network: 'sepolia' as const,
};

// Check if we're in development mode
export const isDevelopment = () => {
  // For Chrome Extension
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    // Extension environment - check if it's unpacked (development)
    return !chrome.runtime.getManifest().update_url;
  }
  
  // For Desktop/Web
  return process.env.NODE_ENV === 'development' || 
         (typeof window !== 'undefined' && window.location.hostname === 'localhost');
};

// Helper to check if dev mode is enabled
export const isDevModeEnabled = () => {
  const devMode = isDevelopment();
  const skipAuth = DEV_CONFIG.skipAuth;
  const result = devMode && skipAuth;
  
  // Debug logging
  console.log('Dev Config Debug:', {
    isDevelopment: devMode,
    skipAuth: skipAuth,
    isDevModeEnabled: result,
    environment: typeof chrome !== 'undefined' ? 'extension' : 'desktop'
  });
  
  return result;
};