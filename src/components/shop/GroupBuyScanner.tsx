import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, ScanLine } from 'lucide-react';

interface GroupBuyScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (code: string) => void;
}

const GroupBuyScanner: React.FC<GroupBuyScannerProps> = ({ isOpen, onClose, onScan }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const containerId = 'group-buy-scanner';

  useEffect(() => {
    if (!isOpen) return;

    setError('');
    setLoading(true);
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    const config = {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1,
    };

    scanner
      .start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          onScan(decodedText.trim());
          scanner.stop().catch(() => {});
          onClose();
        },
        () => {}
      )
      .then(() => {
        setLoading(false);
      })
      .catch((err: unknown) => {
        setLoading(false);
        const message = err instanceof Error ? err.message : String(err);
        setError('无法启动摄像头：' + message + '。请检查摄像头权限或手动输入券码。');
      });

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [isOpen, onClose, onScan]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="relative w-full max-w-md rounded-xl bg-white p-4 shadow-xl mx-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-pink-600" />
            <h3 className="text-lg font-bold text-gray-800">扫码核销券码</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 hover:bg-gray-100"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="relative overflow-hidden rounded-lg bg-black">
          <div id={containerId} className="aspect-square w-full" />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white">
              正在启动摄像头...
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <p className="mt-4 text-center text-sm text-gray-500">
          将团购券二维码放入框内即可自动识别
        </p>
      </div>
    </div>
  );
};

export default GroupBuyScanner;
