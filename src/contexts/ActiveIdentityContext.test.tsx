import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { BusinessProvider } from './BusinessContext';
import { ActiveIdentityProvider, useActiveIdentity } from './ActiveIdentityContext';
const fixture=vi.hoisted(() => ({ user:{id:'owner'},profile:{id:'profile-owner',user_id:'owner',username:'personal',display_name:'Personal',avatar_url:null,is_verified:false}, api:{listBusinessAccounts:vi.fn()} }));
vi.mock('./AuthContext',() => ({useAuth:() => ({user:fixture.user,profile:fixture.profile})}));
vi.mock('@/hooks/useBusinessApi',() => ({useBusinessApi:() => fixture.api}));
function Screen() { const {identity,switchToBusiness,switchToPersonal}=useActiveIdentity(); return <><output>{identity.type}:{identity.profile?.display_name}</output><button onClick={() => switchToBusiness('shop')}>Business</button><button onClick={switchToPersonal}>Personal</button><button onClick={() => switchToBusiness('unauthorized')}>Invalid</button></>; }
function mount() {return render(<QueryClientProvider client={new QueryClient()}><BusinessProvider><ActiveIdentityProvider><Screen /></ActiveIdentityProvider></BusinessProvider></QueryClientProvider>);}
beforeEach(() => { localStorage.clear();fixture.api.listBusinessAccounts.mockResolvedValue([{id:'shop',name:'Studio',username:'studio',role:'owner',avatar_url:null}]); });afterEach(cleanup);
describe('active identity',() => {
 it('restores legacy JSON storage and uses the business profile without competing storage writers',async () => {localStorage.setItem('twibs-active-identity-owner',JSON.stringify({type:'business',businessId:'shop'}));mount();await screen.findByText('business:Studio');fireEvent.click(screen.getByText('Personal'));await screen.findByText('personal:Personal');expect(localStorage.getItem('twibs-active-identity-owner')).toBe('personal');fireEvent.click(screen.getByText('Business'));await screen.findByText('business:Studio');expect(localStorage.getItem('twibs-active-identity-owner')).toBe('shop');});
 it('rejects switching to an identity absent from membership',async () => {mount();await waitFor(() => expect(fixture.api.listBusinessAccounts).toHaveBeenCalled());fireEvent.click(screen.getByText('Invalid'));expect(screen.getByText('personal:Personal')).toBeInTheDocument();});
});
