type ErrorLike = {
  message?: string;
  code?: string;
  name?: string;
  status?: number;
};

const AUTH_ERROR_CODE_MAP: Record<string, string> = {
  invalid_credentials: 'E-posta veya şifre hatalı.',
  email_not_confirmed: 'E-posta adresi henüz doğrulanmamış.',
  user_already_exists: 'Bu e-posta ile zaten bir hesap var.',
  weak_password: 'Şifre güvenlik politikasını karşılamıyor. Daha güçlü bir şifre deneyin.',
};

const COMMON_AUTH_ERROR_MAP: Array<{ pattern: RegExp; tr: string }> = [
  { pattern: /invalid login credentials/i, tr: 'E-posta veya şifre hatalı.' },
  { pattern: /email not confirmed/i, tr: 'E-posta adresi henüz doğrulanmamış.' },
  { pattern: /user already registered/i, tr: 'Bu e-posta ile zaten bir hesap var.' },
  { pattern: /password should be at least/i, tr: 'Şifre en az 6 karakter olmalı.' },
  {
    pattern: /weak password|password is too weak|password should contain|password does not meet|password.*(number|uppercase|lowercase|special)/i,
    tr: 'Şifre güvenlik politikasını karşılamıyor. Daha güçlü bir şifre deneyin.',
  },
  { pattern: /unable to validate email address/i, tr: 'E-posta adresi geçersiz görünüyor.' },
  { pattern: /invalid email/i, tr: 'Geçerli bir e-posta adresi gir.' },
  { pattern: /email rate limit exceeded/i, tr: 'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar dene.' },
  { pattern: /too many requests/i, tr: 'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar dene.' },
  { pattern: /network request failed/i, tr: 'İnternet bağlantısı hatası. Lütfen bağlantını kontrol et.' },
  { pattern: /failed to fetch/i, tr: 'Sunucuya ulaşılamadı. Lütfen tekrar dene.' },
  { pattern: /signup is disabled/i, tr: 'Kayıt olma işlemi şu anda kapalı.' },
  { pattern: /oauth/i, tr: 'Sağlayıcı ile giriş tamamlanamadı. Lütfen tekrar dene.' },
];

export function getAuthErrorMessageTr(error: unknown, fallback: string): string {
  const errorLike = (error ?? {}) as ErrorLike;
  const message = String(errorLike.message ?? '').trim();
  const code = String(errorLike.code ?? '').trim().toLowerCase();
  const name = String(errorLike.name ?? '').trim().toLowerCase();

  if (code && AUTH_ERROR_CODE_MAP[code]) {
    return AUTH_ERROR_CODE_MAP[code];
  }

  if (name === 'authapierror' && /weak_password|password/i.test(message)) {
    return 'Şifre güvenlik politikasını karşılamıyor. Daha güçlü bir şifre deneyin.';
  }

  if (!message) return fallback;

  const normalized = message.toLowerCase();
  for (const item of COMMON_AUTH_ERROR_MAP) {
    if (item.pattern.test(normalized)) {
      return item.tr;
    }
  }

  return fallback;
}
