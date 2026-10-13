const API = 'https://sk-flix-five.vercel.app/api';

export function getToken(): string | null {
  return localStorage.getItem('skflip_token');
}

export async function api(path: string, opts: RequestInit = {}) {
  const t = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as Record<string, string> || {}) };
  if (t) headers['Authorization'] = 'Bearer ' + t;
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export interface Movie {
  _id: string;
  title: string;
  type: 'movie' | 'series' | 'original';
  releaseYear?: number;
  genres?: string[];
  rating?: number;
  duration?: number;
  posterUrl?: string;
  backdropUrl?: string;
  videoUrl?: string;
  hlsUrl?: string;
  description?: string;
  audioLanguages?: string[];
  subtitleLanguages?: string[];
  episodes?: Episode[];
  episodeCount?: number;
  seasonCount?: number;
  _genres_normalized?: string[];
}

export interface Episode {
  season?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  videoUrl?: string;
  hlsUrl?: string;
  duration?: number | string;
  airDate?: string;
}

export function normalizeGenres(genres: unknown): string[] {
  if (!genres) return [];
  if (Array.isArray(genres)) return genres.map(g => String(g).trim()).filter(Boolean);
  if (typeof genres === 'string') return genres.split(',').map(g => g.trim()).filter(Boolean);
  return [];
}

export async function fetchMovies(type?: string): Promise<Movie[]> {
  const params = new URLSearchParams({ limit: '50' });
  if (type) params.set('type', type);
  const data = await api('/movies?' + params);
  const movies: Movie[] = data.movies || [];
  movies.forEach(m => { m._genres_normalized = normalizeGenres(m.genres); });
  return movies;
}
