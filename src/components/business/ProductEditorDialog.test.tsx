import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductEditorDialog } from './ProductEditorDialog';
const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), upload: vi.fn(), rpc: vi.fn(), close: vi.fn() }));
vi.mock('@/hooks/useMarketplace', () => ({ useProductCategories: () => ({ data: [] }) }));
vi.mock('@/hooks/useBusinessStore', () => ({
  emptyProductDraft: () => ({ name:'',description:'',categoryId:null,tags:'',priceCents:0,fulfillment:'shipping',shippingPriceCents:0,freeShippingThresholdCents:null,inventoryTracking:false,status:'draft',variants:[] }),
  useCreateProduct: () => ({ mutateAsync: mocks.create }), useUpdateProduct: () => ({ mutateAsync: mocks.update }), useUploadProductImage: () => ({ mutateAsync: mocks.upload }),
}));
vi.mock('@/hooks/useBusinessAssetUpload', () => ({ ALLOWED_PRODUCT_TYPES:['image/jpeg'],MAX_BYTES:10485760 }));
vi.mock('@/integrations/supabase/client', () => ({ supabase:{ rpc:mocks.rpc } }));
vi.mock('sonner', () => ({ toast:{error:vi.fn(),success:vi.fn()} }));
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions:{queries:{retry:false}} })}><ProductEditorDialog open onOpenChange={mocks.close} businessId="business-1" product={null} /></QueryClientProvider>); }
beforeEach(() => {
  vi.clearAllMocks(); mocks.rpc.mockImplementation(async name => ({data:name === 'product_media_limit' ? 10 : null,error:null})); mocks.create.mockResolvedValue('product-1'); mocks.update.mockResolvedValue(undefined);
  let n=0; URL.createObjectURL=vi.fn(() => `blob:photo-${++n}`); URL.revokeObjectURL=vi.fn();
});
afterEach(cleanup);
describe('product media workflow', () => {
  it('keeps previews stable, chooses a cover, and retries only failed uploads without creating a duplicate product', async () => {
    mount(); fireEvent.click(screen.getByText('2. Details')); fireEvent.change(screen.getByLabelText('Product name'),{target:{value:'Ceramic mug'}});
    fireEvent.click(screen.getByText('3. Pricing & stock')); fireEvent.change(screen.getByLabelText('Price · USD'),{target:{value:'12.50'}});
    fireEvent.click(screen.getByText('1. Photos')); await screen.findByText(/up to 10 photos/i);
    const first=new File(['a'],'first.jpg',{type:'image/jpeg'}); const second=new File(['b'],'second.jpg',{type:'image/jpeg'});
    fireEvent.change(document.querySelector('input[type="file"]')!,{target:{files:[first,second]}});
    expect(screen.getByAltText('Product photo 1')).toHaveAttribute('src','blob:photo-1');
    fireEvent.click(screen.getByText('Make cover'));
    expect(screen.getByAltText('Product photo 1')).toHaveAttribute('src','blob:photo-2');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    mocks.upload.mockResolvedValueOnce({id:'image-second',url:'https://example.test/second.jpg'}).mockRejectedValueOnce(new Error('Network offline')).mockResolvedValueOnce({id:'image-first',url:'https://example.test/first.jpg'});
    fireEvent.click(screen.getByText('Save draft / changes'));
    await screen.findByText('Network offline'); expect(mocks.close).not.toHaveBeenCalled(); expect(mocks.create).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Retry & save'));
    await waitFor(() => expect(mocks.close).toHaveBeenCalledWith(false));
    expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.upload).toHaveBeenCalledTimes(3);
    expect(mocks.upload.mock.calls[0][0].file).toBe(second); expect(mocks.upload.mock.calls[2][0].file).toBe(first);
    expect(mocks.rpc).toHaveBeenCalledWith('reorder_product_images',{p_product_id:'product-1',p_ids:['image-second','image-first']});
  });
  it('releases temporary previews when removed or unmounted', async () => {
    const view=mount(); await screen.findByText(/up to 10 photos/i);
    fireEvent.change(document.querySelector('input[type="file"]')!,{target:{files:[new File(['a'],'a.jpg',{type:'image/jpeg'}),new File(['b'],'b.jpg',{type:'image/jpeg'})]}});
    fireEvent.click(screen.getByLabelText('Remove photo 1')); await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-1'));
    view.unmount(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:photo-2');
  });
});
