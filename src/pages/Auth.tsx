import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Mail, KeyRound, ArrowLeft, Phone, Eye, EyeOff, Check, X, Users, Smartphone
} from 'lucide-react';
import { validateEmail } from '@/lib/emailValidation';
import { isValidPhoneNumber } from 'libphonenumber-js';
import CountryCodeSelector from '@/components/auth/CountryCodeSelector';
import { countries, type Country } from '@/lib/countryCodes';
import BrandLogo from '@/components/brand/BrandLogo';
import { cn } from '@/lib/utils';

const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' };
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-destructive' };
  if (score <= 2) return { score: 2, label: 'Fair', color: 'bg-warning' };
  if (score <= 3) return { score: 3, label: 'Good', color: 'bg-warning' };
  if (score <= 4) return { score: 4, label: 'Strong', color: 'bg-success' };
  return { score: 5, label: 'Very strong', color: 'bg-success' };
}

type AuthMode = 'login' | 'signup' | 'otp-request' | 'otp-verify' | 'phone-request' | 'phone-verify';

const inputField =
  'h-11 bg-surface border-border rounded-lg focus-visible:ring-primary/30 focus-visible:ring-offset-0 transition-colors';

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'login' | 'signup'>(searchParams.get('mode') === 'signup' ? 'signup' : 'login');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; displayName?: string }>({});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [touchedFields, setTouchedFields] = useState<{ email?: boolean; password?: boolean; displayName?: boolean }>({});
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [otpCode, setOtpCode] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(countries.find(c => c.code === 'US')!);
  const [phoneOtpCode, setPhoneOtpCode] = useState('');

  useEffect(() => {
    if (!authLoading && user) navigate('/');
  }, [user, authLoading, navigate]);

  const switchTab = (tab: 'login' | 'signup') => {
    setActiveTab(tab);
    setErrors({});
    setTouchedFields({});
  };

  const validateForm = (isSignUp: boolean) => {
    const newErrors: typeof errors = {};
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      newErrors.email = emailValidation.error || 'Please enter a valid email address';
    }
    if (authMode !== 'otp-request') {
      const passwordResult = passwordSchema.safeParse(password);
      if (!passwordResult.success) {
        newErrors.password = passwordResult.error.errors[0].message;
      }
    }
    if (isSignUp && displayName && displayName.length < 2) {
      newErrors.displayName = 'Display name must be at least 2 characters';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm(false)) return;
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Login failed',
        description: error.message === 'Invalid login credentials'
          ? 'Invalid email or password. Please try again.'
          : error.message,
      });
    } else {
      toast({ title: 'Welcome back!', description: 'You have successfully logged in.' });
      navigate('/');
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm(true)) return;
    setLoading(true);
    const { error } = await signUp(email, password, displayName || undefined);
    setLoading(false);
    if (error) {
      if (error.message.includes('already registered')) {
        toast({
          variant: 'destructive',
          title: 'Account exists',
          description: 'An account with this email already exists.',
          action: (
            <button onClick={() => switchTab('login')} className="text-sm font-medium underline hover:no-underline">
              Log in instead
            </button>
          ),
        });
        return;
      }
      toast({ variant: 'destructive', title: 'Sign up failed', description: error.message });
    } else {
      toast({ title: 'Welcome to Twibsers!', description: 'Your account has been created successfully.' });
      navigate('/onboarding/interests');
    }
  };

  const handleOtpRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      setErrors({ email: emailValidation.error || 'Please enter a valid email address' });
      return;
    }
    setErrors({});
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/` } });
    setLoading(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Failed to send code', description: error.message });
    } else {
      toast({ title: 'Code sent!', description: 'Check your email for the 6-digit verification code.' });
      setAuthMode('otp-verify');
    }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length !== 6) {
      toast({ variant: 'destructive', title: 'Invalid code', description: 'Please enter the 6-digit code from your email.' });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'email' });
    setLoading(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Verification failed', description: error.message });
    } else {
      const { count } = await supabase.from('user_interests').select('*', { count: 'exact', head: true }).eq('user_id', (await supabase.auth.getUser()).data.user?.id);
      const isNewUser = (count || 0) === 0;
      toast({ title: 'Welcome!', description: 'You have successfully signed in.' });
      navigate(isNewUser ? '/onboarding/interests' : '/');
    }
  };

  const handlePhoneRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullPhoneNumber = selectedCountry.dialCode + phoneNumber.replace(/^0+/, '');
    if (!isValidPhoneNumber(fullPhoneNumber)) {
      setErrors({ email: 'Please enter a valid phone number for ' + selectedCountry.name });
      return;
    }
    setErrors({});
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: fullPhoneNumber });
    setLoading(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Failed to send code', description: error.message });
    } else {
      toast({ title: 'Code sent!', description: 'Check your phone for the 6-digit verification code.' });
      setAuthMode('phone-verify');
    }
  };

  const handlePhoneVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (phoneOtpCode.length !== 6) {
      toast({ variant: 'destructive', title: 'Invalid code', description: 'Please enter the 6-digit code from your SMS.' });
      return;
    }
    const fullPhoneNumber = selectedCountry.dialCode + phoneNumber.replace(/^0+/, '');
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ phone: fullPhoneNumber, token: phoneOtpCode, type: 'sms' });
    setLoading(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Verification failed', description: error.message });
    } else {
      const { count } = await supabase.from('user_interests').select('*', { count: 'exact', head: true }).eq('user_id', (await supabase.auth.getUser()).data.user?.id);
      const isNewUser = (count || 0) === 0;
      toast({ title: 'Welcome!', description: 'You have successfully signed in.' });
      navigate(isNewUser ? '/onboarding/interests' : '/');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const renderOtpFlow = () => (
    <div>
      <button type="button" onClick={() => setAuthMode('login')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to log in
      </button>

      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-surface-2 flex items-center justify-center mx-auto mb-3">
          {authMode === 'otp-request' ? <Mail className="h-5 w-5 text-primary" /> : <KeyRound className="h-5 w-5 text-primary" />}
        </div>
        <h1 className="text-xl font-bold mb-1">
          {authMode === 'otp-request' ? 'Log in with email' : 'Enter the code'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {authMode === 'otp-request'
            ? "We'll send a 6-digit code to your email."
            : `Enter the code sent to ${email}.`}
        </p>
      </div>

      {authMode === 'otp-request' ? (
        <form onSubmit={handleOtpRequest} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Email</Label>
            <Input type="email" placeholder="name@example.com" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(inputField, errors.email && 'border-destructive')}
              disabled={loading} />
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {loading ? 'Sending…' : 'Send code'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleOtpVerify} className="space-y-5">
          <div className="flex justify-center">
            <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} disabled={loading}>
              <InputOTPGroup>
                {[0, 1, 2].map(i => <InputOTPSlot key={i} index={i} className="w-11 h-12 text-lg rounded-lg border-border focus:border-primary focus:ring-primary/30" />)}
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                {[3, 4, 5].map(i => <InputOTPSlot key={i} index={i} className="w-11 h-12 text-lg rounded-lg border-border focus:border-primary focus:ring-primary/30" />)}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button type="submit" className="w-full" disabled={loading || otpCode.length !== 6}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Verifying…' : 'Verify and log in'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Didn't receive the code?{' '}
            <button type="button" onClick={() => setAuthMode('otp-request')} className="text-primary font-semibold hover:underline">Resend</button>
          </p>
        </form>
      )}
    </div>
  );

  const renderPhoneFlow = () => (
    <div>
      <button type="button" onClick={() => setAuthMode('login')}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to log in
      </button>

      <div className="text-center mb-6">
        <div className="w-12 h-12 rounded-xl bg-surface-2 flex items-center justify-center mx-auto mb-3">
          {authMode === 'phone-request' ? <Phone className="h-5 w-5 text-primary" /> : <Smartphone className="h-5 w-5 text-primary" />}
        </div>
        <h1 className="text-xl font-bold mb-1">
          {authMode === 'phone-request' ? 'Log in with phone' : 'Enter the code'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {authMode === 'phone-request'
            ? "We'll send a 6-digit code via SMS."
            : `Enter the code sent to ${phoneNumber}.`}
        </p>
      </div>

      {authMode === 'phone-request' ? (
        <form onSubmit={handlePhoneRequest} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Phone number</Label>
            <div className="flex gap-2">
              <CountryCodeSelector value={selectedCountry.code} onChange={setSelectedCountry} disabled={loading} />
              <Input type="tel" placeholder="Enter your number" value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d]/g, ''))}
                className={cn('flex-1', inputField, errors.email && 'border-destructive')}
                disabled={loading} />
            </div>
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
            {loading ? 'Sending…' : 'Send code'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handlePhoneVerify} className="space-y-5">
          <div className="flex justify-center">
            <InputOTP maxLength={6} value={phoneOtpCode} onChange={setPhoneOtpCode} disabled={loading}>
              <InputOTPGroup>
                {[0, 1, 2].map(i => <InputOTPSlot key={i} index={i} className="w-11 h-12 text-lg rounded-lg border-border focus:border-primary focus:ring-primary/30" />)}
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                {[3, 4, 5].map(i => <InputOTPSlot key={i} index={i} className="w-11 h-12 text-lg rounded-lg border-border focus:border-primary focus:ring-primary/30" />)}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button type="submit" className="w-full" disabled={loading || phoneOtpCode.length !== 6}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Verifying…' : 'Verify and log in'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Didn't receive the code?{' '}
            <button type="button" onClick={() => setAuthMode('phone-request')} className="text-primary font-semibold hover:underline">Resend</button>
          </p>
        </form>
      )}
    </div>
  );

  const renderAuthForm = () => (
    <div>
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold tracking-tight mb-1">
          {activeTab === 'login' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="text-sm text-muted-foreground">
          {activeTab === 'login'
            ? 'Log in to see what your friends are sharing.'
            : 'Sign up to share moments and connect with people.'}
        </p>
      </div>

      <div className="flex gap-1 bg-surface-2 p-1 rounded-full mb-6">
        <button type="button" onClick={() => switchTab('login')}
          className={cn('orbis-tab flex-1 text-center', activeTab === 'login' && 'active')}>
          Log In
        </button>
        <button type="button" onClick={() => switchTab('signup')}
          className={cn('orbis-tab flex-1 text-center', activeTab === 'signup' && 'active')}>
          Sign Up
        </button>
      </div>

      <div className="space-y-2.5 mb-5">
        <button type="button"
          className="w-full h-11 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm font-medium flex items-center justify-center gap-2.5 transition-colors">
          <svg className="h-4 w-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Continue with Google
        </button>
        <button type="button"
          className="w-full h-11 rounded-lg border border-border bg-surface hover:bg-surface-2 text-sm font-medium flex items-center justify-center gap-2.5 transition-colors">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
          Continue with Apple
        </button>
      </div>

      <div className="relative mb-5">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center">
          <span className="bg-card px-3 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">or</span>
        </div>
      </div>

      {activeTab === 'login' ? (
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input ref={emailInputRef} type="email" placeholder="name@example.com" autoFocus value={email}
                onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouchedFields(p => ({ ...p, email: true }))}
                className={cn(inputField, 'pl-10', errors.email && 'border-destructive')}
                disabled={loading} />
            </div>
            {errors.email && touchedFields.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Password</Label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input ref={passwordInputRef} type={showPassword ? 'text' : 'password'} placeholder="Enter your password" value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={cn(inputField, 'pl-10 pr-11', errors.password && 'border-destructive')}
                disabled={loading} />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1.5">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Logging in…' : 'Log In'}
          </Button>

          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => setAuthMode('otp-request')}
              className="h-10 rounded-lg border border-border text-sm font-medium flex items-center justify-center gap-2 hover:bg-surface-2 transition-colors">
              <Mail className="h-4 w-4 text-muted-foreground" />
              Email code
            </button>
            <button type="button" onClick={() => setAuthMode('phone-request')}
              className="h-10 rounded-lg border border-border text-sm font-medium flex items-center justify-center gap-2 hover:bg-surface-2 transition-colors">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Phone
            </button>
          </div>

          <p className="text-center text-sm text-muted-foreground pt-1">
            Don't have an account?{' '}
            <button type="button" onClick={() => switchTab('signup')} className="text-primary font-semibold hover:underline">Sign up</button>
          </p>
        </form>
      ) : (
        <form onSubmit={handleSignUp} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Display name <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <div className="relative">
              <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input ref={nameInputRef} type="text" placeholder="What should we call you?" value={displayName}
                onChange={(e) => setDisplayName(e.target.value)} onBlur={() => setTouchedFields(p => ({ ...p, displayName: true }))}
                className={cn(inputField, 'pl-10')}
                disabled={loading} />
            </div>
            {errors.displayName && touchedFields.displayName && (
              <p className="text-xs text-destructive flex items-center gap-1"><X className="h-3 w-3" /> {errors.displayName}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input ref={emailInputRef} type="email" placeholder="name@example.com" value={email}
                onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouchedFields(p => ({ ...p, email: true }))}
                className={cn(inputField, 'pl-10', errors.email && 'border-destructive')}
                disabled={loading} />
            </div>
            {errors.email && touchedFields.email ? (
              <p className="text-xs text-destructive flex items-center gap-1"><X className="h-3 w-3" /> {errors.email}</p>
            ) : email && touchedFields.email && !errors.email ? (
              <p className="text-xs text-success flex items-center gap-1"><Check className="h-3 w-3" /> Looks good!</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Password</Label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input ref={passwordInputRef} type={showPassword ? 'text' : 'password'} placeholder="Create a strong password" value={password}
                onChange={(e) => setPassword(e.target.value)} onBlur={() => setTouchedFields(p => ({ ...p, password: true }))}
                className={cn(inputField, 'pl-10 pr-11', errors.password && 'border-destructive')}
                disabled={loading} />
              <button type="button" onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1.5">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {password && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 flex-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i}
                        className={cn('h-1.5 flex-1 rounded-full transition-colors',
                          getPasswordStrength(password).score >= i
                            ? getPasswordStrength(password).color
                            : 'bg-surface-3')} />
                    ))}
                  </div>
                  <span className={cn('text-xs font-medium min-w-[70px] text-right',
                    getPasswordStrength(password).score >= 4 ? 'text-success'
                      : getPasswordStrength(password).score >= 2 ? 'text-warning'
                      : 'text-destructive')}>
                    {getPasswordStrength(password).label}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { check: password.length >= 6, text: '6+ chars' },
                    { check: /[A-Z]/.test(password), text: 'Uppercase' },
                    { check: /[0-9]/.test(password), text: 'Number' },
                    { check: /[^A-Za-z0-9]/.test(password), text: 'Symbol' },
                  ].map(req => (
                    <span key={req.text}
                      className={cn('text-[11px] px-2 py-0.5 rounded-full border font-medium transition-colors',
                        req.check ? 'border-success/40 text-success bg-surface-2' : 'border-border text-muted-foreground')}>
                      {req.check ? <Check className="h-2.5 w-2.5 inline mr-0.5" /> : null}{req.text}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {errors.password && touchedFields.password && (
              <p className="text-xs text-destructive flex items-center gap-1"><X className="h-3 w-3" /> {errors.password}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Creating account…' : 'Create Account'}
          </Button>

          <button type="button" onClick={() => setAuthMode('phone-request')}
            className="w-full h-10 rounded-lg border border-border text-sm font-medium flex items-center justify-center gap-2 hover:bg-surface-2 transition-colors">
            <Phone className="h-4 w-4 text-muted-foreground" />
            Sign up with Phone
          </button>

          <p className="text-center text-sm text-muted-foreground pt-1">
            Already have an account?{' '}
            <button type="button" onClick={() => switchTab('login')} className="text-primary font-semibold hover:underline">Log in</button>
          </p>
        </form>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-7">
          <BrandLogo className="h-11" />
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 sm:p-7">
          {(authMode === 'otp-request' || authMode === 'otp-verify') && renderOtpFlow()}
          {(authMode === 'phone-request' || authMode === 'phone-verify') && renderPhoneFlow()}
          {authMode === 'login' && renderAuthForm()}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6 leading-relaxed">
          By continuing you agree to our{' '}
          <a href="/terms" className="text-primary font-medium hover:underline">Terms</a>
          {' '}and{' '}
          <a href="/privacy" className="text-primary font-medium hover:underline">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
