import React from 'react';
import './TitleBar.css';

interface TitleBarProps {
  onReload: () => void;
  theme: 'light' | 'dark';
}

const TitleBar: React.FC<TitleBarProps> = ({ onReload, theme }) => {
  return (
    <div className={`titlebar titlebar--${theme}`}>
      <div className="titlebar-controls titlebar-controls--left">
        <button
          className="titlebar-btn titlebar-btn--reload"
          onClick={onReload}
          title="Reload app"
          aria-label="Reload app"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" className="feather feather-refresh-ccw">
            <polyline points="1 4 1 10 7 10"></polyline>
            <polyline points="23 20 23 14 17 14"></polyline>
            <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path>
          </svg>
        </button>
      </div>
      <div className="titlebar-drag-region"></div>
      <div className="titlebar-controls titlebar-controls--right">
        <button
          className="titlebar-btn"
          onClick={() => window.ipcRenderer.windowMinimize()}
          title="Minimize"
          aria-label="Minimize"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" className="feather feather-minus">
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button
          className="titlebar-btn"
          onClick={() => window.ipcRenderer.windowToggleMaximize()}
          title="Maximize"
          aria-label="Maximize"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" className="feather feather-maximize">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
          </svg>
        </button>
        <button
          className="titlebar-btn titlebar-btn--close"
          onClick={() => window.ipcRenderer.windowClose()}
          title="Close"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" className="feather feather-x">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
