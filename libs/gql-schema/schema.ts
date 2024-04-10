import { schema as assignmentSchema } from "./assignment";
import { schema as assignmentRequestSchema } from "./assignment-request";
import { schema as campaignSchema } from "./campaign";
import { schema as campaignContactSchema } from "./campaign-contact";
import { schema as campaignContactTagSchema } from "./campaign-contact-tag";
import { schema as campaignGroupSchema } from "./campaign-group";
import { schema as campaignVariableSchema } from "./campaign-variable";
import { schema as cannedResponseSchema } from "./canned-response";
import { schema as conversationSchema } from "./conversations";
import { schema as externalActivistCodeSchema } from "./external-activist-code";
import { schema as externalListSchema } from "./external-list";
import { schema as externalResultCodeSchema } from "./external-result-code";
import { schema as externalSurveyQuestionSchema } from "./external-survey-question";
import { schema as externalResponseOptionSchema } from "./external-survey-question-response-option";
import { schema as externalSyncConfigSchema } from "./external-sync-config";
import { schema as externalSystemSchema } from "./external-system";
import { schema as interactionStepSchema } from "./interaction-step";
import { schema as inviteSchema } from "./invite";
import { schema as linkDomainSchema } from "./link-domain";
import { schema as messageSchema } from "./message";
import { schema as messagingServiceSchema } from "./messaging-service";
import { schema as noticeSchema } from "./notice";
import { schema as optOutSchema } from "./opt-out";
import { schema as organizationSchema } from "./organization";
import { schema as membershipSchema } from "./organization-membership";
import { schema as organizationSettingsSchema } from "./organization-settings";
import { schema as paginationSchema } from "./pagination";
import { schema as questionSchema } from "./question";
import { schema as questionResponseSchema } from "./question-response";
import { schema as tagSchema } from "./tag";
import { schema as teamSchema } from "./team";
import { schema as trollbotSchema } from "./trollbot";
import { schema as userSchema } from "./user";

