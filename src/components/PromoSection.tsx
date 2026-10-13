import { Zap, Smartphone, Brain, Users, Rocket, Unlock } from 'lucide-react';

export default function PromoSection() {
  return (
    <>
      {/* Promo Banner */}
      <div className="mx-4 sm:mx-14 mt-10 bg-gradient-to-r from-[var(--bg2)] via-[#1a1430] to-[var(--bg2)] border border-[var(--gold)]/25 rounded-2xl p-8 sm:p-16 relative overflow-hidden">
        <div className="absolute -top-1/2 -left-1/5 w-[500px] h-[500px] bg-radial-gradient from-[var(--gold)]/10 to-transparent pointer-events-none" />
        <p className="text-[var(--gold)] text-xs font-bold tracking-[2px] uppercase mb-3">Limited Time Offer</p>
        <h2 className="font-['Bebas_Neue'] text-3xl sm:text-5xl leading-[.95] tracking-wider mb-4">3 Months Free.<br />No Catch.</h2>
        <p className="text-white/40 mb-6 max-w-md">Unlock movies, series, and SkFlip Originals. Cancel anytime.</p>
        <button className="border-2 border-[var(--gold)] text-[var(--gold)] px-7 py-3 rounded-full font-bold tracking-wider hover:bg-[var(--gold)] hover:text-black transition-all hover:-translate-y-0.5">
          Claim Offer Now →
        </button>
      </div>

      {/* Features */}
      <section className="px-4 sm:px-14 py-12">
        <h2 className="font-['Playfair_Display'] text-xl sm:text-3xl font-bold mb-7">Why SkFlip?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: <Zap />, title: 'Ultra HD Streaming', desc: 'Crystal-clear 4K HDR with Dolby Vision. Adaptive bitrate ensures smooth playback.' },
            { icon: <Smartphone />, title: 'Watch Anywhere', desc: 'TV, phone, tablet, laptop — your watchlist follows you everywhere.' },
            { icon: <Brain />, title: 'Smart Recommendations', desc: 'AI-powered personalization learns your taste with every watch.' },
            { icon: <Users />, title: 'Family Profiles', desc: 'Up to 6 individual profiles with kids mode and parental controls.' },
            { icon: <Rocket />, title: 'Instant Access', desc: 'Optimized delivery gets you watching in under 2 seconds.' },
            { icon: <Unlock />, title: 'No Hidden Fees', desc: 'Transparent pricing with no contracts. Cancel anytime.' },
          ].map((f, i) => (
            <div key={i} className="bg-[var(--bg3)] border border-white/[.07] rounded-2xl p-7 hover:border-[var(--gold)]/40 hover:-translate-y-1 transition-all">
              <div className="text-[var(--gold)] mb-4 w-8 h-8">{f.icon}</div>
              <h3 className="font-bold mb-1.5">{f.title}</h3>
              <p className="text-white/40 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
