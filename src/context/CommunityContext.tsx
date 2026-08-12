import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { communities } from '../data/mock';
import { syncMockDataFromSupabase } from '../services/supabaseDataSync';
import { getAppDataSource } from '../services/supabase';
import { useAuth } from './AuthContext';

export type Community = {
  id: string;
  name: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  defaultZoom: number;
  members: number;
  animals: number;
  debt: number;
  adminUserIds: string[];
};

type CommunityContextValue = {
  selectedCommunity: Community | null;
  allCommunities: Community[];
  communityLoadError: string | null;
  selectCommunityById: (id: string) => void;
  clearSelectedCommunity: () => void;
  refreshCommunities: () => Promise<void>;
};

const CommunityContext = createContext<CommunityContextValue | undefined>(undefined);

function sameCommunity(left: Community, right: Community): boolean {
  if (left.id !== right.id) return false;
  if (left.name !== right.name) return false;
  if (left.neighborhood !== right.neighborhood) return false;
  if (left.latitude !== right.latitude || left.longitude !== right.longitude) return false;
  if (left.defaultZoom !== right.defaultZoom) return false;
  if (left.members !== right.members || left.animals !== right.animals || left.debt !== right.debt) return false;
  if (left.adminUserIds.length !== right.adminUserIds.length) return false;

  return left.adminUserIds.every((adminId, index) => adminId === right.adminUserIds[index]);
}

export function CommunityProvider({ children }: PropsWithChildren) {
  const { currentUser } = useAuth();
  const [allCommunities, setAllCommunities] = useState<Community[]>(() => (
    getAppDataSource() === 'mock' ? [...communities] : []
  ));
  const [communityLoadError, setCommunityLoadError] = useState<string | null>(null);
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);

  const bootstrapCommunityData = useCallback(async () => {
    const syncResult = await syncMockDataFromSupabase();

    if (syncResult.usedSupabaseMode && syncResult.syncError) {
      setCommunityLoadError(syncResult.syncError);
    } else {
      setCommunityLoadError(null);
    }

    if (!syncResult.usedSupabaseMode) {
      setAllCommunities([...communities]);
    } else if (syncResult.communitiesLoaded) {
      setAllCommunities([...communities]);
    } else {
      setAllCommunities([]);
    }

    setSelectedCommunity((prev) => {
      if (!prev) return null;

      const sourceList = syncResult.usedSupabaseMode && !syncResult.communitiesLoaded
        ? []
        : communities;

      const refreshed = sourceList.find((item) => item.id === prev.id);
      if (!refreshed) return null;
      return sameCommunity(prev, refreshed) ? prev : refreshed;
    });
  }, []);

  const refreshCommunities = useCallback(async () => {
    await bootstrapCommunityData();
  }, [bootstrapCommunityData]);

  useEffect(() => {
    let mounted = true;

    async function runBootstrap() {
      await bootstrapCommunityData();
      if (!mounted) return;
    }

    runBootstrap();

    return () => {
      mounted = false;
    };
  }, [bootstrapCommunityData, currentUser?.id]);

  function selectCommunityById(id: string) {
    const found = allCommunities.find((item) => item.id === id);
    if (!found) return;
    setSelectedCommunity(found);
  }

  function clearSelectedCommunity() {
    setSelectedCommunity(null);
  }

  const value = useMemo<CommunityContextValue>(() => ({
    selectedCommunity,
    allCommunities,
    communityLoadError,
    selectCommunityById,
    clearSelectedCommunity,
    refreshCommunities,
  }), [allCommunities, communityLoadError, selectedCommunity]);

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity() {
  const context = useContext(CommunityContext);
  if (!context) {
    throw new Error('useCommunity must be used inside CommunityProvider');
  }
  return context;
}
