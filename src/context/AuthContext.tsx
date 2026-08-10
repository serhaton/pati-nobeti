import { createContext, PropsWithChildren, useContext, useMemo, useState } from 'react';

export type AuthUser = {
  id: string;
  fullName: string;
  provider: 'google' | 'apple';
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
    // Prototype auth: set a mock signed-in user.
    setCurrentUser({
      id: 'user-1',
      fullName: 'Serhat Onal',
      provider,
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
