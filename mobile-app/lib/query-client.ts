import {
  MutationCache,
  QueryCache,
  QueryClient,
} from '@tanstack/react-query';
import { reportNetworkError } from './toast';

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (err) => reportNetworkError(err),
    }),
    mutationCache: new MutationCache({
      onError: (err) => reportNetworkError(err),
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, err) => {
          const status =
            err && typeof err === 'object' && 'status' in err
              ? Number((err as { status: unknown }).status)
              : undefined;
          // Do not retry client errors (4xx). Retry up to 3× for 5xx / network errors.
          if (status && status < 500) return false;
          return failureCount < 3;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
