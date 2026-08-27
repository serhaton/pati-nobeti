import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity } from 'react-native';
import { RefreshableScrollView } from '../../src/components/RefreshableScrollView';
import { Card } from '../../src/components/Card';
import { signOutSupabase, supabase } from '../../src/services/supabase';
import { colors } from '../../src/theme';

type AuthLinkParams = {
  access_token?: string;
  refresh_token?: string;
  code?: string;
  type?: string;
  token?: string;
  token_hash?: string;
  error?: string;
  error_description?: string;
};

function parseAuthLinkParams(rawUrl?: string | null): AuthLinkParams {
  if (!rawUrl) return {};

  const [baseAndQuery, hashPart] = rawUrl.split('#');
  const queryPart = baseAndQuery.includes('?') ? baseAndQuery.split('?')[1] : '';
  const combined = [queryPart, hashPart].filter(Boolean).join('&');
  if (!combined) return {};

  const parsed = new URLSearchParams(combined);
  return {
    access_token: parsed.get('access_token') ?? undefined,
    refresh_token: parsed.get('refresh_token') ?? undefined,
    code: parsed.get('code') ?? undefined,
    type: parsed.get('type') ?? undefined,
    token: parsed.get('token') ?? undefined,
    token_hash: parsed.get('token_hash') ?? undefined,
    error: parsed.get('error') ?? undefined,
    error_description: parsed.get('error_description') ?? undefined,
  };
}

