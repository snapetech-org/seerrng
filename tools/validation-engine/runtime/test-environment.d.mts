export interface IsolatedTestEnvironmentOptions {
  includeCi?: boolean;
  includeVitest?: boolean;
}

export type InheritedTestEnvironment = Record<string, string | undefined>;
export type IsolatedTestEnvironment = Record<string, string>;

export function createIsolatedTestEnvironment(
  directory: string,
  inherited?: InheritedTestEnvironment,
  options?: IsolatedTestEnvironmentOptions
): IsolatedTestEnvironment;

export function setIsolatedTestEnvironment(
  directory: string,
  inherited?: InheritedTestEnvironment,
  options?: IsolatedTestEnvironmentOptions
): IsolatedTestEnvironment;
