import '@src/Popup.css';
import { t } from '@extension/i18n';
import { PROJECT_URL_OBJECT, useStorage, withErrorBoundary, withSuspense } from '@extension/shared';
import { exampleThemeStorage } from '@extension/storage';
import { cn, ErrorDisplay, LoadingSpinner, ToggleButton } from '@extension/ui';
// 공통 App 컴포넌트 import
import App from '@shared/App';
import '@shared/App.css'; 

const notificationOptions = {
  type: 'basic',
  iconUrl: chrome.runtime.getURL('icon-34.png'),
  title: 'Injecting content script error',
  message: 'You cannot inject script here!',
} as const;

const Popup = () => {
  const { isLight } = useStorage(exampleThemeStorage);

  const goGithubSite = () => chrome.tabs.create(PROJECT_URL_OBJECT);

  const injectContentScript = async () => {
    const [tab] = await chrome.tabs.query({ currentWindow: true, active: true });

    if (tab.url!.startsWith('about:') || tab.url!.startsWith('chrome:')) {
      chrome.notifications.create('inject-error', notificationOptions);
    }

    await chrome.scripting
      .executeScript({
        target: { tabId: tab.id! },
        files: ['/content-runtime/example.iife.js', '/content-runtime/all.iife.js'],
      })
      .catch(err => {
        if (err.message.includes('Cannot access a chrome:// URL')) {
          chrome.notifications.create('inject-error', notificationOptions);
        }
      });
  };

  // Extension 전용 액션들
  const extensionActions = (
    <div className="extension-actions">
      <h3>Extension Actions</h3>
      <button
        className={cn(
          'mt-4 rounded px-4 py-2 font-bold shadow hover:scale-105',
          isLight ? 'bg-blue-200 text-black' : 'bg-gray-700 text-white',
        )}
        onClick={goGithubSite}>
        Open GitHub
      </button>
      <button
        className={cn(
          'mt-2 rounded px-4 py-2 font-bold shadow hover:scale-105',
          isLight ? 'bg-green-200 text-black' : 'bg-green-700 text-white',
        )}
        onClick={injectContentScript}>
        {t('injectButton')}
      </button>
      <ToggleButton>{t('toggleTheme')}</ToggleButton>
    </div>
  );

  return (
    <div className={cn(isLight ? 'bg-slate-50' : 'bg-gray-800')}>
      <App platform="extension" extensionActions={extensionActions} />
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);
