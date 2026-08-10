import { View, Text } from 'react-native';
import { colors } from '../theme';

function PawIcon({ small = false }: { small?: boolean }) {
  const pad = small ? 9 : 12;
  const toe = small ? 6 : 7;

  return (
    <View style={{ width: small ? 22 : 28, height: small ? 22 : 28 }}>
      <View style={{
        position: 'absolute',
        left: small ? 6 : 8,
        top: small ? 9 : 11,
        width: pad,
        height: pad,
        borderRadius: 999,
        backgroundColor: '#FFFFFF',
      }} />
      <View style={{
        position: 'absolute',
        left: small ? 2 : 3,
        top: small ? 4 : 5,
        width: toe,
        height: toe,
        borderRadius: 999,
        backgroundColor: '#FFFFFF',
      }} />
      <View style={{
        position: 'absolute',
        left: small ? 7 : 9,
        top: small ? 1 : 2,
        width: toe,
        height: toe,
        borderRadius: 999,
        backgroundColor: '#FFFFFF',
      }} />
      <View style={{
        position: 'absolute',
        left: small ? 12 : 15,
        top: small ? 4 : 5,
        width: toe,
        height: toe,
        borderRadius: 999,
        backgroundColor: '#FFFFFF',
      }} />
    </View>
  );
}

export function Logo({ small = false }: { small?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <View style={{
        width: small ? 34 : 46, height: small ? 34 : 46, borderRadius: 14,
        backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center'
      }}>
        <PawIcon small={small} />
      </View>
      <Text style={{ fontSize: small ? 19 : 27, fontWeight: '800', color: colors.text }}>
        Pati Nöbeti
      </Text>
    </View>
  );
}
