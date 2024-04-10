// Spoke client envvars
// See: https://github.com/Microsoft/TypeScript/issues/19816#issuecomment-508705611
interface Window {
  ALTERNATE_LOGIN_URL?: string;
  SUPPRESS_SELF_INVITE?: boolean;
  ASSIGNMENT_SHOW_REQUESTS_AVAILABLE: boolean;
  GRAPHQL_URL: string;
  SPOKE_VERSION: string;
  MAX_MESSAGE_LENGTH: number;
  PASSPORT_STRATEGY: string;
  TZ: string;
  RENDERED_CLASS_NAMES: string[];
  NOT_IN_USA: boolean;
  ALLOW_SEND_ALL: boolean;
  NODE_ENV: string;
  BASE_URL: string;
  ENABLE_TROLLBOT: boolean;
  SHOW_10DLC_REGISTRATION_NOTICES: boolean;

  AuthService: any;
}

// This was a workaround while we are transitioning from JS to TS - 2020-12-21
declare module "*";
