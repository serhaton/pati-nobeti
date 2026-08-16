import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, TextInput, View, Text, TouchableOpacity } from 'react-native';
import Constants from 'expo-constants';
import { useAuth } from '../src/context/AuthContext';
import { Logo } from '../src/components/Logo';
import { getAuthErrorMessageTr } from '../src/services/authErrorMessage';
import { colors } from '../src/theme';

export default function Welcome() {
  const { isAuthLoading, signInWithProvider, signInWithEmail, forgotPassword } = useAuth();
  const params = useLocalSearchParams<{ email?: string }>();
  const prefilledEmail = Array.isArray(params.email) ? params.email[0] : params.email;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (!prefilledEmail) return;
    setEmail(prefilledEmail);
  }, [prefilledEmail]);

  function validateEmailPassword(): boolean {
    if (!email.trim()) {
      Alert.alert('Eksik bilgi', 'Lütfen e-posta adresini gir.');
      return false;
    }

    if (!password || password.length < 6) {
      Alert.alert('Eksik bilgi', 'Sifre en az 6 karakter olmali.');
      return false;
    }

    return true;
  }

  async function continueWith(provider: 'google' | 'apple') {
    try {
      await signInWithProvider(provider);
      router.replace('/community-select');
    } catch (error: any) {
      Alert.alert('Giriş başarısız', getAuthErrorMessageTr(error, 'Sağlayıcı girişi tamamlanamadı.'));
    }
  }

  async function continueWithEmail() {
    if (!validateEmailPassword()) return;

    try {
      await signInWithEmail(email, password);
      router.replace('/community-select');
    } catch (error: any) {
      Alert.alert('Giriş başarısız', getAuthErrorMessageTr(error, 'E-posta veya şifre geçersiz.'));
    }
  }

  async function onForgotPassword() {
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      Alert.alert('Eksik bilgi', 'Lütfen önce e-posta adresini gir.');
      return;
    }

    try {
      await forgotPassword(normalizedEmail);
      Alert.alert(
        'Sıfırlama bağlantısı gönderildi',
        'E-posta adresini kontrol et. Gelen bağlantı ile şifreni sıfırlayabilirsin.'
      );
    } catch (error: any) {
      Alert.alert('İşlem başarısız', getAuthErrorMessageTr(error, 'Sıfırlama e-postası gönderilemedi.'));
    }
  }

  function openRegisterScreen() {
    router.push({
      pathname: '/register',
      params: email.trim() ? { email: email.trim() } : undefined,
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, padding: 28, justifyContent: 'center' }}>
      <View style={{ alignItems: 'center', marginBottom: 42 }}>
        <Text style={{ fontSize: 76 }}>🐱🐶</Text>
        <Logo />
        <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 12, fontSize: 16, lineHeight: 24 }}>
          Mahallendeki can dostların için{'\n'}birlikte, düzenli ve şeffaf.
        </Text>
      </View>

      <TextInput
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="E-posta"
        style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 10 }}
      />

      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Sifre"
        style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 12 }}
      />

      <TouchableOpacity onPress={onForgotPassword} disabled={isAuthLoading} style={{ alignSelf: 'flex-end', marginBottom: 12, opacity: isAuthLoading ? 0.7 : 1 }}>
        <Text style={{ color: colors.primary, fontWeight: '700' }}>Sifremi unuttum</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={continueWithEmail} disabled={isAuthLoading} style={{
        backgroundColor: colors.primary, padding: 17, borderRadius: 16, marginBottom: 10, opacity: isAuthLoading ? 0.7 : 1,
      }}>
        <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, fontWeight: '800' }}>{isAuthLoading ? 'Bekleniyor...' : 'E-posta ile giriş yap'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={openRegisterScreen} disabled={isAuthLoading} style={{
        backgroundColor: '#fff', padding: 17, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.primary, opacity: isAuthLoading ? 0.7 : 1,
      }}>
        <Text style={{ color: colors.primary, textAlign: 'center', fontSize: 16, fontWeight: '800' }}>E-posta ile hesap oluştur</Text>
      </TouchableOpacity>

      <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 11, lineHeight: 16 }}>
        v{appVersion} · © {currentYear} Pati Uzat. Tüm hakları saklıdır.
      </Text>

    </View>
  );
}
