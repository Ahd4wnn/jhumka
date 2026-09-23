import { useState, type SubmitEvent } from 'react';
import { ApiError, post } from '../api';
import { Button, Field, Input } from '../ui';

export function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email || !password) return setError('Enter your email and password.');
    setBusy(true);
    setError('');
    try {
      await post('/auth/login', { email, password });
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-white px-6">
      <form onSubmit={submit} className="w-full max-w-sm" noValidate>
        <p className="display text-6xl leading-none">jhumka</p>
        <p className="caps mt-2">Admin</p>
        <div className="mt-10 grid gap-5">
          <Field label="Email">
            <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          <Field label="Password">
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && (
            <p className="text-sm" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
      </form>
    </div>
  );
}
