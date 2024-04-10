import { gql } from "@apollo/client";

export const GET_ORGANIZATION_DATA = gql`
  query getOrganizationData($organizationId: String!) {
    organization(id: $organizationId) {
      id
      name
      uuid
      teams {
        id
        title
      }
      texters: people {
        id
        firstName
        lastName
        displayName
      }
      numbersApiKey
      messagingServices(active: true) {
        edges {
          node {
            name
          }
        }
      }
      campaigns(cursor: { offset: 0, limit: 5000 }) {
        campaigns {
          id
          title
          createdAt
        }
      }
    }
  }
`;

export const GET_ORGANIZATION_ACTIONS = gql`
  query getActions($organizationId: String!) {
    availableActions(organizationId: $organizationId) {
      name
      display_name
      instructions
    }
  }
`;

export const GET_CAMPAIGN_JOBS = gql`
  query getCampaignJobs($campaignId: String!) {
    campaign(id: $campaignId) {
      id
      pendingJobs {
        id
        jobType
        assigned
        status
        resultMessage
      }
    }
  }
`;

export const DELETE_JOB = gql`
  mutation deleteJob($campaignId: String!, $id: String!) {
    deleteJob(campaignId: $campaignId, id: $id) {
      id
    }
  }
`;

export const EditCampaignFragment = gql`
  fragment EditCampaignFragment on Campaign {
    id
    title
    description
    dueBy
    isStarted
    isApproved
    isArchived
    isTemplate
    contactsCount
    datawarehouseAvailable
    customFields
    useDynamicAssignment
    logoImageUrl
    introHtml
    primaryColor
    textingHoursStart
    textingHoursEnd
    isAssignmentLimitedToTeams
    isAutoassignEnabled
    timezone
    teams {
      id
      title
    }
    messagingServiceSid
    editors
    columnMapping {
      column
      remap
    }
    readiness {
      basics
      textingHours
      integration
      contacts
      autoassign
      cannedResponses
      campaignGroups
      interactions
      texters
    }
  }
`;

export const GET_EDIT_CAMPAIGN_DATA = gql`
  query getCampaign($campaignId: String!) {
    campaign(id: $campaignId) {
      ...EditCampaignFragment
    }
  }
  ${EditCampaignFragment}
`;

export const ARCHIVE_CAMPAIGN = gql`
  mutation archiveCampaign($campaignId: String!) {
    archiveCampaign(id: $campaignId) {
      ...EditCampaignFragment
    }
  }
  ${EditCampaignFragment}
`;

export const UNARCHIVE_CAMPAIGN = gql`
  mutation unarchiveCampaign($campaignId: String!) {
    unarchiveCampaign(id: $campaignId) {
      ...EditCampaignFragment
    }
  }
  ${EditCampaignFragment}
`;

export const START_CAMPAIGN = gql`
  mutation startCampaign($campaignId: String!) {
    startCampaign(id: $campaignId) {
      ...EditCampaignFragment
    }
  }
  ${EditCampaignFragment}
`;

export const EDIT_CAMPAIGN = gql`
  mutation editCampaign($campaignId: String!, $campaign: CampaignInput!) {
    editCampaign(id: $campaignId, campaign: $campaign) {
      ...EditCampaignFragment
    }
  }
  ${EditCampaignFragment}
`;
