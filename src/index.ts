// Main export for the shared app
export { default as App } from './App';

// Types that might be useful
export interface Platform {
  type: 'desktop' | 'extension';
  version: string;
}

// You can add more exports here as your app grows
