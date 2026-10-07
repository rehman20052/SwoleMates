import { createClient } from "npm:@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
Deno.serve(async request => {
  const respond = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers: { ...cors,"Content-Type":"application/json" } });
  if (request.method === "OPTIONS") return new Response(null,{headers:cors});
  if (request.method !== "POST") return respond(405,{error:"Method not allowed"});
  const url = Deno.env.get("SUPABASE_URL")!;
  const client = createClient(url,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i,"");
  if (!token) return respond(401,{error:"Sign in required"});
  const {data:identity,error:identityError} = await client.auth.getUser(token);
  if (identityError || !identity.user?.email) return respond(401,{error:"Sign in required"});
  let body;
  try { body = await request.json(); } catch { return respond(400,{error:"Invalid request"}); }
  if (body.action === "capabilities") return respond(200,{available:true});
  if (body.confirm !== "DELETE" || typeof body.password !== "string" || body.password.length>256) return respond(400,{error:"Confirmation required"});
  const {data:verified,error:passwordError} = await client.auth.signInWithPassword({email:identity.user.email,password:body.password});
  if (passwordError || verified.user?.id!==identity.user.id) return respond(403,{error:"Password confirmation failed"});
  const admin = createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const owner = identity.user.id;
  try {
    // Only delete object paths within this verified owner's UUID directory.
    const {data:buckets,error:bucketError} = await admin.storage.listBuckets();
    if (bucketError) throw bucketError;
    async function removeDirectory(bucket: string, prefix: string) {
      if (!prefix.startsWith(owner+"/") && prefix!==owner) throw Error("Invalid storage owner");
      while (true) {
        const {data:items,error} = await admin.storage.from(bucket).list(prefix,{limit:100});
        if (error) throw error;
        if (!items?.length) return;
        for (const item of items) {
          const path = `${prefix}/${item.name}`;
          if (!item.id) await removeDirectory(bucket,path);
          else { const {error} = await admin.storage.from(bucket).remove([path]); if (error) throw error; }
        }
      }
    }
    for (const bucket of buckets ?? []) await removeDirectory(bucket.id,owner);
    const {error:cleanupError} = await admin.rpc("remove_account_data",{owner_id:owner});
    if (cleanupError) throw cleanupError;
    const {error:deleteError} = await admin.auth.admin.deleteUser(owner);
    if (deleteError) throw deleteError;
    return respond(200,{deleted:true});
  } catch { return respond(500,{error:"Deletion incomplete; retry safely"}); }
});