const rootSchema = `
  enum AutosendingControlsMode {
    BASIC
    DETAILED
  }

  enum CampaignBuilderMode {
    BASIC
    ADVANCED
    TEMPLATE
  }

  input BulkUpdateScriptInput {
    searchString: String!
    replaceString: String!
    campaignIds: [String!]!
  }

  input ContactActionInput {
    cell: Phone!
    assignmentId: String
    message: MessageInput
    reason: String
  }

  input ContactTagActionInput {
    addedTagIds: [String]!
    removedTagIds: [String]!
    message: MessageInput
  }

  input QuestionResponseInput {
    campaignContactId: String!
    interactionStepId: String!
    value: String!
  }

  input AnswerOptionInput {
    action: String
    value: String!
    nextInteractionStepId: String
  }

  input MessageInput {
    text: String
    contactNumber: Phone
    assignmentId: String
    userId: String
    versionHash: String
    campaignVariableIds: [String!]
  }

  input InviteInput {
    id: String
    is_valid: Boolean
    hash: String
    created_at: Date
  }

  input UserInput {
    id: String
    firstName: String!
    lastName: String!
    email: String!
    cell: String!
    notificationFrequency: String!
    oldPassword: String
    newPassword: String
  }

  input ContactMessage {
    message: MessageInput!
    campaignContactId: String!
  }

  input OffsetLimitCursor {
    offset: Int!
    limit: Int!
  }

  input CampaignIdContactId {
    campaignId: String!
    campaignContactId: String!
    messageIds: [String]!
  }

  input UpdateLinkDomain {
    maxUsageCount: Int
    isManuallyDisabled: Boolean
  }

  enum ReleaseActionTarget {
    UNSENT
    UNREPLIED
  }

  input UserPasswordChange {
    password: String!
    passwordConfirm: String!
    newPassword: String!
  }

  type Action {
    name: String
    display_name: String
    instructions: String
  }

  type FoundContact {
    found: Boolean
  }

  input FetchCampaignOverlapInput {
    targetCampaignId: String!
    includeArchived: Boolean!
  }

  type FetchCampaignOverlapResult {
    campaign: Campaign!,
    overlapCount: Int!
    lastActivity: Date!
  }

  type DeleteCampaignOverlapResult {
    campaign: Campaign,
    deletedRowCount: Int!
    remainingCount: Int!
  }

  type PageInfo {
    limit: Int!
    offset: Int!
    next: Int
    previous: Int
    total: Int!
  }

  type ReturnString {
    data: String!
  }

  type ScriptUpdateChange {
    id: String!
    campaignId: String!
    campaignName: String!
    script: String!
  }

  type ScriptUpdateResult {
    campaignId: String!
    found: String!
    replaced: String!
  }

  type ReleaseAllUnhandledRepliesResult {
    campaignCount: Int
    contactCount: Int
  }

  enum CampaignExportType {
    SPOKE
    VAN
  }

  input ExportForVanInput {
    includeUnmessaged: Boolean!
    vanIdField: String!
  }

  input ExportForSpokeInput {
    campaign: Boolean!
    messages: Boolean!
    optOuts: Boolean!
    filteredContacts: Boolean!
  }

  input CampaignExportInput {
    campaignId: String!
    exportType: CampaignExportType!
    spokeOptions: ExportForSpokeInput
    vanOptions: ExportForVanInput
  }

  input QuestionResponseSyncConfigInput {
    id: String!
  }

  input QuestionResponseSyncTargetInput {
    configId: String!
    responseOptionId: String
    activistCodeId: String
    resultCodeId: String
  }

  input SyncCampaignToSystemInput {
    campaignId: String!
  }

  type OptOutByCampaign {
    id: String!
    title: String!
    count: String!
  }

  type RootQuery {
    currentUser: User
    organization(id:String!, utc:String): Organization
    campaign(id:String!): Campaign
    inviteByHash(hash:String!): [Invite]
    contact(id:String!): CampaignContact
    assignment(id:String!): Assignment
    team(id: String!): Team!
    organizations(active: Boolean): [Organization]
    availableActions(organizationId:String!): [Action]
    conversations(cursor:OffsetLimitCursor!, organizationId:String!, campaignsFilter:CampaignsFilter, assignmentsFilter:AssignmentsFilter, tagsFilter: TagsFilter, contactsFilter:ContactsFilter, contactNameFilter:ContactNameFilter): PaginatedConversations
    campaigns(organizationId:String!, cursor:OffsetLimitCursor, campaignsFilter: CampaignsFilter): CampaignsReturn
    people(organizationId:String, cursor:OffsetLimitCursor, campaignsFilter:CampaignsFilter, role: String, userIds:[String]): UsersReturn
    peopleByUserIds(userIds:[String], organizationId:String!): UsersList
    fetchCampaignOverlaps(input: FetchCampaignOverlapInput!): [FetchCampaignOverlapResult]!
    assignmentRequests(organizationId: String!, status: String): [AssignmentRequest]
    trollAlarms(organizationId: String!, limit: Int!, offset: Int!, token: String, dismissed: Boolean!): TrollAlarmPage!
    trollAlarmsCount(organizationId: String!, dismissed: Boolean!): TrollAlarmCount!,
    trollTokens(organizationId: String!): [TrollTrigger]
    externalSystem(systemId: String!): ExternalSystem!
    externalSystems(organizationId: String!, after: Cursor, first: Int): ExternalSystemPage!
    externalLists(organizationId: String!, systemId: String!, after: Cursor, first: Int): ExternalListPage!
    notices(organizationId: String): NoticePage!
    campaignGroups(organizationId: String! after: Cursor, first: Int): CampaignGroupPage!
    campaignNavigation(campaignId: String!): CampaignNavigation!
    bulkUpdateScriptChanges(organizationId: String!, findAndReplace: BulkUpdateScriptInput!): [ScriptUpdateChange!]!
    superadmins: [User!]
    optOuts(organizationId: String!): [OptOutByCampaign!]!
    isValidAttachment(fileUrl: String!): Boolean!
  }

  input SecondPassInput {
    excludeAgeInHours: Float
    excludeNewer: Boolean!
  }

  type RootMutation {
    createInvite(invite:InviteInput!): Invite
    createCampaign(campaign:CampaignInput!): Campaign
    createTemplateCampaign(organizationId: String!): Campaign!
    deleteTemplateCampaign(organizationId: String!, campaignId: String!): Boolean!
    cloneTemplateCampaign(organizationId: String!, campaignId: String!): Campaign!
    editCampaign(id:String!, campaign:CampaignInput!): Campaign
    saveCampaignGroups(organizationId: String!, campaignGroups: [CampaignGroupInput!]!): [CampaignGroup!]!
    deleteCampaignGroup(organizationId: String!, campaignGroupId: String!): Boolean!
    filterLandlines(id:String!): Campaign
    bulkUpdateScript(organizationId:String!, findAndReplace: BulkUpdateScriptInput!): [ScriptUpdateResult]
    deleteJob(campaignId:String!, id:String!): JobRequest
    copyCampaign(id: String!): Campaign
    copyCampaigns(sourceCampaignId: String!, quantity: Int!, targetOrgId: String): [Campaign!]!
    exportCampaign(options: CampaignExportInput!): JobRequest
    createCannedResponse(cannedResponse:CannedResponseInput!): CannedResponse
    createOrganization(name: String!, userId: String!, inviteId: String!): Organization
    editOrganization(id: String! input: EditOrganizationInput!): Organization!
    joinOrganization(organizationUuid: String!): Organization!
    editOrganizationMembership(id: String!, level: RequestAutoApprove, role: String): OrganizationMembership!
    editOrganizationSettings(id: String!, input: OrganizationSettingsInput!): OrganizationSettings!
    purgeOrganizationUsers(organizationId: String!): Int!
    editUser(organizationId: String!, userId: String!, userData:UserInput): User
    resetUserPassword(organizationId: String!, userId: String!): String!
    changeUserPassword(userId: String!, formData: UserPasswordChange): User
    setUserSuspended(userId: String!, isSuspended: Boolean!): User!
    clearUserSessions(userId: String!): User!
    updateDefaultTextingTimezone(organizationId: String!, defaultTextingTz: String!): Organization!
    updateTextingHours( organizationId: String!, textingHoursStart: Int!, textingHoursEnd: Int!): Organization
    updateTextingHoursEnforcement( organizationId: String!, textingHoursEnforced: Boolean!): Organization
    updateTextRequestFormSettings(organizationId: String!, textRequestFormEnabled: Boolean!, textRequestType: String!, textRequestMaxCount: Int!): Organization
    bulkSendMessages(assignmentId: String!): [CampaignContact]
    sendMessage(message:MessageInput!, campaignContactId:String!): CampaignContact,
    tagConversation(campaignContactId: String!, tag: ContactTagActionInput!): CampaignContact
    createOptOut(optOut:ContactActionInput!, campaignContactId:String!):CampaignContact,
    removeOptOut(cell:Phone!):[CampaignContact],
    editCampaignContactMessageStatus(messageStatus: String!, campaignContactId:String!): CampaignContact,
    deleteQuestionResponses(interactionStepIds:[String], campaignContactId:String!): CampaignContact,
    updateQuestionResponses(questionResponses:[QuestionResponseInput], campaignContactId:String!): CampaignContact,
    handleConversation(
      campaignContactId: String!,
      message:MessageInput,
      questionResponses: [QuestionResponseInput],
      interactionStepIdsForDeletedQuestionResponses: [String],
      optOut: ContactActionInput,
      closeConversation: Boolean
    ): CampaignContact,
    setCampaignApproved(id: String!, approved: Boolean!): Campaign!,
    startCampaign(id:String!): Campaign,
    archiveCampaign(id:String!): Campaign,
    unarchiveCampaign(id:String!): Campaign,
    sendReply(id: String!, message: String!): CampaignContact
    getAssignmentContacts(assignmentId: String!, contactIds: [String], findNew: Boolean): [CampaignContact],
    findNewCampaignContact(assignmentId: String!, numberContacts: Int!): FoundContact,
    assignUserToCampaign(organizationUuid: String!, campaignId: String!): Campaign
    userAgreeTerms(userId: String!): User
    megaReassignCampaignContacts(organizationId:String!, campaignIdsContactIds:[CampaignIdContactId]!, newTexterUserIds:[String]): Boolean!
    megaBulkReassignCampaignContacts(organizationId:String!, campaignsFilter:CampaignsFilter, assignmentsFilter:AssignmentsFilter, tagsFilter: TagsFilter, contactsFilter:ContactsFilter, contactNameFilter: ContactNameFilter, newTexterUserIds:[String]): Boolean!
    requestTexts(count: Int!, email: String!, organizationId: String!, preferredTeamId: String!): String!
    releaseMessages(campaignId: String!, target: ReleaseActionTarget!, ageInHours: Float): String!
    releaseAllUnhandledReplies(organizationId: String!, ageInHours: Float, releaseOnRestricted: Boolean, limitToCurrentlyTextableContacts: Boolean): ReleaseAllUnhandledRepliesResult!
    markForSecondPass(campaignId: String!, input: SecondPassInput!): String!
    startAutosending(campaignId: String!): Campaign!
    pauseAutosending(campaignId: String!): Campaign!
    updateCampaignAutosendingLimit(campaignId: String!, limit: Int): Campaign!
    unMarkForSecondPass(campaignId: String!): String!
    deleteNeedsMessage(campaignId: String!): String!
    insertLinkDomain(organizationId: String!, domain: String!, maxUsageCount: Int!): LinkDomain!
    updateLinkDomain(organizationId: String!, domainId: String!, payload: UpdateLinkDomain!): LinkDomain!
    deleteLinkDomain(organizationId: String!, domainId: String!): Boolean!
    deleteCampaignOverlap(organizationId: String!, campaignId: String!, overlappingCampaignId: String!): DeleteCampaignOverlapResult!
    deleteManyCampaignOverlap(organizationId: String!, campaignId: String!, overlappingCampaignIds: [String]!): Int!
    resolveAssignmentRequest(assignmentRequestId: String!, approved: Boolean!, autoApproveLevel: RequestAutoApprove): Int!
    saveTag(organizationId: String!, tag: TagInput!): Tag!
    deleteTag(organizationId: String!, tagId: String!): Boolean!
    saveTeams(organizationId: String!, teams: [TeamInput]!): [Team]!
    deleteTeam(organizationId: String!, teamId: String!): Boolean!
    addUsersToTeam(teamId: String!, userIds: [String]!): Boolean!
    removeUsersFromTeam(teamId: String!, userIds: [String]!): Boolean!
    releaseMyReplies(organizationId: String!): Boolean!
    dismissMatchingAlarms(token: String!, organizationId: String!): Boolean!
    dismissAlarms(messageIds: [String!]!, organizationId: String!): Boolean!
    addToken(organizationId: String!, input: TrollTriggerInput!): Boolean!
    removeToken(token: String!, organizationId: String!): Boolean!
    createExternalSystem(organizationId: String!, externalSystem: ExternalSystemInput!): ExternalSystem!
    editExternalSystem(id: String!, externalSystem: ExternalSystemInput!): ExternalSystem!
    refreshExternalSystem(externalSystemId: String!): Boolean!
    createQuestionResponseSyncConfig(input: QuestionResponseSyncConfigInput!): ExternalSyncQuestionResponseConfig!
    deleteQuestionResponseSyncConfig(input: QuestionResponseSyncConfigInput!): ExternalSyncQuestionResponseConfig!
    createQuestionResponseSyncTarget(input: QuestionResponseSyncTargetInput!): ExternalSyncConfigTarget!
    deleteQuestionResponseSyncTarget(targetId: String!): String!
    syncCampaignToSystem(input: SyncCampaignToSystemInput!): Boolean!
    editExternalOptOutSyncConfig(systemId: String!, targetId: String): ExternalSystem!
    unassignTextsFromUser(membershipId: String!): Boolean!
    editSuperAdminStatus(userEmail: String!, superAdminStatus: Boolean!): Boolean!
    editOrganizationActive(organizationId: String!, active: Boolean!, deactivateMode: DeactivateMode): Boolean!
    bulkOptOut(organizationId: String!, csvFile: Upload, numbersList: String): Int!
    bulkOptIn(organizationId: String!, csvFile: Upload, numbersList: String): Int!
    exportOptOuts(organizationId: String!, campaignIds: [String!]): Boolean!
  }

  schema {
    query: RootQuery
    mutation: RootMutation
  }
`;

export const schema = [
  rootSchema,
  userSchema,
  organizationSchema,
  paginationSchema,
  "scalar Upload",
  "scalar Date",
  "scalar JSON",
  "scalar Phone",
  organizationSettingsSchema,
  membershipSchema,
  campaignSchema,
  assignmentSchema,
  interactionStepSchema,
  optOutSchema,
  messageSchema,
  messagingServiceSchema,
  noticeSchema,
  campaignContactSchema,
  campaignContactTagSchema,
  campaignGroupSchema,
  campaignVariableSchema,
  cannedResponseSchema,
  questionResponseSchema,
  questionSchema,
  inviteSchema,
  linkDomainSchema,
  assignmentRequestSchema,
  conversationSchema,
  tagSchema,
  teamSchema,
  trollbotSchema,
  externalSystemSchema,
  externalListSchema,
  externalSurveyQuestionSchema,
  externalResponseOptionSchema,
  externalActivistCodeSchema,
  externalResultCodeSchema,
  externalSyncConfigSchema
];

export default rootSchema;
