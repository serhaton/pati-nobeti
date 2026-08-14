import { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  ensureCommunitySelectedById: (id: string) => Promise<boolean>;
  clearSelectedCommunity: () => void;
  refreshCommunities: () => Promise<void>;
};

const CommunityContext = createContext<CommunityContextValue | undefined>(undefined);

function getLastCommunityStorageKey(userId: string): string {
  return `last-selected-community:${userId}`;
}

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
  const [restoredUserId, setRestoredUserId] = useState<string | null>(null);

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

  useEffect(() => {
    setSelectedCommunity(null);
    setRestoredUserId(null);
  }, [currentUser?.id]);

  useEffect(() => {
    let cancelled = false;

    async function restoreLastSelectedCommunity() {
      const userId = currentUser?.id;
      if (!userId) return;
      if (restoredUserId === userId) return;
      if (allCommunities.length === 0) return;

      try {
        const lastSelectedCommunityId = await AsyncStorage.getItem(getLastCommunityStorageKey(userId));
        if (cancelled) return;

        if (!lastSelectedCommunityId) {
          setRestoredUserId(userId);
          return;
        }

        const matched = allCommunities.find((community) => community.id === lastSelectedCommunityId);
        if (matched) {
          setSelectedCommunity(matched);
        }
      } finally {
        if (!cancelled) {
          setRestoredUserId(userId);
        }
      }
    }

    restoreLastSelectedCommunity();

    return () => {
      cancelled = true;
    };
  }, [allCommunities, currentUser?.id, restoredUserId]);

  function selectCommunityById(id: string) {
    const found = allCommunities.find((item) => item.id === id);
    if (!found) return;
    setSelectedCommunity(found);

    const userId = currentUser?.id;
    if (userId) {
      void AsyncStorage.setItem(getLastCommunityStorageKey(userId), found.id);
    }
  }

  const ensureCommunitySelectedById = useCallback(async (id: string) => {
    const fromCurrentList = allCommunities.find((item) => item.id === id);
    if (fromCurrentList) {
      setSelectedCommunity(fromCurrentList);
      const userId = currentUser?.id;
      if (userId) {
        await AsyncStorage.setItem(getLastCommunityStorageKey(userId), fromCurrentList.id);
      }
      return true;
    }

    await bootstrapCommunityData();

    const refreshed = communities.find((item) => item.id === id);
    if (!refreshed) {
      return false;
    }

    setSelectedCommunity(refreshed);
    const userId = currentUser?.id;
    if (userId) {
      await AsyncStorage.setItem(getLastCommunityStorageKey(userId), refreshed.id);
    }
    return true;
  }, [allCommunities, bootstrapCommunityData, currentUser?.id]);

  function clearSelectedCommunity() {
    setSelectedCommunity(null);

    const userId = currentUser?.id;
    if (userId) {
      void AsyncStorage.removeItem(getLastCommunityStorageKey(userId));
    }
  }

  const value = useMemo<CommunityContextValue>(() => ({
    selectedCommunity,
    allCommunities,
    communityLoadError,
    selectCommunityById,
    ensureCommunitySelectedById,
    clearSelectedCommunity,
    refreshCommunities,
  }), [allCommunities, communityLoadError, ensureCommunitySelectedById, selectedCommunity, refreshCommunities]);

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity() {
  const context = useContext(CommunityContext);
  if (!context) {
    throw new Error('useCommunity must be used inside CommunityProvider');
  }
  return context;
}
