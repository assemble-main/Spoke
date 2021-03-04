import { Resolver, Resolvers } from "apollo-client";
import gql from "graphql-tag";
import produce from "immer";

import { InteractionStep } from "../../../../api/interaction-step";
import { DateTime } from "../../../../lib/datetime";
import { LocalResolverContext } from "../../../../network/types";

export const generateId = () =>
  `new${Math.random()
    .toString(36)
    .replace(/[^a-zA-Z1-9]+/g, "")}`;

export const EditInteractionStepFragment = gql`
  fragment EditInteractionStep on InteractionStep {
    id
    questionText
    scriptOptions
    answerOption
    answerActions
    parentInteractionId
    isDeleted
    isModified @client
  }
`;

export const GET_CAMPAIGN_INTERACTIONS = gql`
  query GetEditCampaignInteractions($campaignId: String!) {
    campaign(id: $campaignId) {
      id
      isStarted
      interactionSteps {
        ...EditInteractionStep
      }
      customFields
    }
  }
  ${EditInteractionStepFragment}
`;

export interface StageDeleteInteractionStepVars {
  iStepId: string;
}

export const stageDeleteInteractionStep: Resolver = (
  _root,
  variables: StageDeleteInteractionStepVars,
  { client, getCacheKey }: LocalResolverContext
) => {
  const id = getCacheKey({
    __typename: "InteractionStep",
    id: variables.iStepId
  });
  const fragment = gql`
    fragment pendingDeleteInteractionStep on InteractionStep {
      isDeleted
    }
  `;

  const iStep = client.readFragment({ fragment, id });
  const data = { ...iStep, isDeleted: true };
  client.writeData({ id, data });
  return null;
};

export const stageClearInteractionSteps: Resolver = (
  _root,
  { campaignId }: { campaignId: string },
  { client }: LocalResolverContext
) => {
  const variables = { campaignId };
  const cachedResult = client.readQuery({
    query: GET_CAMPAIGN_INTERACTIONS,
    variables
  });
  const data = produce(cachedResult, (draft: any) => {
    draft.campaign.interactionSteps = [];
  });
  client.writeQuery({
    query: GET_CAMPAIGN_INTERACTIONS,
    variables,
    data
  });
  return null;
};

export type AddInteractionStepPayload = Partial<
  Pick<
    InteractionStep,
    | "id"
    | "parentInteractionId"
    | "answerOption"
    | "answerActions"
    | "questionText"
    | "scriptOptions"
  >
>;

export interface StageAddInteractionStepVars extends AddInteractionStepPayload {
  campaignId: string;
}

export const stageAddInteractionStep: Resolver = (
  _root,
  { campaignId, ...payload }: StageAddInteractionStepVars,
  { client }: LocalResolverContext
) => {
  const variables = { campaignId };
  const cachedResult = client.readQuery({
    query: GET_CAMPAIGN_INTERACTIONS,
    variables
  });
  const data = produce(cachedResult, (draft: any) => {
    draft.campaign.interactionSteps.push({
      __typename: "InteractionStep",
      id: payload.id ?? generateId(),
      parentInteractionId: payload.parentInteractionId ?? null,
      questionText: payload.questionText ?? "",
      scriptOptions: payload.scriptOptions ?? [""],
      answerOption: payload.answerOption ?? "",
      answerActions: payload.answerActions ?? "",
      isDeleted: false,
      isModified: true,
      createdAt: DateTime.local().toISO()
    });
  });
  client.writeQuery({
    query: GET_CAMPAIGN_INTERACTIONS,
    variables,
    data
  });
  return null;
};

export type UpdateInteractionStepPayload = Partial<
  Pick<InteractionStep, "answerOption" | "questionText" | "scriptOptions">
>;

export interface StageUpdateInteractionStepVars
  extends UpdateInteractionStepPayload {
  iStepId: string;
}

export const stageUpdateInteractionStep: Resolver = (
  _root,
  { iStepId, ...payload }: StageUpdateInteractionStepVars,
  { client, getCacheKey }: LocalResolverContext
) => {
  const id = getCacheKey({ __typename: "InteractionStep", id: iStepId });
  const fragment = gql`
    fragment editableIStep on InteractionStep {
      questionText
      scriptOptions
      answerOption
    }
  `;
  const iStep = client.readFragment({ fragment, id });
  const data = { ...iStep, ...payload, isModified: true };
  client.writeData({ id, data });
  return null;
};

export const isModified: Resolver = (
  { id: iStepId },
  _variables,
  { client, getCacheKey }: LocalResolverContext
) => {
  const id = getCacheKey({ __typename: "InteractionStep", id: iStepId });
  const fragment = gql`
    fragment modifiableStep on InteractionStep {
      isModified
    }
  `;
  try {
    const iStep = client.readFragment({ fragment, id });
    return iStep?.isModified ?? false;
  } catch {
    // readFragment throws an error if `isModified` cannot be found (e.g. the starting condition)
    return false;
  }
};

const resolvers: Resolvers = {
  Mutation: {
    stageDeleteInteractionStep,
    stageClearInteractionSteps,
    stageAddInteractionStep,
    stageUpdateInteractionStep
  },
  InteractionStep: {
    isModified
  }
};

export default resolvers;
