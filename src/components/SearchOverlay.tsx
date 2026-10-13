import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { useApp } from '@/lib/AppContext';
import MovieCard from './MovieCard';

interface Props {
  onClose: () => void;
}

export default function SearchOverlay({ onClose }: Props) {
  const { allContent } = useApp();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 100); }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const results = q ? allContent.filter(m =>
    m.title?.toLowerCase().includes(q) ||
    (m._genres_normalized || []).some(g => g.toLowerCase().includes(q)) ||
    m.description?.toLowerCase().includes(q)
  ).slice(0, 20) : [];

  return (
    <motion.div
      className="fixed inset-0 z-[1100] bg-[var(--bg)]/97 backdrop-blur-xl flex flex-col pt-24 px-4 sm:px-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="relative max-w-[760px] mx-auto w-full">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="w-full bg-white/5 border border-white/15 rounded-2xl py-5 px-14 text-lg outline-none focus:border-[var(--gold)] transition-colors placeholder:text-white/25"
          placeholder="Search movies, series, genres…"
        />
        <button onClick={onClose} className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[.07] transition-all">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="max-w-[760px] mx-auto w-full mt-8 overflow-y-auto flex-1 pb-10">
        {!q && (
          <div className="text-center text-white/30 mt-16">
            <Search className="w-10 h-10 mx-auto mb-4 opacity-30" />
            <p>Start typing to search…</p>
          </div>
        )}
        {q && results.length === 0 && (
          <div className="text-center text-white/30 mt-16">
            <p>No results for "<strong>{query}</strong>"</p>
          </div>
        )}
        {results.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {results.map(m => (
              <div key={m._id} onClick={onClose}>
                <MovieCard movie={m} />
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
