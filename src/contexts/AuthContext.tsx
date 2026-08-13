import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  location: string | null;
  website: string | null;
  privacy: 'public' | 'private';
  email_notifications: boolean;
  push_notifications: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface UserRole {
  id: string;
  user_id: string;
  role: 'super_admin' | 'admin' | 'moderator' | 'support' | 'user';
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: UserRole[];
  loading: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ error: Error | null; user: User | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
  isAdmin: boolean;
  isModerator: boolean;
  isSuperAdmin: boolean;
  isSupport: boolean;
  isStaff: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!error && data) {
      setProfile(data as Profile);
      return data as Profile;
    }
    return null;
  }, []);

  const fetchRoles = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('*')
      .eq('user_id', userId);

    if (!error && data) {
      setRoles(data as UserRole[]);
    }
  }, []);

  // If the account was deleted (soft-deleted), revoke the session so the
  // user is kicked back to the sign-in page.
  const kickOutIfDeleted = useCallback(async (userId: string): Promise<boolean> => {
    const profile = await fetchProfile(userId);
    if (profile?.deleted_at) {
      await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);
      setRoles([]);
      return true;
    }
    return false;
  }, [fetchProfile]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Use microtask to avoid Supabase realtime deadlock
          queueMicrotask(async () => {
            const kicked = await kickOutIfDeleted(session.user.id);
            if (!kicked) await fetchRoles(session.user.id);
          });
        } else {
          setProfile(null);
          setRoles([]);
        }
      }
    );

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        const kicked = await kickOutIfDeleted(session.user.id);
        if (!kicked) await fetchRoles(session.user.id);
      }

      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, fetchRoles, kickOutIfDeleted]);

  const signUp = async (email: string, password: string, displayName?: string) => {
    const redirectUrl = `${window.location.origin}/`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: displayName || email.split('@')[0],
        },
      },
    });

    return { error: error as Error | null, user: data.user ?? null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: new Error('Not authenticated') };

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('user_id', user.id);

    if (!error) {
      setProfile(prev => prev ? { ...prev, ...updates } : null);
    }

    return { error: error as Error | null };
  };

  const isSuperAdmin = roles.some(r => r.role === 'super_admin');
  const isAdmin = roles.some(r => r.role === 'admin') || isSuperAdmin;
  const isModerator = roles.some(r => r.role === 'moderator') || isAdmin;
  const isSupport = roles.some(r => r.role === 'support') || isModerator;
  const isStaff = isSupport;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        loading,
        signUp,
        signIn,
        signOut,
        updateProfile,
        isAdmin,
        isModerator,
        isSuperAdmin,
        isSupport,
        isStaff,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
