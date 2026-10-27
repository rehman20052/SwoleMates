-- Share only saved routine names and exercise targets with accepted, unblocked partners.
begin;
create or replace function public.partner_workout_routines(person uuid)
returns table(id text, routine jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare r record; draft jsonb; exercise jsonb; targets jsonb; count_sets integer; target_reps integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.match_requests m where m.status='accepted'
      and ((m.from_user_id=auth.uid() and m.to_user_id=person) or (m.to_user_id=auth.uid() and m.from_user_id=person))
      and public.can_contact_match(m.id)
  ) then raise exception 'Not an available partner.' using errcode='42501'; end if;
  for r in select a.record_id,a.payload from public.account_records a
    where a.user_id=person and a.namespace='settings' and not a.deleted and a.record_id like 'workout-plan:%'
    order by a.record_id loop
    begin
      draft := (r.payload->'value'->>'content')::jsonb;
      if length(draft->>'title') not between 1 and 100 or jsonb_typeof(draft->'rows') <> 'array'
        or jsonb_array_length(draft->'rows') not between 1 and 30 then continue; end if;
      targets := '[]'::jsonb;
      for exercise in select value from jsonb_array_elements(draft->'rows') loop
        count_sets := case when jsonb_typeof(exercise->'setValues')='array' and jsonb_array_length(exercise->'setValues')>0
          then jsonb_array_length(exercise->'setValues') else coalesce(nullif(exercise->>'sets','')::integer,1) end;
        target_reps := coalesce(nullif(exercise->'setValues'->0->>'reps','')::integer,nullif(exercise->>'reps','')::integer,8);
        targets := targets || jsonb_build_array(jsonb_build_object('name',case when exercise->>'exercise'='Other' then exercise->>'customName' else exercise->>'exercise' end,'sets',count_sets,'reps',target_reps));
      end loop;
      id := r.record_id; routine := jsonb_build_object('title',draft->>'title','exercises',targets); return next;
    exception when others then continue; -- Ignore malformed legacy templates without exposing raw data.
    end;
  end loop;
end; $$;
revoke all on function public.partner_workout_routines(uuid) from public,anon;
grant execute on function public.partner_workout_routines(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
