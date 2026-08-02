import { useState, useEffect, useRef, useCallback } from 'react';
import { useGetPdfAccess } from '@/hooks/useBookPurchase';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, RefreshCw, X, Maximize2, Minimize2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
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

interface PdfViewerProps {
  bookId: string;
  bookTitle: string;
  onClose?: () => void;
}

export default function PdfViewer({ bookId, bookTitle, onClose }: PdfViewerProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [isRendering, setIsRendering] = useState(false);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfJsLoaded, setPdfJsLoaded] = useState(false);
  const [pdfjsLib, setPdfjsLib] = useState<PDFJSStatic | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<PDFRenderTask | null>(null);
  
  const getPdfAccess = useGetPdfAccess();

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
      const result = await getPdfAccess.mutateAsync({ bookId });
      setPdfUrl(result.url);
    } catch (error) {
      console.error('Failed to load PDF:', error);
    }
  }, [bookId, getPdfAccess]);

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
      // Cancel any ongoing render
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
        
        // Set canvas dimensions
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        renderTaskRef.current = page.render(renderContext);
        await renderTaskRef.current.promise;
      } catch (error: unknown) {
        // Ignore cancelled render errors
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

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const goToPreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const zoomIn = () => {
    setScale(Math.min(scale + 0.2, 3));
  };

  const zoomOut = () => {
    setScale(Math.max(scale - 0.2, 0.5));
  };

  // Prevent context menu (right-click)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  if (getPdfAccess.isPending || !pdfJsLoaded) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-muted/50 rounded-lg">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading PDF...</p>
      </div>
    );
  }

  if (getPdfAccess.isError) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-muted/50 rounded-lg">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground mb-4">Failed to load PDF</p>
        <Button onClick={loadPdf} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  if (!pdfUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-muted/50 rounded-lg">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No PDF available</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative bg-background rounded-lg overflow-hidden',
        isFullscreen && 'fixed inset-0 z-50'
      )}
      onContextMenu={handleContextMenu}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/50">
        <h3 className="font-medium truncate">{bookTitle}</h3>
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <Button variant="ghost" size="icon" onClick={zoomOut} disabled={scale <= 0.5}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-[60px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="ghost" size="icon" onClick={zoomIn} disabled={scale >= 3}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          
          <div className="w-px h-6 bg-border mx-1" />
          
          <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* PDF Canvas */}
      <div
        ref={containerRef}
        className={cn(
          'overflow-auto bg-muted/30 flex justify-center',
          isFullscreen ? 'h-[calc(100vh-120px)]' : 'h-[540px]'
        )}
        style={{ userSelect: 'none' }}
      >
        {isRendering && !pdfDoc && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="my-4 shadow-lg"
          style={{ 
            pointerEvents: 'none',
            maxWidth: '100%',
            height: 'auto'
          }}
        />
      </div>

      {/* Footer with page navigation */}
      <div className="flex items-center justify-center gap-4 p-3 border-t bg-muted/50">
        <Button
          variant="outline"
          size="icon"
          onClick={goToPreviousPage}
          disabled={currentPage <= 1 || isRendering}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <span className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPages || '...'}
        </span>
        
        <Button
          variant="outline"
          size="icon"
          onClick={goToNextPage}
          disabled={currentPage >= totalPages || isRendering}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
