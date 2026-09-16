import { useState, useEffect, useCallback } from 'react';
import {
  Lock,
  Send,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  Check,
  Loader2,
  ShieldCheck,
  Sparkles,
  ArrowLeft,
  AlertCircle,
  Trash2,
  Clock,
} from 'lucide-react';
import { apiRequest, ApiError, type SecretMessage } from '@/lib/api';
import { encryptMessage, decryptMessage, generateCode } from '@/lib/crypto';

type View = 'create' | 'created' | 'unlock' | 'revealed';

export default function App() {
  const [view, setView] = useState<View>('create');
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdCode, setCreatedCode] = useState('');
  const [unlockCode, setUnlockCode] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [showUnlockPassword, setShowUnlockPassword] = useState(false);
  const [revealedMessage, setRevealedMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [storedMessage, setStoredMessage] = useState<SecretMessage | null>(null);

  // Check URL for a code on mount (e.g. ?code=ABCD1234)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setUnlockCode(code.toUpperCase());
      setView('unlock');
    }
  }, []);

  const handleCreate = useCallback(async () => {
    if (!message.trim() || !password.trim()) {
      setError('Please enter both a message and a password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const code = generateCode();
      const { ciphertext, iv, salt } = await encryptMessage(message, password);

      await apiRequest('/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, ciphertext, iv, salt }),
      });

      setCreatedCode(code);
      setView('created');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [message, password]);

  const handleUnlock = useCallback(async () => {
    if (!unlockCode.trim() || !unlockPassword.trim()) {
      setError('Please enter both the code and the password.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const msg: SecretMessage = await apiRequest('/secrets/' + encodeURIComponent(unlockCode.trim().toUpperCase()));

      try {
        const decrypted = await decryptMessage(
          msg.ciphertext,
          msg.iv,
          msg.salt,
          unlockPassword
        );
        setRevealedMessage(decrypted);
        setStoredMessage(msg);
        setView('revealed');
      } catch {
        setError('Wrong password. The message could not be decrypted.');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [unlockCode, unlockPassword]);

  const resetAll = useCallback(() => {
    setMessage('');
    setPassword('');
    setUnlockCode('');
    setUnlockPassword('');
    setRevealedMessage('');
    setStoredMessage(null);
    setError('');
    setCreatedCode('');
    setView('create');
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    window.history.replaceState({}, '', url);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!storedMessage) return;
    setLoading(true);
    setError('');
    try {
      await apiRequest('/secrets/' + encodeURIComponent(storedMessage.code), { method: 'DELETE' });
      resetAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the message.');
    } finally {
      setLoading(false);
    }
  }, [storedMessage, resetAll]);

  const copyCode = useCallback(() => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?code=${createdCode}`;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [createdCode]);

  // ── Created view ──
  if (view === 'created') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-lg">
          <div className="bg-slate-900/70 backdrop-blur-xl rounded-3xl border border-slate-800 shadow-2xl p-8 sm:p-10">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <ShieldCheck className="w-8 h-8 text-emerald-400" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white text-center mb-2">
              Your secret is ready
            </h2>
            <p className="text-slate-400 text-center text-sm mb-8">
              Share this link and the password separately for maximum security.
            </p>

            <div className="bg-slate-800/50 rounded-2xl p-5 mb-5 border border-slate-700/50">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                Shareable Link
              </p>
              <div className="flex items-center gap-3">
                <code className="flex-1 text-sm text-emerald-300 font-mono break-all">
                  {window.location.origin}{window.location.pathname}?code={createdCode}
                </code>
                <button
                  onClick={copyCode}
                  className="shrink-0 p-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 transition-colors text-slate-200"
                  aria-label="Copy link"
                >
                  {copied ? (
                    <Check className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="bg-amber-500/5 rounded-2xl p-5 mb-8 border border-amber-500/15">
              <p className="text-xs font-medium text-amber-400/70 uppercase tracking-wider mb-2">
                Your Code
              </p>
              <p className="text-3xl font-mono font-bold text-amber-300 tracking-[0.3em] text-center py-2">
                {createdCode}
              </p>
            </div>

            <div className="bg-slate-800/30 rounded-2xl p-4 mb-8 border border-slate-700/30">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-400 leading-relaxed">
                  Send the link and the password through different channels — for example, email the link and text the password. The message expires in 7 days.
                </p>
              </div>
            </div>

            <button
              onClick={resetAll}
              className="w-full py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-all border border-slate-700/50"
            >
              Create Another Secret
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Revealed view ──
  if (view === 'revealed') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-lg">
          <div className="bg-slate-900/70 backdrop-blur-xl rounded-3xl border border-slate-800 shadow-2xl p-8 sm:p-10">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Lock className="w-8 h-8 text-emerald-400" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white text-center mb-2">
              Secret Revealed
            </h2>
            <p className="text-slate-400 text-center text-sm mb-8">
              Here is the hidden message that was sent to you.
            </p>

            <div className="bg-slate-800/50 rounded-2xl p-6 mb-8 border border-slate-700/50 min-h-[120px]">
              <p className="text-slate-100 whitespace-pre-wrap break-words leading-relaxed text-base">
                {revealedMessage}
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 mb-6 text-xs text-slate-500">
              <Clock className="w-3.5 h-3.5" />
              <span>Expires {storedMessage?.expires_at ? new Date(storedMessage.expires_at).toLocaleDateString() : 'in 7 days'}</span>
            </div>

            {error && <p role="alert" className="text-sm text-red-300 mb-4">{error}</p>}
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium transition-all border border-red-500/20"
              >
                <Trash2 className="w-4 h-4" />
                Destroy
              </button>
              <button
                onClick={resetAll}
                className="flex-1 py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition-all border border-slate-700/50"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Unlock view ──
  if (view === 'unlock') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-lg">
          <div className="bg-slate-900/70 backdrop-blur-xl rounded-3xl border border-slate-800 shadow-2xl p-8 sm:p-10">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
                <KeyRound className="w-8 h-8 text-sky-400" />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white text-center mb-2">
              Unlock a Secret
            </h2>
            <p className="text-slate-400 text-center text-sm mb-8">
              Enter the code you received and the password to reveal the message.
            </p>

            {error && (
              <div className="mb-5 flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <p className="text-sm text-red-300">{error}</p>
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                  Secret Code
                </label>
                <input
                  type="text"
                  value={unlockCode}
                  onChange={(e) => setUnlockCode(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                  placeholder="e.g. ABCD1234"
                  className="w-full px-4 py-3.5 rounded-2xl bg-slate-800/50 border border-slate-700/50 text-white text-lg font-mono tracking-widest text-center uppercase placeholder:text-slate-600 placeholder:font-sans placeholder:text-sm placeholder:tracking-normal focus:outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showUnlockPassword ? 'text' : 'password'}
                    value={unlockPassword}
                    onChange={(e) => setUnlockPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                    placeholder="Enter the password"
                    className="w-full px-4 py-3.5 pr-12 rounded-2xl bg-slate-800/50 border border-slate-700/50 text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/20 transition-all"
                  />
                  <button
                    onClick={() => setShowUnlockPassword(!showUnlockPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    aria-label="Toggle password visibility"
                  >
                    {showUnlockPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                onClick={handleUnlock}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-all shadow-lg shadow-sky-500/20"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Lock className="w-5 h-5" />
                    Unlock Message
                  </>
                )}
              </button>
            </div>

            <button
              onClick={resetAll}
              className="mt-6 w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Create your own secret
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Create view (default) ──
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500/20 to-emerald-500/20 border border-slate-700/50 mb-4">
            <Sparkles className="w-8 h-8 text-sky-400" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">SecretDrop</h1>
          <p className="text-slate-400 text-sm">
            Write a message, set a password, and share an encrypted code. Only someone with the code and password can read it.
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/70 backdrop-blur-xl rounded-3xl border border-slate-800 shadow-2xl p-8 sm:p-10">
          {error && (
            <div className="mb-5 flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Secret Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your secret message here..."
                rows={5}
                className="w-full px-4 py-3.5 rounded-2xl bg-slate-800/50 border border-slate-700/50 text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/20 transition-all resize-none leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="Set a password to protect the message"
                  className="w-full px-4 py-3.5 pr-12 rounded-2xl bg-slate-800/50 border border-slate-700/50 text-white placeholder:text-slate-600 focus:outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/20 transition-all"
                />
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-all shadow-lg shadow-sky-500/20"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Encrypt & Generate Code
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-600">
          <Lock className="w-3.5 h-3.5" />
          <span>Messages are encrypted in your browser — the server never sees your text or password.</span>
        </div>
      </div>
    </div>
  );
}
