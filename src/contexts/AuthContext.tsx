import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthService, User } from '../services/auth.service';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();

    // Re-verify when user returns to the tab (catches stale cached role)
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkAuth();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const checkAuth = async () => {
    try {
      const userData = await AuthService.verifyToken();
      if (userData?.isBanned) {
                setUser(null);
      } else {
        setUser(userData);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    await AuthService.initiateGitHubLogin();
  };

  const logout = async () => {
    await AuthService.logout();
    setUser(null);
  };

  const isAdmin      = user?.role === 'admin' || user?.role === 'superadmin';
  const isSuperAdmin = user?.role === 'superadmin';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshAuth: checkAuth,
        isAuthenticated: !!user,
        isAdmin,
        isSuperAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
