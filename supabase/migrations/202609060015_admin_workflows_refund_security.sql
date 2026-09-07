begin;

create or replace function public.open_support_case(case_category text,case_summary text,target_reference_type text default null,target_reference_id uuid default null)
returns uuid language plpgsql security definer set search_path=''
as $$ declare result uuid; clinic uuid;
begin
  if auth.uid() is null then raise exception using errcode='42501',message='SIGN_IN_REQUIRED'; end if;
  if case_category is null or case_category not in ('dispute','refund','moderation','privacy','technical') or char_length(btrim(coalesce(case_summary,''))) not between 5 and 1000 then
    raise exception using errcode='22023',message='CASE_INPUT_INVALID'; end if;
  if target_reference_type='appointment' then
    select a.clinic_id into clinic from public.appointments a where a.id=target_reference_id and (public.owns_patient_profile(a.patient_profile_id) or public.is_admin() or public.has_clinic_role(a.clinic_id,array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]));
    if not found then raise exception using errcode='42501',message='CASE_REFERENCE_DENIED'; end if;
  elsif target_reference_type='review' then
    select r.clinic_id into clinic from public.appointment_reviews r where r.id=target_reference_id and (r.is_visible or public.is_admin() or public.owns_patient_profile(r.patient_profile_id));
    if not found then raise exception using errcode='42501',message='CASE_REFERENCE_DENIED'; end if;
  elsif target_reference_type is not null or target_reference_id is not null then
    raise exception using errcode='22023',message='CASE_REFERENCE_INVALID';
  end if;
  insert into public.support_cases(category,summary,opened_by,clinic_id,reference_type,reference_id)
  values(case_category,btrim(case_summary),auth.uid(),clinic,target_reference_type,target_reference_id) returning id into result;
  perform public.write_audit('support.case_opened','support_case',result::text,jsonb_build_object('category',case_category));
  return result;
end $$;

