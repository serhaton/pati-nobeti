import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { RefreshableScrollView } from '../src/components/RefreshableScrollView';
import { useAuth } from '../src/context/AuthContext';
import { getAuthErrorMessageTr } from '../src/services/authErrorMessage';
import { colors } from '../src/theme';

function isValidEmail(value: string): boolean {
  return /.+@.+\..+/.test(value.trim());
}

function isStrongPassword(value: string): boolean {
  const hasLowercase = /[a-z]/.test(value);
  const hasUppercase = /[A-Z]/.test(value);
  const hasNumber = /\d/.test(value);
  return value.length >= 6 && hasLowercase && hasUppercase && hasNumber;
}

export default function RegisterScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const prefilledEmail = useMemo(() => (Array.isArray(params.email) ? params.email[0] : params.email), [params.email]);

  const { isAuthLoading, signUpWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (!prefilledEmail) return;
    setEmail(prefilledEmail);
  }, [prefilledEmail]);

  function validateForm(): boolean {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedName = fullName.trim();

    if (!isValidEmail(trimmedEmail)) {
      Alert.alert('Geçersiz e-posta', 'Lütfen geçerli bir e-posta adresi gir.');
      return false;
    }

    if (!trimmedName) {
      Alert.alert('Eksik bilgi', 'Lütfen ad soyad bilgisini gir.');
      return false;
    }

    if (!isStrongPassword(password)) {
      Alert.alert('Geçersiz şifre', 'Şifre en az 6 karakter olmalı ve en az bir küçük harf, bir büyük harf ve bir rakam içermeli.');
      return false;
    }

    if (password !== passwordConfirm) {
      Alert.alert('Şifre uyumsuz', 'Şifre ve şifre tekrarı aynı olmalı.');
      return false;
    }

    return true;
  }

  async function onSubmit() {
    if (!validateForm()) return;

    try {
      const normalizedEmail = email.trim().toLowerCase();
      await signUpWithEmail({
        email: normalizedEmail,
        password,
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
      });

      Alert.alert('Kayıt başarılı', 'Hesabın oluşturuldu. Giriş yapmak için şifreni gir.');
      router.replace({
        pathname: '/',
        params: { email: normalizedEmail },
      });
    } catch (error: any) {
      let parsedRequestId = '';
      let parsedErrorCode = '';
      try {
        const parsed = typeof error?.message === 'string' ? JSON.parse(error.message) : null;
        parsedRequestId = String(parsed?.headers?.map?.['sb-request-id'] ?? '');
        parsedErrorCode = String(parsed?.headers?.map?.['x-sb-error-code'] ?? '');
      } catch {
        // Ignore parse failures for non-JSON error messages.
      }
      console.error('[register] signUpWithEmail failed:', {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        status: error?.status,
        sbRequestId: parsedRequestId || undefined,
        sbErrorCode: parsedErrorCode || undefined,
        raw: error,
      });
      Alert.alert('Kayıt başarısız', getAuthErrorMessageTr(error, 'Hesap oluşturulamadı.'));
    }
  }

  return (
    <RefreshableScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 34 }}>
      <TouchableOpacity onPress={() => router.replace('/')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={{ paddingVertical: 6, paddingHorizontal: 8, alignSelf: 'flex-start' }}>
        <Text style={{ fontSize: 38, lineHeight: 38 }}>‹</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 27, fontWeight: '800', color: colors.text, marginTop: 12 }}>E-posta ile Kayıt Ol</Text>
      <Text style={{ color: colors.muted, marginTop: 5 }}>Bilgilerini gir ve hesabını oluştur.</Text>

      <View style={{ marginTop: 20 }}>
        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>Ad Soyad</Text>
        <TextInput
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          placeholder="Ad Soyad"
          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 12 }}
        />

        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>E-posta</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="emailAddress"
          autoComplete="email"
          placeholder="ornek@mail.com"
          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 12 }}
        />

        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>Telefon (opsiyonel)</Text>
        <TextInput
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="05xx xxx xx xx"
          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 12 }}
        />

        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>Şifre</Text>
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

        <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>Şifre Tekrar</Text>
        <TextInput
          value={passwordConfirm}
          onChangeText={setPasswordConfirm}
          secureTextEntry
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          textContentType="none"
          placeholder="Şifreyi tekrar gir"
          style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14, marginBottom: 16 }}
        />

        <TouchableOpacity
          onPress={onSubmit}
          disabled={isAuthLoading}
          style={{
            backgroundColor: colors.primary,
            padding: 17,
            borderRadius: 16,
            opacity: isAuthLoading ? 0.7 : 1,
          }}
        >
          <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, fontWeight: '800' }}>
            {isAuthLoading ? 'Kaydediliyor...' : 'Hesap Oluştur'}
          </Text>
        </TouchableOpacity>
      </View>
    </RefreshableScrollView>
  );
}
