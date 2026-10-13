import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Movie } from './api';
import { api, fetchMovies } from './api';
import { getStoredAuth, setStoredAuth, clearStoredAuth, type AuthUser, getWishlist, saveWishlist, isInWishlist } from './store';
import { toast } from 'sonner';

interface AppState {
  user: AuthUser | null;
  movies: Movie[];
  series: Movie[];
  originals: Movie[];
  allContent: Movie[];
  loading: boolean;
  playerMovie: Movie | null;
  detailMovie: Movie | null;
  resumeTime: number;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  openPlayer: (movie: Movie, resumeAt?: number) => void;
  closePlayer: () => void;
  openDetail: (movie: Movie) => void;
  closeDetail: () => void;
  toggleWishlist: (movieId: string) => void;
  refreshData: () => Promise<void>;
}

const AppContext = createContext<AppState>({} as AppState);
export const useApp = () => useContext(AppContext);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [series, setSeries] = useState<Movie[]>([]);
  const [originals, setOriginals] = useState<Movie[]>([]);
  const [allContent, setAllContent] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerMovie, setPlayerMovie] = useState<Movie | null>(null);
  const [detailMovie, setDetailMovie] = useState<Movie | null>(null);
  const [resumeTime, setResumeTime] = useState(0);

  const refreshData = useCallback(async () => {
    try {
      const [m, s, o] = await Promise.all([fetchMovies('movie'), fetchMovies('series'), fetchMovies('original')]);
      setMovies(m); setSeries(s); setOriginals(o);
      const seen = new Set<string>();
      const all = [...m, ...s, ...o].filter(x => { if (seen.has(x._id)) return false; seen.add(x._id); return true; });
      setAllContent(all);
    } catch (e) { console.error('Failed to fetch:', e); }
  }, []);

  useEffect(() => {
    const auth = getStoredAuth();
    if (auth) setUser(auth.user);
    refreshData().finally(() => setLoading(false));
  }, [refreshData]);

  const login = async (email: string, password: string) => {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    setStoredAuth(data.token, data.user);
    setUser(data.user);
    toast.success('Welcome back, ' + data.user.name + '!');
  };

  const signup = async (name: string, email: string, password: string) => {
    const data = await api('/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) });
    setStoredAuth(data.token, data.user);
    setUser(data.user);
    toast.success('Account created! Welcome, ' + data.user.name + '!');
  };

  const logout = () => {
    clearStoredAuth();
    setUser(null);
    toast.info('Signed out. See you soon!');
  };

  const openPlayer = (movie: Movie, resumeAt = 0) => {
    if (!user) { toast.warning('Please sign in to watch'); return; }
    if (!movie.videoUrl && !movie.hlsUrl) { toast.error('No video available'); return; }
    setResumeTime(resumeAt);
    setPlayerMovie(movie);
  };

  const toggleWishlistFn = (movieId: string) => {
    const list = getWishlist();
    const idx = list.indexOf(movieId);
    if (idx > -1) { list.splice(idx, 1); toast.info('Removed from wishlist'); }
    else { list.push(movieId); toast.success('Added to wishlist'); }
    saveWishlist(list);
  };

  return (
    <AppContext.Provider value={{
      user, movies, series, originals, allContent, loading,
      playerMovie, detailMovie, resumeTime,
      login, signup, logout,
      openPlayer, closePlayer: () => setPlayerMovie(null),
      openDetail: (m) => setDetailMovie(m), closeDetail: () => setDetailMovie(null),
      toggleWishlist: toggleWishlistFn, refreshData
    }}>
      {children}
    </AppContext.Provider>
  );
}
