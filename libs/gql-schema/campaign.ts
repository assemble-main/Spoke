export const schema = `
  input CampaignsFilter {
    isArchived: Boolean
    isStarted: Boolean
    organizationId: Int
    campaignId: Int
    listSize: Int
    pageSize: Int
    campaignTitle: String
  }

  type CampaignStats {
    sentMessagesCount: Int!
    receivedMessagesCount: Int!
    optOutsCount: Int!
    needsMessageOptOutsCount: Int!
    percentUnhandledReplies: Float!
    countMessagedContacts: Int!
    countNeedsMessageContacts: Int!
  }

  type DeliverabilityErrorStat {
    errorCode: String
    count: Int!
  }

  input CampaignDeliverabilityStatsFilter {
    initialMessagesOnly: Boolean
  }

  type CampaignDeliverabilityStats {
    deliveredCount: Int!
    sendingCount: Int!
    sentCount: Int!
    errorCount: Int!
    specificErrors: [DeliverabilityErrorStat]
  }

  type JobRequest {
    id: String!
    jobType: String!
    assigned: Boolean
    status: Int
    resultMessage: String
    createdAt: Date!
    updatedAt: Date!
  }

  type CampaignReadiness {
    id: ID!
    basics: Boolean!
    messagingService: Boolean!
    textingHours: Boolean!
    integration: Boolean!
    contacts: Boolean!
    autoassign: Boolean!
    cannedResponses: Boolean!
    campaignGroups: Boolean!
    campaignVariables: Boolean!
    interactions: Boolean!
    texters: Boolean!
  }

  enum ExternalSyncReadinessState {
    READY
    MISSING_SYSTEM
    MISSING_REQUIRED_MAPPING
    INCLUDES_NOT_ACTIVE_TARGETS
  }

  type CsvColumnMapping {
    column: String!
    remap: String!
  }

  type Campaign {
    id: ID!
    organization: Organization!
    title: String!
    description: String!
    dueBy: Date
    readiness: CampaignReadiness!
    isApproved: Boolean!
    isStarted: Boolean
    isArchived: Boolean
    isTemplate: Boolean!
    creator: User
    texters: [User]
    assignments(assignmentsFilter: AssignmentsFilter): [Assignment]
    interactionSteps: [InteractionStep]
    invalidScriptFields: [String!]!
    contacts: [CampaignContact]
    contactsCount: Int
    hasUnassignedContacts: Boolean
    hasUnsentInitialMessages: Boolean
    hasUnhandledMessages: Boolean
    customFields: [String]
    cannedResponses(userId: String): [CannedResponse!]!
    stats: CampaignStats,
    pendingJobs(jobTypes: [String]): [JobRequest]!
    datawarehouseAvailable: Boolean
    useDynamicAssignment: Boolean
    introHtml: String
    primaryColor: String
    logoImageUrl: String
    editors: String
    teams: [Team!]!
    campaignGroups: CampaignGroupPage
    campaignVariables: CampaignVariablePage!
    textingHoursStart: Int
    textingHoursEnd: Int
    isAutoassignEnabled: Boolean!
    repliesStaleAfter: Int
    isAssignmentLimitedToTeams: Boolean!
    timezone: String
    createdAt: String!
    previewUrl: String
    landlinesFiltered: Boolean!
    externalSystem: ExternalSystem
    syncReadiness: ExternalSyncReadinessState!
    externalSyncConfigurations(after: Cursor, first: Int): ExternalSyncQuestionResponseConfigPage!
    deliverabilityStats(filter: CampaignDeliverabilityStatsFilter): CampaignDeliverabilityStats!
    autosendStatus: String!
    messagingServiceSid: String
    autosendLimit: Int
    columnMapping: [CsvColumnMapping!]
    messagingService: MessagingService
  }

  type CampaignEdge {
    cursor: Cursor!
    node: Campaign!
  }

  type CampaignPage {
    edges: [CampaignEdge!]!
    pageInfo: RelayPageInfo!
  }

  type CampaignsList {
    campaigns: [Campaign]
  }

  union CampaignsReturn = PaginatedCampaigns | CampaignsList

  type PaginatedCampaigns {
    campaigns: [Campaign!]!
    pageInfo: PageInfo!
  }

  type CampaignNavigation {
    nextCampaignId: String
    prevCampaignId: String
  }

  input TexterAssignmentInput {
    userId: String!
    contactsCount: Int!
  }

  input TexterInput {
    assignmentInputs: [TexterAssignmentInput!]!
    ignoreAfterDate: Date!
  }

  input CsvColumnMappingInput {
    column: String!
    remap: String!
  }

  input CampaignInput {
    title: String
    description: String
    dueBy: Date
    logoImageUrl: String
    primaryColor: String
    introHtml: String
    externalSystemId: String
    useDynamicAssignment: Boolean
    contacts: [CampaignContactInput]
    contactsFile: Upload
    externalListId: String
    filterOutLandlines: Boolean
    excludeCampaignIds: [String!]
    contactSql: String
    organizationId: String
    isAssignmentLimitedToTeams: Boolean
    teamIds: [ID]
    campaignGroupIds: [String!]
    campaignVariables: [CampaignVariableInput!]
    texters: TexterInput
    interactionSteps: InteractionStepInput
    cannedResponses: [CannedResponseInput]
    textingHoursStart: Int
    textingHoursEnd: Int
    isAutoassignEnabled: Boolean
    timezone: String
    repliesStaleAfter: Int
    messagingServiceSid: String
    autosendLimit: Int
    columnMapping: [CsvColumnMappingInput!]
  }
`;
export default schema;
