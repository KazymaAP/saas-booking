'use client';
// texts/TextsForm.tsx — редактор текстов с живым превью первого экрана (ТЗ §5.3, §19.6).
// Клиентский: счётчики символов и превью обновляются при вводе, ошибки — под полем.
import { useCallback, useId } from 'react';
import { useForm, useWatch, type Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { FieldFrame, fieldA11y } from '../_components/Field';
import { useToast } from '../_components/Toast';
import { callAction } from '../_lib/client-action';
import { applyServerErrors } from '../_lib/form';
import { useUnsavedGuard } from '../_lib/useUnsavedGuard';
import { saveTexts } from './actions';
import { DEFAULT_CTA, TEXT_KEYS, TEXT_META, TextsSchema, cleanText, type TextKey, type TextsValues } from './schema';

type Fallbacks = { title: string; subtitle: string };

export function TextsForm({ slug, defaults, fallbacks, canEdit }: { slug: string; defaults: TextsValues; fallbacks: Fallbacks; canEdit: boolean }) {
  const uid = useId();
  const toast = useToast();
  const { register, handleSubmit, setError, reset, control, formState: { errors, isSubmitting, isDirty } } = useForm<TextsValues>({
    resolver: zodResolver(TextsSchema),
    defaultValues: defaults,
    mode: 'onChange',
  });
  useUnsavedGuard(canEdit && isDirty && !isSubmitting);

  const submit = useCallback(async (values: TextsValues) => {
    const res = await callAction(() => saveTexts(slug, values));
    if (!res.ok) {
      applyServerErrors(setError, res.fieldErrors, TEXT_KEYS);
      toast.error(res.error);
      return;
    }
    reset(values);
    toast.success(res.message ?? 'Сохранено');
  }, [reset, setError, slug, toast]);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start">
      <form onSubmit={handleSubmit(submit)} noValidate className="grid gap-4" aria-busy={isSubmitting}>
        <fieldset disabled={!canEdit || isSubmitting} className="grid gap-4">
          {TEXT_KEYS.map((k) => {
            const id = `${uid}-${k}`;
            const error = errors[k]?.message;
            const meta = TEXT_META[k];
            const a11y = fieldA11y(id, error, meta.hint);
            return (
              <FieldFrame key={k} id={id} label={<>{meta.label} <Counter control={control} name={k} /></>} hint={meta.hint} error={error}>
                {meta.multiline
                  ? <textarea {...register(k)} {...a11y} maxLength={meta.limit} rows={k === 'about' ? 8 : 3} />
                  : <input {...register(k)} {...a11y} maxLength={meta.limit} autoComplete="off" />}
              </FieldFrame>
            );
          })}
        </fieldset>
        {canEdit && (
          <button type="submit" disabled={isSubmitting || !isDirty} className="w-full !min-h-[44px] sm:w-fit">
            {isSubmitting ? 'Сохраняем…' : 'Сохранить'}
          </button>
        )}
      </form>
      <Preview control={control} fallbacks={fallbacks} />
    </div>
  );
}

// Счётчик «12 / 120» — подписан к полю, aria-hidden нет: диктор читает лимит вместе с подписью.
function Counter({ control, name }: { control: Control<TextsValues>; name: TextKey }) {
  const length = cleanText(name, useWatch({ control, name }) ?? '').length;
  const limit = TEXT_META[name].limit;
  const near = length > limit * 0.9;
  return <span className={`font-normal ${near ? 'text-[#a16207]' : 'text-[#595959]'}`}>({length} / {limit})</span>;
}

// Превью первого экрана сайта: те же правила подстановки по умолчанию, что у публичной страницы.
function Preview({ control, fallbacks }: { control: Control<TextsValues>; fallbacks: Fallbacks }) {
  const v = useWatch({ control });
  const title = cleanText('hero_title', v.hero_title ?? '') || fallbacks.title;
  const subtitle = cleanText('hero_subtitle', v.hero_subtitle ?? '') || fallbacks.subtitle;
  const about = cleanText('about', v.about ?? '');
  return (
    <aside aria-labelledby="texts-preview-title" className="grid gap-2 lg:sticky lg:top-24">
      <h2 id="texts-preview-title" className="!mb-0 text-[14px] font-semibold uppercase tracking-wide text-[#595959]">Превью</h2>
      <div className="grid gap-3 overflow-hidden rounded-xl border border-[#e5e5e5] bg-white p-5">
        <p className="!mb-0 break-words text-[24px] font-bold leading-tight">{title}</p>
        {subtitle && <p className="!mb-0 whitespace-pre-line break-words text-[15px] text-[#555555]">{subtitle}</p>}
        <span className="inline-flex min-h-[44px] w-fit items-center rounded-lg px-4 font-semibold text-white" style={{ background: 'var(--brand-color)' }}>
          {cleanText('cta', v.cta ?? '') || DEFAULT_CTA}
        </span>
        {about && (
          <div className="border-t border-[#e5e5e5] pt-3">
            <p className="!mb-1 font-semibold">О нас</p>
            <p className="!mb-0 line-clamp-6 whitespace-pre-line break-words text-[14px] text-[#555555]">{about}</p>
          </div>
        )}
      </div>
      <p className="!mb-0 text-[13px] text-[#595959]">Примерный вид. Шрифты и фон — как в шаблоне сайта.</p>
    </aside>
  );
}
