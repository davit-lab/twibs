import { Button } from '@/components/ui/button';
import { Library, Plus, FolderPlus, Search } from 'lucide-react';
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
        icon: Search,
        title: 'No results found',
        description: 'Try a different search term or browse all items',
        action: null,
      };
    }

    switch (type) {
      case 'explore':
        return {
          icon: Library,
          title: 'No archived books yet',
          description: 'Be the first to contribute to the community archive',
          action: isLoggedIn && onUploadSuccess ? (
            <UploadItemModal onSuccess={onUploadSuccess}>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Upload First Item
              </Button>
            </UploadItemModal>
          ) : null,
        };
      case 'my-library':
        return {
          icon: Library,
          title: 'Your library is empty',
          description: 'Upload a book or find something worth reading',
          action: onUploadSuccess ? (
            <UploadItemModal onSuccess={onUploadSuccess}>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Upload Your First Book
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
            <Button onClick={onCreateCollection}>
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
    <div className="py-24 flex flex-col items-center justify-center text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-border/60 bg-muted/30 text-primary">
        <Icon className="h-8 w-8" />
      </div>

      <h3 className="text-2xl font-bold text-foreground tracking-tight mb-2">
        {content.title}
      </h3>
      <p className="text-muted-foreground text-base max-w-sm leading-relaxed mb-6">
        {content.description}
      </p>

      {content.action}
    </div>
  );
}
