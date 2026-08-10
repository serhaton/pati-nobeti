import { router } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Card } from '../src/components/Card';
import { Logo } from '../src/components/Logo';
import { useCommunity } from '../src/context/CommunityContext';
import { colors } from '../src/theme';

export default function CommunitySelectScreen() {
  const { allCommunities, selectedCommunity, selectCommunityById } = useCommunity();

  function selectAndContinue(id: string) {
    selectCommunityById(id);
    router.replace('/home');
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: 20, paddingTop: 58, paddingBottom: 32 }}>
      <Logo small />
      <Text style={{ color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 18 }}>Topluluk Secimi</Text>
      <Text style={{ color: colors.muted, marginTop: 7 }}>Devam etmek icin once bir topluluk secmelisin.</Text>

      <View style={{ marginTop: 22 }}>
        {allCommunities.map((community) => {
          const isSelected = selectedCommunity?.id === community.id;
          return (
            <TouchableOpacity key={community.id} onPress={() => selectAndContinue(community.id)}>
              <Card style={{ marginBottom: 10, borderColor: isSelected ? colors.primary : colors.border, borderWidth: isSelected ? 2 : 1 }}>
                <Text style={{ fontWeight: '800', color: colors.text, fontSize: 17 }}>{community.name}</Text>
                <Text style={{ color: colors.muted, marginTop: 5 }}>
                  {community.neighborhood} · {community.members} uye · {community.animals} can
                </Text>
                <View style={{ marginTop: 10, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 9 }}>
                  <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '800' }}>Bu Toplulukla Devam Et</Text>
                </View>
              </Card>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}
