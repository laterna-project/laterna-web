import { createConnectQueryKey } from "@connectrpc/connect-query";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogService } from "../gen/laterna/v1/catalog_pb";
import { HomeService } from "../gen/laterna/v1/home_pb";
import { createInvalidator } from "./events";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createInvalidator", () => {
  it("batches a burst into one invalidation per service", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const inv = createInvalidator(client, 400);
    inv.mark(HomeService);
    inv.mark(HomeService, CatalogService);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledWith({
      queryKey: createConnectQueryKey({ schema: HomeService, cardinality: undefined }),
    });
  });

  it('"all" wins over the rest', () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    const inv = createInvalidator(client, 400);
    inv.mark(HomeService);
    inv.mark("all");
    vi.advanceTimersByTime(400);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith();
  });
});
