begin;

create type public.payment_provider as enum ('bkash','nagad');
create type public.payment_state as enum ('created','pending','succeeded','failed','refunded','partially_refunded');
create type public.invoice_state as enum ('draft','issued','partially_paid','paid','void');
create type public.stock_movement_type as enum ('receipt','consumption','adjustment_in','adjustment_out','expiry','return');
create type public.purchase_order_state as enum ('draft','ordered','partially_received','received','cancelled');
create type public.lab_case_state as enum ('created','sent','in_progress','quality_check','ready','delivered','cancelled');
create type public.subscription_state as enum ('trialing','active','grace_period','cancelled','expired','billing_issue');
create type public.subscription_tier as enum ('patient_plus','clinic_pro');

create table public.platform_commission_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid references public.clinics(id) on delete cascade,
  rate_percent numeric(5,2) not null check(rate_percent between 0 and 100),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check(effective_until is null or effective_until>effective_from)
);
create unique index commission_one_active_platform on public.platform_commission_rules((clinic_id is null)) where clinic_id is null and effective_until is null;
create unique index commission_one_active_clinic on public.platform_commission_rules(clinic_id) where clinic_id is not null and effective_until is null;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_profile_id uuid references public.patient_profiles(id) on delete restrict,
  appointment_id uuid references public.appointments(id) on delete restrict,
  status public.invoice_state not null default 'draft',
  subtotal_bdt numeric(12,2) not null default 0 check(subtotal_bdt>=0),
  discount_bdt numeric(12,2) not null default 0 check(discount_bdt>=0),
  total_bdt numeric(12,2) not null default 0 check(total_bdt>=0),
  paid_bdt numeric(12,2) not null default 0 check(paid_bdt>=0),
  balance_bdt numeric(12,2) generated always as (greatest(total_bdt-paid_bdt,0)) stored,
  issued_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(discount_bdt<=subtotal_bdt), check(paid_bdt<=total_bdt)
);
create table public.invoice_items (
  id uuid primary key default gen_random_uuid(), invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null check(char_length(btrim(description)) between 1 and 500), quantity numeric(12,3) not null check(quantity>0),
  unit_price_bdt numeric(12,2) not null check(unit_price_bdt>=0), line_total_bdt numeric(12,2) generated always as (quantity*unit_price_bdt) stored,
  created_at timestamptz not null default now()
);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(), provider public.payment_provider not null, appointment_id uuid references public.appointments(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete restrict, patient_profile_id uuid not null references public.patient_profiles(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict, amount_bdt numeric(12,2) not null check(amount_bdt>0), currency text not null default 'BDT' check(currency='BDT'),
  status public.payment_state not null default 'created', provider_payment_id text, provider_checkout_url text,
  idempotency_key text not null unique, provider_payload jsonb not null default '{}'::jsonb, confirmed_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(appointment_id is not null or invoice_id is not null), unique(provider,provider_payment_id)
);
create index payment_transactions_reconcile_idx on public.payment_transactions(provider,status,created_at);

create table public.payment_webhook_events (
  id bigint generated always as identity primary key, provider public.payment_provider not null, provider_event_id text not null,
  signature_digest text not null, payload jsonb not null, processed_at timestamptz, processing_error text, received_at timestamptz not null default now(),
  unique(provider,provider_event_id)
);
create table public.refunds (
  id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.payment_transactions(id) on delete restrict,
  amount_bdt numeric(12,2) not null check(amount_bdt>0), reason text not null check(char_length(btrim(reason)) between 3 and 500),
  status public.payment_state not null default 'created', provider_refund_id text, idempotency_key text not null unique, provider_payload jsonb not null default '{}'::jsonb,
  requested_by uuid not null references auth.users(id) on delete restrict, confirmed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(payment_id,provider_refund_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade,
  category text not null check(char_length(btrim(category)) between 1 and 100), description text not null check(char_length(btrim(description)) between 1 and 500),
  amount_bdt numeric(12,2) not null check(amount_bdt>0), incurred_on date not null, recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.clinic_ledger_entries (
  id bigint generated always as identity primary key, clinic_id uuid not null references public.clinics(id) on delete restrict,
  entry_type text not null check(entry_type in ('payment','commission','refund','payout','adjustment')),
  payment_id uuid references public.payment_transactions(id) on delete restrict, refund_id uuid references public.refunds(id) on delete restrict,
  amount_bdt numeric(12,2) not null check(amount_bdt<>0), description text not null, created_at timestamptz not null default now()
);
create table public.clinic_payouts (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete restrict,
  amount_bdt numeric(12,2) not null check(amount_bdt>0), status text not null default 'pending' check(status in ('pending','processing','paid','failed')),
  period_start date not null, period_end date not null, provider_reference text, requested_by uuid not null references auth.users(id) on delete restrict,
  paid_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(period_end>=period_start)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check(char_length(btrim(name)) between 1 and 300), phone text not null default '', email text not null default '', address text not null default '', active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), unique(clinic_id,name)
);
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade, sku text not null,
  name text not null check(char_length(btrim(name)) between 1 and 300), unit text not null check(char_length(btrim(unit)) between 1 and 40),
  reorder_level numeric(14,3) not null default 0 check(reorder_level>=0), active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(clinic_id,sku)
);
create table public.inventory_lots (
  id uuid primary key default gen_random_uuid(), item_id uuid not null references public.inventory_items(id) on delete cascade,
  lot_number text not null, expires_on date, received_on date not null default current_date,
  on_hand numeric(14,3) not null default 0 check(on_hand>=0), unit_cost_bdt numeric(12,2) check(unit_cost_bdt is null or unit_cost_bdt>=0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(item_id,lot_number)
);
create table public.stock_movements (
  id bigint generated always as identity primary key, clinic_id uuid not null references public.clinics(id) on delete restrict,
  item_id uuid not null references public.inventory_items(id) on delete restrict, lot_id uuid not null references public.inventory_lots(id) on delete restrict,
  movement_type public.stock_movement_type not null, quantity numeric(14,3) not null check(quantity>0), signed_quantity numeric(14,3) not null,
  reason text not null check(char_length(btrim(reason)) between 3 and 500), reference_type text not null default '', reference_id uuid,
  recorded_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now()
);
create index inventory_lots_expiry_idx on public.inventory_lots(expires_on) where on_hand>0;

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade, supplier_id uuid not null references public.suppliers(id) on delete restrict,
  order_number text not null, status public.purchase_order_state not null default 'draft', ordered_on date, expected_on date, notes text not null default '',
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(clinic_id,order_number)
);
create table public.purchase_order_items (
  id uuid primary key default gen_random_uuid(), purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete restrict, quantity_ordered numeric(14,3) not null check(quantity_ordered>0),
  quantity_received numeric(14,3) not null default 0 check(quantity_received between 0 and quantity_ordered), unit_cost_bdt numeric(12,2) not null check(unit_cost_bdt>=0), unique(purchase_order_id,inventory_item_id)
);

create table public.lab_vendors (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null check(char_length(btrim(name)) between 1 and 300), phone text not null default '', email text not null default '', address text not null default '', active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), unique(clinic_id,name)
);
create table public.lab_cases (
  id uuid primary key default gen_random_uuid(), case_number text not null unique, clinic_id uuid not null references public.clinics(id) on delete restrict,
  patient_profile_id uuid not null references public.patient_profiles(id) on delete restrict, encounter_id uuid references public.clinical_encounters(id) on delete restrict,
  vendor_id uuid not null references public.lab_vendors(id) on delete restrict, case_type text not null check(char_length(btrim(case_type)) between 1 and 200),
  status public.lab_case_state not null default 'created', due_date date not null, cost_bdt numeric(12,2) not null default 0 check(cost_bdt>=0),
  invoice_id uuid references public.invoices(id) on delete restrict, notes text not null default '', delivered_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.lab_case_events (
  id bigint generated always as identity primary key, lab_case_id uuid not null references public.lab_cases(id) on delete cascade,
  from_status public.lab_case_state, to_status public.lab_case_state not null, notes text not null default '', changed_by uuid not null references auth.users(id) on delete restrict, changed_at timestamptz not null default now()
);
create table public.lab_case_attachments (
  id uuid primary key default gen_random_uuid(), lab_case_id uuid not null references public.lab_cases(id) on delete cascade,
  storage_path text not null unique, filename text not null, content_type text not null, byte_size bigint not null check(byte_size between 1 and 20971520),
  uploaded_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now()
);

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(), external_product_id text not null unique, tier public.subscription_tier not null, name_en text not null, name_bn text not null,
  price_bdt numeric(12,2) not null check(price_bdt>=0), billing_period text not null check(billing_period in ('monthly','annual')),
  quotas jsonb not null default '{}'::jsonb check(jsonb_typeof(quotas)='object'), entitlements text[] not null default '{}', active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, clinic_id uuid references public.clinics(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict, revenuecat_app_user_id text not null, revenuecat_entitlement_id text not null,
  status public.subscription_state not null, current_period_start timestamptz, current_period_end timestamptz, cancelled_at timestamptz, expires_at timestamptz,
  original_transaction_id text not null, environment text not null check(environment in ('sandbox','production')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(original_transaction_id)
);
create table public.subscription_webhook_events (
  id bigint generated always as identity primary key, event_id text not null unique, event_type text not null, app_user_id text not null,
  payload jsonb not null, processed_at timestamptz, processing_error text, received_at timestamptz not null default now()
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('lab-attachments','lab-attachments',false,20971520,array['image/jpeg','image/png','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create sequence public.invoice_number_seq start 1000;
create sequence public.lab_case_number_seq start 1000;

create or replace function public.active_commission_rate(target_clinic_id uuid) returns numeric language sql stable security definer set search_path=''
as $$ select coalesce((select rate_percent from public.platform_commission_rules where clinic_id=target_clinic_id and effective_from<=now() and (effective_until is null or effective_until>now()) order by effective_from desc limit 1),(select rate_percent from public.platform_commission_rules where clinic_id is null and effective_from<=now() and (effective_until is null or effective_until>now()) order by effective_from desc limit 1),0); $$;

create or replace function public.validate_subscription_scope() returns trigger language plpgsql set search_path=''
as $$ declare plan_tier public.subscription_tier; begin
  select tier into plan_tier from public.subscription_plans where id=new.plan_id;
  if plan_tier='clinic_pro' and new.clinic_id is null then raise exception using errcode='23514',message='CLINIC_SUBSCRIPTION_REQUIRES_CLINIC'; end if;
  if plan_tier='patient_plus' and new.clinic_id is not null then raise exception using errcode='23514',message='PATIENT_SUBSCRIPTION_CANNOT_HAVE_CLINIC'; end if;
  return new;
end $$;

create or replace function public.prepare_payment_checkout(target_appointment_id uuid,target_provider public.payment_provider,request_key text)
returns table(payment_id uuid,amount_bdt numeric,currency text) language plpgsql security definer set search_path=''
as $$ declare appointment public.appointments%rowtype; existing public.payment_transactions%rowtype; begin
  if char_length(btrim(request_key))<12 then raise exception using errcode='22023',message='IDEMPOTENCY_KEY_INVALID'; end if;
  select * into existing from public.payment_transactions where idempotency_key=request_key;
  if found then
    if existing.appointment_id<>target_appointment_id or existing.provider<>target_provider then raise exception using errcode='22023',message='IDEMPOTENCY_KEY_REUSED'; end if;
    return query select existing.id,existing.amount_bdt,existing.currency; return;
  end if;
  select * into appointment from public.appointments where id=target_appointment_id for update;
  if not found or not public.owns_patient_profile(appointment.patient_profile_id) then raise exception using errcode='42501',message='APPOINTMENT_PAYMENT_DENIED'; end if;
  if appointment.status not in ('confirmed','checked_in','completed') then raise exception using errcode='22023',message='APPOINTMENT_NOT_PAYABLE'; end if;
  if appointment.deposit_bdt<=0 then raise exception using errcode='22023',message='PAYMENT_AMOUNT_INVALID'; end if;
  return query insert into public.payment_transactions(provider,appointment_id,patient_profile_id,clinic_id,amount_bdt,idempotency_key,created_by)
    values(target_provider,appointment.id,appointment.patient_profile_id,appointment.clinic_id,appointment.deposit_bdt,request_key,auth.uid())
    returning public.payment_transactions.id,public.payment_transactions.amount_bdt,public.payment_transactions.currency;
end $$;

create or replace function public.set_payment_checkout_result(target_payment_id uuid,checkout_url text,provider_reference text,event_payload jsonb)
returns void language plpgsql security definer set search_path=''
as $$ begin
  update public.payment_transactions set provider_checkout_url=nullif(btrim(checkout_url),''),provider_payment_id=nullif(btrim(provider_reference),''),provider_payload=coalesce(event_payload,'{}'::jsonb),status='pending',updated_at=now() where id=target_payment_id;
  if not found then raise exception using errcode='22023',message='PAYMENT_NOT_FOUND'; end if;
end $$;

create or replace function public.prepare_refund(target_payment_id uuid,refund_amount numeric,refund_reason text,request_key text)
returns uuid language plpgsql security definer set search_path=''
as $$ declare payment public.payment_transactions%rowtype; result uuid; existing public.refunds%rowtype; already_refunded numeric; begin
  select * into existing from public.refunds where idempotency_key=request_key;
  if found then
    if existing.payment_id<>target_payment_id or existing.amount_bdt<>refund_amount then raise exception using errcode='22023',message='IDEMPOTENCY_KEY_REUSED'; end if;
    return existing.id;
  end if;
  select * into payment from public.payment_transactions where id=target_payment_id for update;
  if not found or (not public.has_clinic_role(payment.clinic_id,array['clinic_owner','clinic_manager']::public.app_role[]) and not public.has_role('super_admin')) then raise exception using errcode='42501',message='REFUND_DENIED'; end if;
  if payment.status not in ('succeeded','partially_refunded') then raise exception using errcode='22023',message='PAYMENT_NOT_REFUNDABLE'; end if;
  select coalesce(sum(amount_bdt),0) into already_refunded from public.refunds where payment_id=payment.id and status in ('succeeded','pending','created');
  if refund_amount<=0 or refund_amount+already_refunded>payment.amount_bdt then raise exception using errcode='22023',message='REFUND_AMOUNT_INVALID'; end if;
  insert into public.refunds(payment_id,amount_bdt,reason,idempotency_key,requested_by) values(payment.id,refund_amount,btrim(refund_reason),request_key,auth.uid()) returning id into result;
  perform public.write_audit('finance.refund_requested','refund',result::text,jsonb_build_object('payment_id',payment.id,'amount_bdt',refund_amount)); return result;
end $$;

create or replace function public.apply_refund_result(target_refund_id uuid,target_status public.payment_state,provider_reference text,event_payload jsonb)
returns boolean language plpgsql security definer set search_path=''
as $$ declare refund public.refunds%rowtype; payment public.payment_transactions%rowtype; successful_total numeric; begin
  select * into refund from public.refunds where id=target_refund_id for update; if not found then return false; end if;
  if refund.status='succeeded' then return false; end if;
  update public.refunds set status=target_status,provider_refund_id=nullif(btrim(provider_reference),''),provider_payload=coalesce(event_payload,'{}'::jsonb),confirmed_at=case when target_status='succeeded' then now() else confirmed_at end,updated_at=now() where id=refund.id;
  if target_status='succeeded' then
    select * into payment from public.payment_transactions where id=refund.payment_id for update;
    insert into public.clinic_ledger_entries(clinic_id,entry_type,payment_id,refund_id,amount_bdt,description) values(payment.clinic_id,'refund',payment.id,refund.id,-refund.amount_bdt,'Provider refund confirmed');
    select coalesce(sum(amount_bdt),0) into successful_total from public.refunds where payment_id=payment.id and status='succeeded';
    update public.payment_transactions set status=case when successful_total>=amount_bdt then 'refunded'::public.payment_state else 'partially_refunded'::public.payment_state end,updated_at=now() where id=payment.id;
  end if; return true;
end $$;

create or replace function public.create_invoice(target_clinic_id uuid,target_patient_profile_id uuid,target_appointment_id uuid,discount numeric,items jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$ declare invoice_id uuid; item jsonb; subtotal numeric:=0; line numeric;
begin
  if not public.has_clinic_role(target_clinic_id,array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]) then raise exception using errcode='42501',message='CLINIC_FINANCE_DENIED'; end if;
  if jsonb_typeof(items)<>'array' or jsonb_array_length(items)=0 then raise exception using errcode='22023',message='INVOICE_ITEMS_REQUIRED'; end if;
  for item in select * from jsonb_array_elements(items) loop
    line:=(item->>'quantity')::numeric*(item->>'unitPriceBdt')::numeric;
    if line<0 then raise exception using errcode='22023',message='INVOICE_ITEM_INVALID'; end if; subtotal:=subtotal+line;
  end loop;
  if coalesce(discount,0)<0 or coalesce(discount,0)>subtotal then raise exception using errcode='22023',message='INVOICE_DISCOUNT_INVALID'; end if;
  insert into public.invoices(invoice_number,clinic_id,patient_profile_id,appointment_id,status,subtotal_bdt,discount_bdt,total_bdt,issued_at,created_by)
  values('INV-'||to_char(current_date,'YYYYMM')||'-'||lpad(nextval('public.invoice_number_seq')::text,6,'0'),target_clinic_id,target_patient_profile_id,target_appointment_id,'issued',subtotal,coalesce(discount,0),subtotal-coalesce(discount,0),now(),auth.uid()) returning id into invoice_id;
  for item in select * from jsonb_array_elements(items) loop insert into public.invoice_items(invoice_id,description,quantity,unit_price_bdt) values(invoice_id,btrim(item->>'description'),(item->>'quantity')::numeric,(item->>'unitPriceBdt')::numeric); end loop;
  perform public.write_audit('finance.invoice_created','invoice',invoice_id::text,jsonb_build_object('clinic_id',target_clinic_id,'total_bdt',subtotal-coalesce(discount,0)));
  return invoice_id;
end $$;

create or replace function public.record_expense(target_clinic_id uuid,expense_category text,expense_description text,amount numeric,expense_date date)
returns uuid language plpgsql security definer set search_path=''
as $$ declare result uuid; begin
  if not public.has_clinic_role(target_clinic_id,array['clinic_owner','clinic_manager']::public.app_role[]) then raise exception using errcode='42501',message='CLINIC_FINANCE_DENIED'; end if;
  insert into public.expenses(clinic_id,category,description,amount_bdt,incurred_on,recorded_by) values(target_clinic_id,btrim(expense_category),btrim(expense_description),amount,expense_date,auth.uid()) returning id into result;
  perform public.write_audit('finance.expense_recorded','expense',result::text,jsonb_build_object('clinic_id',target_clinic_id,'amount_bdt',amount)); return result;
end $$;

create or replace function public.create_inventory_item(target_clinic_id uuid,item_sku text,item_name text,item_unit text,reorder numeric)
returns uuid language plpgsql security definer set search_path=''
as $$ declare result uuid; begin
  if not public.has_clinic_role(target_clinic_id,array['clinic_owner','clinic_manager']::public.app_role[]) then raise exception using errcode='42501',message='INVENTORY_DENIED'; end if;
  insert into public.inventory_items(clinic_id,sku,name,unit,reorder_level,created_by) values(target_clinic_id,upper(btrim(item_sku)),btrim(item_name),btrim(item_unit),reorder,auth.uid()) returning id into result;
  perform public.write_audit('inventory.item_created','inventory_item',result::text); return result;
end $$;

create or replace function public.post_stock_movement(target_clinic_id uuid,target_item_id uuid,target_lot_id uuid,movement public.stock_movement_type,movement_quantity numeric,movement_reason text,source_type text default '',source_id uuid default null)
returns bigint language plpgsql security definer set search_path=''
as $$ declare lot public.inventory_lots%rowtype; delta numeric; result bigint;
begin
  if not public.has_clinic_role(target_clinic_id,array['clinic_owner','clinic_manager','dentist']::public.app_role[]) then raise exception using errcode='42501',message='INVENTORY_DENIED'; end if;
  if movement_quantity<=0 then raise exception using errcode='22023',message='STOCK_QUANTITY_INVALID'; end if;
  select l.* into lot from public.inventory_lots l join public.inventory_items i on i.id=l.item_id where l.id=target_lot_id and l.item_id=target_item_id and i.clinic_id=target_clinic_id for update;
  if not found then raise exception using errcode='22023',message='STOCK_LOT_INVALID'; end if;
  delta:=case when movement in ('receipt','adjustment_in','return') then movement_quantity else -movement_quantity end;
  if lot.on_hand+delta<0 then raise exception using errcode='23514',message='INSUFFICIENT_STOCK'; end if;
  update public.inventory_lots set on_hand=on_hand+delta,updated_at=now() where id=lot.id;
  insert into public.stock_movements(clinic_id,item_id,lot_id,movement_type,quantity,signed_quantity,reason,reference_type,reference_id,recorded_by) values(target_clinic_id,target_item_id,target_lot_id,movement,movement_quantity,delta,btrim(movement_reason),btrim(source_type),source_id,auth.uid()) returning id into result;
  perform public.write_audit('inventory.movement_posted','stock_movement',result::text,jsonb_build_object('clinic_id',target_clinic_id,'signed_quantity',delta)); return result;
end $$;

create or replace function public.create_inventory_lot(target_item_id uuid,lot_code text,expiry date,unit_cost numeric,initial_quantity numeric)
returns uuid language plpgsql security definer set search_path=''
as $$ declare item public.inventory_items%rowtype; result uuid; begin
  select * into item from public.inventory_items where id=target_item_id;
  if not found or not public.has_clinic_role(item.clinic_id,array['clinic_owner','clinic_manager']::public.app_role[]) then raise exception using errcode='42501',message='INVENTORY_DENIED'; end if;
  if initial_quantity<0 then raise exception using errcode='22023',message='STOCK_QUANTITY_INVALID'; end if;
  insert into public.inventory_lots(item_id,lot_number,expires_on,on_hand,unit_cost_bdt) values(target_item_id,btrim(lot_code),expiry,0,unit_cost) returning id into result;
  if initial_quantity>0 then perform public.post_stock_movement(item.clinic_id,item.id,result,'receipt',initial_quantity,'Initial lot receipt','inventory_lot',result); end if; return result;
end $$;

create or replace function public.create_lab_case(target_clinic_id uuid,target_patient_profile_id uuid,target_encounter_id uuid,target_vendor_id uuid,target_case_type text,target_due_date date,target_cost numeric,target_notes text)
returns uuid language plpgsql security definer set search_path=''
as $$ declare result uuid; begin
  if not public.has_clinic_role(target_clinic_id,array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]) then raise exception using errcode='42501',message='LAB_CASE_DENIED'; end if;
  insert into public.lab_cases(case_number,clinic_id,patient_profile_id,encounter_id,vendor_id,case_type,due_date,cost_bdt,notes,created_by)
  values('LAB-'||to_char(current_date,'YYYYMM')||'-'||lpad(nextval('public.lab_case_number_seq')::text,6,'0'),target_clinic_id,target_patient_profile_id,target_encounter_id,target_vendor_id,btrim(target_case_type),target_due_date,target_cost,btrim(target_notes),auth.uid()) returning id into result;
  insert into public.lab_case_events(lab_case_id,to_status,notes,changed_by) values(result,'created','Case created',auth.uid());
  perform public.write_audit('lab.case_created','lab_case',result::text,jsonb_build_object('clinic_id',target_clinic_id)); return result;
end $$;

create or replace function public.advance_lab_case(target_case_id uuid,next_status public.lab_case_state,event_notes text default '') returns void language plpgsql security definer set search_path=''
as $$ declare target public.lab_cases%rowtype; begin select * into target from public.lab_cases where id=target_case_id for update;
  if not found or not public.has_clinic_role(target.clinic_id,array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]) then raise exception using errcode='42501',message='LAB_CASE_DENIED'; end if;
  if next_status=target.status then return; end if;
  insert into public.lab_case_events(lab_case_id,from_status,to_status,notes,changed_by) values(target.id,target.status,next_status,btrim(event_notes),auth.uid());
  update public.lab_cases set status=next_status,delivered_at=case when next_status='delivered' then now() else delivered_at end,updated_at=now() where id=target.id;
  perform public.write_audit('lab.case_status_changed','lab_case',target.id::text,jsonb_build_object('from',target.status,'to',next_status)); end $$;

create or replace function public.has_entitlement(target_entitlement text,target_clinic_id uuid default null) returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.user_subscriptions s join public.subscription_plans p on p.id=s.plan_id where s.user_id=auth.uid() and (target_clinic_id is null or s.clinic_id=target_clinic_id) and s.status in ('trialing','active','grace_period') and coalesce(s.expires_at,s.current_period_end,now()+interval '1 day')>now() and target_entitlement=any(p.entitlements)); $$;

create or replace function public.set_subscription_plan(target_plan_id uuid,product_id text,target_tier public.subscription_tier,name_english text,name_bangla text,price numeric,period text,target_quotas jsonb,target_entitlements text[],enabled boolean)
returns uuid language plpgsql security definer set search_path=''
as $$ declare result uuid; begin if not public.has_role('super_admin') then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED'; end if;
  insert into public.subscription_plans(id,external_product_id,tier,name_en,name_bn,price_bdt,billing_period,quotas,entitlements,active,created_by)
  values(coalesce(target_plan_id,gen_random_uuid()),product_id,target_tier,btrim(name_english),btrim(name_bangla),price,period,target_quotas,target_entitlements,enabled,auth.uid())
  on conflict(id) do update set external_product_id=excluded.external_product_id,tier=excluded.tier,name_en=excluded.name_en,name_bn=excluded.name_bn,price_bdt=excluded.price_bdt,billing_period=excluded.billing_period,quotas=excluded.quotas,entitlements=excluded.entitlements,active=excluded.active,updated_at=now() returning id into result;
  perform public.write_audit('subscription.plan_saved','subscription_plan',result::text); return result; end $$;

create or replace function public.set_commission_rate(target_clinic_id uuid,rate numeric)
returns uuid language plpgsql security definer set search_path=''
as $$ declare result uuid; begin
  if not public.has_role('super_admin') then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED'; end if;
  if rate<0 or rate>100 then raise exception using errcode='22023',message='COMMISSION_RATE_INVALID'; end if;
  update public.platform_commission_rules set effective_until=now() where clinic_id is not distinct from target_clinic_id and effective_until is null;
  insert into public.platform_commission_rules(clinic_id,rate_percent,created_by) values(target_clinic_id,rate,auth.uid()) returning id into result;
  perform public.write_audit('finance.commission_rate_saved','commission_rule',result::text,jsonb_build_object('clinic_id',target_clinic_id,'rate_percent',rate)); return result;
end $$;

create or replace function public.create_supplier(target_clinic_id uuid,supplier_name text,supplier_phone text default '',supplier_email text default '',supplier_address text default '')
returns uuid language plpgsql security definer set search_path=''
as $$ declare result uuid; begin
  if not public.has_clinic_role(target_clinic_id,array['clinic_owner','clinic_manager']::public.app_role[]) then raise exception using errcode='42501',message='PURCHASING_DENIED'; end if;
  insert into public.suppliers(clinic_id,name,phone,email,address,created_by) values(target_clinic_id,btrim(supplier_name),btrim(supplier_phone),lower(btrim(supplier_email)),btrim(supplier_address),auth.uid()) returning id into result;
  perform public.write_audit('inventory.supplier_created','supplier',result::text,jsonb_build_object('clinic_id',target_clinic_id)); return result;
end $$;

create or replace function public.create_purchase_order(target_clinic_id uuid,target_supplier_id uuid,expected_date date,order_notes text,items jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$ declare result uuid; item jsonb; begin
  if not public.has_clinic_role(target_clinic_id,array['clinic_owner','clinic_manager']::public.app_role[]) then raise exception using errcode='42501',message='PURCHASING_DENIED'; end if;
  if jsonb_typeof(items)<>'array' or jsonb_array_length(items)=0 then raise exception using errcode='22023',message='PURCHASE_ITEMS_REQUIRED'; end if;
  if not exists(select 1 from public.suppliers where id=target_supplier_id and clinic_id=target_clinic_id and active) then raise exception using errcode='22023',message='SUPPLIER_INVALID'; end if;
  insert into public.purchase_orders(clinic_id,supplier_id,order_number,status,ordered_on,expected_on,notes,created_by) values(target_clinic_id,target_supplier_id,'PO-'||to_char(current_date,'YYYYMMDD')||'-'||substr(gen_random_uuid()::text,1,8),'ordered',current_date,expected_date,btrim(order_notes),auth.uid()) returning id into result;
  for item in select * from jsonb_array_elements(items) loop
    if not exists(select 1 from public.inventory_items where id=(item->>'itemId')::uuid and clinic_id=target_clinic_id) then raise exception using errcode='22023',message='PURCHASE_ITEM_INVALID'; end if;
    insert into public.purchase_order_items(purchase_order_id,inventory_item_id,quantity_ordered,unit_cost_bdt) values(result,(item->>'itemId')::uuid,(item->>'quantity')::numeric,(item->>'unitCostBdt')::numeric);
  end loop;
  perform public.write_audit('inventory.purchase_order_created','purchase_order',result::text,jsonb_build_object('clinic_id',target_clinic_id)); return result;
end $$;

create or replace function public.receive_purchase_order_item(target_purchase_item_id uuid,received_quantity numeric,lot_code text,expiry date)
returns uuid language plpgsql security definer set search_path=''
as $$ declare order_item public.purchase_order_items%rowtype; purchase public.purchase_orders%rowtype; lot_id uuid; remaining numeric; begin
  select * into order_item from public.purchase_order_items where id=target_purchase_item_id for update;
  if not found then raise exception using errcode='22023',message='PURCHASE_ITEM_INVALID'; end if;
  select * into purchase from public.purchase_orders where id=order_item.purchase_order_id for update;
  if not public.has_clinic_role(purchase.clinic_id,array['clinic_owner','clinic_manager']::public.app_role[]) then raise exception using errcode='42501',message='PURCHASING_DENIED'; end if;
  remaining:=order_item.quantity_ordered-order_item.quantity_received;if received_quantity<=0 or received_quantity>remaining then raise exception using errcode='22023',message='RECEIPT_QUANTITY_INVALID'; end if;
  select id into lot_id from public.inventory_lots where item_id=order_item.inventory_item_id and lot_number=btrim(lot_code);
  if lot_id is null then insert into public.inventory_lots(item_id,lot_number,expires_on,on_hand,unit_cost_bdt) values(order_item.inventory_item_id,btrim(lot_code),expiry,0,order_item.unit_cost_bdt) returning id into lot_id; end if;
  perform public.post_stock_movement(purchase.clinic_id,order_item.inventory_item_id,lot_id,'receipt',received_quantity,'Purchase order receipt','purchase_order',purchase.id);
  update public.purchase_order_items set quantity_received=quantity_received+received_quantity where id=order_item.id;
  update public.purchase_orders set status=case when not exists(select 1 from public.purchase_order_items i where i.purchase_order_id=purchase.id and i.quantity_received<i.quantity_ordered) then 'received'::public.purchase_order_state else 'partially_received'::public.purchase_order_state end,updated_at=now() where id=purchase.id;
  perform public.write_audit('inventory.purchase_received','purchase_order',purchase.id::text,jsonb_build_object('quantity',received_quantity,'lot_id',lot_id)); return lot_id;
end $$;

create or replace function public.create_lab_vendor(target_clinic_id uuid,vendor_name text,vendor_phone text default '',vendor_email text default '',vendor_address text default '')
returns uuid language plpgsql security definer set search_path=''
as $$ declare result uuid; begin
  if not public.has_clinic_role(target_clinic_id,array['clinic_owner','clinic_manager']::public.app_role[]) then raise exception using errcode='42501',message='LAB_VENDOR_DENIED'; end if;
  insert into public.lab_vendors(clinic_id,name,phone,email,address,created_by) values(target_clinic_id,btrim(vendor_name),btrim(vendor_phone),lower(btrim(vendor_email)),btrim(vendor_address),auth.uid()) returning id into result;
  perform public.write_audit('lab.vendor_created','lab_vendor',result::text,jsonb_build_object('clinic_id',target_clinic_id)); return result;
end $$;

create or replace function public.request_clinic_payout(target_clinic_id uuid,payout_amount numeric,from_date date,to_date date)
returns uuid language plpgsql security definer set search_path=''
as $$ declare result uuid; available numeric; begin
  if not public.has_clinic_role(target_clinic_id,array['clinic_owner']::public.app_role[]) then raise exception using errcode='42501',message='PAYOUT_DENIED'; end if;
  select coalesce(sum(amount_bdt),0) into available from public.clinic_ledger_entries where clinic_id=target_clinic_id;
  if payout_amount<=0 or payout_amount>available then raise exception using errcode='22023',message='PAYOUT_AMOUNT_INVALID'; end if;
  insert into public.clinic_payouts(clinic_id,amount_bdt,period_start,period_end,requested_by) values(target_clinic_id,payout_amount,from_date,to_date,auth.uid()) returning id into result;
  insert into public.clinic_ledger_entries(clinic_id,entry_type,amount_bdt,description) values(target_clinic_id,'payout',-payout_amount,'Clinic payout requested');
  perform public.write_audit('finance.payout_requested','clinic_payout',result::text,jsonb_build_object('clinic_id',target_clinic_id,'amount_bdt',payout_amount)); return result;
end $$;

create or replace function public.apply_payment_event(target_provider public.payment_provider,target_event_id text,target_payment_id uuid,target_provider_payment_id text,target_status public.payment_state,event_payload jsonb,signature_hash text)
returns boolean language plpgsql security definer set search_path=''
as $$ declare payment public.payment_transactions%rowtype; rate numeric; commission numeric; event_row bigint; begin
  insert into public.payment_webhook_events(provider,provider_event_id,signature_digest,payload) values(target_provider,target_event_id,signature_hash,event_payload) on conflict(provider,provider_event_id) do nothing returning id into event_row;
  if event_row is null then return false; end if;
  select * into payment from public.payment_transactions where id=target_payment_id and provider=target_provider for update;
  if not found then update public.payment_webhook_events set processing_error='PAYMENT_NOT_FOUND' where id=event_row; return false; end if;
  update public.payment_transactions set status=target_status,provider_payment_id=coalesce(nullif(target_provider_payment_id,''),provider_payment_id),provider_payload=event_payload,confirmed_at=case when target_status='succeeded' then now() else confirmed_at end,updated_at=now() where id=payment.id;
  if target_status='succeeded' and payment.status<>'succeeded' then
    rate:=public.active_commission_rate(payment.clinic_id); commission:=round(payment.amount_bdt*rate/100,2);
    insert into public.clinic_ledger_entries(clinic_id,entry_type,payment_id,amount_bdt,description) values(payment.clinic_id,'payment',payment.id,payment.amount_bdt,'Provider payment confirmed'),(payment.clinic_id,'commission',payment.id,-commission,'Platform commission');
    if payment.invoice_id is not null then update public.invoices set paid_bdt=least(total_bdt,paid_bdt+payment.amount_bdt),status=case when paid_bdt+payment.amount_bdt>=total_bdt then 'paid'::public.invoice_state else 'partially_paid'::public.invoice_state end,updated_at=now() where id=payment.invoice_id; end if;
  end if;
  update public.payment_webhook_events set processed_at=now() where id=event_row; return true; end $$;

create or replace function public.apply_subscription_event(target_event_id text,target_event_type text,target_app_user_id text,target_product_id text,target_original_transaction_id text,target_status public.subscription_state,target_period_start timestamptz,target_period_end timestamptz,target_expires_at timestamptz,target_environment text,event_payload jsonb)
returns boolean language plpgsql security definer set search_path=''
as $$ declare event_row bigint; target_user uuid; target_plan uuid; begin
  insert into public.subscription_webhook_events(event_id,event_type,app_user_id,payload) values(target_event_id,target_event_type,target_app_user_id,event_payload) on conflict(event_id) do nothing returning id into event_row; if event_row is null then return false; end if;
  begin target_user:=target_app_user_id::uuid; exception when invalid_text_representation then update public.subscription_webhook_events set processing_error='USER_ID_INVALID' where id=event_row; return false; end;
  select id into target_plan from public.subscription_plans where external_product_id=target_product_id and active; if target_plan is null then update public.subscription_webhook_events set processing_error='PLAN_NOT_FOUND' where id=event_row; return false; end if;
  insert into public.user_subscriptions(user_id,plan_id,revenuecat_app_user_id,revenuecat_entitlement_id,status,current_period_start,current_period_end,cancelled_at,expires_at,original_transaction_id,environment)
  values(target_user,target_plan,target_app_user_id,(select tier::text from public.subscription_plans where id=target_plan),target_status,target_period_start,target_period_end,case when target_status='cancelled' then now() end,target_expires_at,target_original_transaction_id,target_environment)
  on conflict(original_transaction_id) do update set plan_id=excluded.plan_id,status=excluded.status,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,cancelled_at=excluded.cancelled_at,expires_at=excluded.expires_at,environment=excluded.environment,updated_at=now();
  update public.subscription_webhook_events set processed_at=now() where id=event_row; return true; end $$;

create or replace function public.clinic_finance_summary(target_clinic_id uuid,from_date date,to_date date)
returns table(gross_payments numeric,refund_total numeric,commission_total numeric,expense_total numeric,payout_total numeric,net_payable numeric) language plpgsql security definer set search_path=''
as $$ begin if not public.has_clinic_role(target_clinic_id,array['clinic_owner','clinic_manager']::public.app_role[]) and not public.has_role('super_admin') then raise exception using errcode='42501',message='CLINIC_FINANCE_DENIED'; end if;
  return query select coalesce(sum(case when l.entry_type='payment' then l.amount_bdt else 0 end),0),abs(coalesce(sum(case when l.entry_type='refund' then l.amount_bdt else 0 end),0)),abs(coalesce(sum(case when l.entry_type='commission' then l.amount_bdt else 0 end),0)),coalesce((select sum(e.amount_bdt) from public.expenses e where e.clinic_id=target_clinic_id and e.incurred_on between from_date and to_date),0),abs(coalesce(sum(case when l.entry_type='payout' then l.amount_bdt else 0 end),0)),coalesce(sum(l.amount_bdt),0) from public.clinic_ledger_entries l where l.clinic_id=target_clinic_id and l.created_at::date between from_date and to_date; end $$;

create trigger invoices_touch_updated_at before update on public.invoices for each row execute function public.touch_updated_at();
create trigger payments_touch_updated_at before update on public.payment_transactions for each row execute function public.touch_updated_at();
create trigger refunds_touch_updated_at before update on public.refunds for each row execute function public.touch_updated_at();
create trigger expenses_touch_updated_at before update on public.expenses for each row execute function public.touch_updated_at();
create trigger inventory_items_touch_updated_at before update on public.inventory_items for each row execute function public.touch_updated_at();
create trigger inventory_lots_touch_updated_at before update on public.inventory_lots for each row execute function public.touch_updated_at();
create trigger purchase_orders_touch_updated_at before update on public.purchase_orders for each row execute function public.touch_updated_at();
create trigger lab_cases_touch_updated_at before update on public.lab_cases for each row execute function public.touch_updated_at();
create trigger subscription_plans_touch_updated_at before update on public.subscription_plans for each row execute function public.touch_updated_at();
create trigger subscriptions_touch_updated_at before update on public.user_subscriptions for each row execute function public.touch_updated_at();
create trigger subscriptions_validate_scope before insert or update of plan_id,clinic_id on public.user_subscriptions for each row execute function public.validate_subscription_scope();

alter table public.invoices enable row level security; alter table public.invoice_items enable row level security; alter table public.payment_transactions enable row level security; alter table public.payment_webhook_events enable row level security; alter table public.refunds enable row level security; alter table public.expenses enable row level security; alter table public.clinic_ledger_entries enable row level security; alter table public.clinic_payouts enable row level security;
alter table public.suppliers enable row level security; alter table public.inventory_items enable row level security; alter table public.inventory_lots enable row level security; alter table public.stock_movements enable row level security; alter table public.purchase_orders enable row level security; alter table public.purchase_order_items enable row level security;
alter table public.lab_vendors enable row level security; alter table public.lab_cases enable row level security; alter table public.lab_case_events enable row level security; alter table public.lab_case_attachments enable row level security;
alter table public.subscription_plans enable row level security; alter table public.user_subscriptions enable row level security; alter table public.subscription_webhook_events enable row level security; alter table public.platform_commission_rules enable row level security;

create policy invoices_read_participants on public.invoices for select to authenticated using(public.owns_patient_profile(patient_profile_id) or public.has_clinic_role(clinic_id,array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]) or public.has_role('super_admin'));
create policy invoice_items_read_participants on public.invoice_items for select to authenticated using(exists(select 1 from public.invoices i where i.id=invoice_id and (public.owns_patient_profile(i.patient_profile_id) or public.has_clinic_role(i.clinic_id,array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]) or public.has_role('super_admin'))));
create policy payments_read_participants on public.payment_transactions for select to authenticated using(public.owns_patient_profile(patient_profile_id) or public.has_clinic_role(clinic_id,array['clinic_owner','clinic_manager']::public.app_role[]) or public.has_role('super_admin'));
create policy refunds_read_participants on public.refunds for select to authenticated using(exists(select 1 from public.payment_transactions p where p.id=payment_id and (public.owns_patient_profile(p.patient_profile_id) or public.has_clinic_role(p.clinic_id,array['clinic_owner','clinic_manager']::public.app_role[]) or public.has_role('super_admin'))));
create policy expenses_read_finance on public.expenses for select to authenticated using(public.has_clinic_role(clinic_id,array['clinic_owner','clinic_manager']::public.app_role[]) or public.has_role('super_admin'));
create policy ledger_read_finance on public.clinic_ledger_entries for select to authenticated using(public.has_clinic_role(clinic_id,array['clinic_owner','clinic_manager']::public.app_role[]) or public.has_role('super_admin'));
create policy payouts_read_finance on public.clinic_payouts for select to authenticated using(public.has_clinic_role(clinic_id,array['clinic_owner','clinic_manager']::public.app_role[]) or public.has_role('super_admin'));
create policy suppliers_read_clinic on public.suppliers for select to authenticated using(public.has_clinic_role(clinic_id,array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]));
create policy inventory_items_read_clinic on public.inventory_items for select to authenticated using(public.has_clinic_role(clinic_id,array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]));
create policy inventory_lots_read_clinic on public.inventory_lots for select to authenticated using(exists(select 1 from public.inventory_items i where i.id=item_id and public.has_clinic_role(i.clinic_id,array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[])));
create policy stock_movements_read_clinic on public.stock_movements for select to authenticated using(public.has_clinic_role(clinic_id,array['clinic_owner','clinic_manager','dentist']::public.app_role[]));
create policy purchase_orders_read_clinic on public.purchase_orders for select to authenticated using(public.has_clinic_role(clinic_id,array['clinic_owner','clinic_manager','front_desk']::public.app_role[]));
create policy purchase_items_read_clinic on public.purchase_order_items for select to authenticated using(exists(select 1 from public.purchase_orders p where p.id=purchase_order_id and public.has_clinic_role(p.clinic_id,array['clinic_owner','clinic_manager','front_desk']::public.app_role[])));
create policy lab_vendors_read_clinic on public.lab_vendors for select to authenticated using(public.has_clinic_role(clinic_id,array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]));
create policy lab_cases_read_clinic on public.lab_cases for select to authenticated using(public.has_clinic_role(clinic_id,array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]));
create policy lab_events_read_clinic on public.lab_case_events for select to authenticated using(exists(select 1 from public.lab_cases c where c.id=lab_case_id and public.has_clinic_role(c.clinic_id,array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[])));
create policy lab_attachments_read_clinic on public.lab_case_attachments for select to authenticated using(exists(select 1 from public.lab_cases c where c.id=lab_case_id and public.has_clinic_role(c.clinic_id,array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[])));
create policy subscription_plans_read_active on public.subscription_plans for select to authenticated using(active or public.has_role('super_admin'));
create policy subscriptions_read_owner on public.user_subscriptions for select to authenticated using(user_id=auth.uid() or (clinic_id is not null and public.has_clinic_role(clinic_id,array['clinic_owner','clinic_manager']::public.app_role[])) or public.has_role('super_admin'));
create policy commissions_read_finance on public.platform_commission_rules for select to authenticated using(public.has_role('super_admin') or clinic_id is not null and public.has_clinic_role(clinic_id,array['clinic_owner','clinic_manager']::public.app_role[]));
create policy lab_objects_read on storage.objects for select to authenticated using(bucket_id='lab-attachments' and exists(select 1 from public.lab_case_attachments a join public.lab_cases c on c.id=a.lab_case_id where a.storage_path=name and public.has_clinic_role(c.clinic_id,array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[])));
create policy lab_objects_upload on storage.objects for insert to authenticated with check(bucket_id='lab-attachments' and split_part(name,'/',1)=auth.uid()::text and public.is_verified_dentist(auth.uid()));

