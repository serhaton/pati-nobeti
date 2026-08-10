import { createClient } from '@supabase/supabase-js';

// .env içine EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_ANON_KEY eklenebilir.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://YOUR_PROJECT.supabase.co';
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'YOUR_ANON_KEY';

export const supabase = createClient(url, key);

export async function signInWithGoogle() {
  // Production: Supabase OAuth + Expo deep link burada uygulanmalı.
  return { provider: 'google' as const };
}

export async function signInWithApple() {
  // Production: Apple Sign In credential -> Supabase signInWithIdToken.
  return { provider: 'apple' as const };
}
