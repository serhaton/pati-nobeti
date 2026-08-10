import { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { colors } from '../theme';

export function Card({ children, style }: PropsWithChildren<{ style?: any }>) {
  return (
    <View style={[{
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      shadowColor: '#000',
      shadowOpacity: 0.04,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 3 },
    }, style]}>
      {children}
    </View>
  );
}
