import { getRuntimeStrategy, domainBackendFallbackCatalog } from "./runtimeCatalog";


type DomainServiceName = keyof typeof domainBackendFallbackCatalog;
type DomainOperationName<TService extends DomainServiceName> = keyof (typeof domainBackendFallbackCatalog)[TService];

export function requireBackendFallback<
  TService extends DomainServiceName,
  TOperation extends DomainOperationName<TService>,
>(service: TService, operation: TOperation) {
  const strategy = getRuntimeStrategy(domainBackendFallbackCatalog, service, operation);
  if (strategy !== "backend-fallback") {
    throw new Error(
      `Backend fallback is not allowed for ${String(service)}.${String(operation)}.`,
    );
  }
}

export async function callBackendFallback<T>(
  service: DomainServiceName,
  operation: string,
  executor: () => Promise<T>,
): Promise<T> {
  requireBackendFallback(
    service,
    operation as DomainOperationName<typeof service>,
  );
  return await executor();
}
