export const schema = `
  input CannedResponseInput {
    id: String
    title: String
    text: String
    campaignId: String
    userId: String
    displayOrder: Int
  }

  type CannedResponse {
    id: ID!
    title: String!
    text: String!
    isUserCreated: Boolean
    displayOrder: Int!
  }
`;
export default schema;
