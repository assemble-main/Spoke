export interface CampaignReadinessType {
  basics: boolean;
  textingHours: boolean;
  integration: boolean;
  contacts: boolean;
  autoassign: boolean;
  cannedResponses: boolean;
  interactions: boolean;
}

export interface DataSourceItemType {
  text: string;
  rawValue: string;
  value: React.ReactNode;
}
