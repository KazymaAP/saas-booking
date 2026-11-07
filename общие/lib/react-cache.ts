// lib/react-cache.ts — cache() из react для серверных функций (дедупликация внутри одного запроса).
// react.cache есть в Server Components Next.js. В unit-тестах (vitest, React 18 без RSC) его нет:
// тогда функция возвращается как есть — поведение то же, только без дедупликации.
import * as React from 'react';

type AnyFn = (...args: never[]) => unknown;
type ReactCache = <F extends AnyFn>(fn: F) => F;

const reactCache = (React as unknown as { cache?: ReactCache }).cache;

export function cache<F extends AnyFn>(fn: F): F {
  return reactCache ? reactCache(fn) : fn;
}
