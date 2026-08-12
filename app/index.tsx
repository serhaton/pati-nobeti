import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, TextInput, View, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { Logo } from '../src/components/Logo';
import { colors } from '../src/theme';

export default function Welcome() {
  const { isAuthLoading, signInWithProvider, signInWithEmail, signUpWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function validateEmailPassword(): boolean {
    if (!email.trim()) {
      Alert.alert('Eksik bilgi', 'Lutfen e-posta adresini gir.');
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
      Alert.alert('Giris basarisiz', error?.message ?? 'Saglayici girisi tamamlanamadi.');
    }
  }

  async function continueWithEmail() {
    if (!validateEmailPassword()) return;

    try {
      await signInWithEmail(email, password);
      router.replace('/community-select');
    } catch (error: any) {
      Alert.alert('Giris basarisiz', error?.message ?? 'E-posta veya sifre gecersiz.');
    }
  }

  async function createAccountWithEmail() {
    if (!validateEmailPassword()) return;

    try {
      await signUpWithEmail(email, password);
      Alert.alert('Kayit basarili', 'Hesap olusturuldu. Dogrudan giris yapabilir veya e-posta dogrulamasi sonrasinda devam edebilirsin.');
      router.replace('/community-select');
    } catch (error: any) {
      Alert.alert('Kayit basarisiz', error?.message ?? 'Hesap olusturulamadi.');
    }
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

      <TouchableOpacity onPress={continueWithEmail} disabled={isAuthLoading} style={{
        backgroundColor: colors.primary, padding: 17, borderRadius: 16, marginBottom: 10, opacity: isAuthLoading ? 0.7 : 1,
      }}>
        <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, fontWeight: '800' }}>{isAuthLoading ? 'Bekleniyor...' : 'E-posta ile giris yap'}</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={createAccountWithEmail} disabled={isAuthLoading} style={{
        backgroundColor: '#fff', padding: 17, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.primary, opacity: isAuthLoading ? 0.7 : 1,
      }}>
        <Text style={{ color: colors.primary, textAlign: 'center', fontSize: 16, fontWeight: '800' }}>E-posta ile hesap olustur</Text>
      </TouchableOpacity>

    </View>
  );
}
