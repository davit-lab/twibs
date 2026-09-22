import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useLoginSessions } from '@/hooks/useLoginSessions';
import { useCallBlocks } from '@/hooks/useCallBlocks';
import { useUserInterests, useInterestCategories, useInterestActions } from '@/hooks/useInterests';
import { useAccountChangeUsage, useEmailVerification, maskEmail } from '@/hooks/useAccountSecurity';
import { useAdminActions } from '@/hooks/useAdminActions';
import InterestCard from '@/components/onboarding/InterestCard';
import VerifyCodeDialog from '@/components/settings/VerifyCodeDialog';
import OtpInput from '@/components/settings/OtpInput';
import SocialCleanupSection from '@/components/settings/SocialCleanup';
import { supabase } from '@/integrations/supabase/client';
import MainLayout from '@/components/layout/MainLayout';
import BrandLogo from '@/components/brand/BrandLogo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Camera, User, Bell, Lock, Shield, Palette, Eye,
  Globe, Moon, Smartphone, Laptop, MapPin,
  LogOut, Trash2, Key, AlertTriangle, Check, Mail, Upload,
  UserX, ChevronRight, PlayCircle,
  MessageSquare, Accessibility, BadgeCheck, Heart,
  Sparkles, ShieldCheck, KeyRound, Megaphone, Target,
  Info, HelpCircle, LifeBuoy, FileText, CalendarDays, Database,
  Type, SlidersHorizontal, BellOff, ExternalLink, CheckCircle2, MoonStar, Ban, BookMarked,
  RotateCcw, Ghost, HardDrive, PhoneOff, VolumeX, RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { getAllLanguages } from '@/lib/languageDetection';
import { validateEmail } from '@/lib/emailValidation';
import { normalizeHex, colorToHslTriple, hexToHsl } from '@/hooks/useUserPreferences';
import ProfessionalAccountsSection from '@/components/ads/ProfessionalAccountsSection';

const LANGUAGES = getAllLanguages();

const APP_VERSION = '1.0.0';
const SUPPORT_EMAIL = 'support@twibsers.com';

const CONTENT_FILTERS = [
  { value: 'strict', label: 'Strict', description: 'Hide all potentially sensitive content' },
  { value: 'standard', label: 'Standard', description: 'Show warnings before sensitive content' },
  { value: 'none', label: 'None', description: 'Show all content without warnings' },
];

