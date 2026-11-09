import type { ApiArg, ApiMethod, ApiResult } from '@shared/api';

/** Error returned by main. `user` = message is meant to be shown to the user. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly user: boolean,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function call<K extends ApiMethod>(method: K, ...arg: ApiArg<K> extends void ? [] : [ApiArg<K>]): Promise<ApiResult<K>> {
  const r = await window.notenblatt.invoke(method, arg[0] as ApiArg<K>);
  if (r.ok) return r.value;
  throw new ApiError(r.error, r.user);
}
