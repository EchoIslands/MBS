/** Only accept a local customer path; never redirect to an external origin or login loop. */
export function customerLoginRedirect(value: string | null): string | null {
  if (!value || !value.startsWith('/customer/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return null;
  try {
    const target = new URL(value, 'https://mbs.invalid');
    if (target.origin !== 'https://mbs.invalid' || target.pathname === '/customer/login' || target.pathname === '/customer/change-password') return null;
    return target.pathname + target.search + target.hash;
  } catch { return null; }
}
