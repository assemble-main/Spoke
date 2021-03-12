export interface ExternalSurveyQuestionResponseOption {
  id: string;
  externalSurveyQuestionId: string;
  externalId: string;
  name: string;
  mediumName: string;
  shortName: string;
  createdAt: string;
  updatedAt: string;
}

export const schema = `
  type ExternalSurveyQuestionResponseOption {
    id: String!
    externalSurveyQuestionId: String!
    externalId: String!
    name: String!
    mediumName: String!
    shortName: String!
    createdAt: Date!
    updatedAt: Date!
  }

  type ExternalSurveyQuestionResponseOptionEdge {
    cursor: Cursor!
    node: ExternalSurveyQuestionResponseOption!
  }

  type ExternalSurveyQuestionResponseOptionPage {
    edges: [ExternalSurveyQuestionResponseOptionEdge!]!
    pageInfo: RelayPageInfo!
  }
`;
