import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { RefreshableScrollView } from '../../src/components/RefreshableScrollView';
import { Card } from '../../src/components/Card';
import { supabase } from '../../src/services/supabase';
import { colors } from '../../src/theme';

type AuthLinkParams = {
  access_token?: string;
  refresh_token?: string;
  code?: string;
  type?: string;
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
  };
}

export default function AuthConfirmScreen() {
  const params = useLocalSearchParams<AuthLinkParams>();
  const currentUrl = Linking.useURL();
  const [statusText, setStatusText] = useState('Doğrulama bağlantısı kontrol ediliyor...');
  const [isLoading, setIsLoading] = useState(true);

  const mergedParams = useMemo<AuthLinkParams>(() => {
    const fromUrl = parseAuthLinkParams(currentUrl);
    const accessToken = Array.isArray(params.access_token) ? params.access_token[0] : params.access_token;
    const refreshToken = Array.isArray(params.refresh_token) ? params.refresh_token[0] : params.refresh_token;
    const code = Array.isArray(params.code) ? params.code[0] : params.code;
    const type = Array.isArray(params.type) ? params.type[0] : params.type;

    return {
      access_token: accessToken ?? fromUrl.access_token,
      refresh_token: refreshToken ?? fromUrl.refresh_token,
      code: code ?? fromUrl.code,
      type: type ?? fromUrl.type,
    };
  }, [currentUrl, params.access_token, params.code, params.refresh_token, params.type]);

  useEffect(() => {
    let cancelled = false;

    async function finalizeConfirmation() {
      try {
        if (mergedParams.code) {
          const { error } = await supabase.auth.exchangeCodeForSession(mergedParams.code);
          if (error) throw error;
        } else if (mergedParams.access_token && mergedParams.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: mergedParams.access_token,
            refresh_token: mergedParams.refresh_token,
          });
          if (error) throw error;
        }

        if (!cancelled) {
          setStatusText('E-posta doğrulaması tamamlandı. Giriş yapabilirsin.');
        }
      } catch (error: any) {
        if (!cancelled) {
          setStatusText(String(error?.message ?? 'Doğrulama tamamlanamadı.'));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    finalizeConfirmation();

    return () => {
      cancelled = true;
    };
  }, [mergedParams.access_token, mergedParams.code, mergedParams.refresh_token]);

  return (
    <RefreshableScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 36 }}>
      <TouchableOpacity onPress={() => router.replace('/')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}>
        <Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 12 }}>E-posta Doğrulama</Text>
      <Text style={{ color: colors.muted, marginTop: 5 }}>Hesap doğrulama işlemi tamamlanıyor.</Text>

      <Card style={{ marginTop: 20 }}>
        {isLoading ? <ActivityIndicator color={colors.primary} /> : null}
        <Text style={{ color: colors.text, marginTop: isLoading ? 10 : 0 }}>{statusText}</Text>
      </Card>

      <TouchableOpacity
        onPress={() => router.replace('/')}
        style={{
          backgroundColor: colors.primary,
          padding: 16,
          borderRadius: 14,
          marginTop: 16,
        }}
      >
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Giriş Ekranına Dön</Text>
      </TouchableOpacity>
    </RefreshableScrollView>
  );
}
