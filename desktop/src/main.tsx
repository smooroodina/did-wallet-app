import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from '../../src'
import TitleBar from './components/TitleBar'
import './index.css'

const DesktopApp = () => {
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light');

  const handleReload = async () => {
    if (typeof window !== 'undefined' && window.ipcRenderer?.reloadApp) {
      try {
        await window.ipcRenderer.reloadApp();
      } catch (error) {
        console.error('Failed to reload app:', error);
      }
    }
  };

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
  };

  return (
    <>
      <TitleBar onReload={handleReload} theme={theme} />
      <App platform="desktop" onThemeChange={handleThemeChange} />
    </>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DesktopApp />
  </React.StrictMode>,
)

// Use contextBridge
window.ipcRenderer.on('main-process-message', (_event, message) => {
  console.log(message)
})
