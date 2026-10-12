import { useSQLiteContext } from 'expo-sqlite';
import { useMemo } from 'react';

import { UNCATEGORIZED_EMOJI } from '@/core/categories';
import type { TxnType } from '@/core/types';
import { useQuery } from '@/db/changes';
import { listCategories, type Category } from '@/db/repo';

export const TYPE_LABELS: Record<TxnType, string> = {
  expense: 'Expense',
  income: 'Income',
  refund: 'Refund',
  transfer: 'Transfer',
  investment: 'Investment',
};

export function useCategories() {
  const db = useSQLiteContext();
  const { data } = useQuery(() => listCategories(db), [db]);
  return useMemo(() => {
    const list: Category[] = data ?? [];
    const byId = new Map(list.map((c) => [c.id, c]));
    return {
      list,
      nameOf: (id: string | null) => (id === null ? 'Uncategorized' : (byId.get(id)?.name ?? 'Uncategorized')),
      emojiOf: (id: string | null) => (id === null ? UNCATEGORIZED_EMOJI : (byId.get(id)?.emoji ?? UNCATEGORIZED_EMOJI)),
    };
  }, [data]);
}
