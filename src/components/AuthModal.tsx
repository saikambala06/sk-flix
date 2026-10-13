import { useState } from 'react';
import { X } from 'lucide-react';
import { useApp } from '@/lib/AppContext';

interface Props {
  initialTab: 'login' | 'signup';
  onClose: () => void;
}

export default function AuthModal({ initialTab, onClose }: Props) {
  const { login, signup } = useApp();
  const [tab, setTab] = useState(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (tab === 'login') {
      if (!email || !password) { setError('Please fill in all fields.'); return; }
    } else {
      if (!name || !email || !password) { setError('Please fill in all fields.'); return; }
      if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    }
    setLoading(true);
    try {
      if (tab === 'login') await login(email, password);
      else await signup(name, email, password);
      onClose();
    } catch (e: any) { setError(e.message || 'Something went wrong'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[3500] bg-black/85 backdrop-blur-xl flex items-center justify-center p-5" onClick={onClose}>
      <div className="bg-[var(--bg3)] border border-white/[.07] rounded-2xl w-full max-w-[440px] p-8 sm:p-10 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3.5 right-3.5 w-10 h-10 rounded-full bg-white/[.07] flex items-center justify-center text-white/50 hover:text-white hover:bg-white/[.14] transition-all">
          <X className="w-5 h-5" />
        </button>
        <div className="font-['Bebas_Neue'] text-3xl tracking-[3px] text-center mb-2">SK<span className="text-[var(--gold)]">FLIP</span></div>
        <p className="text-center text-white/50 text-sm mb-6">{tab === 'login' ? 'Sign in to continue watching' : 'Create your free account'}</p>

        <div className="flex bg-white/5 rounded-xl p-1 mb-6">
          <button onClick={() => setTab('login')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === 'login' ? 'bg-[var(--surface)] text-white shadow-lg' : 'text-white/50'}`}>Sign In</button>
          <button onClick={() => setTab('signup')} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === 'signup' ? 'bg-[var(--surface)] text-white shadow-lg' : 'text-white/50'}`}>Create Account</button>
        </div>

        {error && <p className="text-[var(--red)] text-sm mb-4">{error}</p>}

        <div className="space-y-4">
          {tab === 'signup' && (
            <div>
              <label className="block text-xs font-semibold text-white/50 mb-1.5 tracking-wider">Full Name</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--gold)] transition-colors placeholder:text-white/25" placeholder="Your name" />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-white/50 mb-1.5 tracking-wider">Email Address</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--gold)] transition-colors placeholder:text-white/25" placeholder="you@example.com" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-white/50 mb-1.5 tracking-wider">Password</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-[var(--gold)] transition-colors placeholder:text-white/25" placeholder={tab === 'signup' ? 'Min. 6 characters' : 'Your password'} onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>
          <button onClick={handleSubmit} disabled={loading} className="w-full bg-[var(--gold)] text-black rounded-full py-3.5 font-bold hover:bg-[var(--gold2)] transition-all disabled:opacity-50 mt-2">
            {loading ? 'Please wait…' : tab === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </div>
      </div>
    </div>
  );
}
