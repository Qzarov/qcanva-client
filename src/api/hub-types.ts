// Выборки из сгенерированной схемы хаба (src/api/hub-schema.d.ts, `npm run api:types`).
// Типы ответов и тел в src/api/* выводятся отсюда, чтобы расхождение с хабом ломало
// `npm run build`, а не всплывало в рантайме. Пути — как в схеме, с префиксом `/api`.
import type { components, paths } from './hub-schema';

export type HubPath = keyof paths;

/** HTTP-методы, которые у пути действительно есть (в схеме отсутствующие — `?: never`). */
export type HubMethod<P extends HubPath> = {
  [M in keyof paths[P]]-?: M extends 'parameters'
    ? never
    : [NonNullable<paths[P][M]>] extends [never]
      ? never
      : M;
}[keyof paths[P]];

type HubOperation<P extends HubPath, M extends HubMethod<P>> = NonNullable<paths[P][M]>;

type JsonContent<R> = R extends { content: { 'application/json': infer B } } ? B : never;

type SuccessStatus = 200 | 201 | 202 | 204;

/** JSON успешного ответа операции (200/201/202/204). */
export type HubResponse<P extends HubPath, M extends HubMethod<P>> =
  HubOperation<P, M> extends { responses: infer Rs }
    ? JsonContent<Rs[Extract<keyof Rs, SuccessStatus>]>
    : never;

/** JSON тела запроса операции. */
export type HubBody<P extends HubPath, M extends HubMethod<P>> =
  HubOperation<P, M> extends { requestBody?: infer B } ? JsonContent<NonNullable<B>> : never;

/** Query-параметры операции. */
export type HubQuery<P extends HubPath, M extends HubMethod<P>> =
  HubOperation<P, M> extends { parameters: { query?: infer Q } } ? NonNullable<Q> : never;

/** Именованная схема из `components.schemas`. */
export type HubSchema<N extends keyof components['schemas']> = components['schemas'][N];

/** Элемент массива. */
export type ItemOf<A> = A extends readonly (infer T)[] ? T : never;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * Сгенерированный тип с уточнёнными полями: например, `kind: string` хаба → союз литералов
 * клиента. Каждое уточнение должно существовать в `T` и быть совместимо с его типом —
 * иначе ошибка сборки, то есть хаб и клиент разошлись.
 */
export type Refine<
  T,
  O extends { [K in keyof O]: K extends keyof T ? T[K] : never },
> = Simplify<Omit<T, keyof O> & O>;

/**
 * Поля, где клиент сознательно ждёт не то, что объявил хаб (возможный баг одной из сторон).
 * Тип поля любой, но поле обязано быть в `T`: пропадёт из схемы — ошибка сборки.
 * Каждое такое поле помечай комментарием `// расходится со схемой хаба: <тип в схеме>`.
 */
export type Override<
  T,
  O extends { [K in keyof O]: K extends keyof T ? unknown : never },
> = Simplify<Omit<T, keyof O> & O>;