function isStrongPassword(value: string): boolean {
  const hasLowercase = /[a-z]/.test(value);
  const hasUppercase = /[A-Z]/.test(value);
  const hasNumber = /\d/.test(value);
  return value.length >= 6 && hasLowercase && hasUppercase && hasNumber;
}

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams<AuthLinkParams>();
  const liveUrl = Linking.useURL();
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const lastBootstrapSignatureRef = useRef<string | null>(null);
  const sessionEstablishedRef = useRef(false);
  const recoverySessionRef = useRef<{ accessToken: string; refreshToken: string } | null>(null);

  useEffect(() => {
    let mounted = true;

    Linking.getInitialURL()
      .then((url) => {
        if (!mounted) return;
        if (url) setCapturedUrl(url);
      })
      .catch(() => {
        // Ignore initial URL read failures.
      });

    const subscription = Linking.addEventListener('url', (event) => {
      if (event.url) {
        setCapturedUrl(event.url);
      }
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const currentUrl = liveUrl ?? capturedUrl;

  const mergedParams = useMemo<AuthLinkParams>(() => {
    const fromUrl = parseAuthLinkParams(currentUrl);
    const accessToken = Array.isArray(params.access_token) ? params.access_token[0] : params.access_token;
    const refreshToken = Array.isArray(params.refresh_token) ? params.refresh_token[0] : params.refresh_token;
    const code = Array.isArray(params.code) ? params.code[0] : params.code;
    const type = Array.isArray(params.type) ? params.type[0] : params.type;
    const token = Array.isArray(params.token) ? params.token[0] : params.token;
    const tokenHash = Array.isArray(params.token_hash) ? params.token_hash[0] : params.token_hash;
    const error = Array.isArray(params.error) ? params.error[0] : params.error;
    const errorDescription = Array.isArray(params.error_description) ? params.error_description[0] : params.error_description;

    return {
      access_token: accessToken ?? fromUrl.access_token,
      refresh_token: refreshToken ?? fromUrl.refresh_token,
      code: code ?? fromUrl.code,
      type: type ?? fromUrl.type,
      token: token ?? fromUrl.token,
      token_hash: tokenHash ?? fromUrl.token_hash,
      error: error ?? fromUrl.error,
      error_description: errorDescription ?? fromUrl.error_description,
    };
  }, [currentUrl, params.access_token, params.code, params.error, params.error_description, params.refresh_token, params.token, params.token_hash, params.type]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapRecoverySession() {
      const bootstrapSignature = [
        mergedParams.code ?? '',
        mergedParams.access_token ?? '',
        mergedParams.refresh_token ?? '',
        mergedParams.token_hash ?? '',
        mergedParams.token ?? '',
        mergedParams.type ?? '',
      ].join('|');

      if (sessionEstablishedRef.current) {
        if (!cancelled) setIsBootstrapping(false);
        return;
      }

      if (bootstrapSignature === '|||||') {
        // No usable recovery params yet, wait for a URL event.
        if (!cancelled) setIsBootstrapping(false);
        return;
      }

      if (lastBootstrapSignatureRef.current === bootstrapSignature) {
        if (!cancelled) setIsBootstrapping(false);
        return;
      }
      lastBootstrapSignatureRef.current = bootstrapSignature;

      try {
        console.log('[reset-password] bootstrap params', {
          currentUrl,
          mergedParams,
          hasCode: !!mergedParams.code,
          hasAccessToken: !!mergedParams.access_token,
          hasRefreshToken: !!mergedParams.refresh_token,
          hasToken: !!mergedParams.token,
          hasTokenHash: !!mergedParams.token_hash,
          type: mergedParams.type,
          signature: bootstrapSignature,
        });

        if (mergedParams.code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(mergedParams.code);
          if (error) {
            console.error('[reset-password] exchangeCodeForSession failed', {
              message: error?.message,
              code: error?.code,
              status: error?.status,
              details: error?.details,
              hint: error?.hint,
              hasCode: true,
              hasToken: !!mergedParams.token,
              hasTokenHash: !!mergedParams.token_hash,
              type: mergedParams.type,
              raw: error,
            });
            throw error;
          }

          if (data?.session?.access_token && data?.session?.refresh_token) {
            recoverySessionRef.current = {
              accessToken: data.session.access_token,
              refreshToken: data.session.refresh_token,
            };
          }
        } else if (mergedParams.access_token && mergedParams.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: mergedParams.access_token,
            refresh_token: mergedParams.refresh_token,
          });
          if (error) {
            console.error('[reset-password] setSession failed', {
              message: error?.message,
              code: error?.code,
              status: error?.status,
              details: error?.details,
              hint: error?.hint,
              hasAccessToken: !!mergedParams.access_token,
              hasRefreshToken: !!mergedParams.refresh_token,
              raw: error,
            });
            throw error;
          }

          recoverySessionRef.current = {
            accessToken: mergedParams.access_token,
            refreshToken: mergedParams.refresh_token,
          };
        } else if ((mergedParams.token_hash || mergedParams.token) && mergedParams.type) {
          const tokenHash = mergedParams.token_hash ?? mergedParams.token;
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash!,
            type: mergedParams.type as any,
          });
          if (error) {
            console.error('[reset-password] verifyOtp failed', {
              message: error?.message,
              code: error?.code,
              status: error?.status,
              details: error?.details,
              hint: error?.hint,
              hasTokenHash: !!mergedParams.token_hash,
              hasToken: !!mergedParams.token,
              type: mergedParams.type,
              raw: error,
            });
            throw error;
          }

          if (data?.session?.access_token && data?.session?.refresh_token) {
            recoverySessionRef.current = {
              accessToken: data.session.access_token,
              refreshToken: data.session.refresh_token,
            };
          }
        } else if (mergedParams.error) {
          const details = mergedParams.error_description
            ? decodeURIComponent(mergedParams.error_description)
            : mergedParams.error;
          throw new Error(details || 'Sıfırlama bağlantısı geçersiz.');
        } else {
          console.warn('[reset-password] missing recovery params', {
            currentUrl,
            mergedParams,
            signature: bootstrapSignature,
          });
          throw new Error('Sıfırlama bağlantısı geçersiz veya eksik.');
        }

        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session && recoverySessionRef.current) {
          const { error } = await supabase.auth.setSession({
            access_token: recoverySessionRef.current.accessToken,
            refresh_token: recoverySessionRef.current.refreshToken,
          });
          if (error) {
            throw error;
          }
        }

        const { data: finalSessionData } = await supabase.auth.getSession();
        if (!finalSessionData.session) {
          throw new Error('Şifre yenileme oturumu oluşturulamadı. Lütfen bağlantıya tekrar tıkla.');
        }

        sessionEstablishedRef.current = true;
        if (!cancelled) {
          setBootstrapError(null);
        }
      } catch (error: any) {
        console.error('[reset-password] bootstrap failed', {
          currentUrl,
          mergedParams,
          signature: bootstrapSignature,
          message: error?.message,
          code: error?.code,
          status: error?.status,
          details: error?.details,
          hint: error?.hint,
          raw: error,
        });
        if (!cancelled) {
          setBootstrapError(String(error?.message ?? 'Sıfırlama bağlantısı doğrulanamadı.'));
        }
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    }

    bootstrapRecoverySession();

    return () => {
      cancelled = true;
    };
  }, [mergedParams.access_token, mergedParams.code, mergedParams.error, mergedParams.error_description, mergedParams.refresh_token, mergedParams.token, mergedParams.token_hash, mergedParams.type]);

  async function onSavePassword() {
    if (!isStrongPassword(password)) {
      Alert.alert('Geçersiz şifre', 'Şifre en az 6 karakter olmalı ve en az bir küçük harf, bir büyük harf ve bir rakam içermeli.');
      return;
    }

    if (password !== passwordConfirm) {
      Alert.alert('Şifre uyumsuz', 'Şifre ve şifre tekrarı aynı olmalı.');
      return;
    }

    setIsSaving(true);
    try {
      const { data: currentSessionData } = await supabase.auth.getSession();
      if (!currentSessionData.session && recoverySessionRef.current) {
        const { error: restoreError } = await supabase.auth.setSession({
          access_token: recoverySessionRef.current.accessToken,
          refresh_token: recoverySessionRef.current.refreshToken,
        });
        if (restoreError) {
          throw restoreError;
        }
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        console.error('[reset-password] updateUser failed', {
          message: error?.message,
          code: error?.code,
          status: error?.status,
          details: error?.details,
          hint: error?.hint,
          raw: error,
        });
        throw error;
      }

      await signOutSupabase();
      Alert.alert('Başarılı', 'Şifren güncellendi. Yeni şifrenle giriş yapabilirsin.');
      router.replace('/');
    } catch (error: any) {
      Alert.alert('Güncelleme başarısız', String(error?.message ?? 'Şifre güncellenemedi.'));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <RefreshableScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 36 }}>
      <TouchableOpacity onPress={() => router.replace('/')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}>
        <Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 12 }}>Yeni Şifre Belirle</Text>
      <Text style={{ color: colors.muted, marginTop: 5 }}>Bağlantı doğrulandıktan sonra yeni şifreni kaydedebilirsin.</Text>

      <Card style={{ marginTop: 20 }}>
        {isBootstrapping ? <Text style={{ color: colors.muted }}>Bağlantı doğrulanıyor...</Text> : null}
        {bootstrapError ? <Text style={{ color: '#B54747' }}>{bootstrapError}</Text> : null}

        {!isBootstrapping && !bootstrapError ? (
          <>
            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>Yeni Şifre</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              textContentType="none"
              placeholder="Min. 6 karakter + küçük/büyük harf + rakam"
              style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 12 }}
            />

            <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>Yeni Şifre Tekrar</Text>
            <TextInput
              value={passwordConfirm}
              onChangeText={setPasswordConfirm}
              secureTextEntry
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              textContentType="none"
              placeholder="Şifreyi tekrar gir"
              style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 8 }}
            />
          </>
        ) : null}
      </Card>

      {!isBootstrapping && !bootstrapError ? (
        <TouchableOpacity
          onPress={onSavePassword}
          disabled={isSaving}
          style={{
            backgroundColor: isSaving ? '#6D907D' : colors.primary,
            padding: 16,
            borderRadius: 14,
            marginTop: 16,
            opacity: isSaving ? 0.8 : 1,
          }}
        >
          <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>
            {isSaving ? 'Kaydediliyor...' : 'Yeni Şifreyi Kaydet'}
          </Text>
        </TouchableOpacity>
      ) : null}
    </RefreshableScrollView>
  );
}
