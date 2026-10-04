// Explicit live integration test: creates and removes only disposable test users.
// Run with SUPABASE_URL, SUPABASE_SECRET_KEY and SUPABASE_PUBLISHABLE_KEY set.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

if (process.env.MODOLOUGE_AUTH_TEST !== '1') {
  throw new Error('Set MODOLOUGE_AUTH_TEST=1 to run the live account-link test.');
}
const { SUPABASE_URL: url, SUPABASE_SECRET_KEY: secret, SUPABASE_PUBLISHABLE_KEY: publicKey } = process.env;
assert.ok(url && secret && publicKey, 'All three Supabase environment variables are required');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const server = createClient(url, secret, options);
const browser = createClient(url, publicKey, options);
const email = `account-link-test-${randomUUID()}@example.invalid`;
const password = randomUUID() + randomUUID();
const guestId = randomUUID();
let userId, accessToken;
const checked = ({data,error}) => { if(error) throw error; return data; };
try {
  userId = checked(await server.auth.admin.createUser({email,password,email_confirm:false})).user.id;
  const unverified = await server.rpc('modolouge_link_account', {p_auth_id:userId,p_guest:null});
  assert.match(unverified.error?.message || '', /VERIFIED_EMAIL_REQUIRED/);
  assert.equal(checked(await server.from('modolouge_people').select('id').eq('id',userId)).length,0);

  // This confirms only the disposable .invalid test identity, never a real user.
  checked(await server.auth.admin.updateUserById(userId,{email_confirm:true}));
  checked(await server.from('modolouge_people').insert({id:guestId,kind:'guest'}));
  assert.equal(checked(await server.rpc('modolouge_link_account',{p_auth_id:userId,p_guest:guestId})),userId);
  assert.equal(checked(await server.rpc('modolouge_link_account',{p_auth_id:userId,p_guest:guestId})),userId);
  const profile = checked(await server.from('modolouge_people').select('email,kind,auth_user_id').eq('id',userId).single());
  assert.deepEqual(profile,{email,kind:'member',auth_user_id:userId});
  assert.equal(checked(await server.from('modolouge_people').select('linked_to').eq('id',guestId).single()).linked_to,userId);

  const anonymous = await browser.rpc('modolouge_link_account',{p_auth_id:userId,p_guest:null});
  assert.equal(anonymous.error?.code,'42501');
  const signedIn = checked(await browser.auth.signInWithPassword({email,password}));
  accessToken = signedIn.session.access_token;
  const authenticated = await browser.rpc('modolouge_link_account',{p_auth_id:userId,p_guest:null});
  assert.equal(authenticated.error?.code,'42501');
  const privateData = await browser.from('modolouge_people').select('id');
  assert.equal(privateData.error?.code,'42501');
  console.log(JSON.stringify({unverifiedAccount:'rejected',verifiedAccount:'linked',guestConversion:'preserved',repeatLink:'idempotent',anonymousRPC:'denied',authenticatedRPC:'denied',privateData:'denied'}));
} finally {
  if (accessToken) checked(await server.auth.admin.signOut(accessToken,'global'));
  checked(await server.from('modolouge_people').delete().eq('id',guestId));
  if (userId) {
    checked(await server.from('modolouge_people').delete().eq('id',userId));
    checked(await server.auth.admin.deleteUser(userId));
  }
  console.log('Disposable account-link test fixtures removed.');
}
