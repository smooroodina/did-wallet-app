import 'webextension-polyfill';
import { exampleThemeStorage } from '@extension/storage';

exampleThemeStorage.get().then(theme => {
  console.log('theme', theme);
});

// Wallet auto-lock functionality
let lockTimer: NodeJS.Timeout | null = null;
const IDLE_LOCK_MS = 5 * 60 * 1000; // 5 minutes

function resetLockTimer() {
  if (lockTimer) {
    clearTimeout(lockTimer);
  }
  
  lockTimer = setTimeout(() => {
    // Lock the wallet by clearing the runtime state
    chrome.storage.local.set({ walletLocked: true }, () => {
      console.log('Wallet auto-locked due to inactivity');
      // Notify all tabs that wallet is locked
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, { type: 'WALLET_LOCKED' }).catch(() => {
              // Ignore errors if tab doesn't have content script
            });
          }
        });
      });
    });
  }, IDLE_LOCK_MS);
}

// Listen for user activity to reset timer
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'USER_ACTIVITY') {
    resetLockTimer();
  } else if (message.type === 'WALLET_UNLOCKED') {
    resetLockTimer();
  } else if (message.type === 'WALLET_LOCKED') {
    if (lockTimer) {
      clearTimeout(lockTimer);
      lockTimer = null;
    }
  }
});

// Initialize timer when extension loads
chrome.storage.local.get(['walletLocked'], (result) => {
  if (!result.walletLocked) {
    resetLockTimer();
  }
});

console.log('Background loaded');
console.log("Edit 'chrome-extension/src/background/index.ts' and save to reload.");
