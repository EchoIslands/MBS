/** Only accept local customer pages or an exact invitation link. */
export function customerLoginRedirect(value: string | null): string | null {
  if (!value || /[\\\r\n]/.test(value)) return null;
  if (/^\/invite\?ref=ref_[A-Za-z0-9_]{1,28}$/.test(value)) return value;
  if (!value.startsWith('/customer/')) return null;
  try {
    const target = new URL(value, 'https://mbs.invalid');
    if (target.origin !== 'https://mbs.invalid' || !target.pathname.startsWith('/customer/')) return null;
    const path = decodeURIComponent(target.pathname).replace(/\/+$/, '').toLowerCase();
    if (path === '/customer/login' || path === '/customer/change-password' || /[\\\r\n]/.test(path)) return null;
    return target.pathname + target.search + target.hash;
  } catch { return null; }
}

export function customerPasswordChangePath(returnTo: string | null): string {
  const target = customerLoginRedirect(returnTo);
  return '/customer/change-password' + (target ? '?redirect=' + encodeURIComponent(target) : '');
}
