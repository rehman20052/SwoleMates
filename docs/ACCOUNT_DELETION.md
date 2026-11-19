# Account deletion deployment

The app opens a dedicated deletion screen from the bottom of Settings. It asks for the main reason, offers “Prefer not to say”, then requests the account password and a final destructive confirmation. Questionnaire answers remain in the screen's memory and are cleared when it closes; they are not retained as analytics. JSON export and diagnostics controls have been removed from Settings, and diagnostics collection is disabled.

The `account-controls.sql` migration is already applied. The remaining server deployment is separate from SQL:

1. Open the project's Supabase dashboard and go to **Edge Functions**.
2. Create a function using the browser editor, named exactly **delete-account**.
3. Replace its `index.ts` with the contents of `supabase/functions/delete-account/index.ts` from this repository and deploy it.
4. The function uses Supabase's server environment variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Do not put the service role key in the web app or in an `EXPO_PUBLIC_` variable.
5. Reopen the app's deletion screen. The capability check enables the confirmation flow only when the endpoint and account-control RPC are reachable.

The server independently verifies the signed-in user, the explicit `DELETE` confirmation and that password authentication returns the same account ID. It removes only media beneath the verified account's UUID path, calls the server-only cleanup RPC, then deletes the Auth user. Other people's private logs remain protected by the cleanup migration.

Use a disposable test account to exercise successful deletion. A wrong password must leave account data intact. Cancellation at every screen must preserve the account. No real account deletion was performed during repository verification.

Supabase's deployment and authentication documentation: https://supabase.com/docs/guides/functions and https://supabase.com/docs/guides/functions/auth-headers
