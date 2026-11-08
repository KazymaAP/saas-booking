# Том 07. База данных

Источники: все 20 файлов `supabase/migrations/*.sql`, `общие/lib/database.types.ts`, `database.generated.ts`, `PROGRESS.md`.

## 1. Миграции

| Файл | Содержание |
|---|---|
| `0001_init.sql` | 21 таблица, `pgcrypto`, RLS на всех, `is_business_member()`, `bookings_slot_unique` |
| `0002_lifecycle.sql` | `businesses.refused_at`, индекс `audit_log_created_idx`, bucket `backups` (приватный) |
| `0003_seed.sql` | 11 ниш `vertical_templates`, buckets `photos`, `logos` |
| `0004_features.sql` | `ssl_status`, версии шаблонов, `legacy_redirects`, ключи `settings` |
| `0005_indexes.sql` | Составные индексы |
| `0006_partitions.sql` | Партиционирование `audit_log`, `license_pings`, `app_logs`, `analytics_events`; функции `partition_retention_months`, `secure_partition`, `ensure_month_partition`, `create_monthly_partitions`, `drop_old_partitions`, `is_partitioned`, `ensure_partitions_for_range` |
| `0007_rls_audit.sql` | `btree_gist`, усиление RLS, `set_updated_at()`, `ensure_check`, `ensure_fk`, `current_auth_uid`, `is_api_role`, `is_super_admin`, `current_business`, `is_anon`, `is_business_member`, `accessible_business_ids`, `owned_business_ids`, `public_business_ids`, `booking_range`, `bookings_fill_snapshot()`; 20+ новых таблиц |
| `0008_pg_cron.sql` | `pg_cron`, `pg_net`; `cron_setting`, `cron_log_error`, `cron_log_result`, `cron_try_lock`, `cron_unlock`, `cron_claim`, `cron_release`, `cron_claim_unconfirmed`, `cron_claim_follow_up`, `cron_http_call`, `cron_keep_alive`, `cron_apply_registry`, `cron_assert_registry`; таблицы `cron_locks`, `cron_marks`, `cron_registry`; реестр из 13 заданий |
| `0009_retention.sql` | `cron_retention_policy`, `cron_drop_old_partitions`, `cron_retention` |
| `0010_partitions.sql` | Дополнение партиций |
| `0011_analytics.sql` | `super_admins`, `analytics_events` + партиции, `analytics_secure_relation`, `analytics_create_partition`, `analytics_ensure_partitions`, `analytics_drop_old_partitions`, materialized view `analytics_daily`, `analytics_refresh`, `analytics_refresh_if_stale`, `analytics_rate_hit`, `analytics_purge_rate_limits`, `analytics_business_summary`, `analytics_outreach_summary`, `analytics_traffic_summary`, `analytics_series`, политики `p_analytics_events_ins/sel`; 4 cron.schedule |
| `0012_rate_limit_hit.sql` | Атомарная `public.rate_limit_hit(bucket, limit, window_seconds)` |
| `0013_data_requests_types.sql` | Типы запросов субъектов ПД, индекс `idx_data_requests_open` |
| `0014_partition_bookings.sql` | Пересоздание `bookings` как `bookings_new`, партиции по `scheduled_at`, уникальные индексы `bookings_slot_unique`, `bookings_cancel_token_unique`, политики `member_bookings_read`, `p_bookings_anon_ins` |
| `0015_glowdetailing_demo.sql` | Демо-тенант `d/glowdetailing`: бренд, 5 услуг, график, контакты, рейтинг, 3 фото; `status='client'`, `subscription_active=true`, идемпотентно |
| `0016_remove_ai_assistant.sql` | Удаляет флаг `ai_assistant` из `settings.feature_flags` и `feature_flags` |
| `0017_partners.sql` | 5 таблиц партнёрской программы + идемпотентный блок `add column if not exists` для устаревших таблиц |
| `0018_ready_services.sql` | `ready_services`, `partner_messages`, `partner_payouts` + индексы |
| `0019_admin_query_indexes.sql` | Индексы для админских выборок |
| `0020_partner_referrals.sql` | `partners.referrer_id`, тип начисления `referral_bonus`, `settings.referral_percent = 10%`, индексы |

