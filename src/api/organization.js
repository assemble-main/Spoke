export const TextRequestType = Object.freeze({
  UNSENT: "UNSENT",
  UNREPLIED: "UNREPLIED"
});

export const schema = `
  enum TextRequestType {
    UNSENT
    UNREPLIED
  }

  type AssignmentTarget {
    type: String!
    campaign: Campaign,
    countLeft: Int
  }

  type Organization {
    id: ID
    uuid: String
    name: String
    campaigns(cursor:OffsetLimitCursor, campaignsFilter: CampaignsFilter): PaginatedCampaigns
    people(role: String, campaignId: String, offset: Int): [User]
    peopleCount: Int
    optOuts: [OptOut]
    threeClickEnabled: Boolean
    optOutMessage: String
    textingHoursEnforced: Boolean
    textingHoursStart: Int
    textingHoursEnd: Int
    textRequestFormEnabled: Boolean
    textRequestType: TextRequestType
    textRequestMaxCount: Int
    textsAvailable: Boolean
    currentAssignmentTarget: AssignmentTarget
    escalationUserId: Int
    escalatedConversationCount: Int!
    assignmentRequestCount: Int!
    linkDomains: [LinkDomain]!
    unhealthyLinkDomains: [UnhealthyLinkDomain]!
  }
`;
