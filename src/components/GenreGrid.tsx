import { useApp } from '@/lib/AppContext';

const GENRES = [
  { name: 'Action', cls: 'g1', icon: '💥' }, { name: 'Sci-Fi', cls: 'g2', icon: '🚀' },
  { name: 'Drama', cls: 'g3', icon: '🎭' }, { name: 'Thriller', cls: 'g4', icon: '🔪' },
  { name: 'Romance', cls: 'g5', icon: '❤️' }, { name: 'Horror', cls: 'g6', icon: '👻' },
  { name: 'Comedy', cls: 'g7', icon: '😂' }, { name: 'Documentary', cls: 'g8', icon: '🎬' },
  { name: 'Fantasy', cls: 'g9', icon: '🧙' }, { name: 'Crime', cls: 'g10', icon: '🔍' },
  { name: 'Historical', cls: 'g11', icon: '⏳' }, { name: 'Adventure', cls: 'g12', icon: '🗺️' },
];

interface Props {
  onFilter: (genre: string) => void;
}

export default function GenreGrid({ onFilter }: Props) {
  const { allContent } = useApp();

  return (
    <section className="px-4 sm:px-14 py-12">
      <h2 className="font-['Playfair_Display'] text-xl sm:text-3xl font-bold mb-7">Browse by Genre</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {GENRES.map(g => {
          const count = allContent.filter(m => (m._genres_normalized || []).some(gn => gn.toLowerCase() === g.name.toLowerCase())).length;
          return (
            <div
              key={g.name}
              className={`${g.cls} rounded-xl h-24 flex items-center justify-center cursor-pointer relative overflow-hidden transition-all duration-300 hover:scale-[1.04] hover:shadow-2xl group`}
              onClick={() => onFilter(g.name)}
            >
              <span className="font-['Bebas_Neue'] text-lg tracking-widest z-10 text-shadow-lg pointer-events-none">{g.icon} {g.name}</span>
              {count > 0 && <span className="absolute bottom-2 right-3 text-white/40 text-xs font-medium z-10">{count}</span>}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
            </div>
          );
        })}
      </div>
    </section>
  );
}