create or replace function public.update_support_case(target_case_id uuid,next_status public.support_case_status,resolution_note text,assign_to_self boolean,expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path=''
as $$ declare item public.support_cases%rowtype;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='ADMIN_REQUIRED'; end if;
  select * into item from public.support_cases where id=target_case_id for update;
  if not found then raise exception using errcode='22023',message='CASE_NOT_FOUND'; end if;
  if expected_updated_at is null or item.updated_at<>expected_updated_at then raise exception using errcode='40001',message='CASE_CHANGED_REFRESH'; end if;
  if next_status is null or char_length(btrim(coalesce(resolution_note,''))) not between 5 and 2000 then raise exception using errcode='22023',message='CASE_REASON_REQUIRED'; end if;
  update public.support_cases set status=next_status,resolution=btrim(resolution_note),assigned_to=case when assign_to_self then auth.uid() else assigned_to end,
    resolved_at=case when next_status in ('resolved','dismissed') then now() else null end where id=item.id;
  perform public.write_audit('support.case_updated','support_case',item.id::text,jsonb_build_object('from',item.status,'to',next_status,'assigned_to_self',assign_to_self));
end $$;

create or replace function public.moderate_case_review(target_case_id uuid,make_visible boolean,action_reason text)
returns void language plpgsql security definer set search_path=''
as $$ declare item public.support_cases%rowtype;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='ADMIN_REQUIRED'; end if;
  if char_length(btrim(coalesce(action_reason,''))) not between 5 and 2000 or make_visible is null then raise exception using errcode='22023',message='MODERATION_REASON_REQUIRED'; end if;
  select * into item from public.support_cases where id=target_case_id for update;
  if not found or item.category<>'moderation' or item.reference_type<>'review' then raise exception using errcode='22023',message='REVIEW_CASE_REQUIRED'; end if;
  update public.appointment_reviews set is_visible=make_visible where id=item.reference_id;
  if not found then raise exception using errcode='22023',message='REVIEW_NOT_FOUND'; end if;
  insert into public.moderation_actions(case_id,action,target_type,target_id,reason,actor_id)
  values(item.id,case when make_visible then 'restore_review' else 'hide_review' end,'review',item.reference_id,btrim(action_reason),auth.uid());
  perform public.write_audit('support.review_moderated','review',item.reference_id::text,jsonb_build_object('case_id',item.id,'visible',make_visible));
end $$;

create or replace function public.admin_user_roles()
returns table(user_id uuid,role public.app_role) language plpgsql stable security definer set search_path=''
as $$ begin
  if not public.has_role('super_admin') then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED'; end if;
  return query select r.user_id,r.role from public.user_roles r;
end $$;

create or replace function public.revoke_operational_admin(target_user_id uuid,action_reason text)
returns void language plpgsql security definer set search_path=''
as $$ begin
  if not public.has_role('super_admin') then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED'; end if;
  if char_length(btrim(coalesce(action_reason,''))) not between 5 and 500 then raise exception using errcode='22023',message='ROLE_REASON_REQUIRED'; end if;
  if exists(select 1 from public.user_roles where user_id=target_user_id and role='super_admin') then raise exception using errcode='42501',message='SUPER_ADMIN_PROTECTED'; end if;
  delete from public.user_roles where user_id=target_user_id and role='admin';
  if not found then raise exception using errcode='22023',message='ADMIN_ROLE_NOT_FOUND'; end if;
  perform public.write_audit('admin.access_revoked','user',target_user_id::text,jsonb_build_object('reason',btrim(action_reason)));
end $$;

-- Authorization precedes idempotency lookup. Lock the payment before reserving
-- refundable funds so retries cannot disclose another user's refund or overspend.
create or replace function public.prepare_refund(target_payment_id uuid,refund_amount numeric,refund_reason text,request_key text)
returns uuid language plpgsql security definer set search_path=''
as $$ declare payment public.payment_transactions%rowtype; result uuid; existing public.refunds%rowtype; reserved numeric;
begin
  select * into payment from public.payment_transactions where id=target_payment_id for update;
  if not found or (not public.has_clinic_role(payment.clinic_id,array['clinic_owner','clinic_manager']::public.app_role[]) and not public.is_admin()) then raise exception using errcode='42501',message='REFUND_DENIED'; end if;
  if refund_amount is null or refund_amount<=0 or refund_amount::text in ('NaN','Infinity','-Infinity') or char_length(btrim(coalesce(refund_reason,''))) not between 3 and 500 or char_length(coalesce(request_key,'')) not between 12 and 200 then raise exception using errcode='22023',message='REFUND_INPUT_INVALID'; end if;
  select * into existing from public.refunds where idempotency_key=request_key;
  if found then
    if existing.payment_id<>target_payment_id or existing.amount_bdt<>refund_amount or existing.requested_by<>auth.uid() then raise exception using errcode='22023',message='IDEMPOTENCY_KEY_REUSED'; end if;
    return existing.id;
  end if;
  if payment.status not in ('succeeded','partially_refunded') then raise exception using errcode='22023',message='PAYMENT_NOT_REFUNDABLE'; end if;
  select coalesce(sum(amount_bdt),0) into reserved from public.refunds where payment_id=payment.id and status in ('succeeded','pending','created');
  if refund_amount+reserved>payment.amount_bdt then raise exception using errcode='22023',message='REFUND_AMOUNT_INVALID'; end if;
  insert into public.refunds(payment_id,amount_bdt,reason,idempotency_key,requested_by) values(payment.id,refund_amount,btrim(refund_reason),request_key,auth.uid()) returning id into result;
  perform public.write_audit('finance.refund_requested','refund',result::text,jsonb_build_object('payment_id',payment.id,'amount_bdt',refund_amount));
  return result;
end $$;

create or replace function public.refund_execution_context(target_refund_id uuid)
returns table(provider public.payment_provider,provider_payment_id text,amount_bdt numeric,idempotency_key text,status public.payment_state)
language plpgsql stable security definer set search_path=''
as $$ begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED'; end if;
  return query select p.provider,p.provider_payment_id,r.amount_bdt,r.idempotency_key,r.status from public.refunds r join public.payment_transactions p on p.id=r.payment_id where r.id=target_refund_id;
end $$;

revoke all on function public.open_support_case(text,text,text,uuid),public.update_support_case(uuid,public.support_case_status,text,boolean,timestamptz),public.moderate_case_review(uuid,boolean,text),public.admin_user_roles(),public.revoke_operational_admin(uuid,text),public.refund_execution_context(uuid) from public,anon,authenticated;
grant execute on function public.open_support_case(text,text,text,uuid),public.update_support_case(uuid,public.support_case_status,text,boolean,timestamptz),public.moderate_case_review(uuid,boolean,text),public.admin_user_roles(),public.revoke_operational_admin(uuid,text) to authenticated;
grant execute on function public.refund_execution_context(uuid) to service_role;
commit;
