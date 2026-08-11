import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/contexts/SystemSettingsContext';
import { useInterestCategories, useInterestActions, useHasCompletedOnboarding } from '@/hooks/useInterests';
import InterestCard from '@/components/onboarding/InterestCard';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const MIN_INTERESTS = 3;

export default function OnboardingInterests() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { isEnabled } = useAppSettings();
  const { data: categories, isLoading: categoriesLoading } = useInterestCategories();
  const { data: hasCompleted, isLoading: checkingOnboarding } = useHasCompletedOnboarding();
  const { saveInterests } = useInterestActions();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  // Redirect if onboarding flow is disabled by the admin
  useEffect(() => {
    if (!authLoading && user && !isEnabled('signup_onboarding_enabled')) {
      navigate('/');
    }
  }, [isEnabled, user, authLoading, navigate]);

  // Redirect if already completed onboarding
  useEffect(() => {
    if (!checkingOnboarding && hasCompleted) {
      navigate('/');
    }
  }, [hasCompleted, checkingOnboarding, navigate]);

  const toggleInterest = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleContinue = async () => {
    await saveInterests.mutateAsync(selectedIds);
    navigate('/');
  };

  if (authLoading || categoriesLoading || checkingOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const canContinue = selectedIds.length >= MIN_INTERESTS;

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Aurora backdrop */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 w-[26rem] h-[26rem] rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute top-24 -right-40 w-[30rem] h-[30rem] rounded-full bg-[#EC4899]/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 w-[24rem] h-[24rem] rounded-full bg-[#06B6D4]/10 blur-3xl" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 pt-12 md:pt-20 pb-44">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="text-center mb-10"
        >
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-[11px] font-bold uppercase tracking-[0.2em] mb-5">
            Welcome
          </span>
          <h1 className="text-4xl md:text-[3.25rem] font-black tracking-tight leading-[1.05] mb-4">
            What are you
            <br className="sm:hidden" /> <span className="text-primary">into?</span>
          </h1>
          <p className="text-muted-foreground text-[15px] font-medium max-w-md mx-auto leading-relaxed">
            Pick a few things you love and we'll build your feed around them.
          </p>
        </motion.header>

        {/* Interest Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {categories?.map((category, index) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 * index, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <InterestCard
                name={category.name}
                icon={category.icon}
                color={category.color}
                selected={selectedIds.includes(category.id)}
                onToggle={() => toggleInterest(category.id)}
              />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Sticky Action Bar */}
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="fixed bottom-0 inset-x-0 z-50 border-t border-border/60 bg-background/80 backdrop-blur-xl"
      >
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-2">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    selectedIds.length > i
                      ? 'w-7 bg-primary'
                      : 'w-5 bg-muted'
                  )}
                />
              ))}
            </div>
            <p
              className={cn(
                'text-xs font-bold tabular-nums transition-colors duration-300',
                canContinue ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              {canContinue ? (
                <span className="inline-flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  {selectedIds.length} selected — ready
                </span>
              ) : (
                `Pick ${MIN_INTERESTS - selectedIds.length} more${selectedIds.length === 0 ? ' to get started' : ''}`
              )}
            </p>
          </div>

          <Button
            onClick={handleContinue}
            disabled={!canContinue || saveInterests.isPending}
            size="lg"
            className={cn(
              'group min-w-[150px] rounded-full transition-all duration-200',
              canContinue && 'shadow-lg shadow-primary/30 hover:shadow-primary/40'
            )}
          >
            {saveInterests.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4 ml-2 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
