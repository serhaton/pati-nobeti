import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { User } from '@supabase/supabase-js';
import {
  deleteCurrentUserAccount,
  sendPasswordResetEmail,
  signInWithApple,
  signInWithEmailPassword,
  signInWithGoogle,
  signOutSupabase,
  signUpWithEmailAndProfile,
  supabase,
} from '../services/supabase';
import { deactivatePushTokenForUser, registerPushTokenForUser } from '../services/pushNotifications';

export type AuthUser = {
  id: string;
  username: string;
  fullName: string;
  provider: 'google' | 'apple' | 'email';
  status: 'active';
  email?: string;
};

type AuthContextValue = {
  currentUser: AuthUser | null;
  isAuthLoading: boolean;
  signInWithProvider: (provider: 'google' | 'apple') => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (input: { email: string; password: string; fullName: string; phone?: string }) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function mapProvider(provider?: string): AuthUser['provider'] {
  if (provider === 'google') return 'google';
  if (provider === 'apple') return 'apple';
  return 'email';
}

function mapSupabaseUser(user: User): AuthUser {
  const email = user.email ?? undefined;
  const username =
    email?.split('@')[0] ??
    (typeof user.user_metadata?.user_name === 'string' ? user.user_metadata.user_name : undefined) ??
    user.id;
  const fullName =
    (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : undefined) ??
    (typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : undefined) ??
    username;

  return {
    id: user.id,
    username,
    fullName,
    provider: mapProvider(user.app_metadata?.provider),
    status: 'active',
    email,
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function bootstrapSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!mounted) return;

        const sessionUser = data.session?.user;
        setCurrentUser(sessionUser ? mapSupabaseUser(sessionUser) : null);
        if (sessionUser) {
          void registerPushTokenForUser(sessionUser.id);
        }
      } finally {
        if (mounted) setIsAuthLoading(false);
      }
    }

    bootstrapSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user;
      setCurrentUser(sessionUser ? mapSupabaseUser(sessionUser) : null);
      if (sessionUser) {
        void registerPushTokenForUser(sessionUser.id);
      }
      setIsAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signInWithProvider(provider: 'google' | 'apple') {
    setIsAuthLoading(true);
    try {
      if (provider === 'google') {
        await signInWithGoogle();
      } else {
        await signInWithApple();
      }
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function signInWithEmail(email: string, password: string) {
    setIsAuthLoading(true);
    try {
      await signInWithEmailPassword(email.trim(), password);
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function signUpWithEmail(input: { email: string; password: string; fullName: string; phone?: string }) {
    setIsAuthLoading(true);
    try {
      await signUpWithEmailAndProfile({
        email: input.email.trim(),
        password: input.password,
        fullName: input.fullName,
        phone: input.phone,
      });

      // Keep registration flow on login screen even when sign-up creates a session.
      try {
        await signOutSupabase();
      } catch {
        // Ignore sign-out errors here to avoid blocking successful registration UX.
      }
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function forgotPassword(email: string) {
    setIsAuthLoading(true);
    try {
      await sendPasswordResetEmail(email.trim());
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function signOut() {
    setIsAuthLoading(true);
    try {
      if (currentUser?.id) {
        await deactivatePushTokenForUser(currentUser.id);
      }
      await signOutSupabase();
      setCurrentUser(null);
    } finally {
      setIsAuthLoading(false);
    }
  }

  async function deleteAccount() {
    setIsAuthLoading(true);
    try {
      if (currentUser?.id) {
        await deactivatePushTokenForUser(currentUser.id);
      }
      await deleteCurrentUserAccount();
      setCurrentUser(null);
    } finally {
      setIsAuthLoading(false);
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      isAuthLoading,
      signInWithProvider,
      signInWithEmail,
      signUpWithEmail,
      forgotPassword,
      deleteAccount,
      signOut,
    }),
    [currentUser, isAuthLoading]
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
