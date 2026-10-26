import { useEffect, useRef, useState } from 'react';

/** 两个员工客户编辑入口共享保存反馈；同步锁防止同一渲染周期内重复提交。 */
export function useCustomerFormSave(formKey: string | undefined) {
  const inFlight = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => { setSaveError(null); }, [formKey]);

  const saveCustomer = async (action: () => Promise<void>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await action();
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : '保存失败，请稍后重试');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return { saveCustomer, saving, saveError };
}
