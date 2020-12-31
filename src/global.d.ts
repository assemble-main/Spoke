// Spoke client envvars
// See: https://github.com/Microsoft/TypeScript/issues/19816#issuecomment-508705611
interface Window {
  ALTERNATE_LOGIN_URL?: string;
  SUPPRESS_SELF_INVITE?: boolean;
  ASSIGNMENT_SHOW_REQUESTS_AVAILABLE: boolean;
  GRAPHQL_URL: string;
  SPOKE_VERSION: string;
  MAX_MESSAGE_LENGTH: number;
}

// This was a workaround while we are transitioning from JS to TS - 2020-12-21
declare module "*";
