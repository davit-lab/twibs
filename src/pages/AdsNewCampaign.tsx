import { useNavigate, useParams } from 'react-router-dom';
import MainLayout from '@/components/layout/MainLayout';
import CampaignWizard from '@/components/ads/CampaignWizard';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

export default function AdsNewCampaign() {
  const navigate = useNavigate();
  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 mb-4"
          onClick={() => navigate('/ads')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to campaigns
        </Button>
        <CampaignWizard />
      </div>
    </MainLayout>
  );
}

export function AdsBoostPost() {
  const navigate = useNavigate();
  const { postId } = useParams<{ postId: string }>();
  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 mb-4"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <CampaignWizard postId={postId} />
      </div>
    </MainLayout>
  );
}
