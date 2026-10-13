import type { Movie } from './api';

export function getWishlist(): string[] {
  try { return JSON.parse(localStorage.getItem('skflip_wishlist') || '[]'); } catch { return []; }
}
export function saveWishlist(list: string[]) {
  localStorage.setItem('skflip_wishlist', JSON.stringify(list));
}
export function isInWishlist(movieId: string): boolean {
  return getWishlist().includes(movieId);
}

export interface ContinueItem {
  id: string;
  title: string;
  posterUrl: string;
  backdropUrl: string;
  type: string;
  currentTime: number;
  duration: number;
  timestamp: number;
}

export function getContinueList(): ContinueItem[] {
  try { return JSON.parse(localStorage.getItem('skflip_continue') || '[]'); } catch { return []; }
}
export function saveContinueList(list: ContinueItem[]) {
  localStorage.setItem('skflip_continue', JSON.stringify(list));
}

export function saveWatchProgress(movie: Movie, currentTime: number, duration: number) {
  if (!movie?._id || currentTime < 5) return;
  const pct = duration ? currentTime / duration : 0;
  const list = getContinueList().filter(x => x.id !== movie._id);
  if (pct > 0.95) {
    saveContinueList(list);
    return;
  }
  list.unshift({
    id: movie._id, title: movie.title,
    posterUrl: movie.posterUrl || '', backdropUrl: movie.backdropUrl || '',
    type: movie.type || 'movie',
    currentTime: Math.floor(currentTime),
    duration: Math.floor(duration || 0),
    timestamp: Date.now()
  });
  saveContinueList(list.slice(0, 20));
}

export interface AuthUser {
  name: string;
  email: string;
  role?: string;
}

export function getStoredAuth(): { token: string; user: AuthUser } | null {
  const t = localStorage.getItem('skflip_token');
  const u = localStorage.getItem('skflip_user');
  if (t && u) {
    try { return { token: t, user: JSON.parse(u) }; } catch { return null; }
  }
  return null;
}

export function setStoredAuth(token: string, user: AuthUser) {
  localStorage.setItem('skflip_token', token);
  localStorage.setItem('skflip_user', JSON.stringify(user));
}

export function clearStoredAuth() {
  localStorage.removeItem('skflip_token');
  localStorage.removeItem('skflip_user');
}
