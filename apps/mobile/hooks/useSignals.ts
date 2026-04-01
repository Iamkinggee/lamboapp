// apps/mobile/hooks/useSignals.ts
// NOTE: This hook is intentionally thin. The Signals tab manages its own
// query inline with proper initial-load-vs-merge logic. This hook exists
// for any screen that needs signals without the tab's filter state.

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchSignals } from '../services/api';
import { useSignalStore } from '../store/useSignalStore';

export default function useSignals() {
  const setSignals = useSignalStore((s) => s.setSignals);
  const addSignals = useSignalStore((s) => s.addSignals);
  const initialLoadDone = useRef(false);

  const { data, isLoading, refetch, isError } = useQuery({
    queryKey: ['signals'],
    queryFn: async () => {
      const res = await fetchSignals({ limit: 50 });
      if (res.signals?.length) {
        // FIX: Only do a full setSignals on first load.
        // Subsequent calls merge so WS-delivered signals aren't evicted.
        if (!initialLoadDone.current) {
          setSignals(res.signals);
          initialLoadDone.current = true;
        } else {
          addSignals(res.signals);
        }
      }
      return res;
    },
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  return {
    signals: data?.signals ?? [],
    loading: isLoading,
    isError,
    refetch,
  };
}