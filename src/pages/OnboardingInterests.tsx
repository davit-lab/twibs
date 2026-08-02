import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useInterestCategories, useInterestActions, useHasCompletedOnboarding } from '@/hooks/useInterests';
import InterestCard from '@/components/onboarding/InterestCard';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const MIN_INTERESTS = 3;

export default function OnboardingInterests() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
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

  // Removed handleSkip - interests selection is now mandatory

  if (authLoading || categoriesLoading || checkingOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const canContinue = selectedIds.length >= MIN_INTERESTS;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
            <Sparkles className="h-4 w-4" />
            Personalize Your Feed
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-3">
            What are you interested in?
          </h1>
          <p className="text-muted-foreground text-lg max-w-lg mx-auto">
            Select at least {MIN_INTERESTS} interests to help us personalize your experience
          </p>
        </motion.div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className={cn(
            'text-sm font-medium transition-colors',
            canContinue ? 'text-primary' : 'text-muted-foreground'
          )}>
            {selectedIds.length} / {MIN_INTERESTS} selected
          </div>
          <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min((selectedIds.length / MIN_INTERESTS) * 100, 100)}%`,
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          </div>
        </div>

        {/* Interest Grid */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-10"
        >
          {categories?.map((category, index) => (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
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
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex items-center justify-center"
        >
          <Button
            onClick={handleContinue}
            disabled={!canContinue || saveInterests.isPending}
            className="min-w-[200px]"
          >
            {saveInterests.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </motion.div>

        {/* Hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center text-sm text-muted-foreground mt-8"
        >
          You can always update your interests later in Settings
        </motion.p>
      </div>
    </div>
  );
}