const ACCENT_PRESETS = [
  { value: '#7c3aed', label: 'Violet' },
  { value: '#6d28d9', label: 'Purple' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#22d3ee', label: 'Cyan' },
  { value: '#14b8a6', label: 'Teal' },
  { value: '#22c55e', label: 'Green' },
  { value: '#a3e635', label: 'Lime' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#f97316', label: 'Orange' },
  { value: '#ef4444', label: 'Red' },
  { value: '#e11d48', label: 'Rose' },
  { value: '#f472b6', label: 'Pink' },
];

const LEGACY_ACCENT_HEX: Record<string, string> = {
  purple: '#7c3aed',
  blue: '#3b82f6',
  green: '#22c55e',
  orange: '#f97316',
  pink: '#f472b6',
  red: '#ef4444',
};

function resolveAccentHex(stored?: string | null): string {
  if (!stored) return '#7c3aed';
  if (ACCENT_PRESETS.some((p) => p.value === stored)) return stored;
  if (LEGACY_ACCENT_HEX[stored]) return LEGACY_ACCENT_HEX[stored];
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(stored)) return normalizeHex(stored) || '#7c3aed';
  return '#7c3aed';
}

const BUBBLE_COLORS = [
  { value: 'purple', color: 'hsl(262 83% 62%)', label: 'Purple' },
  { value: 'blue', color: 'hsl(220 70% 60%)', label: 'Blue' },
  { value: 'green', color: 'hsl(160 70% 45%)', label: 'Green' },
  { value: 'teal', color: 'hsl(185 75% 45%)', label: 'Teal' },
  { value: 'orange', color: 'hsl(30 90% 55%)', label: 'Orange' },
  { value: 'pink', color: 'hsl(330 80% 60%)', label: 'Pink' },
  { value: 'red', color: 'hsl(0 75% 55%)', label: 'Red' },
  { value: 'indigo', color: 'hsl(245 60% 62%)', label: 'Indigo' },
];

const FAQ_ITEMS = [
  {
    q: 'Changing my username or display name requires verification?',
    a: 'Yes — to keep your account secure, changing your name or username is confirmed with a one-time code sent to your email. There is also a monthly limit so those fields can\u2019t be changed endlessly.',
  },
  {
    q: 'How do I change my password?',
    a: `Open Security → Change Password. Enter your current password, pick a new one, then confirm with a one-time code sent to ${SUPPORT_EMAIL.replace('support@', 'your account email ')}.`,
  },
  {
    q: 'What happens when I delete my account?',
    a: 'Your profile and login are removed immediately. Your posts, reels and messages may be retained for up to 7 days so our support team can send you a copy of your data before everything is permanently purged. This action cannot be undone.',
  },
  {
    q: 'Where can I report a problem?',
    a: `For anything at all — bugs, reports, or a copy of your data — email us at ${SUPPORT_EMAIL}. We usually respond within a couple of days.`,
  },
];

type SettingsSection =
  | 'account'
  | 'interests'
  | 'appearance'
  | 'content'
  | 'notifications'
  | 'privacy'
  | 'accessibility'
  | 'security'
  | 'professional'
  | 'cleanup'
  | 'about'
  | 'help';

const NAV_GROUPS: { label: string; items: { id: SettingsSection; label: string; icon: React.ElementType }[] }[] = [
  {
    label: 'Profile',
    items: [
      { id: 'account', label: 'Account', icon: User },
      { id: 'interests', label: 'Interests', icon: Target },
      { id: 'professional', label: 'Professional', icon: Megaphone },
    ],
  },
  {
    label: 'Experience',
    items: [
      { id: 'appearance', label: 'Appearance', icon: Palette },
      { id: 'content', label: 'Content & Feed', icon: Eye },
      { id: 'notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: 'Safety',
    items: [
      { id: 'privacy', label: 'Privacy', icon: Lock },
      { id: 'accessibility', label: 'Accessibility', icon: Accessibility },
      { id: 'security', label: 'Security', icon: Shield },
      { id: 'cleanup', label: 'Social Cleanup', icon: Sparkles },
    ],
  },
  {
    label: 'More',
    items: [
      { id: 'about', label: 'About & Data', icon: FileText },
      { id: 'help', label: 'Help & Support', icon: HelpCircle },
    ],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
const VALID_SECTIONS = new Set<string>(NAV_ITEMS.map((item) => item.id));

export default function Settings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, profile, loading: authLoading, updateProfile, signOut } = useAuth();
  const { deleteOwnAccount } = useAdminActions();
  const { preferences, loading: prefsLoading, saving: prefsSaving, updatePreferences } = useUserPreferences();
  const { sessions, loading: sessionsLoading, revokeSession, revokeAllOtherSessions } = useLoginSessions();
  const { blockedUsers, loading: blocksLoading, unblockUser } = useCallBlocks();
  const { toast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [activeSection, setActiveSection] = useState<SettingsSection>('account');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [nameVerifyOpen, setNameVerifyOpen] = useState(false);
  const [nameVerified, setNameVerified] = useState(false);
  const [passwordStep, setPasswordStep] = useState<'form' | 'code'>('form');
  const [passwordDigits, setPasswordDigits] = useState<string[]>(Array(6).fill(''));
  const passwordVerification = useEmailVerification(user?.email || '');
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailStep, setEmailStep] = useState<'form' | 'code'>('form');
  const [newEmail, setNewEmail] = useState('');
  const [emailDigits, setEmailDigits] = useState<string[]>(Array(6).fill(''));
  const [emailLoading, setEmailLoading] = useState(false);
  const emailVerification = useEmailVerification(user?.email || '');

  const { data: changeUsage } = useAccountChangeUsage();

  const getRemaining = (type: 'username' | 'display_name') => {
    const row = changeUsage?.find((u) => u.change_type === type);
    return row?.remaining ?? -1;
  };

  const getUsedLabel = (type: 'username' | 'display_name') => {
    const row = changeUsage?.find((u) => u.change_type === type);
    if (!row) return '';
    return `${row.used} of ${row.change_limit} used this month`;
  };

  const [formData, setFormData] = useState({
    display_name: '',
    username: '',
    bio: '',
    location: '',
    website: '',
    privacy: 'public' as 'public' | 'private',
    email_notifications: true,
    push_notifications: true,
  });

  useEffect(() => {
    const section = searchParams.get('section');
    if (section && VALID_SECTIONS.has(section)) setActiveSection(section as SettingsSection);
  }, [searchParams]);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (profile) {
      setFormData({
        display_name: profile.display_name || '',
        username: profile.username || '',
        bio: profile.bio || '',
        location: profile.location || '',
        website: profile.website || '',
        privacy: profile.privacy,
        email_notifications: profile.email_notifications,
        push_notifications: profile.push_notifications,
      });
    }
  }, [profile]);

  const usernameChanged = !!profile && formData.username !== profile.username;
  const displayNameChanged = !!profile && formData.display_name !== profile.display_name;
  const nameChanged = usernameChanged || displayNameChanged;

  const performSave = async () => {
    const { error } = await updateProfile({
      display_name: formData.display_name,
      username: formData.username,
      bio: formData.bio,
      location: formData.location,
      website: formData.website,
      privacy: formData.privacy,
      email_notifications: formData.email_notifications,
      push_notifications: formData.push_notifications,
    });

    setSaving(false);

    if (error) {
      toast({ variant: 'destructive', title: 'Error saving settings', description: error.message });
    } else {
      toast({ title: 'Settings saved', description: 'Your profile has been updated successfully.' });
      setNameVerified(false);
      if (formData.username !== profile?.username) navigate(`/profile/${formData.username}`);
    }
  };

  const handleSave = async () => {
    if (formData.username !== profile?.username) {
      const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
      if (!usernameRegex.test(formData.username)) {
        setSaving(false);
        toast({ variant: 'destructive', title: 'Invalid username', description: 'Username must be 3-30 characters. Letters, numbers, underscores only.' });
        return;
      }
      const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', formData.username)
        .neq('user_id', user?.id)
        .maybeSingle();
      if (existingUser) {
        setSaving(false);
        toast({ variant: 'destructive', title: 'Username taken', description: 'This username is already in use.' });
        return;
      }
    }

    if (!nameVerified && nameChanged) {
      if (usernameChanged && getRemaining('username') <= 0) {
        toast({ variant: 'destructive', title: 'Monthly limit reached', description: 'You can only change your username once per month. Try again next month.' });
        return;
      }
      if (displayNameChanged && getRemaining('display_name') <= 0) {
        toast({ variant: 'destructive', title: 'Monthly limit reached', description: 'You can only change your display name twice per month. Try again next month.' });
        return;
      }
      setNameVerifyOpen(true);
      return;
    }

    setSaving(true);
    await performSave();
  };

  const onNameVerified = async () => {
    setNameVerified(true);
    setSaving(true);
    await performSave();
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Invalid file type', description: 'Please select an image file.' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'File too large', description: 'Maximum file size is 5MB.' });
      return;
    }
    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      await updateProfile({ avatar_url: urlData.publicUrl });
      toast({ title: 'Photo updated', description: 'Your profile picture has been changed.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Upload failed', description: err.message || 'Failed to upload photo.' });
    } finally {
      setUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const openPasswordDialog = () => {
    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPasswordDigits(Array(6).fill(''));
    setPasswordStep('form');
    passwordVerification.reset();
    setPasswordDialogOpen(true);
  };

  const handlePasswordContinue = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ variant: 'destructive', title: 'Passwords do not match', description: 'Please make sure both passwords are the same.' });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast({ variant: 'destructive', title: 'Password too short', description: 'Password must be at least 6 characters.' });
      return;
    }
    if (!passwordForm.currentPassword) {
      toast({ variant: 'destructive', title: 'Current password required', description: 'Enter your current password to continue.' });
      return;
    }

    setPasswordLoading(true);
    try {
      await passwordVerification.sendCode();
      setPasswordStep('code');
    } catch {
      /* error surfaced by verification state */
    } finally {
      setPasswordLoading(false);
    }
  };

  const handlePasswordVerify = async () => {
    const code = passwordDigits.join('');
    if (code.length !== 6 || !passwordForm.currentPassword) return;

    setPasswordLoading(true);
    try {
      await passwordVerification.verify(code);

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: passwordForm.currentPassword,
      });
      if (signInError) throw signInError;

      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordForm.newPassword,
      });
      if (updateError) throw updateError;

      toast({ title: 'Password changed', description: 'Your password has been updated.' });
      setPasswordDialogOpen(false);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordDigits(Array(6).fill(''));
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to change password',
        description: err?.message?.includes('Monthly limit')
          ? err.message
          : err?.message || 'Something went wrong. Please try again.',
      });
    } finally {
      setPasswordLoading(false);
    }
  };

  const openEmailDialog = () => {
    setNewEmail('');
    setEmailDigits(Array(6).fill(''));
    setEmailStep('form');
    emailVerification.reset();
    setEmailDialogOpen(true);
  };

  const handleEmailContinue = async () => {
    const emailValidation = validateEmail(newEmail);
    if (!emailValidation.valid) {
      toast({ variant: 'destructive', title: 'Invalid email', description: emailValidation.error || 'Please enter a valid email address.' });
      return;
    }
    if (newEmail.toLowerCase() === (user?.email || '').toLowerCase()) {
      toast({ variant: 'destructive', title: 'Same email', description: 'That is already your current email address.' });
      return;
    }

    setEmailLoading(true);
    try {
      await emailVerification.sendCode();
      setEmailStep('code');
    } catch {
      /* error surfaced by verification state */
    } finally {
      setEmailLoading(false);
    }
  };

  const handleEmailVerify = async () => {
    const code = emailDigits.join('');
    if (code.length !== 6) return;

    setEmailLoading(true);
    try {
      await emailVerification.verify(code);

      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) throw error;

      toast({
        title: 'Email change requested',
        description: `A confirmation email has been sent to ${newEmail}. Follow the link there to finish the change.`,
      });
      setEmailDialogOpen(false);
      setNewEmail('');
      setEmailDigits(Array(6).fill(''));
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Failed to change email',
        description: err?.message || 'Something went wrong. Please try again.',
      });
    } finally {
      setEmailLoading(false);
    }
  };

  const getInitials = (name: string) => name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

  const getDeviceIcon = (type: string | null) => {
    switch (type?.toLowerCase()) {
      case 'mobile': case 'tablet': return Smartphone;
      default: return Laptop;
    }
  };

  if (authLoading || prefsLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-4 py-8 pb-28 lg:pb-10">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Settings</p>
              <h1 className="mt-1.5 text-2xl sm:text-3xl font-bold tracking-tight">Make Twibsers yours</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Your profile, appearance, privacy and security — all in one place.
              </p>
            </div>
            {user && profile && (
              <Link
                to={`/profile/${profile.username}`}
                className="group flex shrink-0 items-center gap-3 rounded-2xl border border-border/70 bg-card p-2.5 pr-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all duration-200 hover:border-primary/40 hover:bg-primary/[0.03]"
              >
                <Avatar className="h-10 w-10 ring-2 ring-primary/20 transition-shadow group-hover:ring-primary/40">
                  <AvatarImage src={profile.avatar_url || undefined} />
                  <AvatarFallback className="bg-muted text-sm font-semibold text-muted-foreground">
                    {getInitials(profile.display_name || 'U')}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 text-left">
                  <p className="flex items-center gap-1 text-sm font-semibold leading-tight">
                    <span className="truncate max-w-[140px]">{profile.display_name || 'You'}</span>
                    {profile.is_verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </p>
                  <p className="text-xs text-muted-foreground">@{profile.username || 'username'}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-7">
          {/* Sidebar Navigation */}
          <nav className="lg:w-60 lg:flex-shrink-0">
            <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0">
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="shrink-0 lg:mb-2 lg:w-full">
                  <p className="hidden lg:block mb-1.5 px-3 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/60">
                    {group.label}
                  </p>
                  <div className="flex lg:flex-col gap-1">
                    {group.items.map(({ id, label, icon: Icon }) => {
                      const active = activeSection === id;
                      return (
                        <button
                          key={id}
                          onClick={() => setSearchParams({ section: id })}
                          className={cn(
                            "group flex items-center gap-2.5 rounded-xl px-2.5 py-[7px] text-sm font-medium whitespace-nowrap transition-all duration-200",
                            active
                              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/70"
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-[17px] w-[17px] shrink-0 transition-transform duration-200",
                              active ? "scale-110" : "group-hover:scale-105"
                            )}
                            strokeWidth={active ? 2.4 : 1.8}
                          />
                          <span>{label}</span>
                          {active && <ChevronRight className="ml-auto hidden lg:block h-4 w-4" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          {/* Content Area */}
          <div key={activeSection} className="min-w-0 flex-1 animate-fade-in">
            {activeSection === 'account' && (
              <AccountSection
                profile={profile}
                formData={formData}
                setFormData={setFormData}
                user={user}
                saving={saving}
                uploadingAvatar={uploadingAvatar}
                avatarInputRef={avatarInputRef}
                onUploadAvatar={handleAvatarUpload}
                onSave={handleSave}
                onChangePassword={openPasswordDialog}
                onChangeEmail={openEmailDialog}
                usernameUsageLabel={getUsedLabel('username')}
                usernameRemaining={getRemaining('username')}
                nameUsageLabel={getUsedLabel('display_name')}
                nameRemaining={getRemaining('display_name')}
              />
            )}

            {activeSection === 'interests' && <InterestsSection />}

            {activeSection === 'appearance' && (
              <AppearanceSection
                preferences={preferences}
                updatePreferences={updatePreferences}
              />
            )}

            {activeSection === 'content' && (
              <ContentSection
                preferences={preferences}
                updatePreferences={updatePreferences}
              />
            )}

            {activeSection === 'notifications' && (
              <NotificationsSection
                formData={formData}
                setFormData={setFormData}
                preferences={preferences}
                updatePreferences={updatePreferences}
                saving={saving}
                onSave={handleSave}
              />
            )}

            {activeSection === 'privacy' && (
              <PrivacySection
                formData={formData}
                setFormData={setFormData}
                blockedUsers={blockedUsers}
                blocksLoading={blocksLoading}
                unblockUser={unblockUser}
                saving={saving}
                onSave={handleSave}
                preferences={preferences}
                updatePreferences={updatePreferences}
              />
            )}

            {activeSection === 'accessibility' && (
              <AccessibilitySection
                preferences={preferences}
                updatePreferences={updatePreferences}
              />
            )}

            {activeSection === 'security' && (
              <SecuritySection
                user={user}
                sessions={sessions}
                sessionsLoading={sessionsLoading}
                preferences={preferences}
                updatePreferences={updatePreferences}
                revokeSession={revokeSession}
                revokeAllOtherSessions={revokeAllOtherSessions}
                onChangePassword={() => setPasswordDialogOpen(true)}
                onDeleteAccount={() => setDeleteConfirmOpen(true)}
                getDeviceIcon={getDeviceIcon}
              />
            )}

            {activeSection === 'professional' && <ProfessionalAccountsSection />}

            {activeSection === 'cleanup' && <SocialCleanupSection />}

            {activeSection === 'about' && <AboutSection profile={profile} />}

            {activeSection === 'help' && <HelpSection />}
          </div>
        </div>
      </div>

      {/* Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={(open) => { if (!open) passwordVerification.reset(); setPasswordDialogOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Change Password
            </DialogTitle>
            <DialogDescription>
              {passwordStep === 'form'
                ? 'Enter your current password and choose a new one.'
                : `We sent a one-time code to ${maskEmail(user?.email || '')}.`}
            </DialogDescription>
          </DialogHeader>

          {passwordStep === 'form' ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current Password</Label>
                <Input
                  id="current-password"
                  type="password"
                  placeholder="Enter your current password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New Password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Min 6 characters"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Confirm new password"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <KeyRound className="h-4 w-4 flex-shrink-0" />
                <span>
                  You can change your password as often as you like. We'll send a one-time code to{' '}
                  <strong className="text-foreground">{maskEmail(user?.email || '')}</strong> to confirm the change.
                </span>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>Cancel</Button>
                <Button onClick={handlePasswordContinue} disabled={passwordLoading}>
                  {passwordLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Continue
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <OtpInput value={passwordDigits} onChange={setPasswordDigits} autoFocus />

              {passwordVerification.error && (
                <p className="text-sm text-destructive font-medium text-center">
                  {passwordVerification.error}
                </p>
              )}

              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setPasswordStep('form')}
                  disabled={passwordLoading}
                >
                  Back
                </Button>
                <Button
                  onClick={handlePasswordVerify}
                  disabled={passwordDigits.join('').length !== 6 || passwordLoading}
                >
                  {passwordLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Verify & Change Password
                </Button>
              </DialogFooter>

              <div className="text-center">
                {passwordVerification.resendIn > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Resend code in {passwordVerification.resendIn}s
                  </p>
                ) : (
                  <button
                    onClick={handlePasswordContinue}
                    disabled={passwordLoading}
                    className="text-xs font-bold text-primary hover:underline disabled:opacity-50"
                  >
                    Resend code
                  </button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Change Email Dialog */}
      <Dialog
        open={emailDialogOpen}
        onOpenChange={(open) => { if (!open) emailVerification.reset(); setEmailDialogOpen(open); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Change Email
            </DialogTitle>
            <DialogDescription>
              {emailStep === 'form'
                ? 'Enter the email address you want to use.'
                : `We sent a one-time code to ${maskEmail(user?.email || '')}.`}
            </DialogDescription>
          </DialogHeader>

          {emailStep === 'form' ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-email">New Email</Label>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="name@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleEmailContinue(); }}
                />
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <Mail className="h-4 w-4 flex-shrink-0" />
                <span>
                  We'll send a one-time code to <strong className="text-foreground">{maskEmail(user?.email || '')}</strong>{' '}
                  to confirm it's really you.
                </span>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleEmailContinue} disabled={emailLoading}>
                  {emailLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Continue
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <OtpInput value={emailDigits} onChange={setEmailDigits} autoFocus />

              {emailVerification.error && (
                <p className="text-sm text-destructive font-medium text-center">
                  {emailVerification.error}
                </p>
              )}

              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setEmailStep('form')}
                  disabled={emailLoading}
                >
                  Back
                </Button>
                <Button
                  onClick={handleEmailVerify}
                  disabled={emailDigits.join('').length !== 6 || emailLoading}
                >
                  {emailLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Verify & Change Email
                </Button>
              </DialogFooter>

              <div className="text-center">
                {emailVerification.resendIn > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Resend code in {emailVerification.resendIn}s
                  </p>
                ) : (
                  <button
                    onClick={handleEmailContinue}
                    disabled={emailLoading}
                    className="text-xs font-bold text-primary hover:underline disabled:opacity-50"
                  >
                    Resend code
                  </button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Name/Username change verification */}
      <VerifyCodeDialog
        open={nameVerifyOpen}
        onOpenChange={setNameVerifyOpen}
        email={user?.email || ''}
        title="Confirm your identity"
        description="To keep your account secure, we need to confirm it's really you before updating your name or username."
        onVerified={onNameVerified}
      />

      {/* Delete Account Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Account</DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone. Your profile and login will be removed immediately.
              Your posts, reels and messages may be retained for up to 7 days so our support team can send you a
              copy of your data before everything is permanently purged.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)} disabled={deleting}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                const { error } = await deleteOwnAccount();
                setDeleting(false);
                if (error) {
                  toast({ title: 'Failed to delete account', description: error, variant: 'destructive' });
                  return;
                }
                setDeleteConfirmOpen(false);
                await signOut();
                navigate('/auth');
              }}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deleting ? 'Deleting…' : 'Delete my account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

// ─── Section Primitives ──────────────────────────────────────────────────────

function SectionCard({ icon: Icon, title, description, children, className }: { icon?: React.ElementType; title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden", className)}>
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/70 bg-gradient-to-b from-primary/[0.06] to-transparent">
        <span className="h-5 w-1 shrink-0 rounded-full bg-primary/60" />
        {Icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-tight">{title}</h2>
          {description && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SettingRow({ icon: Icon, label, description, children, className }: { icon?: React.ElementType; label: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("group/setting flex items-center justify-between gap-4 py-3.5", className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/70 text-muted-foreground transition-colors group-hover/setting:text-primary">
            <Icon className="h-[17px] w-[17px]" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug">{label}</p>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ─── Account ─────────────────────────────────────────────────────────────────

function AccountSection({ profile, formData, setFormData, user, saving, uploadingAvatar, avatarInputRef, onUploadAvatar, onSave, onChangePassword, onChangeEmail, usernameUsageLabel, usernameRemaining, nameUsageLabel, nameRemaining }: any) {
  const memberSince = profile?.created_at ? format(new Date(profile.created_at), 'MMMM yyyy') : null;
  const emailVerified = !!user?.email_confirmed_at;

  return (
    <div className="space-y-5">
      <ProfileCompletionCard profile={profile} formData={formData} />

      <SectionCard icon={User} title="Profile Information" description="Update your public profile details">
        <div className="flex items-center gap-5 mb-6">
          <div className="relative group">
            <Avatar className="h-20 w-20">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-muted text-lg font-medium">{getInitialsFn(formData.display_name || 'U')}</AvatarFallback>
            </Avatar>
            <button
              onClick={() => avatarInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            >
              {uploadingAvatar ? <Loader2 className="h-5 w-5 text-white animate-spin" /> : <Camera className="h-5 w-5 text-white" />}
            </button>
            <input ref={avatarInputRef} type="file" accept="image/*" onChange={onUploadAvatar} className="hidden" />
          </div>
          <div>
            <p className="text-sm font-medium">Profile Photo</p>
            <p className="text-xs text-muted-foreground mb-2">Hover over the photo to change it</p>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar}>
              <Upload className="h-3.5 w-3.5" />
              Upload Photo
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="display_name">Display Name</Label>
              <Input id="display_name" value={formData.display_name} onChange={(e) => setFormData({ ...formData, display_name: e.target.value })} placeholder="Your display name" />
              {nameUsageLabel && (
                <p className={cn('text-xs', nameRemaining <= 0 ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                  {nameRemaining <= 0 ? 'No display name changes left this month' : `${nameUsageLabel} · ${nameRemaining} left`}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                <Input id="username" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} placeholder="username" className="pl-7" maxLength={30} />
              </div>
              <p className="text-xs text-muted-foreground">
                3-30 characters. Letters, numbers, underscores only.
                {usernameUsageLabel && (
                  <span className={cn('ml-1', usernameRemaining <= 0 ? 'text-destructive font-medium' : '')}>
                    · {usernameRemaining <= 0 ? 'no changes left this month' : `${usernameUsageLabel}, ${usernameRemaining} left`}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bio">Bio</Label>
            <Textarea id="bio" value={formData.bio} onChange={(e) => setFormData({ ...formData, bio: e.target.value })} placeholder="Tell us about yourself..." className="min-h-[80px]" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="location">Location</Label>
              <Input id="location" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="City, Country" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="website">Website</Label>
              <Input id="website" value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} placeholder="https://yoursite.com" />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={CalendarDays} title="Member Since" description="A little info about your account">
        <div className="divide-y divide-border/70">
          <SettingRow icon={CalendarDays} label="Member since">
            <span className="text-sm font-medium">{memberSince || '—'}</span>
          </SettingRow>
          <SettingRow icon={Lock} label="Account type">
            <span className="text-sm font-medium capitalize">{profile?.privacy === 'private' ? 'Private' : 'Public'}</span>
          </SettingRow>
        </div>
      </SectionCard>

      <SectionCard icon={Mail} title="Email Address" description="Your email is used for sign-in and notifications">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-muted shrink-0">
              <Mail className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.email}</p>
              <span className={cn(
                "inline-flex items-center gap-1 text-xs font-medium",
                emailVerified ? "text-success" : "text-warning"
              )}>
                {emailVerified ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {emailVerified ? 'Verified' : 'Not verified'}
              </span>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onChangeEmail}>Change Email</Button>
        </div>
      </SectionCard>

      <SectionCard icon={Key} title="Password" description="Manage your account password">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Key className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium">Password</p>
              <p className="text-xs text-muted-foreground">Change it anytime — a code confirms the change.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onChangePassword}>Change Password</Button>
        </div>
      </SectionCard>

      <SectionCard icon={BadgeCheck} title="Verification" description="Get the blue badge for your account">
        <VerificationRequestCard profile={profile} />
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

function VerificationRequestCard({ profile }: { profile: { is_verified?: boolean } | null }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const isVerified = !!profile?.is_verified;

  const submit = async () => {
    setLoading(true);
    const { error } = await (supabase as any).rpc('request_verification', { message: reason || null });
    setLoading(false);
    if (error) {
      toast({ variant: 'destructive', title: 'Could not request verification', description: error.message });
      return;
    }
    toast({ title: 'Request submitted', description: 'Our team will review your request.' });
    setOpen(false);
    setReason('');
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('p-2 rounded-lg', isVerified ? 'bg-primary/10' : 'bg-muted')}>
            <BadgeCheck className={cn('h-4 w-4', isVerified ? 'text-primary' : 'text-muted-foreground')} />
          </div>
          <div>
            <p className="text-sm font-medium flex items-center gap-1.5">
              {isVerified ? 'Verified' : 'Not verified'}
              {isVerified && <BadgeCheck className="h-3.5 w-3.5 text-primary" />}
            </p>
            <p className="text-xs text-muted-foreground">
              {isVerified
                ? 'Your profile is verified.'
                : 'Request verification to get the blue badge on your profile.'}
            </p>
          </div>
        </div>
        {!isVerified && (
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            Request Verification
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Verification</DialogTitle>
            <DialogDescription>
              Tell us why you should be verified. Our team will review your request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="verification-reason">Reason (optional)</Label>
            <Textarea
              id="verification-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. I'm a public figure, artist, or brand..."
              className="min-h-[90px]"
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Interests ───────────────────────────────────────────────────────────────

function InterestsSection() {
  const { data: userInterests, isLoading } = useUserInterests();
  const { data: categories } = useInterestCategories();
  const { saveInterests } = useInterestActions();
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (userInterests) {
      setSelected(userInterests.map((ui) => ui.category_id));
    }
  }, [userInterests]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-5">
      <SectionCard
        icon={Sparkles}
        title="Your Interests"
        description="These topics fill your Interests feed. Add or remove any you like."
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {categories?.map((category) => (
              <InterestCard
                key={category.id}
                name={category.name}
                icon={category.icon}
                selected={selected.includes(category.id)}
                onToggle={() => toggle(category.id)}
              />
            ))}
          </div>
        )}
      </SectionCard>

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground font-medium">
          {selected.length} {selected.length === 1 ? 'interest' : 'interests'} selected
        </p>
        <div className="flex justify-end">
          <Button
            onClick={() => saveInterests.mutate(selected)}
            disabled={selected.length === 0 || saveInterests.isPending}
          >
            {saveInterests.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Save Interests
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Appearance ──────────────────────────────────────────────────────────────

function AccentColorCard({ preferences, updatePreferences }: any) {
  const stored = preferences?.color_accent || 'purple';
  const [draft, setDraft] = useState<string>(resolveAccentHex(stored));
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentHex = resolveAccentHex(stored);
  const isCustom = !ACCENT_PRESETS.some((p) => p.value === draft);

  const previewColors = useMemo(() => {
    const c = colorToHslTriple(draft) || { primary: '270 70% 55%', glow: '270 100% 65%' };
    return {
      solid: draft,
      soft: `hsl(${c.primary} / 0.14)`,
      muted: `hsl(${c.primary} / 0.08)`,
    };
  }, [draft]);

  const applyDraft = (hex: string) => {
    setDraft(hex);
    const root = document.documentElement;
    const c = colorToHslTriple(hex);
    if (c) {
      root.style.setProperty('--primary', c.primary);
      root.style.setProperty('--primary-glow', c.glow);
      root.style.setProperty('--ring', c.primary);
    }
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      updatePreferences({ color_accent: hex });
    }, 450);
  };

  const pickCustom = (value: string) => {
    const hex = normalizeHex(value);
    if (hex) applyDraft(hex);
  };

  const resetToDefault = () => {
    applyDraft('#7c3aed');
  };

  useEffect(() => {
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2.5">Presets</p>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2.5">
          {ACCENT_PRESETS.map(({ value, label }) => {
            const active = value === currentHex;
            return (
              <button
                key={value}
                onClick={() => applyDraft(value)}
                className="flex flex-col items-center gap-1.5 group"
                title={label}
              >
                <span
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 group-hover:scale-110",
                    active && "scale-105"
                  )}
                  style={{
                    backgroundColor: value,
                    boxShadow: active ? `0 0 0 2px ${value}, 0 0 0 4px rgba(0,0,0,0.12), 0 6px 16px -6px ${value}66` : undefined,
                  }}
                >
                  {active && <Check className="h-5 w-5 text-white" strokeWidth={3} />}
                </span>
                <span className={cn("text-[10px] leading-none", active ? "text-primary font-semibold" : "text-muted-foreground")}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border/70 pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2.5">Custom color</p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-border/70 p-3.5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <label
              className="relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-xl ring-1 ring-border/60 shadow-inner"
              title="Open color picker"
            >
              <span className="absolute inset-0 transition-colors" style={{ backgroundColor: draft }} />
              <span className="absolute inset-0 bg-black/10 transition-opacity hover:bg-black/20" />
              <input
                type="color"
                value={draft}
                onChange={(e) => pickCustom(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="Custom accent color"
              />
            </label>
            <div className="min-w-0">
              <p className="text-sm font-medium">Pick any shade</p>
              <p className="text-xs text-muted-foreground">Tap the swatch to open the picker, or type a hex code.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9a-fA-F#]/g, '').slice(0, 7);
                setDraft(val);
              }}
              onBlur={() => pickCustom(draft)}
              onKeyDown={(e) => { if (e.key === 'Enter') pickCustom(draft); }}
              className="h-9 w-28 font-mono text-xs uppercase"
              aria-label="Hex color"
            />
            {isCustom && (
              <Button variant="ghost" size="sm" onClick={resetToDefault} className="h-9 gap-1.5 px-2.5">
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-muted/40 p-4">
        <p className="text-xs font-medium text-muted-foreground mb-3">Preview</p>
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
            style={{ color: draft, backgroundColor: previewColors.soft }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Active tab
          </span>
          <span className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ backgroundColor: draft, boxShadow: `0 6px 16px -6px ${draft}66` }}>
            Button
          </span>
          <span
            className="inline-flex h-6 w-11 items-center rounded-full p-0.5"
            style={{ backgroundColor: draft, boxShadow: `0 4px 12px -4px ${draft}66` }}
          >
            <span className="ml-auto block h-5 w-5 rounded-full bg-white shadow-sm" />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium" style={{ color: draft, backgroundColor: previewColors.muted }}>
            <Heart className="h-3 w-3 fill-current" /> 1.2k
          </span>
        </div>
      </div>
    </div>
  );
}

function AppearanceSection({ preferences, updatePreferences }: any) {
  return (
    <div className="space-y-5">
      <SectionCard icon={MoonStar} title="Theme" description="Twibsers is dark mode only">
        <div className="grid grid-cols-1 gap-3">
          {[
            { value: 'dark', icon: Moon, label: 'Dark', desc: 'Easy on eyes' },
          ].map(({ value, icon: Icon, label, desc }) => (
            <button
              key={value}
              onClick={() => updatePreferences({ theme: value })}
              className={cn(
                "flex items-center gap-3 p-4 rounded-xl border transition-all",
                preferences?.theme === value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40"
              )}
            >
              <Icon className={cn("h-5 w-5", preferences?.theme === value ? "text-primary" : "text-muted-foreground")} />
              <div className="text-left">
                <p className="font-medium text-sm">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              {preferences?.theme === value && <Check className="h-4 w-4 text-primary ml-auto" />}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard icon={Type} title="Typography" description="Adjust text size and display density">
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Font Size</Label>
              <Badge variant="secondary" className="text-xs capitalize">{preferences?.font_size || 'medium'}</Badge>
            </div>
            <Slider
              value={[['small', 'medium', 'large', 'xlarge'].indexOf(preferences?.font_size || 'medium')]}
              onValueChange={([v]) => updatePreferences({ font_size: ['small', 'medium', 'large', 'xlarge'][v] })}
              max={3}
              step={1}
              className="w-full"
            />
            <div className="flex justify-between px-1">
              {['Small', 'Medium', 'Large', 'X-Large'].map((size, i) => (
                <button
                  key={size}
                  onClick={() => updatePreferences({ font_size: ['small', 'medium', 'large', 'xlarge'][i] })}
                  className={cn(
                    "text-xs px-2 py-1 rounded transition-colors",
                    ['small', 'medium', 'large', 'xlarge'].indexOf(preferences?.font_size || 'medium') === i
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {size}
                </button>
              ))}
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-muted-foreground text-xs mb-1">Preview</p>
              <p style={{ fontSize: preferences?.font_size === 'small' ? '14px' : preferences?.font_size === 'large' ? '18px' : preferences?.font_size === 'xlarge' ? '20px' : '16px' }}>
                The quick brown fox jumps over the lazy dog.
              </p>
            </div>
          </div>

          <div className="border-t border-border pt-4">
            <Label className="text-sm font-medium mb-3 block">Display Density</Label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'compact', label: 'Compact', desc: 'More content' },
                { value: 'comfortable', label: 'Comfortable', desc: 'Balanced' },
                { value: 'spacious', label: 'Spacious', desc: 'More space' },
              ].map(({ value, label, desc }) => (
                <button
                  key={value}
                  onClick={() => updatePreferences({ display_density: value })}
                  className={cn(
                    "p-3 rounded-lg border text-center transition-all",
                    preferences?.display_density === value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40"
                  )}
                >
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={Palette} title="Accent Color" description="The color that paints Twibsers for you — presets or any custom shade">
        <AccentColorCard preferences={preferences} updatePreferences={updatePreferences} />
      </SectionCard>

      <SectionCard icon={MessageSquare} title="Chat Colors" description="Pick the color of the messages you send">
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-muted/40 flex flex-col gap-2">
            <div className="flex justify-start">
              <div className="max-w-[75%] px-3.5 py-2 rounded-2xl rounded-bl-md bg-surface-3 text-foreground text-sm">
                Hey, did you see the new update?
              </div>
            </div>
            <div className="flex justify-end">
              <div
                className="max-w-[75%] px-3.5 py-2 rounded-2xl rounded-br-md text-white text-sm"
                style={{
                  backgroundColor:
                    BUBBLE_COLORS.find(c => c.value === (preferences?.message_bubble_color || 'purple'))?.color,
                }}
              >
                Yes, I love the new chat colors!
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 sm:gap-3">
            {BUBBLE_COLORS.map(({ value, color, label }) => (
              <button
                key={value}
                onClick={() => updatePreferences({ message_bubble_color: value })}
                className={cn(
                  "relative aspect-square rounded-xl transition-all flex items-center justify-center",
                  preferences?.message_bubble_color === value
                    ? "ring-2 ring-offset-2 ring-offset-background scale-110"
                    : "hover:scale-105"
                )}
                style={{ backgroundColor: color, '--tw-ring-color': color } as React.CSSProperties}
                title={label}
              >
                {preferences?.message_bubble_color === value && <Check className="h-4 w-4 text-white" />}
              </button>
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Content & Feed ──────────────────────────────────────────────────────────

function ContentSection({ preferences, updatePreferences }: any) {
  return (
    <div className="space-y-5">
      <SectionCard icon={SlidersHorizontal} title="Feed Settings" description="Control what you see in your feed">
        <div className="space-y-1">
          <SettingRow icon={PlayCircle} label="Autoplay Videos" description="Automatically play videos as you scroll">
            <Switch checked={preferences?.autoplay_videos ?? true} onCheckedChange={(c: boolean) => updatePreferences({ autoplay_videos: c })} />
          </SettingRow>
          <SettingRow icon={Heart} label="No Like Counts" description="Hide popularity metrics — visitors see that people enjoyed it instead of exact counts" className="border-t border-border/70">
            <Switch checked={preferences?.hide_like_counts ?? false} onCheckedChange={(c: boolean) => updatePreferences({ hide_like_counts: c })} />
          </SettingRow>
          <SettingRow icon={Eye} label="Show Sensitive Content" description="Display content marked as sensitive" className="border-t border-border/70">
            <Switch checked={preferences?.show_sensitive_content ?? false} onCheckedChange={(c: boolean) => updatePreferences({ show_sensitive_content: c })} />
          </SettingRow>
        </div>
      </SectionCard>

      <SectionCard icon={Ban} title="Content Filter" description="Choose how to filter sensitive content">
        <RadioGroup
          value={preferences?.content_filter || 'standard'}
          onValueChange={(v: string) => updatePreferences({ content_filter: v })}
          className="space-y-2"
        >
          {CONTENT_FILTERS.map(({ value, label, description }) => (
            <Label
              key={value}
              htmlFor={`filter-${value}`}
              className={cn(
                "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                preferences?.content_filter === value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              )}
            >
              <RadioGroupItem value={value} id={`filter-${value}`} />
              <div>
                <span className="text-sm font-medium">{label}</span>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </Label>
          ))}
        </RadioGroup>
      </SectionCard>

      <SectionCard icon={Globe} title="Language" description="Choose your preferred language">
        <Select value={preferences?.language || 'en'} onValueChange={(v: string) => updatePreferences({ language: v })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LANGUAGES.map(({ code, name }) => (
              <SelectItem key={code} value={code}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SectionCard>
    </div>
  );
}

// ─── Notifications ───────────────────────────────────────────────────────────

function NotificationsSection({ formData, setFormData, preferences, updatePreferences, saving, onSave }: any) {
  return (
    <div className="space-y-5">
      <SectionCard icon={Bell} title="Notification Preferences" description="Choose how you want to be notified">
        <div className="space-y-1">
          <SettingRow icon={Mail} label="Email Notifications" description="Receive email updates about activity on your account">
            <Switch checked={formData.email_notifications} onCheckedChange={(c: boolean) => setFormData({ ...formData, email_notifications: c })} />
          </SettingRow>
          <SettingRow icon={Smartphone} label="Push Notifications" description="Receive push notifications on your devices" className="border-t border-border/70">
            <Switch checked={formData.push_notifications} onCheckedChange={(c: boolean) => setFormData({ ...formData, push_notifications: c })} />
          </SettingRow>
        </div>
      </SectionCard>

      <SectionCard icon={BellOff} title="Do Not Disturb" description="Silence incoming calls and notifications">
        <div className="space-y-3">
          <SettingRow icon={BellOff} label="Enable Do Not Disturb" description="When enabled, incoming calls will be silently declined">
            <Switch checked={preferences?.do_not_disturb ?? false} onCheckedChange={(c: boolean) => updatePreferences({ do_not_disturb: c })} />
          </SettingRow>
          {preferences?.do_not_disturb && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <p className="text-sm text-amber-600 dark:text-amber-400">Do Not Disturb is active. All incoming calls will be silently declined.</p>
            </div>
          )}
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

// ─── Privacy ─────────────────────────────────────────────────────────────────

function PrivacySection({ formData, setFormData, blockedUsers, blocksLoading, unblockUser, saving, onSave, preferences, updatePreferences }: any) {
  return (
    <div className="space-y-5">
      <SectionCard icon={Lock} title="Account Privacy" description="Control who can see your content">
        <SettingRow icon={Eye} label="Private Account" description="Only approved followers can see your posts and profile">
          <Switch checked={formData.privacy === 'private'} onCheckedChange={(c: boolean) => setFormData({ ...formData, privacy: c ? 'private' : 'public' })} />
        </SettingRow>
        <SettingRow icon={Ghost} label="Ghost Mode" description="Browse profiles privately — your visits won't appear in their profile viewers" className="border-t border-border/70">
          <Switch checked={preferences?.ghost_mode ?? false} onCheckedChange={(c: boolean) => updatePreferences({ ghost_mode: c })} />
        </SettingRow>
      </SectionCard>

      <BlockedAccountsCard />

      <MutedUsersCard />

      <SectionCard icon={PhoneOff} title="Blocked Calls" description="Accounts you've blocked from calling you">
        {blocksLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : blockedUsers.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No call blocks</p>
            <p className="text-xs text-muted-foreground mt-1">Block calls from a user's profile or message thread</p>
          </div>
        ) : (
          <div className="space-y-2">
            {blockedUsers.map((block: any) => (
              <div key={block.id} className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={block.profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-muted text-xs font-medium">
                      {block.profile?.display_name?.slice(0, 2).toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{block.profile?.display_name || 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">@{block.profile?.username || 'user'}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => unblockUser(block.blocked_id)}>
                  Unblock
                </Button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}

function SafetyListCard({ icon: Icon, title, description, emptyTitle, emptyDescription, removeLabel, load, onRemove }: {
  icon: React.ElementType;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  removeLabel: string;
  load: () => Promise<{ id: string; created_at: string; profile: { display_name: string; username: string; avatar_url: string | null } | null }[]>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [items, setItems] = useState<{ id: string; created_at: string; profile: { display_name: string; username: string; avatar_url: string | null } | null }[] | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    load().then((rows) => { if (!cancelled) setItems(rows); }).catch(() => { if (!cancelled) setItems([]); });
    return () => { cancelled = true; };
  }, [load]);

  const removeItem = async (id: string) => {
    if (removing) return;
    setRemoving(id);
    try {
      await onRemove(id);
      setItems((prev) => (prev || []).filter((i) => i.id !== id));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <SectionCard icon={Icon} title={title} description={description}>
      {items === null ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">{emptyTitle}</p>
          <p className="text-xs text-muted-foreground mt-1">{emptyDescription}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={`${item.id}-${i}`} className="flex items-center justify-between gap-3 p-3 rounded-lg border">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={item.profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-muted text-xs font-medium">
                    {item.profile?.display_name?.slice(0, 2).toUpperCase() || getInitialsFn('U')}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.profile?.display_name || 'Unknown'}</p>
                  <p className="truncate text-xs text-muted-foreground">@{item.profile?.username || 'user'}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => removeItem(item.id)} disabled={removing === item.id} className="shrink-0">
                {removing === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {removeLabel}
              </Button>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function BlockedAccountsCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const load = useCallback(async () => {
    if (!user) return [];
    const { data } = await supabase
      .from('blocks')
      .select('blocked_id, created_at')
      .eq('blocker_id', user.id)
      .order('created_at', { ascending: false });
    const rows = (data || []) as { blocked_id: string; created_at: string }[];
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.blocked_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name, username, avatar_url')
      .in('user_id', ids);
    const map = new Map((profiles || []).map((p) => [p.user_id, p]));
    return rows.map((r) => ({ id: r.blocked_id, created_at: r.created_at, profile: map.get(r.blocked_id) || null }));
  }, [user]);

  const unblock = async (id: string) => {
    const { error } = await supabase.rpc('unblock_user', { target_user_id: id });
    if (error) {
      toast({ variant: 'destructive', title: 'Failed to unblock', description: error.message });
      throw error;
    }
    toast({ title: 'User unblocked', description: 'They can now see your posts again.' });
  };

  return (
    <SafetyListCard
      icon={UserX}
      title="Blocked Accounts"
      description="They can't see your posts, view your profile, or message you"
      emptyTitle="No blocked accounts"
      emptyDescription="Block someone from their profile or message thread"
      removeLabel="Unblock"
      load={load}
      onRemove={unblock}
    />
  );
}

function MutedUsersCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const load = useCallback(async () => {
    if (!user) return [];
    const { data } = await supabase
      .from('mutes')
      .select('muted_id, created_at')
      .eq('muter_id', user.id)
      .order('created_at', { ascending: false });
    const rows = (data || []) as { muted_id: string; created_at: string }[];
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.muted_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, display_name, username, avatar_url')
      .in('user_id', ids);
    const map = new Map((profiles || []).map((p) => [p.user_id, p]));
    return rows.map((r) => ({ id: r.muted_id, created_at: r.created_at, profile: map.get(r.muted_id) || null }));
  }, [user]);

  const unmute = async (id: string) => {
    const { error } = await supabase.rpc('unmute_user', { target_user_id: id });
    if (error) {
      toast({ variant: 'destructive', title: 'Failed to unmute', description: error.message });
      throw error;
    }
    toast({ title: 'User unmuted', description: 'You will see their posts again.' });
  };

  return (
    <SafetyListCard
      icon={VolumeX}
      title="Muted Users"
      description="Muted accounts won't show up in your feed or notifications"
      emptyTitle="No muted users"
      emptyDescription="Mute someone from a post, their profile, or message thread"
      removeLabel="Unmute"
      load={load}
      onRemove={unmute}
    />
  );
}

// ─── Accessibility ───────────────────────────────────────────────────────────

function AccessibilitySection({ preferences, updatePreferences }: any) {
  return (
    <div className="space-y-5">
      <SectionCard icon={Accessibility} title="Accessibility" description="Make Twibsers easier to use">
        <div className="space-y-1">
          <SettingRow icon={Moon} label="Reduce Motion" description="Minimize animations and transitions">
            <Switch checked={preferences?.reduced_motion ?? false} onCheckedChange={(c: boolean) => updatePreferences({ reduced_motion: c })} />
          </SettingRow>
          <SettingRow icon={Eye} label="High Contrast" description="Increase color contrast for better visibility" className="border-t border-border/70">
            <Switch checked={preferences?.high_contrast ?? false} onCheckedChange={(c: boolean) => updatePreferences({ high_contrast: c })} />
          </SettingRow>
          <SettingRow icon={Accessibility} label="Screen Reader Optimized" description="Optimize experience for screen readers" className="border-t border-border/70">
            <Switch checked={preferences?.screen_reader_optimized ?? false} onCheckedChange={(c: boolean) => updatePreferences({ screen_reader_optimized: c })} />
          </SettingRow>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── Security ────────────────────────────────────────────────────────────────

function SecuritySection({ user, sessions, sessionsLoading, preferences, updatePreferences, revokeSession, revokeAllOtherSessions, onChangePassword, onDeleteAccount, getDeviceIcon }: any) {
  return (
    <div className="space-y-5">
      <SectionCard icon={Shield} title="Account Security" description="Manage your security settings">
        <div className="space-y-1">
          <SettingRow icon={Shield} label="Two-Factor Authentication" description="Add an extra layer of security to your account">
            <Switch checked={preferences?.two_factor_enabled ?? false} onCheckedChange={(c: boolean) => updatePreferences({ two_factor_enabled: c })} />
          </SettingRow>
          <SettingRow icon={AlertTriangle} label="Login Alerts" description="Get notified of new logins to your account" className="border-t border-border/70">
            <Switch checked={preferences?.login_alerts ?? true} onCheckedChange={(c: boolean) => updatePreferences({ login_alerts: c })} />
          </SettingRow>
        </div>
      </SectionCard>

      <SectionCard icon={Smartphone} title="Active Sessions" description="Manage devices logged into your account">
        {sessionsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No active sessions</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session: any) => {
              const DeviceIcon = getDeviceIcon(session.device_type);
              return (
                <div key={session.id} className={cn("flex items-center gap-3 p-3 rounded-lg border", session.is_current && "bg-primary/5 border-primary/20")}>
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <DeviceIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{session.device_name || 'Unknown Device'}</span>
                      {session.is_current && <Badge variant="secondary" className="text-xs">Current</Badge>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {session.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {session.location}
                        </span>
                      )}
                      <span>{format(new Date(session.last_active_at), 'MMM d, yyyy')}</span>
                    </div>
                  </div>
                  {!session.is_current && (
                    <Button variant="ghost" size="sm" onClick={() => revokeSession(session.id)} className="text-destructive hover:text-destructive flex-shrink-0">
                      <LogOut className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {sessions.length > 1 && (
          <div className="mt-3 pt-3 border-t border-border flex justify-end">
            <Button variant="outline" size="sm" onClick={revokeAllOtherSessions} className="gap-1.5 text-destructive hover:text-destructive">
              <LogOut className="h-3.5 w-3.5" />
              Log out all others
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard icon={AlertTriangle} title="Danger Zone" description="Irreversible actions" className="border-destructive/30">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Delete Account</p>
            <p className="text-xs text-muted-foreground">Permanently delete your account and all data</p>
          </div>
          <Button variant="destructive" size="sm" onClick={onDeleteAccount} className="gap-1.5">
            <Trash2 className="h-3.5 w-3.5" />
            Delete Account
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}

// ─── About & Data ────────────────────────────────────────────────────────────

function AboutSection({ profile }: { profile: { privacy?: string } | null }) {
  return (
    <div className="space-y-5">
      <SectionCard icon={Info} title="About Twibsers" description="Version and basic information">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border/70 bg-muted/40">
            <BrandLogo className="h-7" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Twibsers</p>
            <p className="text-xs text-muted-foreground mt-0.5">Version {APP_VERSION}</p>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              A place for you, your friends, your reels and the community you build in between.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard icon={FileText} title="Legal" description="The rules that keep Twibsers safe and fair">
        <div className="space-y-1">
          <SettingRow icon={FileText} label="Terms of Service" description="The agreement you agreed to when you signed up">
            <Button variant="ghost" size="sm" asChild className="gap-1.5">
              <Link to="/terms">
                View
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </SettingRow>
          <SettingRow icon={ShieldCheck} label="Privacy Policy" description="How your data is collected and used" className="border-t border-border/70">
            <Button variant="ghost" size="sm" asChild className="gap-1.5">
              <Link to="/privacy">
                View
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </SettingRow>
          <SettingRow icon={BookMarked} label="Community Guidelines" description="What we expect from the community" className="border-t border-border/70">
            <Button variant="ghost" size="sm" asChild className="gap-1.5">
              <Link to="/community-guidelines">
                View
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </SettingRow>
        </div>
      </SectionCard>

      <SectionCard icon={Database} title="Your Data" description="What we store and how to get it">
        <div className="space-y-1">
          <SettingRow icon={Database} label="Account data" description="Profile, posts, messages and settings you created">
            <span className="text-xs font-medium text-muted-foreground">On Twibsers servers</span>
          </SettingRow>
          <SettingRow icon={Mail} label="Request a copy of your data" description="Email support and we\u2019ll prepare an export of your account" className="border-t border-border/70">
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <a href={`mailto:${SUPPORT_EMAIL}?subject=Data%20export%20request`}>
                Request
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </SettingRow>
        </div>
      </SectionCard>

      <StorageCard />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

function StorageCard() {
  const [usage, setUsage] = useState<string | null>(null);
  const [cacheCount, setCacheCount] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if ('storage' in navigator && navigator.storage?.estimate) {
          const est = await navigator.storage.estimate();
          if (!cancelled) setUsage(formatBytes(est.usage || 0));
        }
      } catch {
        /* storage estimate unavailable */
      }
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          if (!cancelled) setCacheCount(keys.length);
        }
      } catch {
        /* caches unavailable */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const clearCache = async () => {
    setClearing(true);
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        setCacheCount(0);
      }
      toast({
        title: 'Cache cleared',
        description: 'Temporary files were removed. Some media may take a moment to reload.',
      });
    } catch {
      toast({ variant: 'destructive', title: 'Could not clear cache', description: 'Something went wrong while clearing temporary files.' });
    } finally {
      setClearing(false);
    }
  };

  return (
    <SectionCard icon={HardDrive} title="Storage & Cache" description="Manage temporary files stored on this device">
      <SettingRow icon={Database} label="Storage used on this device" description="Temporary and cached content for Twibsers">
        <span className="text-sm font-medium">{usage ?? '—'}</span>
      </SettingRow>
      <SettingRow icon={RefreshCw} label="Cached app data" description="Downloaded images, videos and offline assets" className="border-t border-border/70">
        <span className="text-sm font-medium">
          {cacheCount === null ? '—' : `${cacheCount} ${cacheCount === 1 ? 'cache' : 'caches'}`}
        </span>
      </SettingRow>
      <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3.5">
        <p className="text-xs text-muted-foreground">This only clears temporary files. Your account data is unaffected.</p>
        <Button variant="outline" size="sm" onClick={clearCache} disabled={clearing} className="shrink-0 gap-1.5">
          {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Clear cache
        </Button>
      </div>
    </SectionCard>
  );
}

// ─── Help & Support ──────────────────────────────────────────────────────────

function HelpSection() {
  return (
    <div className="space-y-5">
      <SectionCard icon={HelpCircle} title="Frequently asked questions" description="Quick answers to common questions">
        <Accordion type="single" collapsible className="w-full">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`} className="border-b border-border/70 last:border-b-0">
              <AccordionTrigger className="text-sm font-medium text-left gap-3 py-3.5">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </SectionCard>

      <SectionCard icon={LifeBuoy} title="Still stuck?" description="We\u2019re happy to help">
        <div className="space-y-1">
          <SettingRow icon={Mail} label="Contact support" description={`Email us any time at ${SUPPORT_EMAIL}`}>
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <a href={`mailto:${SUPPORT_EMAIL}`}>
                Send email
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </SettingRow>
          <SettingRow icon={BookMarked} label="Read the guidelines" description="Understand what's allowed on Twibsers" className="border-t border-border/70">
            <Button variant="ghost" size="sm" asChild className="gap-1.5">
              <Link to="/community-guidelines">
                View
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </SettingRow>
        </div>
      </SectionCard>
    </div>
  );
}

function ProfileCompletionCard({ profile, formData }: any) {
  const steps = [
    { label: 'Profile photo', done: !!profile?.avatar_url, hint: 'Add a photo' },
    { label: 'Display name', done: !!formData.display_name, hint: 'Add a name' },
    { label: 'Username', done: !!formData.username, hint: 'Add a username' },
    { label: 'Bio', done: !!formData.bio, hint: 'Add a bio' },
    { label: 'Location', done: !!formData.location, hint: 'Add a location' },
    { label: 'Website', done: !!formData.website, hint: 'Add a website' },
  ];
  const pct = Math.round((steps.filter((s) => s.done).length / steps.length) * 100);
  const ttl = 1200;
  const dash = 2 * Math.PI * (ttl / 2);
  const offset = dash - (pct / 100) * dash;

  return (
    <section className="rounded-2xl border border-border/70 bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)] overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-4">
        <div className="relative h-[34px] w-[34px] shrink-0">
          <svg viewBox="0 0 34 34" className="h-full w-full -rotate-90">
            <circle cx="17" cy="17" r="15" fill="none" stroke="var(--border)" strokeWidth="4" strokeLinecap="round" />
            <circle
              cx="17" cy="17" r="15" fill="none"
              stroke="hsl(var(--primary))" strokeWidth="4" strokeLinecap="round"
              strokeDasharray={dash} strokeDashoffset={offset}
              className="transition-[stroke-dashoffset] duration-500 ease-out"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular-nums">
            {pct}
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-tight">Profile strength</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {pct === 100 ? 'You look great — your profile is complete.' : `${pct}% complete · fill in the highlights to stand out.`}
          </p>
        </div>
      </div>
      {pct < 100 && (
        <div className="px-5 pb-4">
          <div className="flex flex-wrap gap-1.5 border-t border-border/70 pt-3.5">
            {steps.filter((s) => !s.done).map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5 rounded-full bg-muted/70 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                <AlertTriangle className="h-3 w-3" />
                {s.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function getInitialsFn(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}