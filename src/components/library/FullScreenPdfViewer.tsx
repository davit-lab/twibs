import { useState, useEffect, useRef, useCallback } from 'react';
import { useGetPdfAccess } from '@/hooks/useBookPurchase';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { 
  Loader2, 
  FileText, 
  RefreshCw, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut,
  RotateCw,
  BookOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';

// PDF.js types
interface PDFDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PDFPageProxy>;
}

interface PDFPageProxy {
  getViewport: (params: { scale: number }) => PDFViewport;
  render: (params: { canvasContext: CanvasRenderingContext2D; viewport: PDFViewport }) => PDFRenderTask;
}

interface PDFViewport {
  width: number;
  height: number;
}

interface PDFRenderTask {
  promise: Promise<void>;
  cancel: () => void;
}

interface PDFJSStatic {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (params: { url: string }) => { promise: Promise<PDFDocumentProxy> };
}

// Load PDF.js from CDN
const loadPdfJs = (): Promise<PDFJSStatic> => {
  return new Promise((resolve, reject) => {
    if ((window as unknown as { pdfjsLib?: PDFJSStatic }).pdfjsLib) {
      resolve((window as unknown as { pdfjsLib: PDFJSStatic }).pdfjsLib);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      const pdfjsLib = (window as unknown as { pdfjsLib: PDFJSStatic }).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(pdfjsLib);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

interface FullScreenPdfViewerProps {
  bookId: string;
  bookTitle: string;
  pdfUrl?: string;
  onClose: () => void;
}

export default function FullScreenPdfViewer({ bookId, bookTitle, pdfUrl: externalPdfUrl, onClose }: FullScreenPdfViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [isRendering, setIsRendering] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false);
  const [pdfjsLib, setPdfjsLib] = useState<PDFJSStatic | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<PDFRenderTask | null>(null);
  
  const getPdfAccess = useGetPdfAccess();

  // Prevent body scroll when mounted
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  // Load PDF.js library
  useEffect(() => {
    loadPdfJs()
      .then((lib) => {
        setPdfjsLib(lib);
        setPdfJsLoaded(true);
      })
      .catch((error) => {
        console.error('Failed to load PDF.js:', error);
      });
  }, []);

  const loadPdf = useCallback(async () => {
    try {
      if (externalPdfUrl) {
        setPdfUrl(externalPdfUrl);
        return;
      }
      const result = await getPdfAccess.mutateAsync({ bookId });
      setPdfUrl(result.url);
    } catch (error) {
      console.error('Failed to load PDF:', error);
    }
  }, [bookId, getPdfAccess, externalPdfUrl]);

  useEffect(() => {
    loadPdf();
  }, [bookId]);

  // Load PDF document when URL and library are available
  useEffect(() => {
    if (!pdfUrl || !pdfJsLoaded || !pdfjsLib) return;

    const loadDocument = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
        const doc = await loadingTask.promise;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setCurrentPage(1);
      } catch (error) {
        console.error('Failed to load PDF document:', error);
      }
    };

    loadDocument();
  }, [pdfUrl, pdfJsLoaded, pdfjsLib]);

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const renderPage = async () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      setIsRendering(true);

      try {
        const page = await pdfDoc.getPage(currentPage);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        const viewport = page.getViewport({ scale });
        
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        renderTaskRef.current = page.render(renderContext);
        await renderTaskRef.current.promise;
      } catch (error: unknown) {
        if (error instanceof Error && !error.message.includes('cancelled')) {
          console.error('Failed to render page:', error);
        }
      } finally {
        setIsRendering(false);
      }
    };

    renderPage();

    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, currentPage, scale]);

  const goToPreviousPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  const handlePageInput = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const zoomIn = () => setScale(Math.min(scale + 0.25, 4));
  const zoomOut = () => setScale(Math.max(scale - 0.25, 0.5));
  const resetZoom = () => setScale(1.5);

  const handleContextMenu = (e: React.MouseEvent) => e.preventDefault();

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goToPreviousPage();
      if (e.key === 'ArrowRight') goToNextPage();
      if (e.key === '+' || e.key === '=') zoomIn();
      if (e.key === '-') zoomOut();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, scale]);

  if (getPdfAccess.isPending || !pdfJsLoaded) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Loading book...</p>
      </div>
    );
  }

  if (getPdfAccess.isError) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center">
        <FileText className="h-16 w-16 text-muted-foreground mb-4" />
        <p className="text-lg text-muted-foreground mb-4">Failed to load book</p>
        <div className="flex gap-3">
          <Button onClick={loadPdf} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button onClick={onClose} variant="ghost">
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="fixed inset-0 z-50 bg-background flex flex-col"
      onContextMenu={handleContextMenu}
    >
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-card/80 ">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h1 className="font-semibold text-lg truncate max-w-[300px]">{bookTitle}</h1>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[50px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={zoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={resetZoom}>
            <RotateCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Page Info */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Page</span>
            <input
              type="number"
              value={currentPage}
              onChange={(e) => handlePageInput(parseInt(e.target.value) || 1)}
              className="w-14 h-8 text-center bg-muted/50 border rounded-md text-foreground"
              min={1}
              max={totalPages}
            />
            <span>of {totalPages}</span>
          </div>
        </div>
      </div>

      {/* PDF Viewer */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-muted/20 flex justify-center items-start py-6"
        style={{ userSelect: 'none' }}
      >
        {isRendering && !pdfDoc && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="shadow-2xl rounded-sm"
          style={{ 
            pointerEvents: 'none',
            maxWidth: '100%',
            height: 'auto'
          }}
        />
      </div>

      {/* Bottom Navigation */}
      <div className="flex items-center justify-center gap-6 py-4 border-t bg-card/80 ">
        <Button
          variant="outline"
          size="lg"
          onClick={goToPreviousPage}
          disabled={currentPage <= 1 || isRendering}
          className="gap-2"
        >
          <ChevronLeft className="h-5 w-5" />
          Previous
        </Button>

        {/* Page Slider */}
        <div className="flex items-center gap-4 min-w-[300px]">
          <Slider
            value={[currentPage]}
            onValueChange={([value]) => setCurrentPage(value)}
            min={1}
            max={totalPages || 1}
            step={1}
            className="w-full"
          />
        </div>
        
        <Button
          variant="outline"
          size="lg"
          onClick={goToNextPage}
          disabled={currentPage >= totalPages || isRendering}
          className="gap-2"
        >
          Next
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
