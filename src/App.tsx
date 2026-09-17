import { useState, useEffect, useCallback, useRef } from 'react';
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
import { encryptSecret, decryptMessage, generateCode } from '@/lib/crypto';
import { passwordStrength } from '@/lib/password';

type View = 'create' | 'created' | 'unlock' | 'revealed' | 'manage';
const expiryOptions = [{ seconds: 600, label: '10 minutes' }, { seconds: 3600, label: '1 hour' }, { seconds: 86400, label: '1 day' }, { seconds: 604800, label: '7 days' }];

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
  const [burnAfterRead, setBurnAfterRead] = useState(false);
  const [expirySeconds, setExpirySeconds] = useState(604800);
  const [deleteToken, setDeleteToken] = useState('');
  const [deleted, setDeleted] = useState(false);
  const [selfDestructed, setSelfDestructed] = useState(false);
  const [privateCopied, setPrivateCopied] = useState(false);
  const submitting = useRef(false);
  const strength = passwordStrength(password);
  const expiryLabel = expiryOptions.find((option) => option.seconds === expirySeconds)?.label;
  const privateLink = `${window.location.origin}${window.location.pathname}#manage=${createdCode}.${deleteToken}`;

  // Check URL for a code on mount (e.g. ?code=ABCD1234)
  useEffect(() => {
    const owner = /^#manage=([A-Z2-9]{8})\.([a-f0-9]{64})$/.exec(window.location.hash);
    if (owner) {
      setCreatedCode(owner[1]);
      setDeleteToken(owner[2]);
      setView('manage');
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      setUnlockCode(code.toUpperCase());
      setView('unlock');
    }
  }, []);

  const handleCreate = useCallback(async () => {
    if (submitting.current) return;
    if (!message.trim() || !password.trim()) {
      setError('Please enter both a message and a password.');
      return;
    }
    submitting.current = true;
    setLoading(true);
    setError('');
    try {
      const code = generateCode();
      const encrypted = await encryptSecret(message, password, burnAfterRead);

      const result = await apiRequest('/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, ...encrypted, burn_after_read: burnAfterRead, expiry_seconds: expirySeconds }),
      });

      setCreatedCode(code);
      setDeleteToken(result.delete_token);
      setDeleted(false);
      setMessage('');
      setPassword('');
      window.history.replaceState({}, '', `#manage=${code}.${result.delete_token}`);
      setView('created');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }, [message, password, burnAfterRead, expirySeconds]);

  const handleUnlock = useCallback(async () => {
    if (submitting.current) return;
    if (!unlockCode.trim() || !unlockPassword.trim()) {
      setError('Please enter both the code and the password.');
      return;
    }
    submitting.current = true;
    setLoading(true);
    setError('');
    try {
      const msg: SecretMessage = await apiRequest('/secrets/' + encodeURIComponent(unlockCode.trim().toUpperCase()) + '/unlock', { method: 'POST' });

      let decrypted: string;
      try {
        decrypted = await decryptMessage(
          msg.ciphertext,
          msg.iv,
          msg.salt,
          unlockPassword
        );
      } catch {
        setError('Wrong password. The message could not be decrypted.');
        return;
      }
      setSelfDestructed(false);
      if (msg.burn_after_read) {
        const envelope = JSON.parse(decrypted);
        const result = await apiRequest(`/secrets/${msg.code}/burn`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: envelope.burnToken }),
        });
        decrypted = envelope.message;
        msg.view_count = result.view_count;
        setSelfDestructed(result.self_destructed);
      }
      setRevealedMessage(decrypted);
      setStoredMessage(msg);
      setUnlockPassword('');
      setView('revealed');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    } finally {
      submitting.current = false;
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
    setDeleteToken('');
    setDeleted(false);
    setSelfDestructed(false);
    setBurnAfterRead(false);
    setExpirySeconds(604800);
    setCopied(false);
    setPrivateCopied(false);
    setView('create');
    const url = new URL(window.location.href);
    url.searchParams.delete('code');
    url.hash = '';
    window.history.replaceState({}, '', url);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!createdCode || !deleteToken) return;
    setLoading(true);
    setError('');
    try {
      await apiRequest('/secrets/' + encodeURIComponent(createdCode), { method: 'DELETE', headers: { Authorization: `Bearer ${deleteToken}` } });
      setDeleted(true);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the message.');
    } finally {
      setLoading(false);
    }
  }, [createdCode, deleteToken]);

  const copyCode = useCallback(async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?code=${createdCode}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Could not copy. Select and copy the recipient link above.');
    }
  }, [createdCode]);

  // ── Created view ──
  if (view === 'created' || view === 'manage') {
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
              {deleted ? 'Secret deleted' : view === 'manage' ? 'Manage your secret' : 'Your secret is ready'}
            </h2>
            <p className="text-slate-400 text-center text-sm mb-8">
              {deleted ? 'The message has been permanently removed from the database.' : 'Keep your private delete link. Share only the recipient link below.'}
            </p>

            {!deleted && <>
            {view === 'created' && <div className="flex flex-wrap gap-2 mb-5 text-xs">
              <span className="rounded-full bg-sky-500/10 text-sky-300 px-3 py-1.5">Expires in {expiryLabel}</span>
              {burnAfterRead && <span className="rounded-full bg-orange-500/10 text-orange-300 px-3 py-1.5">Burn after read</span>}
            </div>}
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
                  Send the recipient link and password through different channels. Only your private delete link allows manual deletion.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-red-500/20 p-4 mb-5 bg-red-500/5">
              <p className="text-sm text-red-200 font-medium mb-2">Private delete link — sender only</p>
              <p className="text-xs text-slate-400 mb-3">Save this link to delete later, even on another device. Do not send it to the recipient.</p>
              <input aria-label="Private delete link" readOnly value={privateLink} className="w-full bg-slate-800 text-slate-300 text-xs p-3 rounded-xl mb-3" onFocus={(e) => e.target.select()} />
              <button onClick={async () => { try { await navigator.clipboard.writeText(privateLink); setPrivateCopied(true); } catch { setError('Could not copy. Select and copy the private link above.'); } }} className="text-sm text-sky-300 mr-4">{privateCopied ? 'Copied' : 'Copy private link'}</button>
              <button onClick={handleDelete} disabled={loading} className="text-sm text-red-300 disabled:opacity-50"><Trash2 className="w-4 h-4 inline mr-1" />{loading ? 'Deleting…' : 'Delete my secret'}</button>
            </div>
            </>}
            {error && <p role="alert" className="text-sm text-red-300 mb-4">{error}</p>}

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
              <span>{selfDestructed ? 'Self-destructed — deleted from database' : `Expires ${storedMessage?.expires_at ? new Date(storedMessage.expires_at).toLocaleString() : ''}`}</span>
            </div>
            <p className="text-center text-sm text-sky-300 mb-5">{storedMessage?.view_count} unlock attempt{storedMessage?.view_count === 1 ? '' : 's'} (including incorrect passwords)</p>
            {selfDestructed && <p role="status" className="rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-300 text-center text-sm p-2 mb-5">Self-destructed</p>}

            {error && <p role="alert" className="text-sm text-red-300 mb-4">{error}</p>}
            <div className="flex gap-3">
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
              <div className="mt-3" role="meter" aria-label="Password strength" aria-valuemin={0} aria-valuemax={5} aria-valuenow={strength.score} aria-valuetext={strength.label}>
                <div className="flex gap-1.5" aria-hidden="true">{[1, 2, 3, 4, 5].map((bar) => <span key={bar} className={`h-1.5 flex-1 rounded-full transition-colors ${bar <= strength.score ? strength.color : 'bg-slate-700'}`} />)}</div>
                <p className="text-xs text-slate-300 mt-2">{strength.label}</p>
              </div>
              <p className="text-xs text-slate-500 mt-1">Use a long, unique password. Strength is an estimate.</p>
            </div>

            <fieldset>
              <legend className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Message expiry</legend>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{expiryOptions.map((option) => <label key={option.seconds} className={`cursor-pointer rounded-xl border p-2.5 text-center text-sm ${expirySeconds === option.seconds ? 'border-sky-500 bg-sky-500/10 text-sky-300' : 'border-slate-700 text-slate-400'}`}><input className="sr-only" type="radio" name="expiry" checked={expirySeconds === option.seconds} onChange={() => setExpirySeconds(option.seconds)} />{option.label}</label>)}</div>
            </fieldset>
            <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-700 bg-slate-800/30 p-4 cursor-pointer">
              <span><span className="block text-sm text-slate-200 font-medium">Burn After Read</span><span className="block text-xs text-slate-400 mt-1">Delete permanently after the first successful unlock.</span></span>
              <input type="checkbox" role="switch" aria-label="Burn After Read" checked={burnAfterRead} onChange={(e) => setBurnAfterRead(e.target.checked)} className="w-5 h-5 accent-orange-400 shrink-0" />
            </label>
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
        <nav aria-label="About SecretDrop" className="mt-6 flex justify-center gap-5 text-sm text-sky-300">
          <a href="/guide.html" className="hover:underline">How it works</a>
          <a href="/privacy.html" className="hover:underline">Privacy</a>
        </nav>
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-slate-600">
          <Lock className="w-3.5 h-3.5" />
          <span>Messages are encrypted in your browser — the server never sees your text or password.</span>
        </div>
      </div>
    </div>
  );
}
