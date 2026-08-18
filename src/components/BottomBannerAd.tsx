import { Platform, View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';

const BANNER_UNIT_ID = __DEV__
  ? TestIds.BANNER
  : Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER_ID ?? TestIds.BANNER
    : process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID ?? TestIds.BANNER;

const IS_SHOW_ADS_ENABLED = (process.env.EXPO_PUBLIC_SHOW_ADS ?? 'true').toLowerCase() !== 'false';

export function BottomBannerAd() {
  if (!IS_SHOW_ADS_ENABLED) {
    return null;
  }

  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: 8,
        paddingBottom: Math.max(insets.bottom, 8),
        alignItems: 'center',
        backgroundColor: colors.background,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <BannerAd
        unitId={BANNER_UNIT_ID}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
      />
    </View>
  );
}
