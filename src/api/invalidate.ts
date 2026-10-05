import type { DescService } from "@bufbuild/protobuf";
import { createConnectQueryKey } from "@connectrpc/connect-query";
import { useQueryClient } from "@tanstack/react-query";

/** Refetches everything read from these services, after a change made here. */
export function useInvalidate() {
  const queryClient = useQueryClient();
  return async (...services: DescService[]) => {
    for (const schema of services)
      await queryClient.invalidateQueries({
        queryKey: createConnectQueryKey({ schema, cardinality: undefined }),
      });
  };
}
