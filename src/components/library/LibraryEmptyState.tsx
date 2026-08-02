import { Button } from '@/components/ui/button';
import { Library, Plus, FolderPlus, Sparkles } from 'lucide-react';
import UploadItemModal from './UploadItemModal';

interface LibraryEmptyStateProps {
  type: 'explore' | 'my-library' | 'collections';
  searchQuery?: string;
  isLoggedIn: boolean;
  onUploadSuccess?: () => void;
  onCreateCollection?: () => void;
}

export default function LibraryEmptyState({
  type,
  searchQuery,
  isLoggedIn,
  onUploadSuccess,
  onCreateCollection,
}: LibraryEmptyStateProps) {
  const getContent = () => {
    if (searchQuery) {
      return {
        icon: Sparkles,
        title: 'No results found',
        description: 'Try a different search term or browse all items',
        action: null,
      };
    }

    switch (type) {
      case 'explore':
        return {
          icon: Library,
          title: 'The archive awaits',
          description: 'Be the first to contribute to the community archive',
          action: isLoggedIn && onUploadSuccess ? (
            <UploadItemModal onSuccess={onUploadSuccess}>
              <Button className="h-12 px-8 rounded-2xl font-bold shadow-lg shadow-primary/20">
                <Plus className="h-4 w-4 mr-2" />
                Upload First Item
              </Button>
            </UploadItemModal>
          ) : null,
        };
      case 'my-library':
        return {
          icon: Library,
          title: 'Your vault is empty',
          description: 'Upload audio, PDFs, or images to start your collection',
          action: onUploadSuccess ? (
            <UploadItemModal onSuccess={onUploadSuccess}>
              <Button className="h-12 px-8 rounded-2xl font-bold shadow-lg shadow-primary/20">
                <Plus className="h-4 w-4 mr-2" />
                Upload Your First Item
              </Button>
            </UploadItemModal>
          ) : null,
        };
      case 'collections':
        return {
          icon: FolderPlus,
          title: 'No collections yet',
          description: 'Create collections to organize your library',
          action: onCreateCollection ? (
            <Button 
              onClick={onCreateCollection}
              className="h-12 px-8 rounded-2xl font-bold shadow-lg shadow-primary/20"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Collection
            </Button>
          ) : null,
        };
      default:
        return {
          icon: Library,
          title: 'Nothing here',
          description: 'Check back later',
          action: null,
        };
    }
  };

  const content = getContent();
  const Icon = content.icon;

  return (
    <div className="py-24 flex flex-col items-center justify-center text-center animate-in fade-in-50 duration-500">
      <div className="relative mb-8">
        <div className="absolute inset-0 bg-primary/20 blur-3xl opacity-50" />
        <div className="relative w-28 h-28 bg-gradient-to-br from-primary/10 to-primary/5 text-primary/60 rounded-3xl flex items-center justify-center border border-primary/20 shadow-lg shadow-primary/10">
          <Icon className="h-14 w-14" />
        </div>
      </div>
      
      <h3 className="text-3xl font-black text-foreground tracking-tight mb-3">
        {content.title}
      </h3>
      <p className="text-muted-foreground font-medium text-lg max-w-sm leading-relaxed mb-8">
        {content.description}
      </p>
      
      {content.action}
    </div>
  );
}
