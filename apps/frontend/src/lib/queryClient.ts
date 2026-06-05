import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';
import toast from 'react-hot-toast';
import i18n from '@/locales/i18n';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      onError: (error) => {
        if (error instanceof ApiError && error.status !== 402) {
          toast.error(i18n.t(error.code));
        }
      },
    },
  },
});
