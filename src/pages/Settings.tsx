import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useLoginSessions } from '@/hooks/useLoginSessions';
import { useCallBlocks } from '@/hooks/useCallBlocks';
import { supabase } from '@/integrations/supabase/client';
import MainLayout from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Camera, User, Bell, Lock, Shield, Palette, Eye,
  Globe, Moon, Smartphone, Laptop, MapPin,
  LogOut, Trash2, Key, AlertTriangle, Check, Mail, Upload,
  PhoneOff, UserX, ChevronRight, ChevronLeft, Settings2,
  MessageSquare, Heart, Bookmark, Search, Accessibility
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { getAllLanguages } from '@/lib/languageDetection';

const LANGUAGES = getAllLanguages();

const CONTENT_FILTERS = [
  { value: 'strict', label: 'Strict', description: 'Hide all potentially sensitive content' },
  { value: 'standard', label: 'Standard', description: 'Show warnings before sensitive content' },
  { value: 'none', label: 'None', description: 'Show all content without warnings' },
];

const COLOR_ACCENTS = [
  { value: 'purple', color: 'hsl(270 70% 55%)', label: 'Purple' },
  { value: 'blue', color: 'hsl(220 70% 55%)', label: 'Blue' },
  { value: 'green', color: 'hsl(160 70% 45%)', label: 'Green' },
  { value: 'orange', color: 'hsl(30 90% 55%)', label: 'Orange' },
  { value: 'pink', color: 'hsl(330 80% 55%)', label: 'Pink' },
  { value: 'red', color: 'hsl(0 75% 55%)', label: 'Red' },
];

type SettingsSection =
  | 'account'
  | 'appearance'
  | 'content'
  | 'notifications'
  | 'privacy'
  | 'accessibility'
  | 'security'
  | 'sessions'
  | 'blocked';

const NAV_ITEMS: { id: SettingsSection; label: string; icon: React.ElementType }[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'content', label: 'Content & Feed', icon: Eye },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'privacy', label: 'Privacy', icon: Lock },
  { id: 'accessibility', label: 'Accessibility', icon: Accessibility },
  { id: 'security', label: 'Security', icon: Shield },
];

