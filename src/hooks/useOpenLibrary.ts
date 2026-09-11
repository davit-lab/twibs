import { useCallback } from 'react';

export function useOpenLibrary() {
  const fetchPdfUrl = useCallback(async (bookKey: string, editionKeys?: string[]): Promise<string | null> => {
    try {
      const editionsRes = await fetch(
        `https://openlibrary.org${bookKey}/editions.json?limit=10`
      );
      if (!editionsRes.ok) return null;

      const editionsData = await editionsRes.json();
      const editions = editionsData.entries || [];

      const publicEdition = editions.find(
        (e: Record<string, unknown>) =>
          e.ebook_access === 'public' || e.ebook_access === 'borrowable'
      );

      if (publicEdition?.ia) {
        return `https://archive.org/download/${publicEdition.ia}/${publicEdition.ia}.pdf`;
      }

      const anyIaEdition = editions.find((e: Record<string, unknown>) => e.ia);
      if (anyIaEdition?.ia) {
        return `https://archive.org/download/${anyIaEdition.ia}/${anyIaEdition.ia}.pdf`;
      }

      if (editionKeys?.length) {
        return `https://archive.org/download/isbn_${editionKeys[0]}/isbn_${editionKeys[0]}.pdf`;
      }

      return null;
    } catch {
      return null;
    }
  }, []);

  return { fetchPdfUrl };
}