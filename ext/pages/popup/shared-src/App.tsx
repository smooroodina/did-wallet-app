import React, { useState } from 'react';
import './App.css';

interface AppProps {
  platform?: 'desktop' | 'extension';
  extensionActions?: React.ReactNode; // Extension 전용 액션들
}

const App = ({ platform = 'desktop', extensionActions }: AppProps) => {
  const [count, setCount] = useState(0);

  return (
    <div className={`app app--${platform}`}>
      <header className="app-header">
        <h1>DID Wallet App</h1>
        <p>Shared React App for Desktop & Extension</p>
      </header>
      
      <main className="app-main">
        <div className="counter-demo">
          <button onClick={() => setCount(count + 1)}>
            Count: {count}
          </button>
          <p>This is a shared component working on {platform}!</p>
        </div>
        
        <div className="features">
          <h3>Features to implement:</h3>
          <ul>
            <li>DID Management</li>
            <li>Wallet Operations</li>
            <li>Secure Storage</li>
          </ul>
        </div>
        
        {/* Extension 전용 기능들 */}
        {extensionActions && (
          <div className="extension-section">
            {extensionActions}
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
