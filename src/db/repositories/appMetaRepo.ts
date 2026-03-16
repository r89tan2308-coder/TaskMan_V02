import { db } from '../index';

export async function getAppMetaValue<T>(key: string): Promise<T | undefined> {
  const entry = await db.appMeta.get(key);
  return entry?.value as T | undefined;
}

export async function setAppMetaValue<T>(key: string, value: T): Promise<void> {
  await db.appMeta.put({
    key,
    value,
    updatedAt: new Date().toISOString()
  });
}
