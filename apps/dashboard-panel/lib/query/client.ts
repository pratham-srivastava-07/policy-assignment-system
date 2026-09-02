import { QueryClient } from "@tanstack/react-query"
import { isApiError } from "@/lib/api"
import { QUERY_TIERS } from "./tiers"

export const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: QUERY_TIERS.READ,
      mutations: {
        retry: (failureCount, error) => {
          if (isApiError(error) && (error.status < 500 || error.isRateLimited)) {
            return false
          }

          return failureCount < 1
        },
      },
    },
  })
