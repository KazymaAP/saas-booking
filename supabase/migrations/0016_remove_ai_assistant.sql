-- 0016_remove_ai_assistant.sql — удаляет флаг «ИИ-помощник» (ai_assistant).
-- Чат-ассистент в продукте не используется: флаг убирается из настроек платформы
-- и из таблицы feature_flags. Идемпотентно: повторный запуск безопасен.
begin;

update settings
   set value = value - 'ai_assistant'
 where key = 'feature_flags'
   and value ? 'ai_assistant';

delete from feature_flags where key = 'ai_assistant';

commit;
