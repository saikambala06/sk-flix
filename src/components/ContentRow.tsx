import MovieCard from './MovieCard';
import type { Movie } from '@/lib/api';
import { Film } from 'lucide-react';

interface Props {
  title: string;
  movies: Movie[];
  emptyMsg?: string;
  accent?: boolean;
  onSeeAll?: () => void;
}

export default function ContentRow({ title, movies, emptyMsg = 'No content yet.', accent, onSeeAll }: Props) {
  return (
    <section className="px-4 sm:px-14 pt-9">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-['Playfair_Display'] text-lg sm:text-2xl font-bold">
          {accent && <span className="text-[var(--gold)] mr-2">●</span>}
          {title}
        </h2>
        {onSeeAll && (
          <button onClick={onSeeAll} className="text-[var(--gold)] text-sm font-semibold hover:text-[var(--gold2)] transition-colors">
            See All →
          </button>
        )}
      </div>
      {movies.length === 0 ? (
        <div className="text-center py-10 text-white/40">
          <Film className="w-12 h-12 mx-auto mb-3 opacity-25" />
          <span>{emptyMsg}</span>
        </div>
      ) : (
        <div className="card-row">
          {movies.map(m => <MovieCard key={m._id} movie={m} />)}
        </div>
      )}
    </section>
  );
}
