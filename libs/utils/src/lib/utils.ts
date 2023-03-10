export function memoize<T1, T2 extends (...params: any[]) => T1 | Promise<T1>>(
  func: T2
): (...params: Parameters<T2>) => Awaited<T1> {
  const cache: Map<string, T1> = new Map();
  return ((...params) => {
    const key = params.map((u) => u.toString()).join('-');
    const saved = cache.get(key);
    if (saved) {
      return saved;
    } else {
      const result = func(...params);
      if (isPromise(result)) {
        return result.then((v) => {
          cache.set(key, v);
          return v;
        });
      } else {
        cache.set(key, result);
        return result;
      }
    }
  }) as (...params: Parameters<T2>) => Awaited<T1>;
}

export function isPromise<T1>(t: T1 | Promise<T1>): t is Promise<T1> {
  return typeof t === 'object' && typeof t['then'] === 'function';
}

export function trimString(str: string, length: number) {
  return str.length < length ? str : str.substring(0, length - 1) + '…';
}
