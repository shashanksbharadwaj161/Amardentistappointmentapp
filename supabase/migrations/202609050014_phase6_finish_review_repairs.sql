begin;

create or replace function public.enforce_ai_feature_flags()
returns trigger language plpgsql security definer set search_path=''
as $$
declare audience_flag text;
begin
  audience_flag:=case when new.audience='patient' then 'patient_ai' else 'dentist_ai' end;
  if not coalesce((select enabled from public.feature_flags where flag_key=audience_flag),false) then
    raise exception using errcode='22023',message='AI_FEATURE_DISABLED';
  end if;
  if new.task_type='xray_observation' and not coalesce((select enabled from public.feature_flags where flag_key='experimental_xray_ai'),false) then
    raise exception using errcode='22023',message='AI_XRAY_FEATURE_DISABLED';
  end if;
  return new;
end $$;

drop trigger if exists ai_tasks_enforce_feature_flags on public.ai_tasks;
create trigger ai_tasks_enforce_feature_flags before insert on public.ai_tasks for each row execute function public.enforce_ai_feature_flags();

create or replace function public.ai_daily_limit(actor uuid,target_audience public.ai_task_audience)
returns integer language plpgsql stable security definer set search_path=''
as $$
declare limits public.platform_usage_limits%rowtype; paid boolean;
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED'; end if;
  select * into limits from public.platform_usage_limits where limit_key=case when target_audience='patient' then 'patient_ai_daily' else 'dentist_ai_daily' end;
  if not found then raise exception using errcode='22023',message='AI_LIMIT_NOT_CONFIGURED'; end if;
  select exists(
    select 1 from public.user_subscriptions s
    join public.subscription_plans p on p.id=s.plan_id and p.active
    where s.status in ('trialing','active','grace_period')
      and coalesce(s.expires_at,s.current_period_end,'infinity'::timestamptz)>now()
      and ((target_audience='patient' and s.user_id=actor and p.tier='patient_plus')
        or (target_audience='dentist' and p.tier='clinic_pro' and exists(
          select 1 from public.clinic_memberships m where m.clinic_id=s.clinic_id and m.user_id=actor and m.status='active'
        )))
  ) into paid;
  return case when paid then limits.paid_value else limits.free_value end;
end $$;

create or replace function public.apply_reviewed_ai_task(target_task_id uuid,target_reviewed_fields jsonb,target_final_output jsonb,change_summary text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare task public.ai_tasks%rowtype; encounter public.clinical_encounters%rowtype; prescription_id uuid;
begin
  select * into task from public.ai_tasks where id=target_task_id for update;
  if not found then raise exception using errcode='42501',message='AI_REVIEW_DENIED'; end if;
  perform public.review_ai_task(target_task_id,target_reviewed_fields,target_final_output,change_summary);
  if task.task_type='clinical_note' then
    select * into encounter from public.clinical_encounters where id=task.encounter_id for update;
    perform public.save_clinical_encounter(
      task.encounter_id,encounter.chief_complaint,
      coalesce(target_final_output->>'subjective',''),coalesce(target_final_output->>'objective',''),
      coalesce(target_final_output->>'assessment',''),coalesce(target_final_output->>'plan',''),
      'Dentist-reviewed AI draft applied'
    );
  elsif task.task_type='prescription' and jsonb_typeof(target_final_output->'items')='array' and jsonb_array_length(target_final_output->'items')>0 then
    prescription_id:=public.save_prescription_draft(task.encounter_id,null,coalesce(target_final_output->>'rationale',''),target_final_output->'items','Dentist-reviewed AI prescription draft applied');
  end if;
  return prescription_id;
end $$;

create or replace function public.claim_notification_batch(batch_size integer default 25)
returns setof public.notification_outbox language plpgsql security definer set search_path=''
as $$
begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED'; end if;
  return query
  with candidates as (
    select id from public.notification_outbox
    where channel<>'in_app'
      and ((status in ('queued','failed') and next_attempt_at<=now()) or (status='processing' and updated_at<=now()-interval '5 minutes'))
      and attempt_count<12
    order by created_at for update skip locked limit least(greatest(batch_size,1),100)
  )
  update public.notification_outbox n set status='processing',attempt_count=n.attempt_count+1,updated_at=now()
  from candidates c where n.id=c.id returning n.*;
end $$;

revoke all on function public.ai_daily_limit(uuid,public.ai_task_audience),public.apply_reviewed_ai_task(uuid,jsonb,jsonb,text) from public,anon,authenticated;
grant execute on function public.ai_daily_limit(uuid,public.ai_task_audience) to service_role;
grant execute on function public.apply_reviewed_ai_task(uuid,jsonb,jsonb,text) to authenticated;
revoke execute on function public.review_ai_task(uuid,jsonb,jsonb,text) from authenticated;

insert into public.audit_logs(actor_id,action,target_type,target_id,metadata)
values(null,'platform.phase6_finish_review_repaired','migration','202609050014',jsonb_build_object('feature_flags',true,'quota_enforcement',true,'atomic_ai_apply',true,'notification_lease',true));

commit;
