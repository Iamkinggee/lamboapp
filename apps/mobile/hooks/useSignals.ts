// apps/mobile/hooks/useSignals.ts
import { useQuery } from '@tanstack/react-query';
import { fetchSignals } from '../services/api';
import { useSignalStore } from '../store/useSignalStore';

export default function useSignals() {
  const setSignals = useSignalStore((s) => s.setSignals);

  const { data, isLoading, refetch, isError } = useQuery({
    queryKey: ['signals'],
    queryFn: async () => {
      const res = await fetchSignals({ limit: 50 });
      if (res.signals?.length) setSignals(res.signals);
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