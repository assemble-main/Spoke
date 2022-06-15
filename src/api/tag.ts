import { ExternalSyncTagConfig } from "./external-sync-config";
import { RelayPaginatedResponse } from "./pagination";

export interface Tag {
  id: string;
  title: string;
  description: string;
  textColor: string;
  backgroundColor: string;
  author: any | null;
  confirmationSteps: string[][];
  onApplyScript: string;
  webhookUrl: string;
  isAssignable: boolean;
  isSystem: boolean;
  createdAt: string;

  contacts: any[];
  externalSyncConfigurations: RelayPaginatedResponse<ExternalSyncTagConfig>;
}

export interface TagsFilter {
  excludeEscalated?: boolean;
  escalatedConvosOnly?: boolean;
  specificTagIds?: string[];
}

export const schema = `
  type Tag {
    id: ID!
    title: String!
    description: String!
    textColor: String!
    backgroundColor: String!
    author: User
    confirmationSteps: [[String]]!
    onApplyScript: String!
    webhookUrl: String!
    isAssignable: Boolean!
    isSystem: Boolean!
    createdAt: Date!

    contacts(campaignId: String): [CampaignContact]!
    externalSyncConfigurations(after: Cursor, first: Int): ExternalSyncTagConfigPage!
  }

  input TagInput {
    id: ID
    title: String!
    description: String!
    textColor: String
    backgroundColor: String
    confirmationSteps: [[String]]
    onApplyScript: String
    webhookUrl: String
    isAssignable: Boolean!
  }

  input TagsFilter {
    excludeEscalated: Boolean
    escalatedConvosOnly: Boolean
    specificTagIds: [String]
  }
`;
