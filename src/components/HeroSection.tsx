import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Heart, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '@/lib/AppContext';
import { isInWishlist } from '@/lib/store';
import type { Movie } from '@/lib/api';

export default function HeroSection() {
  const { allContent, openPlayer, openDetail, toggleWishlist } = useApp();
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const slides = allContent.filter(m => m.backdropUrl?.startsWith('http')).slice(0, 8);
  const movie = slides[idx] || allContent[0];

  const goTo = useCallback((i: number) => {
    setVisible(false);
    setTimeout(() => { setIdx(i); setVisible(true); }, 400);
  }, []);

  useEffect(() => {
    if (slides.length <= 1) return;
    timerRef.current = setInterval(() => {
      setVisible(false);
      setTimeout(() => { setIdx(prev => (prev + 1) % slides.length); setVisible(true); }, 400);
    }, 5000);
    return () => clearInterval(timerRef.current);
  }, [slides.length]);

  if (!movie) {
    return (
      <section className="min-h-screen flex items-center px-6 sm:px-14 pt-[var(--nav-h)]">
        <div>
          <h1 className="font-['Bebas_Neue'] text-5xl sm:text-7xl tracking-wider"><span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--gold)] to-[var(--gold2)]">SKFLIP</span></h1>
          <p className="text-white/50 mt-4 max-w-md">Movies, series, and originals — all in one place.</p>
        </div>
      </section>
    );
  }

  const inW = isInWishlist(movie._id);
  const genres = movie._genres_normalized || [];

  return (
    <section className="min-h-[100svh] flex items-center relative overflow-hidden px-4 sm:px-14 pt-[var(--nav-h)] pb-16">
      {/* BG image */}
      <AnimatePresence mode="wait">
        <motion.img
          key={movie._id}
          src={movie.backdropUrl}
          className="absolute inset-0 w-full h-full object-cover"
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: visible ? 0.25 : 0, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
        />
      </AnimatePresence>
      <div className="absolute inset-0 bg-gradient-to-r from-[var(--bg)]/97 via-[var(--bg)]/60 to-[var(--bg)]/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-transparent to-transparent" />

      {/* Content */}
      <motion.div
        className="relative z-10 max-w-[600px]"
        initial={{ opacity: 0, x: 60 }}
        animate={{ opacity: visible ? 1 : 0, x: visible ? 0 : -40 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <span className="inline-flex items-center gap-1.5 bg-[var(--gold)]/15 border border-[var(--gold)]/40 text-[var(--gold)] px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase mb-4">
          STREAMING PLATFORM
        </span>

        <h1 className="font-['Bebas_Neue'] text-[clamp(2.5rem,8vw,6rem)] leading-[.95] tracking-wider mb-3">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[var(--gold)] via-[var(--gold2)] to-orange-400">{movie.title}</span>
        </h1>

        <div className="flex items-center gap-2 flex-wrap mb-3">
          {movie.rating && <span className="text-[var(--gold)] font-semibold text-sm">⭐ {movie.rating}</span>}
          {movie.releaseYear && <><span className="text-white/30">•</span><span className="text-white/60 text-sm">{movie.releaseYear}</span></>}
          {movie.duration && <><span className="text-white/30">•</span><span className="text-white/60 text-sm">{Math.floor(movie.duration / 60)}h {movie.duration % 60}m</span></>}
          <span className="bg-white/10 text-white text-xs px-2 py-0.5 rounded font-medium">{movie.type?.toUpperCase()}</span>
          {genres.slice(0, 2).map(g => <span key={g} className="bg-white/10 text-white text-xs px-2 py-0.5 rounded">{g}</span>)}
        </div>

        {movie.description && (
          <p className="text-white/60 text-base leading-relaxed mb-6 max-w-[480px] line-clamp-3">{movie.description}</p>
        )}

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => openPlayer(movie)}
            className="flex items-center gap-2 bg-[var(--gold)] text-black px-7 py-3.5 rounded-full font-bold hover:bg-[var(--gold2)] hover:-translate-y-0.5 transition-all shadow-lg shadow-[var(--gold)]/35"
          >
            <Play className="w-5 h-5 fill-current" /> Play Now
          </button>
          <button
            onClick={() => toggleWishlist(movie._id)}
            className={`flex items-center gap-2 px-6 py-3.5 rounded-full font-medium backdrop-blur-lg transition-all hover:-translate-y-0.5 border ${inW ? 'bg-[var(--gold)]/15 border-[var(--gold)]/50 text-[var(--gold)]' : 'bg-white/10 border-white/15 text-white'}`}
          >
            <Heart className="w-5 h-5" fill={inW ? 'currentColor' : 'none'} /> {inW ? 'Wishlisted' : 'Wishlist'}
          </button>
          <button
            onClick={() => openDetail(movie)}
            className="flex items-center gap-2 bg-white/10 border border-white/15 text-white px-6 py-3.5 rounded-full font-medium backdrop-blur-lg transition-all hover:-translate-y-0.5 hover:bg-white/20"
          >
            <Info className="w-4 h-4" /> More Info
          </button>
        </div>
      </motion.div>

      {/* Dots */}
      {slides.length > 1 && (
        <div className="absolute bottom-7 left-4 sm:left-14 z-10 flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => { clearInterval(timerRef.current); goTo(i); }}
              className={`h-2 rounded-full transition-all duration-500 ${i === idx ? 'w-7 bg-[var(--gold)]' : 'w-2 bg-white/30 hover:bg-white/50'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
