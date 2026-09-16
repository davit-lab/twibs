import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/SystemSettingsContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Check, Eye, EyeOff, Loader2, Mail, Phone, User
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

type AuthMode = 'login' | 'signup' | 'otp-request' | 'otp-verify' | 'phone-request' | 'phone-verify' | 'forgot-password' | 'reset-password';

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1600&q=80';

const field =
  'h-12 bg-surface border border-border rounded-[10px] px-4 text-[15px] placeholder:text-muted-foreground/70 transition-colors duration-150 focus:border-primary focus-visible:ring-1 focus-visible:ring-primary/25 focus-visible:ring-offset-0';

const primaryBtn =
  'w-full h-12 rounded-[10px] bg-primary text-primary-foreground text-[15px] font-semibold shadow-none hover:bg-primary/90 transition-colors duration-150';

const secondaryBtn =
  'h-11 rounded-[10px] border border-border bg-surface text-sm font-medium text-foreground hover:bg-surface-2 transition-colors duration-150 flex items-center justify-center gap-2';

const socialBtn =
  'flex h-12 w-full items-center justify-center gap-2.5 rounded-[10px] border border-border bg-surface text-[15px] font-semibold text-foreground transition-colors duration-150 hover:bg-surface-2';

const otpSlot =
  'h-12 sm:h-[52px] w-10 sm:w-11 rounded-[10px] bg-surface border-border text-lg font-semibold text-foreground';

