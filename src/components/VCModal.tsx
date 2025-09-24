import React from 'react';
import { VerifiableCredential } from '../types/vc';
import { getDemoVpRequest, buildVpFromRequestAndVc, type VerifiablePresentation } from '../lib/vpRequestHandler';

interface VCModalProps {
  vc: VerifiableCredential | null;
  onClose: () => void;
}

export const VCModal: React.FC<VCModalProps> = ({ vc, onClose }) => {
  if (!vc) return null;

  const [vp, setVp] = React.useState<VerifiablePresentation | null>(null);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // 토스트 메시지 표시 (App.tsx의 토스트 시스템 사용)
      const event = new CustomEvent('showToast', { detail: 'VC가 클립보드에 복사되었습니다! 📋' });
      window.dispatchEvent(event);
    } catch (err) {
      console.error('복사 실패:', err);
    }
  };

  return (
    <div className="modal-overlay visible" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>VC 상세 정보</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          <div className="vc-info">
            <div className="vc-field">
              <label>발급자:</label>
              <span>{vc.issuer?.name || vc.issuer?.id}</span>
            </div>
            
            <div className="vc-field">
              <label>주체:</label>
              <span>{vc.credentialSubject?.name || vc.credentialSubject?.studentName || vc.credentialSubject?.id}</span>
            </div>
            
            <div className="vc-field">
              <label>발급일:</label>
              <span>{new Date(vc.issuanceDate).toLocaleString()}</span>
            </div>
            
            {vc.expirationDate && (
              <div className="vc-field">
                <label>만료일:</label>
                <span>{new Date(vc.expirationDate).toLocaleString()}</span>
              </div>
            )}
            
            {vc.savedAt && (
              <div className="vc-field">
                <label>저장일:</label>
                <span>{new Date(vc.savedAt).toLocaleString()}</span>
              </div>
            )}
            
            {vc.origin && (
              <div className="vc-field">
                <label>발급 사이트:</label>
                <span>{vc.origin}</span>
              </div>
            )}
          </div>
          
          <div className="vc-json">
            <label>VC JSON:</label>
            <div className="json-container">
              <pre>{JSON.stringify(vc, null, 2)}</pre>
            </div>
          </div>

          {vp && (
            <div className="vc-json" style={{ marginTop: 12 }}>
              <label>생성된 VP JSON:</label>
              <div className="json-container">
                <pre>{JSON.stringify(vp, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={() => {
              try {
                const demoReq = getDemoVpRequest();
                const vpBuilt = buildVpFromRequestAndVc(demoReq, vc);
                setVp(vpBuilt);
                const event = new CustomEvent('showToast', { detail: 'VP가 생성되었습니다.' });
                window.dispatchEvent(event);
              } catch (e) {
                console.error('VP 생성 실패:', e);
                const event = new CustomEvent('showToast', { detail: 'VP 생성 실패 ❌' });
                window.dispatchEvent(event);
              }
            }}
          >VP 생성</button>
          <button className="btn btn-primary" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
};
