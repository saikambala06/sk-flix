import { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from '@/components/ui/sonner';
import { AppProvider, useApp } from '@/lib/AppContext';
import Navbar from '@/components/Navbar';
import HeroSection from '@/components/HeroSection';
import ContentRow from '@/components/ContentRow';
import GenreGrid from '@/components/GenreGrid';
import PromoSection from '@/components/PromoSection';
import Footer from '@/components/Footer';
import VideoPlayer from '@/components/VideoPlayer';
import DetailOverlay from '@/components/DetailOverlay';
import AuthModal from '@/components/AuthModal';
import SearchOverlay from '@/components/SearchOverlay';

function AppInner() {
  const { movies, series, originals, allContent, loading, playerMovie, detailMovie, closePlayer, closeDetail } = useApp();
  const [authTab, setAuthTab] = useState<'login' | 'signup' | null>(null);
  const [search, setSearch] = useState(false);
  const [genreFilter, setGenreFilter] = useState<string | null>(null);

  const moviesRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<HTMLDivElement>(null);
  const originalsRef = useRef<HTMLDivElement>(null);
  const genresRef = useRef<HTMLDivElement>(null);

  const handleNav = (section: string) => {
    if (section === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
    else if (section === 'movies') moviesRef.current?.scrollIntoView({ behavior: 'smooth' });
    else if (section === 'series') seriesRef.current?.scrollIntoView({ behavior: 'smooth' });
    else if (section === 'originals') originalsRef.current?.scrollIntoView({ behavior: 'smooth' });
    else if (section === 'genres') genresRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const filteredMovies = genreFilter
    ? allContent.filter(m => (m._genres_normalized || []).some(g => g.toLowerCase() === genreFilter.toLowerCase()))
    : movies;

  if (loading) {
    return (
      <div className="fixed inset-0 z-[9999] bg-[var(--bg)] flex flex-col items-center justify-center">
        <div className="font-['Bebas_Neue'] text-4xl sm:text-5xl tracking-[4px] mb-6">SK<span className="text-[var(--gold)]">FLIP</span></div>
        <div className="w-44 h-[3px] bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-[var(--gold)] to-[var(--gold2)] rounded-full animate-[shimmer_1.8s_ease-in-out_infinite]" style={{ width: '40%' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Navbar
        onSearch={() => setSearch(true)}
        onAuth={setAuthTab}
        onWishlist={() => {}}
        onAdmin={() => {}}
        onNav={handleNav}
      />

      <HeroSection />

      <div ref={moviesRef}>
        <ContentRow
          title={genreFilter ? `${genreFilter} Movies & Series` : 'Trending Now'}
          movies={filteredMovies}
          emptyMsg="No content yet."
          onSeeAll={genreFilter ? () => setGenreFilter(null) : undefined}
        />
        {genreFilter && (
          <div className="px-4 sm:px-14 mt-2">
            <button onClick={() => setGenreFilter(null)} className="text-white/40 text-sm hover:text-white transition-colors">✕ Clear filter</button>
          </div>
        )}
      </div>

      <div ref={seriesRef}>
        <ContentRow title="Top Rated Series" movies={series} emptyMsg="No series available." />
      </div>

      <div ref={originalsRef}>
        <ContentRow title="SkFlip Originals" movies={originals} accent emptyMsg="No originals yet." />
      </div>

      <div ref={genresRef}>
        <GenreGrid onFilter={setGenreFilter} />
      </div>

      <PromoSection />
      <Footer />

      {/* Overlays */}
      <AnimatePresence>
        {detailMovie && <DetailOverlay key="detail" movie={detailMovie} onClose={closeDetail} />}
      </AnimatePresence>

      <AnimatePresence>
        {playerMovie && <VideoPlayer key="player" movie={playerMovie} onClose={closePlayer} />}
      </AnimatePresence>

      {authTab && <AuthModal initialTab={authTab} onClose={() => setAuthTab(null)} />}

      <AnimatePresence>
        {search && <SearchOverlay onClose={() => setSearch(false)} />}
      </AnimatePresence>

      <Toaster position="bottom-right" theme="dark" />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