function Field({ label, htmlFor, error, required, children }: {
  label: React.ReactNode;
  htmlFor?: string;
  error?: string | null;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[13px] font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function PasswordInput({ id, inputRef, value, onChange, placeholder, show, onToggle, disabled, autoComplete, error }: {
  id: string;
  inputRef?: React.Ref<HTMLInputElement>;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  show: boolean;
  onToggle: () => void;
  disabled?: boolean;
  autoComplete?: string;
  error?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        type={show ? 'text' : 'password'}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={error}
        className={cn(field, 'pr-12', error && 'border-destructive focus:border-destructive')}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-surface-3 hover:text-foreground"
      >
        {show ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
      </button>
    </div>
  );
}

function PasswordStrengthMeter({ password }: { password: string }) {
  const strength = getPasswordStrength(password);
  if (!password) return null;
  const toneText = strength.score >= 4 ? 'text-success' : strength.score >= 2 ? 'text-warning' : 'text-destructive';
  const requirements = [
    { check: password.length >= 6, text: '6+ chars' },
    { check: /[A-Z]/.test(password), text: 'Uppercase' },
    { check: /[0-9]/.test(password), text: 'Number' },
    { check: /[^A-Za-z0-9]/.test(password), text: 'Symbol' },
  ];
  return (
    <div className="space-y-2.5 pt-2">
      <div className="flex gap-1.5" aria-hidden>
        {[1, 2, 3, 4, 5].map(i => (
          <span
            key={i}
            className={cn(
              'h-[3px] flex-1 rounded-full transition-colors duration-200',
              i <= strength.score ? strength.color : 'bg-surface-3'
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {requirements.map(req => (
            <span
              key={req.text}
              className={cn('text-[11px] font-medium', req.check ? 'text-foreground/80' : 'text-muted-foreground/60')}
            >
              <Check
                className={cn('mr-1 inline h-3 w-3 align-[-1px]', req.check ? 'text-success' : 'text-muted-foreground/40')}
              />
              {req.text}
            </span>
          ))}
        </div>
        <span className={cn('shrink-0 text-xs font-medium', toneText)}>{strength.label}</span>
      </div>
    </div>
  );
}

function Divider({ label = 'or' }: { label?: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[200px] items-center gap-4 py-1" role="separator">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-7 flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </button>
  );
}

function OtpFields({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex justify-center pt-1">
      <InputOTP maxLength={6} value={value} onChange={onChange} disabled={disabled} inputMode="numeric" pattern="[0-9]*">
        <InputOTPGroup>
          {[0, 1, 2].map(i => <InputOTPSlot key={i} index={i} className={otpSlot} />)}
        </InputOTPGroup>
        <InputOTPSeparator />
        <InputOTPGroup>
          {[3, 4, 5].map(i => <InputOTPSlot key={i} index={i} className={otpSlot} />)}
        </InputOTPGroup>
      </InputOTP>
    </div>
  );
}

function FlowHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-7">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>
    </div>
  );
}

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const { isEnabled } = useAppSettings();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'login' | 'signup'>(searchParams.get('mode') === 'signup' ? 'signup' : 'login');
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; displayName?: string; avatar?: string }>({});
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [touchedFields, setTouchedFields] = useState<{ email?: boolean; password?: boolean; displayName?: boolean }>({});
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [otpCode, setOtpCode] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [selectedCountry, setSelectedCountry] = useState<Country>(countries.find(c => c.code === 'US')!);
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [isRecovery, setIsRecovery] = useState(false);

  // Detect a password-recovery redirect (Supabase appends
  // #access_token=...&type=recovery to the redirect URL).
  useEffect(() => {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (hashParams.get('type') === 'recovery') {
      setIsRecovery(true);
      setAuthMode('reset-password');
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user && !isRecovery) navigate('/');
  }, [user, authLoading, navigate, isRecovery]);

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
    if (isSignUp && !avatarFile) {
      newErrors.avatar = 'A profile photo is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrors((p) => ({ ...p, avatar: 'Please select an image file' }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((p) => ({ ...p, avatar: 'Image must be 5MB or smaller' }));
      return;
    }
    setErrors((p) => ({ ...p, avatar: undefined }));
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    if (avatarInputRef.current) avatarInputRef.current.value = '';
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
    if (!isEnabled('allow_registrations')) {
      toast({
        variant: 'destructive',
        title: 'Sign ups are closed',
        description: 'New account registration is currently disabled. Please try again later.',
      });
      return;
    }
    setLoading(true);
    const { error, user } = await signUp(email, password, displayName || undefined);
    if (error) {
      setLoading(false);
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
      return;
    }

    let avatarUploaded = true;
    if (user && avatarFile) {
      try {
        const fileExt = avatarFile.name.split('.').pop() || 'jpg';
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, avatarFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
        const { error: profileError } = await supabase
          .from('profiles')
          .update({ avatar_url: urlData.publicUrl })
          .eq('user_id', user.id);
        if (profileError) throw profileError;
      } catch (err) {
        avatarUploaded = false;
        const message = err instanceof Error ? err.message : 'Failed to upload photo.';
        toast({
          variant: 'destructive',
          title: 'Photo upload failed',
          description: `Your account was created, but we could not upload your photo. ${message} You can add one later in Settings.`,
        });
      }
    }

    setLoading(false);
    if (avatarUploaded) {
      toast({ title: 'Welcome to Twibsers!', description: 'Your account has been created successfully.' });
    }
    navigate(isEnabled('signup_onboarding_enabled') ? '/onboarding/interests' : '/');
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
      navigate(isNewUser && isEnabled('signup_onboarding_enabled') ? '/onboarding/interests' : '/');
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
      navigate(isNewUser && isEnabled('signup_onboarding_enabled') ? '/onboarding/interests' : '/');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      setErrors({ email: emailValidation.error || 'Please enter a valid email address' });
      return;
    }
    setErrors({});
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth`,
    });
    setLoading(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Failed to send reset link', description: error.message });
    } else {
      setAuthMode('forgot-password');
      toast({ title: 'Reset link sent', description: 'If an account exists for that email, a password reset link is on its way.' });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const passwordResult = passwordSchema.safeParse(resetPassword);
    if (!passwordResult.success) {
      toast({ variant: 'destructive', title: 'Invalid password', description: passwordResult.error.errors[0].message });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: resetPassword });
    setLoading(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Reset failed', description: error.message });
      return;
    }
    toast({ title: 'Password updated', description: 'You can now log in with your new password.' });
    navigate('/');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const renderOtpFlow = () => (
    <div className="page-transition">
      <BackButton label="Back to log in" onClick={() => setAuthMode('login')} />

      <FlowHeading
        title={authMode === 'otp-request' ? 'Log in with email' : 'Check your email'}
        subtitle={authMode === 'otp-request'
          ? "We'll send a 6-digit code to your email."
          : `Enter the 6-digit code we sent to ${email}.`}
      />

      {authMode === 'otp-request' ? (
        <form onSubmit={handleOtpRequest} className="space-y-4">
          <Field label="Email" htmlFor="otp-email" error={errors.email}>
            <Input
              id="otp-email"
              type="email"
              placeholder="name@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={cn(field, errors.email && 'border-destructive')}
              disabled={loading}
              aria-invalid={!!errors.email}
            />
          </Field>
          <Button type="submit" className={primaryBtn} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {loading ? 'Sending…' : 'Send code'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleOtpVerify} className="space-y-5">
          <OtpFields value={otpCode} onChange={setOtpCode} disabled={loading} />
          <Button type="submit" className={primaryBtn} disabled={loading || otpCode.length !== 6}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Verifying…' : 'Verify and log in'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Didn't receive the code?{' '}
            <button type="button" onClick={() => setAuthMode('otp-request')} className="font-semibold text-primary transition-colors hover:underline">
              Resend
            </button>
          </p>
        </form>
      )}
    </div>
  );

  const renderPhoneFlow = () => (
    <div className="page-transition">
      <BackButton label="Back to log in" onClick={() => setAuthMode('login')} />

      <FlowHeading
        title={authMode === 'phone-request' ? 'Log in with phone' : 'Check your phone'}
        subtitle={authMode === 'phone-request'
          ? "We'll send a 6-digit code via SMS."
          : `Enter the 6-digit code we sent to ${phoneNumber}.`}
      />

      {authMode === 'phone-request' ? (
        <form onSubmit={handlePhoneRequest} className="space-y-4">
          <Field label="Phone number" htmlFor="phone-number" error={errors.email}>
            <div className="flex gap-2">
              <CountryCodeSelector
                value={selectedCountry.code}
                onChange={setSelectedCountry}
                disabled={loading}
                className="h-12"
              />
              <Input
                id="phone-number"
                type="tel"
                placeholder="Enter your number"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d]/g, ''))}
                className={cn('min-w-0 flex-1', field, errors.email && 'border-destructive')}
                disabled={loading}
                aria-invalid={!!errors.email}
              />
            </div>
          </Field>
          <Button type="submit" className={primaryBtn} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
            {loading ? 'Sending…' : 'Send code'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handlePhoneVerify} className="space-y-5">
          <OtpFields value={phoneOtpCode} onChange={setPhoneOtpCode} disabled={loading} />
          <Button type="submit" className={primaryBtn} disabled={loading || phoneOtpCode.length !== 6}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Verifying…' : 'Verify and log in'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Didn't receive the code?{' '}
            <button type="button" onClick={() => setAuthMode('phone-request')} className="font-semibold text-primary transition-colors hover:underline">
              Resend
            </button>
          </p>
        </form>
      )}
    </div>
  );

  const renderForgotPasswordFlow = () => (
    <div className="page-transition">
      <BackButton label="Back to log in" onClick={() => setAuthMode('login')} />

      <FlowHeading
        title="Reset your password"
        subtitle="Enter your email and we'll send you a link to create a new password."
      />

      <form onSubmit={handleForgotPassword} className="space-y-4">
        <Field label="Email" htmlFor="reset-email" error={errors.email}>
          <Input
            id="reset-email"
            type="email"
            placeholder="name@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(field, errors.email && 'border-destructive')}
            disabled={loading}
            aria-invalid={!!errors.email}
          />
        </Field>
        <Button type="submit" className={primaryBtn} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>

      <p className="mt-5 text-center text-xs text-muted-foreground">
        Forgot your email? <a href="/auth" className="font-medium text-primary transition-colors hover:underline">Log in another way</a>
      </p>
    </div>
  );

  const renderResetPasswordFlow = () => (
    <div className="page-transition">
      <FlowHeading
        title="Set a new password"
        subtitle="Choose a strong password you haven't used before."
      />

      <form onSubmit={handleResetPassword} className="space-y-4">
        <Field label="New password" htmlFor="new-password">
          <PasswordInput
            id="new-password"
            inputRef={passwordInputRef}
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            placeholder="Create a strong password"
            show={showPassword}
            onToggle={() => setShowPassword(v => !v)}
            disabled={loading}
            autoComplete="new-password"
          />
          <PasswordStrengthMeter password={resetPassword} />
        </Field>
        <Button type="submit" className={primaryBtn} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? 'Updating…' : 'Update password'}
        </Button>
      </form>
    </div>
  );

  const renderAuthForm = () => (
    <div key={activeTab} className="page-transition">
      <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-[2.125rem]">
        {activeTab === 'login' ? 'Welcome back' : 'Create your account'}
      </h1>
      <p className="mt-2 text-[15px] text-muted-foreground">
        {activeTab === 'login' ? 'Log in to Twibsers' : 'Join Twibsers and start sharing.'}
      </p>

      {activeTab === 'login' ? (
        <>
          {/* Social sign in */}
          <div className="mt-7 space-y-2.5">
            <button type="button" className={socialBtn}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
            <button type="button" className={socialBtn}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Continue with Apple
            </button>
          </div>

          <div className="mt-5">
            <Divider />
          </div>

          {/* Email / password */}
          <form onSubmit={handleLogin} className="mt-4 space-y-4">
            <Field label="Email" htmlFor="login-email" error={errors.email && touchedFields.email ? errors.email : null}>
              <Input
                ref={emailInputRef}
                id="login-email"
                type="email"
                placeholder="name@example.com"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouchedFields(p => ({ ...p, email: true }))}
                className={cn(field, errors.email && 'border-destructive')}
                disabled={loading}
                aria-invalid={!!errors.email}
              />
            </Field>

            <Field label="Password" htmlFor="login-password" error={errors.password}>
              <PasswordInput
                id="login-password"
                inputRef={passwordInputRef}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                show={showPassword}
                onToggle={() => setShowPassword(v => !v)}
                disabled={loading}
                autoComplete="current-password"
                error={!!errors.password}
              />
            </Field>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => { setAuthMode('forgot-password'); setErrors({}); }}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                Forgot password?
              </button>
            </div>

            <Button type="submit" className={primaryBtn} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? 'Logging in…' : 'Log In'}
            </Button>
          </form>

          {/* Alternate methods */}
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => setAuthMode('otp-request')} className={secondaryBtn}>
              <Mail className="h-4 w-4 text-muted-foreground" />
              Email code
            </button>
            <button type="button" onClick={() => setAuthMode('phone-request')} className={secondaryBtn}>
              <Phone className="h-4 w-4 text-muted-foreground" />
              Phone
            </button>
          </div>

          <p className="mt-7 text-center text-sm text-muted-foreground">
            Don't have an account?{' '}
            <button type="button" onClick={() => switchTab('signup')} className="font-semibold text-primary transition-colors hover:underline">
              Sign up
            </button>
          </p>
        </>
      ) : (
        <>
          <form onSubmit={handleSignUp} className="mt-7 space-y-4">
            {/* Profile photo */}
            <div className="flex items-center gap-4 py-1">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={loading}
                title="Choose a profile photo"
                aria-label="Choose a profile photo"
                className="relative shrink-0"
              >
                <div className={cn(
                  'flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-surface-2 ring-1 transition-colors duration-150',
                  errors.avatar ? 'ring-destructive/70' : avatarPreview ? 'ring-primary/60' : 'ring-border'
                )}>
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Profile preview" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-8 w-8 text-muted-foreground/70" />
                  )}
                </div>
              </button>

              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Profile photo <span className="text-destructive">*</span>
                </span>
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={loading}
                  className="self-start text-sm font-semibold text-primary transition-colors hover:underline"
                >
                  {avatarPreview ? 'Change photo' : 'Add profile photo'}
                </button>
                {avatarPreview ? (
                  <button
                    type="button"
                    onClick={() => { setAvatarFile(null); setAvatarPreview(null); }}
                    className="self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Remove photo
                  </button>
                ) : (
                  <p className="text-xs text-muted-foreground">Your photo is required to join. Up to 5MB.</p>
                )}
                {errors.avatar && <p className="text-xs text-destructive">{errors.avatar}</p>}
              </div>

              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarSelect}
                disabled={loading}
              />
            </div>

            <Field label={<>Display name <span className="font-normal text-muted-foreground">(optional)</span></>} htmlFor="signup-name" error={errors.displayName && touchedFields.displayName ? errors.displayName : null}>
              <Input
                ref={nameInputRef}
                id="signup-name"
                type="text"
                placeholder="What should we call you?"
                autoComplete="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onBlur={() => setTouchedFields(p => ({ ...p, displayName: true }))}
                className={field}
                disabled={loading}
              />
            </Field>

            <Field label="Email" htmlFor="signup-email" error={errors.email && touchedFields.email ? errors.email : null}>
              <Input
                ref={emailInputRef}
                id="signup-email"
                type="email"
                placeholder="name@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setTouchedFields(p => ({ ...p, email: true }))}
                className={cn(field, errors.email && 'border-destructive')}
                disabled={loading}
                aria-invalid={!!errors.email}
              />
              {email && touchedFields.email && !errors.email && (
                <p className="flex items-center gap-1 pt-0.5 text-xs text-success">
                  <Check className="h-3 w-3" /> Looks good!
                </p>
              )}
            </Field>

            <Field label="Password" htmlFor="signup-password" error={errors.password && touchedFields.password ? errors.password : null}>
              <PasswordInput
                id="signup-password"
                inputRef={passwordInputRef}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                show={showPassword}
                onToggle={() => setShowPassword(v => !v)}
                disabled={loading}
                autoComplete="new-password"
                error={!!errors.password}
              />
              <PasswordStrengthMeter password={password} />
            </Field>

            <Button type="submit" className={primaryBtn} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? 'Creating account…' : 'Create account'}
            </Button>

            <button
              type="button"
              onClick={() => setAuthMode('phone-request')}
              className="flex w-full items-center justify-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Phone className="h-4 w-4" /> Sign up with phone
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <button type="button" onClick={() => switchTab('login')} className="font-semibold text-primary transition-colors hover:underline">
              Log in
            </button>
          </p>
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-dvh bg-background lg:flex">
      {/* Desktop editorial visual panel */}
      <aside className="relative hidden overflow-hidden bg-[#0d0d12] lg:block lg:w-[56%]">
        <img
          src={HERO_IMAGE}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-[center_35%] opacity-95 saturate-[0.92]"
        />
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-black/95 via-black/45 to-transparent" />

        <div className="relative z-10 flex h-full flex-col justify-between p-8 sm:p-10 xl:p-12">
          <BrandLogo className="h-9" />

          <div>
            <div className="mb-5 flex gap-1.5" aria-hidden>
              <span className="h-[3px] w-9 rounded-full bg-white/90" />
              <span className="h-[3px] w-9 rounded-full bg-white/25" />
              <span className="h-[3px] w-9 rounded-full bg-white/25" />
            </div>
            <h1 className="max-w-md text-[2rem] font-semibold leading-[1.08] tracking-tight text-white xl:text-[2.35rem]">
              Your world,<br />
              <span className="text-white/55">in one place.</span>
            </h1>
            <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-white/70">
              Share the moments, people and conversations that matter.
            </p>

            <div className="mt-7 flex items-center gap-3">
              <span className="h-px w-10 bg-primary" aria-hidden />
              <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-white/45">
                © {new Date().getFullYear()} Twibsers
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Auth column */}
      <main className="flex min-h-dvh flex-1 flex-col lg:min-h-0">
        {/* Mobile photo header */}
        <div className="relative h-36 overflow-hidden bg-black sm:h-44 lg:hidden">
          <img
            src={HERO_IMAGE}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-105 object-cover object-[center_25%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-black/30 to-black/30" />
          <div className="absolute inset-x-0 bottom-0 px-5 pb-4">
            <p className="text-[15px] font-semibold text-white">
              Your world,<span className="font-normal text-white/55"> in one place.</span>
            </p>
            <p className="mt-0.5 text-xs text-white/60">Share the moments, people and conversations that matter.</p>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-6 lg:px-10 lg:py-16">
          <div className="w-full max-w-[420px]">
            {/* Mobile brand mark */}
            <div className="mb-8 flex justify-center lg:hidden">
              <BrandLogo className="h-9" />
            </div>

            {(authMode === 'otp-request' || authMode === 'otp-verify') && renderOtpFlow()}
            {(authMode === 'phone-request' || authMode === 'phone-verify') && renderPhoneFlow()}
            {authMode === 'forgot-password' && renderForgotPasswordFlow()}
            {authMode === 'reset-password' && renderResetPasswordFlow()}
            {authMode === 'login' && renderAuthForm()}

            <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground/70 sm:text-xs">
              By continuing you agree to our{' '}
              <a href="/terms" className="font-medium text-muted-foreground underline decoration-border underline-offset-2 transition-colors hover:text-foreground">
                Terms
              </a>
              {' '}and{' '}
              <a href="/privacy" className="font-medium text-muted-foreground underline decoration-border underline-offset-2 transition-colors hover:text-foreground">
                Privacy Policy
              </a>.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}