export default function Settings() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, loading: authLoading, updateProfile } = useAuth();
  const { preferences, loading: prefsLoading, saving: prefsSaving, updatePreferences } = useUserPreferences();
  const { sessions, loading: sessionsLoading, revokeSession, revokeAllOtherSessions } = useLoginSessions();
  const { blockedUsers, loading: blocksLoading, unblockUser } = useCallBlocks();
  const { toast } = useToast();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [activeSection, setActiveSection] = useState<SettingsSection>('account');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [passwordMode, setPasswordMode] = useState<'password' | 'email'>('password');
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

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

  const handleSave = async () => {
    setSaving(true);

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
      if (formData.username !== profile?.username) navigate(`/profile/${formData.username}`);
    }
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

  const handlePasswordChange = async () => {
    if (passwordMode === 'password') {
      if (passwordForm.newPassword !== passwordForm.confirmPassword) {
        toast({ variant: 'destructive', title: 'Passwords do not match', description: 'Please make sure both passwords are the same.' });
        return;
      }
      if (passwordForm.newPassword.length < 6) {
        toast({ variant: 'destructive', title: 'Password too short', description: 'Password must be at least 6 characters.' });
        return;
      }
      setPasswordLoading(true);
      const { error } = await supabase.auth.updateUser({ password: passwordForm.newPassword });
      setPasswordLoading(false);
      if (error) {
        toast({ variant: 'destructive', title: 'Failed to change password', description: error.message });
      } else {
        toast({ title: 'Password changed', description: 'Your password has been updated.' });
        setPasswordDialogOpen(false);
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      }
    } else {
      setPasswordLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(user?.email || '', { redirectTo: `${window.location.origin}/settings` });
      setPasswordLoading(false);
      if (error) {
        toast({ variant: 'destructive', title: 'Failed to send email', description: error.message });
      } else {
        toast({ title: 'Email sent', description: 'Check your email for the password reset link.' });
        setPasswordDialogOpen(false);
      }
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
      <div className="max-w-5xl mx-auto px-4 py-6 pb-24 lg:pb-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Navigation */}
          <nav className="lg:w-56 flex-shrink-0">
            <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0">
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                    activeSection === id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </nav>

          {/* Content Area */}
          <div className="flex-1 min-w-0">
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
                onChangePassword={() => setPasswordDialogOpen(true)}
              />
            )}

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
          </div>
        </div>
      </div>

      {/* Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Choose how you want to change your password</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setPasswordMode('password')}
                className={cn(
                  "p-3 rounded-lg border text-center transition-all text-sm",
                  passwordMode === 'password' ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                )}
              >
                <Key className="h-5 w-5 mx-auto mb-1.5" />
                <p className="font-medium">Use Password</p>
              </button>
              <button
                onClick={() => setPasswordMode('email')}
                className={cn(
                  "p-3 rounded-lg border text-center transition-all text-sm",
                  passwordMode === 'email' ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                )}
              >
                <Mail className="h-5 w-5 mx-auto mb-1.5" />
                <p className="font-medium">Email Link</p>
              </button>
            </div>
            {passwordMode === 'password' ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">New Password</Label>
                  <Input id="new-password" type="password" placeholder="Min 6 characters" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input id="confirm-password" type="password" placeholder="Confirm new password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} />
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-muted/50 text-center text-sm text-muted-foreground">
                We'll send a password reset link to <strong>{user?.email}</strong>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>Cancel</Button>
            <Button onClick={handlePasswordChange} disabled={passwordLoading}>
              {passwordLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {passwordMode === 'password' ? 'Change Password' : 'Send Reset Link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Account Dialog */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Account</DialogTitle>
            <DialogDescription>
              This action is permanent and cannot be undone. All your data will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive">Delete my account</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}

// ─── Section Components ──────────────────────────────────────────────────────

function SectionCard({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("border border-border rounded-xl", className)}>
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-base font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function SettingRow({ label, description, children, className }: { label: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between py-3", className)}>
      <div className="flex-1 min-w-0 mr-4">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function AccountSection({ profile, formData, setFormData, user, saving, uploadingAvatar, avatarInputRef, onUploadAvatar, onSave, onChangePassword }: any) {
  return (
    <div className="space-y-5">
      <SectionCard title="Profile Information" description="Update your public profile details">
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                <Input id="username" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} placeholder="username" className="pl-7" maxLength={30} />
              </div>
              <p className="text-xs text-muted-foreground">3-30 characters. Letters, numbers, underscores only.</p>
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

      <SectionCard title="Email Address" description="Your email is used for sign-in and notifications">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Mail className="h-4 w-4" />
            </div>
            <span className="text-sm font-medium">{user?.email}</span>
          </div>
          <Button variant="outline" size="sm">Change Email</Button>
        </div>
      </SectionCard>

      <SectionCard title="Password" description="Manage your account password">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              <Key className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-medium">Password</p>
              <p className="text-xs text-muted-foreground">Last changed: Unknown</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onChangePassword}>Change Password</Button>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

function AppearanceSection({ preferences, updatePreferences }: any) {
  return (
    <div className="space-y-5">
      <SectionCard title="Theme" description="Twibsers is dark mode only">
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

      <SectionCard title="Typography" description="Adjust text size and display density">
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

      <SectionCard title="Accent Color" description="Personalize your color theme">
        <div className="grid grid-cols-6 gap-3">
          {COLOR_ACCENTS.map(({ value, color, label }) => (
            <button
              key={value}
              onClick={() => updatePreferences({ color_accent: value })}
              className={cn(
                "relative aspect-square rounded-xl transition-all flex items-center justify-center",
                preferences?.color_accent === value
                  ? "ring-2 ring-offset-2 ring-offset-background scale-110"
                  : "hover:scale-105"
              )}
              style={{ backgroundColor: color, '--tw-ring-color': color } as React.CSSProperties}
              title={label}
            >
              {preferences?.color_accent === value && <Check className="h-5 w-5 text-white" />}
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function ContentSection({ preferences, updatePreferences }: any) {
  return (
    <div className="space-y-5">
      <SectionCard title="Feed Settings" description="Control what you see in your feed">
        <div className="space-y-4">
          <SettingRow label="Autoplay Videos" description="Automatically play videos as you scroll">
            <Switch checked={preferences?.autoplay_videos ?? true} onCheckedChange={(c: boolean) => updatePreferences({ autoplay_videos: c })} />
          </SettingRow>

          <SettingRow label="Show Sensitive Content" description="Display content marked as sensitive" className="border-t border-border">
            <Switch checked={preferences?.show_sensitive_content ?? false} onCheckedChange={(c: boolean) => updatePreferences({ show_sensitive_content: c })} />
          </SettingRow>
        </div>
      </SectionCard>

      <SectionCard title="Content Filter" description="Choose how to filter sensitive content">
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

      <SectionCard title="Language" description="Choose your preferred language">
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

function NotificationsSection({ formData, setFormData, preferences, updatePreferences, saving, onSave }: any) {
  return (
    <div className="space-y-5">
      <SectionCard title="Notification Preferences" description="Choose how you want to be notified">
        <div className="space-y-1">
          <SettingRow label="Email Notifications" description="Receive email updates about activity on your account">
            <Switch checked={formData.email_notifications} onCheckedChange={(c: boolean) => setFormData({ ...formData, email_notifications: c })} />
          </SettingRow>
          <SettingRow label="Push Notifications" description="Receive push notifications on your devices" className="border-t border-border">
            <Switch checked={formData.push_notifications} onCheckedChange={(c: boolean) => setFormData({ ...formData, push_notifications: c })} />
          </SettingRow>
        </div>
      </SectionCard>

      <SectionCard title="Do Not Disturb" description="Silence incoming calls and notifications">
        <div className="space-y-3">
          <SettingRow label="Enable Do Not Disturb" description="When enabled, incoming calls will be silently declined">
            <Switch checked={preferences?.do_not_disturb ?? false} onCheckedChange={(c: boolean) => updatePreferences({ do_not_disturb: c })} />
          </SettingRow>
          {preferences?.do_not_disturb && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Bell className="h-4 w-4 text-amber-500" />
              <p className="text-sm text-amber-600 dark:text-amber-400">Do Not Disturb is active. All incoming calls will be silently declined.</p>
            </div>
          )}
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

function PrivacySection({ formData, setFormData, blockedUsers, blocksLoading, unblockUser, saving, onSave }: any) {
  return (
    <div className="space-y-5">
      <SectionCard title="Account Privacy" description="Control who can see your content">
        <SettingRow label="Private Account" description="Only approved followers can see your posts and profile">
          <Switch checked={formData.privacy === 'private'} onCheckedChange={(c: boolean) => setFormData({ ...formData, privacy: c ? 'private' : 'public' })} />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Blocked Users" description="Users you've blocked cannot contact or call you">
        {blocksLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : blockedUsers.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No blocked users</p>
            <p className="text-xs text-muted-foreground mt-1">Block users from their profile or message thread</p>
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
        <Button onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

function AccessibilitySection({ preferences, updatePreferences }: any) {
  return (
    <div className="space-y-5">
      <SectionCard title="Accessibility" description="Make Twibsers easier to use">
        <div className="space-y-1">
          <SettingRow label="Reduce Motion" description="Minimize animations and transitions">
            <Switch checked={preferences?.reduced_motion ?? false} onCheckedChange={(c: boolean) => updatePreferences({ reduced_motion: c })} />
          </SettingRow>
          <SettingRow label="High Contrast" description="Increase color contrast for better visibility" className="border-t border-border">
            <Switch checked={preferences?.high_contrast ?? false} onCheckedChange={(c: boolean) => updatePreferences({ high_contrast: c })} />
          </SettingRow>
          <SettingRow label="Screen Reader Optimized" description="Optimize experience for screen readers" className="border-t border-border">
            <Switch checked={preferences?.screen_reader_optimized ?? false} onCheckedChange={(c: boolean) => updatePreferences({ screen_reader_optimized: c })} />
          </SettingRow>
        </div>
      </SectionCard>
    </div>
  );
}

function SecuritySection({ user, sessions, sessionsLoading, preferences, updatePreferences, revokeSession, revokeAllOtherSessions, onChangePassword, onDeleteAccount, getDeviceIcon }: any) {
  return (
    <div className="space-y-5">
      <SectionCard title="Account Security" description="Manage your security settings">
        <div className="space-y-1">
          <SettingRow label="Two-Factor Authentication" description="Add an extra layer of security to your account">
            <Switch checked={preferences?.two_factor_enabled ?? false} onCheckedChange={(c: boolean) => updatePreferences({ two_factor_enabled: c })} />
          </SettingRow>
          <SettingRow label="Login Alerts" description="Get notified of new logins to your account" className="border-t border-border">
            <Switch checked={preferences?.login_alerts ?? true} onCheckedChange={(c: boolean) => updatePreferences({ login_alerts: c })} />
          </SettingRow>
        </div>
      </SectionCard>

      <SectionCard title="Active Sessions" description="Manage devices logged into your account">
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

      <SectionCard title="Danger Zone" description="Irreversible actions" className="border-destructive/30">
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

function getInitialsFn(name: string) {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}