Накат: `scripts/apply-migrations.cjs` / `apply-migrations-api.cjs` (Management API, минуя прямой порт 5432), `scripts/migrate.sh`, `служебное/scripts/apply-migrations*.cjs`. Миграции идемпотентны (`if not exists`, `add column if not exists`, `on conflict`). История применений хранится в `_applied_migrations`. Факт из журнала работ: 0001–0014 накатывались на реальный проект Supabase (`oryzoexstuzgpbqvpjbr`) 29.10.2026.

## 2. Таблицы и колонки

### Ядро (`0001`)

**`vertical_templates`**: `id`, `name`, `slug` (unique), `icon`, `url_prefix` (unique), `description`, `fields` jsonb, `default_services` jsonb, `default_texts` jsonb, `default_colors` jsonb, `blocks` jsonb, `show_demo_mode` bool, `is_active` bool, `created_at`, `updated_at` (0007).

**`businesses`**: `id`, `slug` (unique), `slug_history text[]`, `name`, `description`, `vertical_template_id → vertical_templates`, `category`, `address`, `city`, `region`, `postal_code`, `lat`, `lng`, `working_hours` jsonb, `slot_step_minutes` (60), `cancel_hours_before` (3), `min_hours_before` (2), `max_days_ahead` (30), `auto_confirm` (false), `phones/emails/websites text[]`, `socials` jsonb, `rating`, `reviews_count`, `source_2gis_url`, `logo_url`, `favicon_url`, `brand_color` (#111111), `status` (enum, см. том 01), `preview_url`, `preview_token` (unique), `custom_domain` (unique), `plan` (basic), `paid_initial_at`, `plan_type`, `subscription_price`, `subscription_active`, `subscription_until`, `subscription_started_at`, `support_until`, `code_transferred_at`, `license_id`, `telegram_chat_id`, `telegram_connected_at`, `reply_text`, `reply_received_at`, `custom_texts` jsonb, `custom_blocks` jsonb, `oferta_accepted_at`, `oferta_accepted_ip`, `onboarding_completed_at`, `deletion_scheduled_at`, `notes`, `created_at`. Плюс `refused_at` (0002), `ssl_status` (0004).

**`services`**: `id`, `business_id` (cascade), `name`, `description`, `price`, `duration_minutes` (60), `sort_order`, `is_active`.

**`photos`**: `id`, `business_id` (cascade), `url`, `alt`, `sort_order`, `path`.

**`bookings`**: `id`, `business_id` (cascade), `client_name`, `client_phone`, `client_email`, `client_telegram`, `service_id` (set null), `scheduled_at`, `comment`, `status` (`new`/`confirmed`/`cancelled`/`done`/`no_show`), `cancel_token` (unique), `cancelled_at`, `cancelled_by`, `reminder_24h_sent_at`, `reminder_2h_sent_at`, `privacy_accepted_at`, `privacy_ip`, `privacy_version`, `created_at`. Уникальный индекс `bookings_slot_unique (business_id, scheduled_at) where status in ('new','confirmed')` — защита от двойной брони; в 0014 таблица пересоздаётся партиционированной с `rescheduled_from`/`rescheduled_to`.

**`admin_users`**: `id`, `business_id` (cascade), `email`, `role` (`owner`/`manager`), `auth_user_id`, `created_at`.

**`outreach_log`**: `id`, `business_id`, `channel`, `template_id`, `message`, `sent_at`, `opened_at`, `clicked_at`, `tracking_token` (unique), `email_account_id`, `status`.

**`emails_outgoing`**: `id`, `business_id`, `outreach_log_id`, `from_email`, `to_email`, `subject`, `body_text`, `body_html`, `sent_at`, `opened_at`, `clicked_at`, `status` (sent).

**`emails_incoming`**: `id`, `business_id`, `from_email`, `to_email`, `subject`, `body_text`, `received_at`, `is_read`, `thread_id`.

**`email_accounts`**: `id`, `email` (unique), `smtp_host`, `smtp_port`, `smtp_user`, `smtp_pass_encrypted`, `imap_host`, `imap_port`, `daily_limit` (50), `sent_today`, `last_reset`, `active`.

**`templates`**: `id`, `channel`, `name`, `subject`, `body`, `active`, `created_at`.

**`settings`**: `key` PK, `value` jsonb, `updated_at`. Ключи: `feature_flags`, `referral_percent`, реквизиты, тарифы, лимиты, шаблоны уведомлений и др.

**`licenses`**: `id`, `license_id` (unique), `business_id`, `domain`, `allowed_domains text[]`, `issued_at`, `revoked`, `notes`.

**`license_pings`**: `id`, `license_id`, `domain`, `version`, `ip`, `user_agent`, `status`, `pinged_at`.

**`feature_flags`**: `key` PK, `enabled`, `updated_at` (0007).

**`audit_log`**: `id`, `user_id`, `action`, `entity`, `entity_id`, `payload` jsonb, `created_at`; в 0006 пересоздана партиционированной с `business_id`.

**`business_telegram_codes`**: `code` PK, `business_id`, `created_at`, `used_at`.

**`business_requisites`**: `business_id` PK, `legal_name`, `inn`, `legal_address`, `contact_email`, `contact_phone`, `updated_at`.

**`promo_codes`**: `id`, `code` (unique), `discount_type`, `discount_value`, `max_uses`, `used_count`, `valid_until`, `is_active`.

**`pricing_plans`**: `id`, `name`, `price_monthly`, `price_yearly`, `features` jsonb, `is_active`.

**`rate_limits`**: `bucket` PK, `window_start`, `hits`.

### Дополнения 0004–0007

**`legacy_redirects`**: `from_domain` PK, `to_url`, `created_at`.

**`business_holidays`**: `id`, `business_id`, `date`, `reason`, `created_at`, unique `(business_id, date)`.

**`admin_invites`**: `id`, `business_id`, `email`, `role`, `token` (unique), `expires_at` (7 дней), `used_at`, `created_by → admin_users`, `created_at`.

**`templates_versions`**: `id`, `template_id`, `version`, `subject`, `body_text`, `body_html`, `created_at`, unique `(template_id, version)`.

**`email_queue`**: `id`, `business_id`, `booking_id`, `template_id`, `email_account_id`, `to_email`, `subject`, `body_text`, `body_html`, `status` (`pending`/`sending`/`sent`/`failed`), `retry_count`, `max_retries` (3), `next_retry_at`, `error`, `sent_at`, `message_id`, `in_reply_to`, `references`, `tracking_token` (unique), `created_at`, `updated_at`.

**`email_bounces`**: `id`, `email_account_id`, `original_message_id`, `bounced_email`, `bounce_type` (`hard`/`soft`/`complaint`), `reason`, `raw`, `received_at`.

**`email_attachments`**: `id`, `email_incoming_id`, `filename`, `mime_type`, `size_bytes`, `minio_path`, `created_at`.

**`unsubscribes`**: `id`, `email` (unique), `token` (unique), `reason`, `created_at`.

**`imap_state`**: `email_account_id` PK, `uidvalidity`, `uidnext`, `last_check_at`.

**`payments`**: `id`, `business_id`, `amount`, `type` (`initial_5000`/`subscription`/`code_buyout`/`other`), `period_start`, `period_end`, `paid_at`, `note`, `receipt_url`, `receipt_sent_at`, `created_at`.

**`receipts`**: `id`, `business_id`, `payment_id`, `amount`, `receipt_url`, `sent_at`, `created_at`.

**`code_archives`**: `id`, `business_id`, `zip_path`, `size_bytes`, `created_at`.

**`telegram_messages`**: `id bigserial`, `direction` (`in`/`out`), `chat_id`, `business_id`, `message_id`, `text`, `payload` jsonb, `created_at`.

**`notifications`**: `id`, `business_id`, `type`, `channel` (`email`/`telegram`/`sms`/`push`), `payload` jsonb, `status` (`pending`/`sent`/`failed`/`skipped`), `sent_at`, `error`, `created_at`.

**`webhook_events`**: `id`, `source`, `event_id` (unique), `payload` jsonb, `processed_at`, `created_at`.

**`jobs`**: `id`, `type` (`generate_prototypes`/`import_excel`/`backup`/`export_zip`/`export_business_data`), `payload` jsonb, `status` (`pending`/`running`/`done`/`failed`), `result` jsonb, `error`, `attempts`, `max_attempts`, `locked_by`, `locked_at`, `heartbeat_at`, `started_at`, `finished_at`, `created_at`.

**`job_locks`**: `job_id` PK, `worker_id`, `heartbeat_at`.

**`leads`**: `id`, `name`, `phone`, `email`, `message`, `source`, `status` (`new`/`contacted`/`converted`/`refused`), `telegram_sent_at`, `created_at`, `updated_at`.

**`data_requests`**: `id`, `email`, `type` (`access`/`delete`/`correct`), `business_id`, `request_text`, `status` (`new`/`in_progress`/`done`/`rejected`), `processed_by`, `response_text`, `processed_at`, `created_at`.

**`support_tickets`**: `id`, `business_id`, `email`, `subject`, `message`, `status` (`open`/`pending`/`closed`), `priority` (`low`/`normal`/`high`/`urgent`), `assigned_to`, `closed_at`, `created_at`, `updated_at`.

**`cookie_consents`**: `id`, `ip_hash`, `ua_hash`, `accepted`, `policy_version`, `created_at`.

**`slug_locks`**: резервирование slug при генерации.

**`super_admins`**: список супер-админов (0007 и 0011).

### Партиционированные и служебные (0006, 0011)

`public.audit_log` + `audit_log_default`, `public.license_pings` + default, `public.app_logs` (level, сообщение, created_at) + default, `public.analytics_events` (business_id, event, session_id, payload, created_at) + default, ежемесячные партиции `*_yYYYYmMM`, materialized view `analytics_daily`, `analytics_refresh_log`.

`public.cron_locks`, `public.cron_marks`, `public.cron_registry` (name, schedule, kind `http`/`sql`, command, timeout_ms, enabled, updated_at), `public.cron_retention_policy`.

### Партнёрская программа (0017, 0018, 0020)

**`partners`**: `id`, `email` (unique), `name`, `password_hash` (scrypt), `referral_code` (unique), `payout_method`, `payout_details`, `status` (`active`/`blocked`), `created_at`, `updated_at`, `referrer_id → partners` (0020).

**`partner_ready_sites`**: `id`, `niche`, `title`, `slug` (unique), `business_id`, `preview_url`, `description`, `is_active`, `sold_at`, `created_at`, `updated_at`.

**`partner_leads`**: `id`, `partner_id` (cascade), `name`, `phone`, `email`, `message`, `source`, `status` (`new`/`contacted`/`converted`/`refused`), `referral_sent_at`, `created_at`, `updated_at`.

**`partner_checkouts`**: `id`, `partner_id`, `ready_site_id`, `business_id`, `variant` (`subscription_5000`/`code_5000`/`custom`), `amount numeric(10,2)`, `partner_commission`, `commission_type` (`recurring_monthly`/`one_time`), `entrepreneur_name/email/phone`, `status` (`draft`/`awaiting_payment`/`paid`/`cancelled`/`expired`), `yookassa_payment_id`, `yookassa_confirmation_url`, `paid_at`, `expires_at`, `created_at`, `updated_at`.

**`partner_earnings`**: `id`, `partner_id`, `checkout_id`, `business_id`, `amount`, `type` (`recurring_monthly`/`one_time`/`referral_bonus`), `status` (`accrued`/`paid_out`/`cancelled`), `period_start`, `period_end`, `next_accrual_at`, `paid_out_at`, `created_at`.

**`ready_services`**: `id`, `niche`, `name`, `slug`, `business_id`, `phone`, `email`, `address`, `city`, `category` (`new`/`full`/`no_photos`/`no_services`/`no_template`), `source` (`parser`/`upload`/`manual`), `payload` jsonb, `status` (`draft`/`approved`/`rejected`), `assigned_partner_id`, `assignment_status` (`available`/`in_process`/`written`), `taken_at`, `refusal_count`, `no_answer_count`, `last_outcome` (`refused`/`no_answer`), `created_at`, `updated_at`, unique `(niche, slug)`.

**`partner_messages`**: `id`, `partner_id`, `body`, `from_admin` (default true), `read_at`, `created_at`.

**`partner_payouts`**: `id`, `partner_id`, `amount`, `kind` (`bonus`/`payout`/`adjust`), `note`, `created_at`.

## 3. RLS

RLS включён на всех таблицах. `service_role` обходит RLS — весь серверный код работает через `adminClient()`.

Ключевые функции/политики (`0007_rls_audit.sql`):
- `is_super_admin()` — проверка по `super_admins`/`SUPERADMIN_EMAILS`.
- `current_auth_uid()`, `is_api_role()`, `current_business()`, `is_anon()`, `is_business_member(b)`, `accessible_business_ids()`, `owned_business_ids()`, `public_business_ids()`.
- `p_businesses_sel/ins/upd/del`, `p_vertical_templates_sel/admin`, `p_admin_users_self`, `p_bookings_anon_ins`, `member_bookings_read` (0014).
- Циклическое создание однотипных политик `p_<table>_sel/ins/upd/del` для групп таблиц: чтение — membership, запись — `is_super_admin()`; для служебных таблиц — только супер-админ.
- `p_analytics_events_ins/sel` (0011).
- `p_partition_admin` для каждой партиции (`secure_partition`).
- `bookings_fill_snapshot()` — триггерная функция.

## 4. Индексы

- `bookings_slot_unique` — уникальный частичный (защита от двойной брони), `bookings_cancel_token_unique`.
- `bookings_status_scheduled_idx`, `bookings_status_created_idx`, `idx_bookings_business_scheduled`, `idx_bookings_business_status`, `idx_bookings_scheduled_status`, `idx_bookings_service`, `idx_bookings_rescheduled_from/to`, `idx_bookings_scheduled`.
- `businesses_status_refused_idx`, `businesses_status_subscription_idx`, `businesses_status_deletion_idx`, `businesses_custom_domain_idx` (partial), `businesses_transfer_support_idx`.
- `outreach_log_status_sent_idx`, `emails_outgoing_business_sent_idx`.
- `idx_audit_log_created/action/business/entity/user`, `idx_audit_log_action_created`.
- `idx_license_pings_pinged/license`, `idx_app_logs_level`, `idx_analytics_business/event/session`, `analytics_daily_uq`, `analytics_daily_business_day`.
- `idx_support_tickets_status_created`, `idx_leads_created`, `idx_leads_status_created`, `idx_payments_paid_at`, `idx_data_requests_open`.
- `idx_ready_services_status/partner/niche`, `idx_partner_messages_partner`, `idx_partner_payouts_partner`, `idx_partners_referrer`, `idx_partner_earnings_type`.
- `cron_marks_created_idx`.

## 5. Storage buckets

| Bucket | Публичность | Миграция | Назначение |
|---|---|---|---|
| `backups` | приватный | 0002 | JSON-бэкапы таблиц, восстановление |
| `photos` | публичный | 0003 | Фото работ бизнесов (подписанная загрузка) |
| `logos` | публичный | 0003 | Логотипы |

## 6. Расширения

`pgcrypto` (0001), `btree_gist` (0007), `pg_cron` (0008), `pg_net` в схеме `extensions` (0008).

## 7. Типы в коде

`общие/lib/database.generated.ts` — сгенерированные типы схемы (`gen-db-types.ps1`). `общие/lib/database.types.ts` — типы строк (`Business`, `AdminUser`, …), в заголовке указано: источник истины — схема БД.
