export const schema = `
  type TrollAlarm {
    id: ID!
    messageId: ID!
    messageText: String!
    token: String!
    dismissed: Boolean!
  }

  type TrollTrigger {
    id: ID!
    token: String!
    organizationId: String!
  }
`;
