import { createClient } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

// .env içine EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_KEY eklenebilir.
// Veri kaynağı için EXPO_PUBLIC_DATA_SOURCE=mock | supabase kullanılabilir (varsayılan: supabase).
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://YOUR_PROJECT.supabase.co';
const key =
  process.env.EXPO_PUBLIC_SUPABASE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'YOUR_PUBLISHABLE_OR_ANON_KEY';
const dataSourceRaw = process.env.EXPO_PUBLIC_DATA_SOURCE ?? 'supabase';

export const supabase = createClient(url, key);

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

function ensureSupabaseConfigured() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase ayarlari eksik. EXPO_PUBLIC_SUPABASE_URL ve EXPO_PUBLIC_SUPABASE_KEY (veya EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY / EXPO_PUBLIC_SUPABASE_ANON_KEY) girilmeli.');
  }
}

export async function signInWithEmailPassword(email: string, password: string) {
  ensureSupabaseConfigured();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUpWithEmailPassword(email: string, password: string) {
  ensureSupabaseConfigured();

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  ensureSupabaseConfigured();

  const redirectTo = Linking.createURL('/');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });

  if (error) throw error;
  return data;
}

export async function signInWithApple() {
  ensureSupabaseConfigured();

  const redirectTo = Linking.createURL('/');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo },
  });

  if (error) throw error;
  return data;
}

export async function signOutSupabase() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
