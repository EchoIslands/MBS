// 图片上传（base64 → Supabase Storage URL）
const API_BASE = typeof import.meta !== 'undefined' && (import.meta as { env?: Record<string, string> }).env?.VITE_API_BASE
  ? (import.meta as { env?: Record<string, string> }).env!.VITE_API_BASE
  : '/api';

function getAuthToken(): string | null {
  try {
    return localStorage.getItem('mbs_auth_token');
  } catch (_e) {
    return null;
  }
}

export const uploadImage = async (base64Image: string): Promise<string> => {
  const token = getAuthToken();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(`${API_BASE}/upload/image`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ image: base64Image }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `上传失败：${res.status}`);
    }

    const data = (await res.json()) as { success?: boolean; url?: string; error?: string };
    if (!data.success || !data.url) {
      throw new Error(data.error || '上传失败');
    }
    return data.url;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    throw err instanceof Error ? err : new Error(String(err));
  }
};
