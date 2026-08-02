import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Sparkles, Users, BookOpen, MessageCircle, Mail, KeyRound,
  ArrowLeft, Phone, Smartphone, Eye, EyeOff, Check, X, Shield,
  Heart, Zap, Globe, TrendingUp, Play, Camera, Send
} from 'lucide-react';
import { validateEmail } from '@/lib/emailValidation';
import { isValidPhoneNumber } from 'libphonenumber-js';
import CountryCodeSelector from '@/components/auth/CountryCodeSelector';
import { countries, type Country } from '@/lib/countryCodes';
import BrandLogo from '@/components/brand/BrandLogo';
import { cn } from '@/lib/utils';

const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

function getPasswordStrength(pw: string): { score: number; label: string; color: string; gradient: string } {
  if (!pw) return { score: 0, label: '', color: '', gradient: '' };
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score: 1, label: 'Weak', color: 'text-red-500', gradient: 'from-red-500 to-red-400' };
  if (score <= 2) return { score: 2, label: 'Fair', color: 'text-orange-500', gradient: 'from-orange-500 to-amber-400' };
  if (score <= 3) return { score: 3, label: 'Good', color: 'text-yellow-500', gradient: 'from-yellow-500 to-amber-400' };
  if (score <= 4) return { score: 4, label: 'Strong', color: 'text-green-500', gradient: 'from-green-500 to-emerald-400' };
  return { score: 5, label: 'Very Strong', color: 'text-emerald-500', gradient: 'from-emerald-500 to-teal-400' };
}

type AuthMode = 'login' | 'signup' | 'otp-request' | 'otp-verify' | 'phone-request' | 'phone-verify';

const floatingBubbles = [
  { size: 80, x: '10%', y: '20%', delay: 0, duration: 8, color: 'bg-white/10' },
  { size: 120, x: '70%', y: '15%', delay: 1, duration: 10, color: 'bg-white/5' },
  { size: 60, x: '85%', y: '60%', delay: 2, duration: 7, color: 'bg-white/10' },
  { size: 100, x: '20%', y: '70%', delay: 0.5, duration: 9, color: 'bg-white/5' },
  { size: 40, x: '50%', y: '40%', delay: 3, duration: 6, color: 'bg-white/10' },
  { size: 90, x: '30%', y: '85%', delay: 1.5, duration: 11, color: 'bg-white/5' },
  { size: 50, x: '75%', y: '80%', delay: 2.5, duration: 8, color: 'bg-white/10' },
];

const features = [
  { icon: Camera, title: 'Share Moments', desc: 'Capture and share your daily life', color: 'from-pink-500 to-rose-500' },
  { icon: Heart, title: 'Connect & Love', desc: 'Build meaningful relationships', color: 'from-red-500 to-orange-500' },
  { icon: MessageCircle, title: 'Real-Time Chat', desc: 'Messages, calls, and stories', color: 'from-blue-500 to-indigo-500' },
  { icon: Play, title: 'Watch & Create', desc: 'Short videos and live streams', color: 'from-purple-500 to-violet-500' },
];

