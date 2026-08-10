import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';
import { communities } from '../data/mock';

export type Community = {
  id: string;
  name: string;
  neighborhood: string;
  members: number;
  animals: number;
  debt: number;
};

type CommunityContextValue = {
  selectedCommunity: Community | null;
  allCommunities: Community[];
  selectCommunityById: (id: string) => void;
  clearSelectedCommunity: () => void;
};

const CommunityContext = createContext<CommunityContextValue | undefined>(undefined);

export function CommunityProvider({ children }: PropsWithChildren) {
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);

  function selectCommunityById(id: string) {
    const found = communities.find((item) => item.id === id);
    if (!found) return;
    setSelectedCommunity(found);
  }

  function clearSelectedCommunity() {
    setSelectedCommunity(null);
  }

  const value = useMemo<CommunityContextValue>(() => ({
    selectedCommunity,
    allCommunities: communities,
    selectCommunityById,
    clearSelectedCommunity,
  }), [selectedCommunity]);

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunity() {
  const context = useContext(CommunityContext);
  if (!context) {
    throw new Error('useCommunity must be used inside CommunityProvider');
  }
  return context;
}
