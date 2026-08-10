import { router } from 'expo-router';
import { View, Text, TouchableOpacity } from 'react-native';
import { useAuth } from '../src/context/AuthContext';
import { Logo } from '../src/components/Logo';
import { colors } from '../src/theme';

export default function Welcome() {
  const { signInWithProvider } = useAuth();

  function continueWith(provider: 'google' | 'apple') {
    signInWithProvider(provider);
    router.replace('/community-select');
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

      <TouchableOpacity onPress={() => continueWith('google')} style={{
        backgroundColor: colors.primary, padding: 17, borderRadius: 16, marginBottom: 12
      }}>
        <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, fontWeight: '800' }}>Google ile devam et</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => continueWith('apple')} style={{
        backgroundColor: '#111', padding: 17, borderRadius: 16
      }}>
        <Text style={{ color: '#fff', textAlign: 'center', fontSize: 16, fontWeight: '800' }}>Apple ile devam et</Text>
      </TouchableOpacity>

      <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 12, marginTop: 20 }}>
        Prototip: giris sonrasi once topluluk secimi zorunludur.
      </Text>
    </View>
  );
}
