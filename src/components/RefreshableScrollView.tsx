import { ReactNode, useCallback, useState } from 'react';
import { RefreshControl, ScrollView, ScrollViewProps, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../theme';

type RefreshableScrollViewProps = ScrollViewProps & {
  onRefreshAction?: () => void | Promise<void>;
  children: ReactNode;
};

function isPageLevelScrollView(style: StyleProp<ViewStyle>) {
  const flattened = StyleSheet.flatten(style);
  return flattened?.flex === 1;
}

export function RefreshableScrollView({
  onRefreshAction,
  children,
  ...props
}: RefreshableScrollViewProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);

      if (onRefreshAction) {
        await onRefreshAction();
        return;
      }

      // Keep pull-to-refresh UX without triggering a route transition animation.
      await new Promise((resolve) => setTimeout(resolve, 600));
    } finally {
      setRefreshing(false);
    }
  }, [onRefreshAction]);

  const shouldAttachRefreshControl = !props.horizontal && isPageLevelScrollView(props.style);

  return (
    <ScrollView
      {...props}
      refreshControl={
        shouldAttachRefreshControl
          ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
                progressBackgroundColor={colors.card}
              />
            )
          : props.refreshControl
      }
    >
      {children}
    </ScrollView>
  );
}
