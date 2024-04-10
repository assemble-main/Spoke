const envalid = require("envalid");
const pickBy = require("lodash/pickBy");

const { str, bool, num, email, url, host, port } = envalid;

const ServerMode = Object.freeze({
  Server: "SERVER",
  Worker: "WORKER",
  Dual: "DUAL"
});

const validators = {
  ACTION_HANDLERS: str({
    desc: "Comma-separated list of action handlers to enable.",
    example: "actionkit-rsvp,revere-signup",
    default: undefined
  }),
  AK_BASEURL: url({
    desc: "Baseurl for ActionKit.",
    default: undefined
  }),
  AK_SECRET: str({
    desc: "ActionKit API secret.",
    default: undefined
  }),
  ALLOW_SEND_ALL: bool({
    desc:
      "Whether to allow sending all messages in a campaign at once. NOT LEGAL IN US.",
    default: false,
    isClient: true
  }),
  ALTERNATE_LOGIN_URL: url({
    desc:
      'When set, the "Login" link on the home page will direct to this alternate URL',
    default: undefined,
    isClient: true
  }),
  APOLLO_OPTICS_KEY: str({
    desc: "A key for Apollo tracer.",
    default: undefined
  }),
  ASSETS_DIR: str({
    desc:
      "Directory path where front-end packaged JavaScript is saved and loaded.",
    default: "./build/client/assets"
  }),
  ASSETS_MAP_FILE: str({
    desc:
      "File name of map file, within ASSETS_DIR, containing map of general file names to unique build-specific file names.",
    default: "assets.json"
  }),
  ASSIGNMENT_USERNAME: str({
    desc: "Basic auth username to validate incoming requests to /autoassign.",
    default: undefined
  }),
  ASSIGNMENT_PASSWORD: str({
    desc: "Basic auth password to validate incoming requests to /autoassign.",
    default: undefined
  }),
  ASSIGNMENT_REQUESTED_URL: url({
    desc: "Webhook URL to notify when a texter assignment is requested.",
    default: undefined
  }),
  ASSIGNMENT_REQUESTED_URL_REQUIRED: bool({
    desc:
      "Require successful assignment requested webhook to persist assignment request in Spoke.",
    default: false
  }),
  ASSIGNMENT_REQUESTED_TOKEN: str({
    desc: "Bearer token to use as authorization with ASSIGNMENT_REQUESTED_URL.",
    default: undefined
  }),
  ASSIGNMENT_COMPLETE_NOTIFICATION_URL: url({
    desc:
      "Webhook URL to notify when there are no more assignable campaign contacts.",
    default: undefined
  }),
  ASSIGNMENT_COMPLETE_NOTIFICATION_TEAM_IDS: str({
    desc:
      "Comma separated list of team IDs to restrict 'assignment complete' notifications to.",
    default: ""
  }),
  ASSIGNMENT_SHOW_REQUESTS_AVAILABLE: bool({
    desc:
      "If enabled, display icons on the home page organization selection list indicating availability of assignments.",
    default: false,
    isClient: true
  }),
  ASSIGNMENT_MANAGER_DATABASE_URL: str({
    desc:
      "Database url of external assignent manager - used by 'update-sms-spanish-speakers' cron job",
    default: ""
  }),
  AUTH0_DOMAIN: host({
    desc: "Domain name on Auth0 account",
    example: "example.auth0.com",
    default: undefined,
    isClient: true
  }),
  AUTH0_CLIENT_ID: str({
    desc: "Client ID from Auth0 app.",
    default: undefined,
    isClient: true
  }),
  AUTH0_CLIENT_SECRET: str({
    desc: "Client secret from Auth0 app.",
    default: undefined
  }),
  AUTO_HANDLE_REQUESTS: bool({
    desc: "Whether to auto handle requests after submission",
    default: false
  }),
  ENABLE_AUTOSENDING: bool({
    desc: "Whether autosending is enabled",
    default: false,
    isClient: true
  }),
  ENABLE_REWIRED_SHUTDOWN_NOTICE: bool({
    desc: "Show the Rewired shutdown notice",
    default: true
  }),
  DISABLE_ASSIGNMENT_CASCADE: bool({
    desc:
      "Whether to just assign from 1 campaign rather than gathering from multiple to fulfill a request",
    default: false
  }),
  AUTO_HANDLE_REQUESTS_CONCURRENCY: num({
    desc: "How many requests to handle at once",
    default: 1
  }),
  AWS_ACCESS_AVAILABLE: bool({
    desc: "Enable or disable S3 campaign exports within Amazon Lambda.",
    default: false
  }),
  AWS_ENDPOINT: url({
    desc:
      "An alternate endpoint to use with the AWS SDK. This allows uploading to S3-compatible services such as Wasabi and Google Cloud Storage.",
    default: undefined
  }),
  AWS_ACCESS_KEY_ID: str({
    desc:
      "AWS access key ID with access to S3 bucket, required for campaign exports outside Amazon Lambda.",
    default: undefined
  }),
  AWS_LAMBDA_FUNCTION_NAME: str({
    desc: "Function name to send to AWS Lambda.",
    default: undefined
  }),
  AWS_SECRET_ACCESS_KEY: str({
    desc:
      "AWS access key secret with access to S3 bucket, required for campaign exports outside Amazon Lambda.",
    default: undefined
  }),
  AWS_S3_BUCKET_NAME: str({
    desc: "Name of S3 bucket for saving campaign exports.",
    default: undefined
  }),
  AWS_S3_KEY_PREFIX: str({
    desc: "Optional prefix to add to campaign export S3 keys.",
    example: "spoke/exports/",
    default: ""
  }),
  BAD_BENS_DISABLE_HAS_UNASSIGNED_CONTACTS: bool({
    dec: "Disable use of has unassigned contacts variable",
    default: false
  }),
  BAD_WORD_TOKEN: str({
    desc: "Bearer token used for authorization with BAD_WORD_URL.",
    default: undefined
  }),
  BAD_WORD_URL: url({
    desc: "URL to notify with message text whenever a message is sent.",
    default: undefined
  }),
  BASE_URL: url({
    desc:
      "The base URL of the website, without trailing slash, used to construct various URLs.",
    example: "https://example.org",
    devDefault: "http://localhost:3000",
    isClient: true
  }),
  BULK_SEND_CHUNK_SIZE: num({
    desc:
      "Chunk size to use when sending all texts at once with ALLOW_SEND_ALL",
    default: 100,
    isClient: true
  }),
  CACHE_PREFIX: str({
    desc:
      "If REDISURL is set, then this will prefix keys CACHE_PREFIX, which might be useful if multiple applications use the same redis server.",
    default: undefined
  }),
  CACHING_BUCKETS: str({
    desc:
      "Comma seperated caching buckets to be used for memoization (other than core)",
    default: "core"
  }),
  // Note: redis url likely doesnt pass envalid url validation
  CACHING_URL: str({
    desc: "This enables caching using simple memoization (memoredis)",
    default: undefined
  }),
  CACHING_PREFIX: str({
    desc: "The key prefix to use for memoredis memoization (memoredis)",
    default: undefined
  }),
  CAMPAIGN_ID: num({
    desc:
      "Campaign ID used by dev-tools/export-query.js to identify which campaign should be exported.",
    default: -1
  }),
  CLIENT_NAME: str({
    desc: "Name of client to pass to Datadog",
    default: undefined
  }),
  CONTACT_REMOVAL_SECRET: str({
    desc:
      "Secret to authorize incoming requests to /remove-number-from-campaign",
    default: undefined
  }),
  DATABASE_URL: url({
    desc: "Database connection URL",
    example: "postgres://username:password@127.0.0.1:5432/db_name",
    default: undefined
  }),
  DATABASE_READER_URL: url({
    desc: "Database reader connection URL",
    example: "postgres://username:password@127.0.0.1:5432/db_name",
    default: undefined
  }),
  DB_HOST: host({
    desc: "Domain or IP address of database host.",
    example: "pg-db.example.org",
    default: undefined
  }),
  DB_PORT: num({
    desc: "Database port number.",
    default: 5432
  }),
  DB_NAME: str({
    desc: "Database name.",
    example: "spoke_prod",
    default: undefined
  }),
  DB_USER: str({
    desc: "Database username.",
    default: undefined
  }),
  DB_PASSWORD: str({
    desc: "Database password.",
    default: undefined
  }),
  DB_MIN_POOL: num({
    desc: "Database connection pool minumum size. ",
    default: 2
  }),
  DB_MAX_POOL: num({
    desc: "Database connection pool maximum size. ",
    default: 10
  }),
  DB_IDLE_TIMEOUT_MS: num({
    desc: "Free resouces are destroyed after this many milliseconds",
    default: 30000
  }),
  DB_REAP_INTERVAL_MS: num({
    desc: "How often to check for idle resources to destroy",
    default: 1000
  }),
  DB_USE_SSL: bool({
    desc:
      "Boolean value to determine whether database connections should use SSL.",
    default: false
  }),
  PGSSLMODE: str({
    desc:
      "Postgres SSL mode. Due to a Knex bug, this environment variable must be used in order to specify the SSL mode directly in the driver. This must be set to PGSSLMODE=require to work with Heroku databases above the free tier.",
    choice: ["require"],
    default: undefined
  }),
  DEBUG_INCOMING_MESSAGES: bool({
    desc: "Emit console.log on events related to handleIncomingMessages.",
    default: false
  }),
  DEBUG_SCALING: bool({
    desc: "Emit console.log on events related to scaling issues.",
    default: false
  }),
  DEFAULT_SERVICE: str({
    desc: "Default SMS service.",
    choices: ["assemble-numbers", "twilio", "nexmo", "fakeservice"],
    default: undefined
  }),
  DEFAULT_ORG: num({
    desc:
      "Set only with FIX_ORGLESS. Set to integer organization.id corresponding to the organization you want orgless users to be assigned to.",
    default: -1
  }),
  AUTOJOIN_ORG_UUID: str({
    desc: "UUID of organization to automatically insert users into upon signup",
    default: undefined
  }),
  DD_AGENT_HOST: host({
    desc: "Datadog agent host",
    default: undefined
  }),
  DD_DOGSTATSD_PORT: port({
    desc: "Datadog dogstatd port",
    default: undefined
  }),
  DD_TAGS: str({
    desc: "Comma-separated list of DataDog tags to apply to metrics.",
    example: "app:spoke,client:rewired",
    default: "app:spoke"
  }),
  DELIVERABILITY_ALERT_ENDPOINT: url({
    desc:
      "When present, notification payloads will be sent to this URL when deliverability for a domain becomes poor.",
    default: undefined
  }),
  DEV_APP_PORT: num({
    desc: "Port for development Webpack server.",
    devDefault: 8090,
    default: undefined
  }),
  DISABLE_ASSIGNMENT_PAGE: bool({
    desc: "Whether to disable the Assignments admin page.",
    default: false,
    isClient: true
  }),
  ENABLE_TROLLBOT: bool({
    desc: "Whether to enable trollbot",
    default: false,
    isClient: true
  }),
  TROLL_ALERT_PERIOD_MINUTES: num({
    desc:
      "The interval length in minutes that each troll patrol sweep will examine messages within.",
    default: 6
  }),
  ENABLE_CAMPAIGN_GROUPS: bool({
    desc: "Whether to enable campaign groups",
    default: false,
    isClient: true
  }),
  ENABLE_SHORTLINK_DOMAINS: bool({
    desc: "Whether to enable shortlink domains",
    default: false,
    isClient: true
  }),
  DISABLE_TEXTER_NOTIFICATIONS: bool({
    desc:
      "Whether to disable texter notifications – if true, should be implemented externally.",
    default: false
  }),
  DISABLED_TEXTER_NOTIFICATION_TYPES: str({
    desc: "Comma-separated list of notification names to ignore.",
    example: "assignment.message.received,assignment.updated",
    default: ""
  }),
  DISABLE_SIDEBAR_BADGES: bool({
    desc: "Whether to disable showing the badge counts on the admin sidebar.",
    default: "false",
    isClient: true
  }),
  EMAIL_FROM: email({
    desc: "Email from address. Required to send email from SMTP server.",
    default: undefined
  }),
  EMAIL_REPLY_TO: email({
    desc:
      "Reply-To address. If not supplied, an organization owner's email address will be used.",
    default: undefined
  }),
  EMAIL_HOST: host({
    desc: "Email server host. Required for custom SMTP server usage.",
    default: undefined
  }),
  EMAIL_HOST_PASSWORD: str({
    desc: "Email server password. Required for custom SMTP server usage.",
    default: undefined
  }),
  EMAIL_HOST_PORT: port({
    desc: "Email server port. Required for custom SMTP server usage.",
    default: 465
  }),
  EMAIL_HOST_SECURE: bool({
    desc: "Whether nodemailer should use TLS or not.",
    default: true
  }),
  EMAIL_HOST_USER: str({
    desc: "Email server user. Required for custom SMTP server usage.",
    default: undefined
  }),
  ENABLE_MONTHLY_ORG_MESSAGE_LIMITS: bool({
    desc: "Whether to enable monthly, per organization message limits",
    default: false
  }),
  ENCRYPTION_ALGORITHM: str({
    desc: "Encryption algorithm to use with crypto package.",
    choices: ["aes256"],
    default: "aes256"
  }),
  ENCRYPTION_INPUT_ENCODING: str({
    desc: "Input encoding to use with crypto package.",
    choices: ["utf8"],
    default: "utf8"
  }),
  ENCRYPTION_OUTPUT_ENCODING: str({
    desc: "Output encoding to use with crypto package.",
    choices: ["hex"],
    default: "hex"
  }),
  EXPERIMENTAL_VAN_SYNC: bool({
    desc: "Use experimental real-time VAN sync",
    default: false,
    isClient: true
  }),
  EXPORT_DRIVER: str({
    desc: "Which cloud storage driver to use for exports.",
    choices: ["s3", "gs-json"], // eventually add support for GCP w/ HMAC interoperability: ["gs"]
    default: "s3"
  }),
  EXPORT_CAMPAIGN_CHUNK_SIZE: num({
    desc: "Chunk size to use for exporting campaign contacts and messages.",
    default: 1000
  }),
  FIX_ORGLESS: bool({
    desc:
      "Set to true only if you want to run the job that automatically assigns the default org (see DEFAULT_ORG) to new users who have no assigned org.",
    default: false
  }),
  GOOGLE_APPLICATION_CREDENTIALS: str({
    desc: "JSON token for service account",
    default: undefined
  }),
  GRAPHQL_URL: str({
    desc: "Optional URL for pointing GraphQL API requests. ",
    example: "https://externalservice.org/graphql",
    default: "/graphql",
    isClient: true
  }),
  HIDE_CAMPAIGN_STATE_VARS_ON_ARCHIVED_CAMPAIGNS: bool({
    desc:
      "If true, campaign state tags on the campaigns list page will be hidden for archived campaigns",
    default: false
  }),
  CONTACT_FIELDS_TO_HIDE: str({
    desc:
      "A comma separated list of contact fields to not ship to the client. Can include 'external_id, cell, and lastName'",
    default: ""
  }),
  SHOW_10DLC_REGISTRATION_NOTICES: bool({
    desc:
      "Whether the 10DLC Registration Notices are displayed to Admins and Owners",
    default: true,
    isClient: true
  }),
  JOBS_SAME_PROCESS: bool({
    desc:
      "Whether jobs should be executed in the same process in which they are created (vs. processing asyncronously via worker processes).",
    default: true
  }),
  JOBS_SYNC: bool({
    desc:
      "Whether jobs should be performed syncronously. Requires JOBS_SAME_PROCESS.",
    default: false
  }),
  LAMBDA_DEBUG_LOG: bool({
    desc: "When true, log each lambda event to the console.",
    default: false
  }),
  LARGE_CAMPAIGN_THRESHOLD: num({
    desc: 'Threshold for what qualifies as a "large campaign"',
    default: 100 * 1000
  }),
  LARGE_CAMPAIGN_WEBHOOK: url({
    desc: "URL to send webhook to when large campaign is uploaded or started",
    default: undefined
  }),
  LOGGING_MONGODB_URI: url({
    desc: "If present, requestLogger will send logs events to MongoDB.",
    default: undefined
  }),
  // npm log level choices: https://github.com/winstonjs/winston#logging-levels
  LOG_LEVEL: str({
    desc: "The winston log level.",
    choices: ["silly", "debug", "verbose", "info", "warn", "error"],
    default: "warn",
    devDefault: "silly"
  }),
  MAX_CONTACTS: num({
    desc:
      "If set each campaign can only have a maximum of the value (an integer). This is good for staging/QA/evaluation instances. Set to 0 for no maximum.",
    default: 0
  }),
  MAX_CONTACTS_PER_TEXTER: num({
    desc:
      "Maximum contacts that a texter can receive. This is particularly useful for dynamic assignment. Set to 0 for no maximum.",
    default: 500
  }),
  MAX_MESSAGE_LENGTH: num({
    desc:
      "The maximum size for a message that a texter can send. When you send a SMS message over 160 characters the message will be split, so you might want to set this as 160 or less if you have a high SMS-only target demographic.",
    default: 99999,
    isClient: true
  }),
  MODE: str({
    desc: "Server mode",
    choices: Object.values(ServerMode),
    default: ServerMode.Dual
  }),
  MUI_PRO_KEY: str({
    desc: "MUI Pro Key",
    default: undefined,
    isClient: true
  }),
  NEXMO_API_KEY: str({
    desc: "Nexmo API key. Required if using Nexmo.",
    default: undefined
  }),
  NEXMO_API_SECRET: str({
    desc: "Nexmo API secret. Required if using Nexmo.",
    default: undefined
  }),
  NO_EXTERNAL_LINKS: bool({
    desc:
      "Removes google fonts and auth0 login script -- good for development offline when you already have an auth0 session.",
    default: false
  }),
  NODE_ENV: str({
    desc: "Node environment",
    choices: ["production", "development", "test"],
    default: "development",
    isClient: true
  }),
  NOT_IN_USA: bool({
    desc:
      "A flag to affirmatively indicate the ability to use features that are discouraged or not legally usable in the United States. Consult with an attorney about the implications for doing so. Default assumes a USA legal context.",
    default: false,
    isClient: true
  }),
  OPT_OUT_MESSAGE: str({
    desc: "Spoke instance-wide default for opt out message.",
    default: undefined
  }),
  OPTOUTS_SHARE_ALL_ORGS: bool({
    desc:
      "Can be set to true if opt outs should be respected per instance and across organizations.",
    default: false
  }),
  OUTPUT_DIR: str({
    desc: "Directory path for packaged files should be saved to. Required.",
    default: "./build"
  }),
  PASSPORT_STRATEGY: str({
    desc: "Which passport strategy to use for authentication.",
    choices: ["auth0", "slack", "local"],
    default: "auth0",
    isClient: true
  }),
  PHONE_NUMBER_COUNTRY: str({
    desc: "Country code for phone number formatting.",
    default: "US",
    isClient: true
  }),
  PORT: port({
    desc: "Port for Heroku servers.",
    default: 3000
  }),
  PUBLIC_DIR: str({
    desc: "Directory path server should use to serve files. Required.",
    default: "./build/client"
  }),
  REDIS_FAKE: bool({
    desc: "Use fakeredis package to back cache.",
    default: false
  }),
  REDIS_URL: url({
    desc:
      "	This enables caching using the url option in redis library. This is an area of active development. More can be seen at server/models/cacheable-queries/README",
    default: undefined
  }),
  REVERE_SQS_URL: url({
    desc: "SQS URL to process outgoing Revere SMS Messages.",
    default: undefined
  }),
  REVERE_LIST_ID: str({
    desc: "Revere List to add user to.",
    default: undefined
  }),
  REVERE_NEW_SUBSCRIBER_MOBILE_FLOW: str({
    desc: "Revere mobile flow to trigger upon recording action.",
    default: undefined
  }),
  REVERE_MOBILE_API_KEY: str({
    desc: "Revere authentication api key to use to access Revere API.",
    default: undefined
  }),
  REVERE_API_URL: url({
    desc: "Revere api endpoint to use for triggering a mobile flow.",
    default: undefined
  }),
  ROLLBAR_CLIENT_TOKEN: str({
    desc: "Client token for Rollbar error tracking.",
    default: undefined,
    isClient: true
  }),
  ROLLBAR_ACCESS_TOKEN: str({
    desc: "Access token for Rollbar error tracking.",
    default: undefined,
    isClient: true
  }),
  ROLLBAR_ENDPOINT: url({
    desc: "Endpoint URL for Rollbar error tracking.",
    default: undefined
  }),
  SEND_DELAY: num({
    desc: "Delay between successive sends in Spoke client",
    default: 100,
    isClient: true
  }),
  SESSION_SECRET: str({
    desc: "Unique key used to encrypt sessions."
  }),
  SHUTDOWN_GRACE_PERIOD: num({
    desc:
      "How long to wait after receiving kill signal before tearing down. Useful for waiting for readiness probe period.",
    default: 5000,
    devDefault: 10
  }),
  SLACK_TEAM_NAME: str({
    desc: "The name of the Slack team to use for sign-in.",
    default: undefined
  }),
  SLACK_TEAM_ID: str({
    desc: "The ID of the Slack team to use for sign-in.",
    default: undefined
  }),
  SLACK_CLIENT_ID: str({
    desc: "The Slack client ID to use for sign-in.",
    default: undefined,
    isClient: true
  }),
  SLACK_CLIENT_SECRET: str({
    desc: "The Slack client secret to use for sign-in.",
    default: undefined
  }),
  SLACK_SCOPES: str({
    desc: "Comma separated list Slack scopes to request.",
    example: "groups:read",
    default: "identity.basic,identity.email,identity.team"
  }),
  SLACK_CONVERT_EXISTING: bool({
    desc:
      "When true, Slack authentication will attempt to convert existing non-Slack accounts (with matching emails) to Slack accounts",
    default: true
  }),
  SLACK_TOKEN: str({
    desc: "The Slack token to use for the slack-teams-update cron job",
    default: undefined
  }),
  SLACK_NOTIFY_URL: url({
    desc:
      "If set, then on post-install (often from deploying) a message will be posted to a slack channel's #spoke channel",
    default: undefined
  }),
  SLACK_SYNC_CHANNELS: bool({
    desc:
      "If true, Spoke team membership will be synced with matching Slack channel membership",
    default: false
  }),
  SLACK_SYNC_CHANNELS_CRONTAB: str({
    desc: "The crontab schedule to run the team sync on",
    default: "*/10 * * * *"
  }),
  STATIC_BASE_URL: str({
    desc: "Alternate static base url",
    example: "https://s3.us-east-1.amazonaws.com/my-spoke-bucket/spoke/static/",
    default: "/assets/"
  }),
  SUPERADMIN_LOGIN_SECRET: str({
    desc:
      "A secret login code to allow a superadmin to assume the role of an organization owner.",
    default: undefined
  }),
  SUPPRESS_SELF_INVITE: bool({
    desc:
      "Prevent self-invitations. Recommend setting before making sites available to public.",
    default: true,
    isClient: true
  }),
  TERMS_REQUIRE: bool({
    desc:
      "Require texters to accept the Terms page before they can start texting.",
    default: false,
    isClient: true
  }),
  TEST_DATABASE_URL: url({
    desc: "Testing database connection URL",
    example: "postgres://username:password@127.0.0.1:5432/db_name",
    default: undefined
  }),
  TWILIO_API_KEY: str({
    desc: "Twilio API key. Required if using Twilio.",
    default: undefined
  }),
  TWILIO_APPLICATION_SID: str({
    desc: "Twilio application ID. Required if using Twilio.",
    default: undefined
  }),
  TWILIO_AUTH_TOKEN: str({
    desc: "Twilio auth token. Required if using Twilio.",
    default: undefined
  }),
  TWILIO_MESSAGE_SERVICE_SID: str({
    desc: "Twilio message service ID. Required if using Twilio.",
    default: undefined
  }),
  TWILIO_STATUS_CALLBACK_URL: url({
    desc: "URL for Twilio status callbacks. Required if using Twilio.",
    example: "https://example.org/twilio-message-report",
    default: undefined
  }),
  TWILIO_SQS_QUEUE_URL: url({
    desc:
      "AWS SQS URL to handle incoming messages when app isn't connected to Twilio.",
    default: undefined
  }),
  TWILIO_MESSAGE_VALIDITY_PERIOD: num({
    desc: "An optional maximum validity period for queued Twilio messages.",
    default: undefined
  }),
  TWILIO_VALIDATION_HOST: host({
    desc:
      'Allow overriding the host Spoke validates Twilio headers against. This can be useful if you are running Spoke behind a proxy. If set to "", the host option will be undefined.',
    default: undefined
  }),
  TZ: str({
    desc: "The timezone Spoke is operating in.",
    example: "Australia/Sydney",
    default: "America/New_York",
    isClient: true
  }),
  SCRIPT_PREVIEW_AUTH: str({
    desc:
      "A JSON blob passed directly to express-basic-auth for locking campaign previews",
    default: undefined
  }),
  SKIP_TWILIO_VALIDATION: bool({
    desc: "Whether to bypass Twilio header validation altogether.",
    default: false
  }),
  SPANISH_TEAM_ID: num({
    desc:
      "ID of Spanish team for use in 'update-sms-spanish-speakers' cron job",
    default: undefined
  }),
  SPOKE_VERSION: str({
    desc: "The version of Spoke running",
    default: "no-version",
    isClient: true
  }),
  SWITCHBOARD_BASE_URL: url({
    desc: "Custom base URL for Switchboard client.",
    default: undefined
  }),
  VAN_BASE_URL: url({
    desc:
      "The base url to use when interacting with VAN (may need to change for international use)",
    default: "https://api.securevan.com/v4"
  }),
  VAN_EXPORT_TYPE: num({
    desc:
      "The numeric coding of the VAN list export type. The default is the Hustle format.",
    default: 8
  }),
  EXPORT_JOB_WEBHOOK: url({
    default: "https://eneeuk8v5vhvsc8.m.pipedream.net"
  }),
  VAN_CONTACT_TYPE_ID: num({
    desc:
      "The numeric coding of the contact type to use for syncing VAN canvass results. Default is 'SMS Text'.",
    default: 37
  }),
  WAREHOUSE_DB_TYPE: str({
    desc:
      "Enables ability to load contacts directly from a SQL query from a separate data-warehouse db -- only is_superadmin-marked users will see the interface",
    choices: ["mysql", "pg", "sqlite3"],
    default: undefined
  }),
  WAREHOUSE_DB_HOST: host({
    desc:
      "Enables ability to load contacts directly from a SQL query from a separate data-warehouse db -- only is_superadmin-marked users will see the interface",
    default: "127.0.0.1"
  }),
  WAREHOUSE_DB_PORT: port({
    desc:
      "Enables ability to load contacts directly from a SQL query from a separate data-warehouse db -- only is_superadmin-marked users will see the interface",
    default: 5432
  }),
  WAREHOUSE_DB_NAME: str({
    desc:
      "Enables ability to load contacts directly from a SQL query from a separate data-warehouse db -- only is_superadmin-marked users will see the interface",
    default: undefined
  }),
  WAREHOUSE_DB_USER: str({
    desc:
      "Enables ability to load contacts directly from a SQL query from a separate data-warehouse db -- only is_superadmin-marked users will see the interface",
    default: undefined
  }),
  WAREHOUSE_DB_PASSWORD: str({
    desc:
      "Enables ability to load contacts directly from a SQL query from a separate data-warehouse db -- only is_superadmin-marked users will see the interface",
    default: undefined
  }),
  WAREHOUSE_DB_LAMBDA_ITERATION: bool({
    desc:
      "If the WAREHOUSE_DB connection/feature is enabled, then on AWS Lambda, queries that take longer than 5min can expire. This will enable incrementing through queries on new lambda invocations to avoid timeouts.",
    default: false
  }),
  WEBHOOK_PAYLOAD_ALL_STRINGS: bool({
    desc: "If true, all payload values will be converted to strings.",
    default: false
  }),
  WORKER_CONCURRENCY: num({
    desc: "Worker concurrency. ",
    default: 2
  }),
  WORKER_MAX_POOL: num({
    desc: "Worker database connection pool maximum size. ",
    default: 2
  })
};

const config = envalid.cleanEnv(process.env, validators, {
  strict: true
});

const clientConfig = pickBy(
  { ...config },
  (value, key) => validators[key].isClient
);

module.exports = { config, clientConfig, ServerMode };
