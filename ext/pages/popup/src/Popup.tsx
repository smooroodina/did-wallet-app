import '@src/Popup.css';
import { withErrorBoundary, withSuspense } from '@extension/shared';
import { ErrorDisplay, LoadingSpinner } from '@extension/ui';
// 공통 App 컴포넌트 import
import App from '@shared/App';
import '@shared/App.css'; 

const Popup = () => {
  return (
    <div>
      <App platform="extension" />
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <LoadingSpinner />), ErrorDisplay);
