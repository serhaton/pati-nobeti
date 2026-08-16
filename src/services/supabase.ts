import { createClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';

// .env içine EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_KEY eklenebilir.
// Veri kaynağı için EXPO_PUBLIC_DATA_SOURCE=mock | supabase kullanılabilir (varsayılan: supabase).
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://YOUR_PROJECT.supabase.co';
const key =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'YOUR_PUBLISHABLE_OR_ANON_KEY';
const dataSourceRaw = process.env.EXPO_PUBLIC_DATA_SOURCE ?? 'supabase';
const SIGNUP_EMAIL_REDIRECT_URL = 'patiuzat://auth/confirm';
const RESET_PASSWORD_REDIRECT_URL = 'patiuzat://auth/reset-password';

export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage,
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
    return;
  }

  supabase.auth.stopAutoRefresh();
});

export type AppDataSource = 'supabase' | 'mock';

export function getAppDataSource(): AppDataSource {
  const normalized = dataSourceRaw.trim().toLowerCase();
  return normalized === 'mock' ? 'mock' : 'supabase';
}

export function isSupabaseConfigured(): boolean {
  return !url.includes('YOUR_PROJECT') && key !== 'YOUR_PUBLISHABLE_OR_ANON_KEY';
}

export function isSupabaseDataEnabled(): boolean {
  return getAppDataSource() === 'supabase' && isSupabaseConfigured();
}

function logAuthServiceError(action: string, error: any, context?: Record<string, unknown>) {
  console.error('[auth-service] request failed', {
    action,
    code: error?.code,
    status: error?.status,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    context,
    raw: error,
  });
}

function ensureSupabaseConfigured() {
  if (!isSupabaseConfigured()) {
    throw new Error('Uygulama servis ayarları eksik. Lütfen daha sonra tekrar deneyin.');
  }
}

export async function signInWithEmailPassword(email: string, password: string) {
  ensureSupabaseConfigured();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    logAuthServiceError('signInWithEmailPassword', error, { email });
    throw error;
  }
  return data;
}

export async function signUpWithEmailPassword(email: string, password: string) {
  ensureSupabaseConfigured();

  const normalizedEmail = email.trim().toLowerCase();
  const username = normalizedEmail;

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      emailRedirectTo: SIGNUP_EMAIL_REDIRECT_URL,
      data: {
        username,
      },
    },
  });
  if (error) {
    logAuthServiceError('signUpWithEmailPassword', error, { email: normalizedEmail });
    throw error;
  }
  return data;
}

export async function signUpWithEmailAndProfile(input: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}) {
  ensureSupabaseConfigured();

  const normalizedEmail = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const phone = String(input.phone ?? '').trim();
  const username = normalizedEmail;

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: input.password,
    options: {
      emailRedirectTo: SIGNUP_EMAIL_REDIRECT_URL,
      data: {
        username,
        full_name: fullName,
        name: fullName,
        phone,
      },
    },
  });
  if (error) {
    logAuthServiceError('signUpWithEmailAndProfile', error, {
      email: normalizedEmail,
      hasPhone: phone.length > 0,
      fullNameLength: fullName.length,
    });
    throw error;
  }

  return data;
}

export async function signInWithGoogle() {
  ensureSupabaseConfigured();

  const redirectTo = Linking.createURL('/');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });

  if (error) {
    logAuthServiceError('signInWithGoogle', error, { redirectTo });
    throw error;
  }
  return data;
}

export async function signInWithApple() {
  ensureSupabaseConfigured();

  const redirectTo = Linking.createURL('/');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo },
  });

  if (error) {
    logAuthServiceError('signInWithApple', error, { redirectTo });
    throw error;
  }
  return data;
}

export async function signOutSupabase() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    logAuthServiceError('signOutSupabase', error);
    throw error;
  }
}

export async function sendPasswordResetEmail(email: string) {
  ensureSupabaseConfigured();

  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo: RESET_PASSWORD_REDIRECT_URL,
  });
  if (error) {
    logAuthServiceError('sendPasswordResetEmail', error, {
      email: normalizedEmail,
      redirectTo: RESET_PASSWORD_REDIRECT_URL,
    });
    throw error;
  }
  return data;
}
