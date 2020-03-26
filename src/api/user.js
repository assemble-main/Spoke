export const schema = `
  type User {
    id: ID
    firstName: String
    lastName: String
    displayName: String
    email: String
    cell: String
    memberships(after: Cursor, first: Int): OrganizationMembershipPage
    organizations(role: String): [Organization]
    todos(organizationId: String): [Assignment]
    roles(organizationId: String!): [String]
    teams(organizationId: String!): [Team]!
    currentRequest(organizationId: String!): AssignmentRequest
    assignedCell: Phone
    assignment(campaignId: String): Assignment,
    terms: Boolean
  }
  
type UsersList {
  users: [User]
}

type PaginatedUsers {
  users: [User]
  pageInfo: PageInfo
}

union UsersReturn = PaginatedUsers | UsersList
`;
