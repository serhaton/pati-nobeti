import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';
import { users } from '../data/mock';

export type AuthUser = {
  id: string;
  username: string;
  fullName: string;
  provider: 'google' | 'apple';
  status: 'active' | 'passive';
};

type AuthContextValue = {
  currentUser: AuthUser | null;
  signInWithProvider: (provider: 'google' | 'apple') => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  function signInWithProvider(provider: 'google' | 'apple') {
    const user = users.find((item) => item.authMethod === provider && item.status === 'active');
    if (!user) {
      setCurrentUser(null);
      return;
    }

    setCurrentUser({
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      provider,
      status: user.status,
    });
  }

  function signOut() {
    setCurrentUser(null);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      signInWithProvider,
      signOut,
    }),
    [currentUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}
