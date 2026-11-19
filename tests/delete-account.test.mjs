import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function endpoint(options = {}) {
  const calls = []; let handler;
  const owner = '11111111-1111-4111-8111-111111111111';
  let removed = false;
  const client = {
    auth: {
      getUser: async () => ({ data:{user:{id:owner,email:'owner@example.com'}},error:options.invalidToken ? {} : null }),
      signInWithPassword: async () => ({data:{user:{id:options.wrongOwner ? 'another' : owner}},error:options.badPassword ? {} : null}),
    },
    rpc: async () => ({data:!options.missingMigration,error:options.missingMigration ? {} : null}),
  };
  const admin = {
    storage:{
      listBuckets: async () => ({data:[{id:'profile-photos'}],error:null}),
      from: bucket => ({
        list: async prefix => {calls.push(['list',bucket,prefix]);return {data:removed ? [] : [{id:'photo',name:'photo.jpg'}],error:null};},
        remove: async paths => {calls.push(['remove',...paths]);removed=true;return {error:null};},
      }),
    },
    rpc: async (name,args) => {calls.push([name,args.owner_id]);return {error:options.cleanupFails ? {} : null};},
    auth:{admin:{deleteUser: async id => {calls.push(['deleteUser',id]);return {error:null};}}},
  };
  const source = readFileSync('supabase/functions/delete-account/index.ts','utf8').replace(/^import .*\n/, '');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText, {
    Response, createClient: (_url,key) => key==='service' ? admin : client,
    Deno:{env:{get:name => ({SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:options.noServiceKey ? undefined : 'service'})[name]},serve:value => {handler=value;}},
  });
  const request = (body, authenticated=true) => handler(new Request('https://example.com/delete-account',{method:'POST',headers:authenticated ? {Authorization:'Bearer test','Content-Type':'application/json'} : {},body:JSON.stringify(body)}));
  return {request,calls,owner};
}
test('deletion requires authentication, explicit confirmation and the matching password owner', async () => {
  for (const [options,body,authenticated,status] of [
    [{},{password:'password',confirm:'DELETE'},false,401],
    [{},{password:'password'},true,400],
    [{badPassword:true},{password:'password',confirm:'DELETE'},true,403],
    [{wrongOwner:true},{password:'password',confirm:'DELETE'},true,403],
  ]) {
    const api=endpoint(options); assert.equal((await api.request(body,authenticated)).status,status);assert.equal(api.calls.length,0);
  }
});
test('capabilities check migration and server credentials without deleting data', async () => {
  const available=endpoint(); assert.equal((await (await available.request({action:'capabilities'})).json()).available,true);assert.equal(available.calls.length,0);
  const missing=endpoint({missingMigration:true});assert.equal((await (await missing.request({action:'capabilities'})).json()).available,false);
  assert.equal((await endpoint({noServiceKey:true}).request({action:'capabilities'})).status,503);
});
test('deletion removes only verified owner media, cleans records before deleting Auth', async () => {
  const api=endpoint(); const response=await api.request({password:'password',confirm:'DELETE'});
  assert.equal(response.status,200); assert.equal((await response.json()).deleted,true);
  assert.deepEqual(api.calls.filter(call => call[0]==='remove'),[['remove',`${api.owner}/photo.jpg`]]);
  assert.deepEqual(api.calls.slice(-2),[['remove_account_data',api.owner],['deleteUser',api.owner]]);
});
test('cleanup failure does not delete the Auth account or disclose server details', async () => {
  const api=endpoint({cleanupFails:true});const response=await api.request({password:'password',confirm:'DELETE'});
  assert.equal(response.status,500); assert.equal(api.calls.some(call=>call[0]==='deleteUser'),false);
  assert.deepEqual(await response.json(),{error:'Deletion incomplete; retry safely'});
});