revoke all on public.platform_commission_rules,public.invoices,public.invoice_items,public.payment_transactions,public.payment_webhook_events,public.refunds,public.expenses,public.clinic_ledger_entries,public.clinic_payouts,public.suppliers,public.inventory_items,public.inventory_lots,public.stock_movements,public.purchase_orders,public.purchase_order_items,public.lab_vendors,public.lab_cases,public.lab_case_events,public.lab_case_attachments,public.subscription_plans,public.user_subscriptions,public.subscription_webhook_events from anon,authenticated;
grant select on public.platform_commission_rules,public.invoices,public.invoice_items,public.payment_transactions,public.refunds,public.expenses,public.clinic_ledger_entries,public.clinic_payouts,public.suppliers,public.inventory_items,public.inventory_lots,public.stock_movements,public.purchase_orders,public.purchase_order_items,public.lab_vendors,public.lab_cases,public.lab_case_events,public.lab_case_attachments,public.subscription_plans,public.user_subscriptions to authenticated;
revoke all on function public.prepare_payment_checkout(uuid,public.payment_provider,text),public.prepare_refund(uuid,numeric,text,text),public.create_invoice(uuid,uuid,uuid,numeric,jsonb),public.record_expense(uuid,text,text,numeric,date),public.create_inventory_item(uuid,text,text,text,numeric),public.create_inventory_lot(uuid,text,date,numeric,numeric),public.post_stock_movement(uuid,uuid,uuid,public.stock_movement_type,numeric,text,text,uuid),public.create_lab_case(uuid,uuid,uuid,uuid,text,date,numeric,text),public.advance_lab_case(uuid,public.lab_case_state,text),public.has_entitlement(text,uuid),public.set_subscription_plan(uuid,text,public.subscription_tier,text,text,numeric,text,jsonb,text[],boolean),public.set_commission_rate(uuid,numeric),public.create_supplier(uuid,text,text,text,text),public.create_purchase_order(uuid,uuid,date,text,jsonb),public.receive_purchase_order_item(uuid,numeric,text,date),public.create_lab_vendor(uuid,text,text,text,text),public.request_clinic_payout(uuid,numeric,date,date) from public,anon,authenticated;
grant execute on function public.prepare_payment_checkout(uuid,public.payment_provider,text),public.prepare_refund(uuid,numeric,text,text),public.create_invoice(uuid,uuid,uuid,numeric,jsonb),public.record_expense(uuid,text,text,numeric,date),public.create_inventory_item(uuid,text,text,text,numeric),public.create_inventory_lot(uuid,text,date,numeric,numeric),public.post_stock_movement(uuid,uuid,uuid,public.stock_movement_type,numeric,text,text,uuid),public.create_lab_case(uuid,uuid,uuid,uuid,text,date,numeric,text),public.advance_lab_case(uuid,public.lab_case_state,text),public.has_entitlement(text,uuid),public.set_subscription_plan(uuid,text,public.subscription_tier,text,text,numeric,text,jsonb,text[],boolean),public.set_commission_rate(uuid,numeric),public.create_supplier(uuid,text,text,text,text),public.create_purchase_order(uuid,uuid,date,text,jsonb),public.receive_purchase_order_item(uuid,numeric,text,date),public.create_lab_vendor(uuid,text,text,text,text),public.request_clinic_payout(uuid,numeric,date,date) to authenticated;
revoke all on function public.set_payment_checkout_result(uuid,text,text,jsonb),public.apply_refund_result(uuid,public.payment_state,text,jsonb),public.apply_payment_event(public.payment_provider,text,uuid,text,public.payment_state,jsonb,text),public.apply_subscription_event(text,text,text,text,text,public.subscription_state,timestamptz,timestamptz,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.set_payment_checkout_result(uuid,text,text,jsonb),public.apply_refund_result(uuid,public.payment_state,text,jsonb),public.apply_payment_event(public.payment_provider,text,uuid,text,public.payment_state,jsonb,text),public.apply_subscription_event(text,text,text,text,text,public.subscription_state,timestamptz,timestamptz,timestamptz,text,jsonb) to service_role;
grant execute on function public.clinic_finance_summary(uuid,date,date) to authenticated;

commit;
