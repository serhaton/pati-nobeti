import { View, Text, Image } from 'react-native';
import { colors } from '../theme';

export function Logo({ small = false }: { small?: boolean }) {
  const iconSize = small ? 34 : 46;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <Image
        source={require('../../assets/app-icon.png')}
        style={{ width: iconSize, height: iconSize, borderRadius: 12 }}
      />
      <Text style={{ fontSize: small ? 19 : 27, fontWeight: '800', color: colors.text }}>
        Pati Uzat
      </Text>
    </View>
  );
}
