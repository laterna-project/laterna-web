import type { Transport } from "@connectrpc/connect";
import { createQueryOptions } from "@connectrpc/connect-query";
import { AuthService } from "../gen/laterna/v1/auth_pb";
import { CatalogService } from "../gen/laterna/v1/catalog_pb";
import { ServerService } from "../gen/laterna/v1/server_pb";

/** Public description of the server (name, version, whether setup is pending). */
export const serverInfoQuery = (transport: Transport) =>
  createQueryOptions(ServerService.method.getServerInfo, {}, { transport });

/** Libraries the profile can browse, with their kind and counts. */
export const catalogLibrariesQuery = (transport: Transport) =>
  createQueryOptions(CatalogService.method.listCatalogLibraries, {}, { transport });

/** This device's session: account, chosen profile. */
export const sessionQuery = (transport: Transport) =>
  createQueryOptions(AuthService.method.getSession, {}, { transport });