const stats = [
  { value: '2M+', label: 'Active Users', icon: Users },
  { value: '50M+', label: 'Posts Shared', icon: Send },
  { value: '180+', label: 'Countries', icon: Globe },
];

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
      const { count } = await (supabase as any).from('user_interests').select('*', { count: 'exact', head: true }).eq('user_id', (await supabase.auth.getUser()).data.user?.id);
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
      const { count } = await (supabase as any).from('user_interests').select('*', { count: 'exact', head: true }).eq('user_id', (await supabase.auth.getUser()).data.user?.id);
      const isNewUser = (count || 0) === 0;
      toast({ title: 'Welcome!', description: 'You have successfully signed in.' });
      navigate(isNewUser ? '/onboarding/interests' : '/');
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5 }}>
          <Loader2 className="h-10 w-10 animate-spin text-white" />
        </motion.div>
      </div>
    );
  }

  const formVariants = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.35, ease: 'easeOut' } },
    exit: { opacity: 0, x: -20, transition: { duration: 0.2 } },
  };

  const socialButtonClass = "h-12 rounded-xl font-medium text-sm flex items-center justify-center gap-2.5 transition-all duration-200 border hover:shadow-md active:scale-[0.98]";

  const renderOtpFlow = () => (
    <motion.div key="otp" variants={formVariants} initial="hidden" animate="visible" exit="exit" className="w-full max-w-md mx-auto">
      <button onClick={() => setAuthMode('login')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8 group">
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to login
      </button>
      <div className="text-center mb-8">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
          className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/25">
          {authMode === 'otp-request' ? <Mail className="h-6 w-6 text-white" /> : <KeyRound className="h-6 w-6 text-white" />}
        </motion.div>
        <h1 className="text-2xl font-bold mb-2">
          {authMode === 'otp-request' ? 'Sign in with Email' : 'Enter Code'}
        </h1>
        <p className="text-muted-foreground text-sm">
          {authMode === 'otp-request' ? "We'll send a 6-digit code to your email" : `Enter the code sent to ${email}`}
        </p>
      </div>
      {authMode === 'otp-request' ? (
        <form onSubmit={handleOtpRequest} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Email address</Label>
            <Input type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
              className="h-12 bg-muted/30 border-border/40 rounded-xl focus:bg-background focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all" disabled={loading} />
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
          </div>
          <Button type="submit" className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-medium shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 transition-all" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Mail className="mr-2 h-5 w-5" />}
            {loading ? 'Sending...' : 'Send Code'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleOtpVerify} className="space-y-6">
          <div className="flex justify-center">
            <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode} disabled={loading}>
              <InputOTPGroup>
                {[0, 1, 2].map(i => <InputOTPSlot key={i} index={i} className="w-12 h-14 text-xl rounded-xl border-border/40 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20" />)}
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                {[3, 4, 5].map(i => <InputOTPSlot key={i} index={i} className="w-12 h-14 text-xl rounded-xl border-border/40 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20" />)}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button type="submit" className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-medium shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 transition-all" disabled={loading || otpCode.length !== 6}>
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
            {loading ? 'Verifying...' : 'Verify & Sign In'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Didn't receive the code?{' '}
            <button type="button" onClick={() => setAuthMode('otp-request')} className="text-violet-600 hover:text-violet-700 font-semibold transition-colors">Resend</button>
          </p>
        </form>
      )}
    </motion.div>
  );

  const renderPhoneFlow = () => (
    <motion.div key="phone" variants={formVariants} initial="hidden" animate="visible" exit="exit" className="w-full max-w-md mx-auto">
      <button onClick={() => setAuthMode('login')} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8 group">
        <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
        Back to login
      </button>
      <div className="text-center mb-8">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
          className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/25">
          {authMode === 'phone-request' ? <Phone className="h-6 w-6 text-white" /> : <Smartphone className="h-6 w-6 text-white" />}
        </motion.div>
        <h1 className="text-2xl font-bold mb-2">
          {authMode === 'phone-request' ? 'Sign in with Phone' : 'Enter Code'}
        </h1>
        <p className="text-muted-foreground text-sm">
          {authMode === 'phone-request' ? "We'll send a 6-digit code via SMS" : `Enter the code sent to ${phoneNumber}`}
        </p>
      </div>
      {authMode === 'phone-request' ? (
        <form onSubmit={handlePhoneRequest} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Phone Number</Label>
            <div className="flex gap-2">
              <CountryCodeSelector value={selectedCountry.code} onChange={setSelectedCountry} disabled={loading} />
              <Input type="tel" placeholder="Enter your number" value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d]/g, ''))}
                className="flex-1 h-12 bg-muted/30 border-border/40 rounded-xl focus:bg-background focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all" disabled={loading} />
            </div>
            <p className="text-xs text-muted-foreground">Select your country and enter your phone number</p>
            {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
          </div>
          <Button type="submit" className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-medium shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 transition-all" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Phone className="mr-2 h-5 w-5" />}
            {loading ? 'Sending...' : 'Send Code'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handlePhoneVerify} className="space-y-6">
          <div className="flex justify-center">
            <InputOTP maxLength={6} value={phoneOtpCode} onChange={setPhoneOtpCode} disabled={loading}>
              <InputOTPGroup>
                {[0, 1, 2].map(i => <InputOTPSlot key={i} index={i} className="w-12 h-14 text-xl rounded-xl border-border/40 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20" />)}
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                {[3, 4, 5].map(i => <InputOTPSlot key={i} index={i} className="w-12 h-14 text-xl rounded-xl border-border/40 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20" />)}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <Button type="submit" className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-medium shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 transition-all" disabled={loading || phoneOtpCode.length !== 6}>
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
            {loading ? 'Verifying...' : 'Verify & Sign In'}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Didn't receive the code?{' '}
            <button type="button" onClick={() => setAuthMode('phone-request')} className="text-violet-600 hover:text-violet-700 font-semibold transition-colors">Resend</button>
          </p>
        </form>
      )}
    </motion.div>
  );

  const renderAuthForm = () => (
    <div className="w-full max-w-md mx-auto">
      {/* Mobile logo */}
      <motion.div initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="lg:hidden flex items-center mb-8">
        <BrandLogo className="h-10" />
      </motion.div>

      {/* Header */}
      <motion.div initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.05 }} className="text-center mb-8">
        <h1 className="text-3xl font-extrabold mb-2 tracking-tight">
          {activeTab === 'login' ? 'Welcome back' : 'Join the community'}
        </h1>
        <p className="text-muted-foreground text-sm">
          {activeTab === 'login'
            ? 'Sign in to continue your journey'
            : 'Create your account and start connecting'}
        </p>
      </motion.div>

      {/* Tab Switcher */}
      <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }} className="flex bg-muted/40 p-1 rounded-2xl mb-6">
        <button onClick={() => switchTab('login')}
          className={cn("flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-300",
            activeTab === 'login' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          Log In
        </button>
        <button onClick={() => switchTab('signup')}
          className={cn("flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all duration-300",
            activeTab === 'signup' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          Sign Up
        </button>
      </motion.div>

      {/* Social Auth */}
      <motion.div initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }} className="grid grid-cols-2 gap-3 mb-6">
        <button className={cn(socialButtonClass, "bg-background border-border/40 hover:bg-muted/50 text-foreground")}>
          <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          Google
        </button>
        <button className={cn(socialButtonClass, "bg-background border-border/40 hover:bg-muted/50 text-foreground")}>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
          Apple
        </button>
      </motion.div>

      {/* Divider */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="relative mb-6">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border/40" /></div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-3 text-muted-foreground tracking-wider">or continue with email</span>
        </div>
      </motion.div>

      <AnimatePresence mode="wait">
        {activeTab === 'login' && (
          <motion.form key="login" variants={formVariants} initial="hidden" animate="visible" exit="exit" onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input ref={emailInputRef} type="email" placeholder="name@example.com" autoFocus value={email}
                  onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouchedFields(p => ({ ...p, email: true }))}
                  className={cn("h-12 pl-10 bg-muted/30 border-border/40 rounded-xl focus:bg-background focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all", errors.email && 'border-destructive')}
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
                  className={cn("h-12 pl-10 pr-12 bg-muted/30 border-border/40 rounded-xl focus:bg-background focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all", errors.password && 'border-destructive')}
                  disabled={loading} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>

            <Button type="submit"
              className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 transition-all duration-200 active:scale-[0.98]"
              disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>

            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setAuthMode('otp-request')}
                className="h-11 rounded-xl border border-border/40 text-sm font-medium flex items-center justify-center gap-2 hover:bg-muted/50 transition-all">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Email Code
              </button>
              <button type="button" onClick={() => setAuthMode('phone-request')}
                className="h-11 rounded-xl border border-border/40 text-sm font-medium flex items-center justify-center gap-2 hover:bg-muted/50 transition-all">
                <Phone className="h-4 w-4 text-muted-foreground" />
                Phone
              </button>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-2">
              Don't have an account?{' '}
              <button type="button" onClick={() => switchTab('signup')} className="text-violet-600 hover:text-violet-700 font-semibold transition-colors">Sign up free</button>
            </p>
          </motion.form>
        )}

        {activeTab === 'signup' && (
          <motion.form key="signup" variants={formVariants} initial="hidden" animate="visible" exit="exit" onSubmit={handleSignUp} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Display Name <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <div className="relative">
                <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input ref={nameInputRef} type="text" placeholder="What should we call you?" value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)} onBlur={() => setTouchedFields(p => ({ ...p, displayName: true }))}
                  className="h-12 pl-10 bg-muted/30 border-border/40 rounded-xl focus:bg-background focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all"
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
                  className={cn("h-12 pl-10 bg-muted/30 border-border/40 rounded-xl focus:bg-background focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all", errors.email && 'border-destructive')}
                  disabled={loading} />
              </div>
              {errors.email && touchedFields.email ? (
                <p className="text-xs text-destructive flex items-center gap-1"><X className="h-3 w-3" /> {errors.email}</p>
              ) : email && touchedFields.email && !errors.email ? (
                <p className="text-xs text-emerald-600 flex items-center gap-1"><Check className="h-3 w-3" /> Looks good!</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Password</Label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input ref={passwordInputRef} type={showPassword ? 'text' : 'password'} placeholder="Create a strong password" value={password}
                  onChange={(e) => setPassword(e.target.value)} onBlur={() => setTouchedFields(p => ({ ...p, password: true }))}
                  className={cn("h-12 pl-10 pr-12 bg-muted/30 border-border/40 rounded-xl focus:bg-background focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all", errors.password && 'border-destructive')}
                  disabled={loading} />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {password && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2 pt-1">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1 flex-1">
                      {[1, 2, 3, 4, 5].map(i => (
                        <motion.div key={i} initial={{ scaleX: 0 }} animate={{ scaleX: 1 }}
                          transition={{ delay: i * 0.05 }}
                          className={cn("h-1.5 flex-1 rounded-full transition-colors origin-left",
                            getPasswordStrength(password).score >= i
                              ? `bg-gradient-to-r ${getPasswordStrength(password).gradient}`
                              : 'bg-muted')} />
                      ))}
                    </div>
                    <span className={cn("text-xs font-medium min-w-[70px] text-right", getPasswordStrength(password).color)}>
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
                      <motion.span key={req.text} initial={{ scale: 0.8 }} animate={{ scale: 1 }}
                        className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium transition-all",
                          req.check ? 'border-emerald-500/40 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30' : 'border-border/50 text-muted-foreground')}>
                        {req.check ? <Check className="h-2.5 w-2.5 inline mr-0.5" /> : null}{req.text}
                      </motion.span>
                    ))}
                  </div>
                </motion.div>
              )}

              {errors.password && touchedFields.password && (
                <p className="text-xs text-destructive flex items-center gap-1"><X className="h-3 w-3" /> {errors.password}</p>
              )}
            </div>

            <Button type="submit"
              className="w-full h-12 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-violet-500/25 hover:shadow-xl hover:shadow-violet-500/30 transition-all duration-200 active:scale-[0.98]"
              disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Sparkles className="mr-2 h-5 w-5" />}
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>

            <button type="button" onClick={() => setAuthMode('phone-request')}
              className="w-full h-11 rounded-xl border border-border/40 text-sm font-medium flex items-center justify-center gap-2 hover:bg-muted/50 transition-all">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Sign up with Phone
            </button>

            <div className="flex items-start gap-2 p-3 rounded-xl bg-muted/20 border border-border/20">
              <Shield className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                By signing up, you agree to our{' '}
                <a href="/terms" className="text-violet-600 hover:text-violet-700 font-medium">Terms</a>
                {' '}and{' '}
                <a href="/privacy" className="text-violet-600 hover:text-violet-700 font-medium">Privacy Policy</a>.
              </p>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-1">
              Already have an account?{' '}
              <button type="button" onClick={() => switchTab('login')} className="text-violet-600 hover:text-violet-700 font-semibold transition-colors">Sign in</button>
            </p>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div className="min-h-screen flex">
      {/* Left side - Animated Branding */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700">
        {/* Animated gradient overlay */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/80 via-purple-500/60 to-indigo-600/80" />
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
            className="absolute -top-1/4 -left-1/4 w-[150%] h-[150%] opacity-30"
            style={{ background: 'conic-gradient(from 0deg, transparent, rgba(255,255,255,0.1), transparent, rgba(255,255,255,0.05), transparent)' }} />
        </div>

        {/* Floating bubbles */}
        {floatingBubbles.map((b, i) => (
          <motion.div key={i} className={`absolute rounded-full ${b.color} backdrop-blur-sm`}
            style={{ width: b.size, height: b.size, left: b.x, top: b.y }}
            animate={{ y: [-20, 20, -20], x: [-10, 10, -10], scale: [1, 1.1, 1] }}
            transition={{ duration: b.duration, delay: b.delay, repeat: Infinity, ease: 'easeInOut' }} />
        ))}

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between w-full p-12 xl:p-16">
          {/* Logo */}
          <motion.div initial={{ x: -30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.6 }}>
            <div className="flex items-center">
              <BrandLogo className="h-12" />
            </div>
          </motion.div>

          {/* Main headline + features */}
          <div className="space-y-10">
            <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.7, delay: 0.2 }}>
              <h2 className="text-4xl xl:text-5xl font-extrabold text-white leading-tight mb-4">
                Your world.
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-300 via-white to-violet-300">
                  Your story.
                </span>
              </h2>
              <p className="text-white/70 text-lg max-w-md leading-relaxed">
                Share moments, connect with friends, and discover what's happening around you.
              </p>
            </motion.div>

            {/* Feature cards */}
            <div className="grid grid-cols-2 gap-3">
              {features.map((f, i) => (
                <motion.div key={i} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 + i * 0.1 }}
                  className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-white/10 hover:bg-white/15 transition-colors group">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-3 shadow-lg group-hover:scale-110 transition-transform`}>
                    <f.icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-white font-semibold text-sm mb-0.5">{f.title}</h3>
                  <p className="text-white/60 text-xs leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6, delay: 0.6 }}
            className="flex items-center gap-8">
            {stats.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <s.icon className="h-4 w-4 text-white/40" />
                <div>
                  <p className="text-white font-bold text-lg leading-none">{s.value}</p>
                  <p className="text-white/50 text-xs mt-0.5">{s.label}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Right side - Auth Form */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 md:p-10 bg-card relative">
        {/* Decorative gradient blob */}
        <div className="absolute top-0 right-0 w-72 h-72 bg-violet-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-indigo-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />

        <div className="w-full max-w-md relative z-10">
          {(authMode === 'otp-request' || authMode === 'otp-verify') && renderOtpFlow()}
          {(authMode === 'phone-request' || authMode === 'phone-verify') && renderPhoneFlow()}
          {authMode === 'login' && renderAuthForm()}
        </div>
      </div>
    </div>
  );
}
