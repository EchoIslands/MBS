import { useEffect, useState } from 'react';

export function useCustomerToast() {
  const [notice, setNotice] = useState<{ message: string }>();
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(undefined), 2000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const toast = notice ? <div className="customer-toast" role="status">{notice.message}</div> : null;
  return { toast, notify: (message: string) => setNotice({ message }) };
}
