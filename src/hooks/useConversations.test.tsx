import { renderHook, waitFor, act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useConversations } from './useConversations';
const fixture=vi.hoisted(() => ({ identity:{type:'personal',businessId:null as string|null},user:{id:'owner'},rpc:vi.fn(),rows:[] as unknown[] }));
vi.mock('@/contexts/AuthContext',() => ({useAuth:() => ({user:fixture.user})}));
vi.mock('@/contexts/ActiveIdentityContext',() => ({useActiveIdentity:() => ({identity:fixture.identity})}));
vi.mock('@/integrations/supabase/client',() => ({supabase:{rpc:fixture.rpc,from:() => ({select:() => ({in:(_column:string,ids:string[]) => ({order:async () => ({data:fixture.rows.filter((r:{id:string}) => ids.includes(r.id)),error:null})})})}),channel:() => {const channel={on:() => channel,subscribe:() => channel};return channel;},removeChannel:vi.fn()}}));
const profile=(name:string) => ({username:name,display_name:name,avatar_url:null,is_verified:false,last_seen_at:null});
const participant=(id:string,role='member') => ({user_id:id,business_id:null,role,muted:false,last_read_at:null,is_typing:false,profiles:profile(id)});
beforeEach(() => { fixture.identity={type:'personal',businessId:null};fixture.rpc.mockReset();fixture.rows=[{id:'personal-chat',type:'dm',business_id:null,conversation_participants:[participant('owner'),participant('friend')],business:null},{id:'business-chat',type:'business',business_id:'shop',conversation_participants:[participant('owner','owner'),participant('customer')],business:{id:'shop',name:'Studio',username:'studio',avatar_url:null,category:null}}]; });afterEach(cleanup);
describe('conversation identity isolation',() => {
 it('hides the old inbox immediately and shows the customer in the business inbox',async () => {
  fixture.rpc.mockResolvedValueOnce({data:[{conversation_id:'personal-chat',last_message:null,unread_count:0}],error:null});
  const {result,rerender}=renderHook(() => useConversations());await waitFor(() => expect(result.current.conversations[0]?.id).toBe('personal-chat'));
  let resolve:(value:unknown)=>void;fixture.rpc.mockImplementationOnce(() => new Promise(r => {resolve=r;}));fixture.identity={type:'business',businessId:'shop'};rerender();expect(result.current.conversations).toEqual([]);
  await act(async () => resolve!({data:[{conversation_id:'business-chat',last_message:null,unread_count:1}],error:null}));
  await waitFor(() => expect(result.current.conversations[0]?.party.name).toBe('customer'));
  expect(result.current.conversations[0].party.kind).toBe('user');expect(fixture.rpc).toHaveBeenLastCalledWith('get_identity_conversation_summaries',{p_business_id:'shop'});
 });
 it('does not fetch a personal inbox while a business identity is still resolving',async () => {fixture.identity={type:'business',businessId:null};const {result}=renderHook(() => useConversations());expect(result.current.conversations).toEqual([]);expect(fixture.rpc).not.toHaveBeenCalled();});
 it('keeps a customer business thread in the personal inbox', async () => {
  fixture.rpc.mockResolvedValueOnce({data:[{conversation_id:'business-chat',last_message:null,unread_count:0}],error:null});
  const { result } = renderHook(() => useConversations());
  await waitFor(() => expect(result.current.conversations.map(c => c.id)).toEqual(['business-chat']));
  expect(result.current.conversations[0].party.kind).toBe('business');
  expect(result.current.conversations[0].party.name).toBe('Studio');
 });
});
