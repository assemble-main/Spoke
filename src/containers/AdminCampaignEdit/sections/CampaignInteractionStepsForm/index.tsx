import type { ApolloQueryResult } from "@apollo/client";
import { gql } from "@apollo/client";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import Grid from "@material-ui/core/Grid";
import type { CampaignVariablePage } from "@spoke/spoke-codegen";
import produce from "immer";
import isEqual from "lodash/isEqual";
import React, { useEffect, useState } from "react";
import { compose } from "recompose";

import type { Campaign } from "../../../../api/campaign";
import type {
  InteractionStep,
  InteractionStepWithChildren
} from "../../../../api/interaction-step";
import type { Action } from "../../../../api/types";
import { readClipboardText, writeClipboardText } from "../../../../client/lib";
import ScriptPreviewButton from "../../../../components/ScriptPreviewButton";
import { dataTest } from "../../../../lib/attributes";
import { DateTime } from "../../../../lib/datetime";
import { makeTree } from "../../../../lib/interaction-step-helpers";
import { scriptToTokens } from "../../../../lib/scripts";
import type { MutationMap, QueryMap } from "../../../../network/types";
import theme from "../../../../styles/theme";
import { loadData } from "../../../hoc/with-operations";
import CampaignFormSectionHeading from "../../components/CampaignFormSectionHeading";
import type {
  FullComponentProps,
  RequiredComponentProps
} from "../../components/SectionWrapper";
import { asSection } from "../../components/SectionWrapper";
import InteractionStepCard from "./components/InteractionStepCard";
import type {
  AddInteractionStepPayload,
  UpdateInteractionStepPayload
} from "./resolvers";
import {
  EditInteractionStepFragment,
  generateId,
  GET_CAMPAIGN_INTERACTIONS
} from "./resolvers";
import { isBlock } from "./utils";

const DEFAULT_EMPTY_STEP_ID = "DEFAULT_EMPTY_STEP_ID";

interface Values {
  interactionSteps: InteractionStepWithChildren;
}

interface InteractionStepWithLocalState extends InteractionStep {
  isModified: boolean;
}

interface HocProps {
  mutations: {
    editCampaign(payload: Values): ApolloQueryResult<any>;
    stageDeleteInteractionStep(iStepId: string): Promise<void>;
    stageClearInteractionSteps(): Promise<void>;
    stageAddInteractionStep(payload: AddInteractionStepPayload): Promise<void>;
    stageUpdateInteractionStep(
      iStepId: string,
      payload: UpdateInteractionStepPayload
    ): Promise<void>;
  };
  data: {
    campaign: Pick<
      Campaign,
      "id" | "isStarted" | "customFields" | "externalSystem"
    > & {
      interactionSteps: InteractionStepWithLocalState[];
      campaignVariables: CampaignVariablePage;
    };
  };
  availableActions: {
    availableActions: Action[];
  };
}

interface InnerProps extends FullComponentProps, HocProps {}

const CampaignInteractionStepsForm: React.FC<InnerProps> = (props) => {
  const [isWorking, setIsWorking] = useState(false);
  const [hasBlockCopied, setHasBlockCopied] = useState(false);
  const [confirmingRootPaste, setConfirmingRootPaste] = useState(false);

  const updateClipboardHasBlock = async () => {
    const clipboardText = await readClipboardText();
    setHasBlockCopied(isBlock(clipboardText));
  };

  useEffect(() => {
    updateClipboardHasBlock();
  }, []);

  const pendingInteractionSteps = (options: {
    filterEmpty: boolean;
    filterDeleted: boolean;
    stripLocals: boolean;
  }) => {
    const hasEmptyScript = (step: InteractionStep) => {
      const hasNoOptions = step.scriptOptions.length === 0;
      const hasEmptyScriptOption =
        step.scriptOptions.find((version) => version.trim() === "") !==
        undefined;
      return hasNoOptions || hasEmptyScriptOption;
    };

    const interactionSteps = props.data?.campaign?.interactionSteps ?? [];
    const liveInteractionSteps = interactionSteps
      .filter(
        (step) =>
          (!options.filterDeleted || !step.isDeleted) &&
          (!options.filterEmpty || !hasEmptyScript(step))
      )
      .map((step) => {
        if (options.stripLocals) {
          const { isModified: _, ...stripped } = step;
          return stripped;
        }
        return step;
      });

    const didChange =
      interactionSteps.find(
        (step) => step.isDeleted || step.isModified || step.id.includes("new")
      ) !== undefined;

    const hasEmptyScripts =
      liveInteractionSteps.find(hasEmptyScript) !== undefined;

    return {
      interactionSteps: liveInteractionSteps,
      didChange,
      hasEmptyScripts
    };
  };

  const handleSave = async () => {
    const { didChange } = pendingInteractionSteps({
      filterEmpty: true,
      filterDeleted: false,
      stripLocals: true
    });

    const interactionSteps = makeTree(
      props.data.campaign.interactionSteps.map(
        ({ isModified: _, ...step }) => step
      )
    );

    if (!didChange) return;

    setIsWorking(true);
    try {
      const response = await props.mutations.editCampaign({
        interactionSteps
      });
      if (response.errors) throw response.errors;
    } catch (err) {
      props.onError(err.message);
    } finally {
      setIsWorking(false);
    }
  };

  const createAddStepHandler = (parentInteractionId: string) => () => {
    props.mutations.stageAddInteractionStep({ parentInteractionId });
  };

  const onRequestRootPaste = () => {
    setConfirmingRootPaste(true);
  };

  const createPasteBlockHandler = (
    parentInteractionId: string | null
  ) => () => {
    readClipboardText().then((text) => {
      if (!isBlock(text)) return;

      const idMap: Record<string, string> = {};

      const newBlocks: InteractionStep[] = JSON.parse(text);

      newBlocks.forEach((interactionStep) => {
        idMap[interactionStep.id] = generateId();
      });

      const mappedBlocks: InteractionStep[] = newBlocks.map(
        (interactionStep) => {
          // Prepend new to force it to create a new one, even if it was already new
          return {
            ...interactionStep,
            id: idMap[interactionStep.id],
            parentInteractionId: interactionStep.parentInteractionId
              ? idMap[interactionStep.parentInteractionId]
              : parentInteractionId
          };
        }
      );

      if (parentInteractionId === null) {
        props.mutations.stageClearInteractionSteps();
      }

      mappedBlocks.forEach((newStep) =>
        props.mutations.stageAddInteractionStep(newStep)
      );
    });
  };

  const confirmRootPaste = () => {
    setConfirmingRootPaste(false);
    createPasteBlockHandler(null)();
  };

  const createDeleteStepHandler = (id: string) => () =>
    props.mutations.stageDeleteInteractionStep(id);

  const handleFormChange = (changedStep: InteractionStepWithChildren) => {
    if (changedStep.id === DEFAULT_EMPTY_STEP_ID) {
      return props.mutations.stageAddInteractionStep({
        ...changedStep,
        id: generateId()
      });
    }
    const { answerOption, questionText, scriptOptions } = changedStep;
    props.mutations.stageUpdateInteractionStep(changedStep.id, {
      answerOption,
      questionText,
      scriptOptions
    });
  };

  const copyBlock = async (interactionStep: InteractionStepWithChildren) => {
    const interactionStepsInBlock = new Set([interactionStep.id]);
    const {
      parentInteractionId: _id,
      interactionSteps: _interactionSteps,
      ...orphanedInteractionStep
    } = interactionStep;
    const block = [orphanedInteractionStep];

    let interactionStepsAdded = 1;

    const { interactionSteps } = pendingInteractionSteps({
      filterEmpty: false,
      filterDeleted: true,
      stripLocals: true
    });

    while (interactionStepsAdded !== 0) {
      interactionStepsAdded = 0;

      for (const is of interactionSteps) {
        if (
          !interactionStepsInBlock.has(is.id) &&
          is.parentInteractionId &&
          interactionStepsInBlock.has(is.parentInteractionId)
        ) {
          block.push(is);
          interactionStepsInBlock.add(is.id);
          interactionStepsAdded += 1;
        }
      }
    }

    await writeClipboardText(JSON.stringify(block));
    await updateClipboardHasBlock();
  };

  const {
    isNew,
    saveLabel,
    data: {
      campaign: {
        customFields,
        invalidScriptFields,
        campaignVariables: { edges: campaignVariableEdges },
        externalSystem
      } = {
        customFields: [],
        campaignVariables: { edges: [] },
        externalSystem: null
      }
    },
    availableActions: { availableActions }
  } = props;

  const campaignVariables = campaignVariableEdges.map(({ node }) => node);

  const {
    interactionSteps,
    didChange: hasPendingChanges,
    hasEmptyScripts
  } = pendingInteractionSteps({
    filterEmpty: false,
    filterDeleted: true,
    stripLocals: true
  });

  const invalidCampaignVariables = interactionSteps.reduce<Array<string>>(
    (acc, step) => {
      let result = acc;
      for (const scriptOption of step.scriptOptions) {
        const { invalidCampaignVariablesUsed } = scriptToTokens({
          script: scriptOption ?? "",
          customFields,
          campaignVariables
        });
        result = result.concat(invalidCampaignVariablesUsed);
      }
      return result;
    },
    []
  );

  const isSaveDisabled =
    isWorking || hasEmptyScripts || (!isNew && !hasPendingChanges);
  const finalSaveLabel = isWorking ? "Working..." : saveLabel;
  const upperSaveLabel = isWorking ? "Working..." : "Save";

  const tree = makeTree(interactionSteps);
  const finalFree: InteractionStepWithChildren = isEqual(tree, {
    interactionSteps: []
  })
    ? {
        id: DEFAULT_EMPTY_STEP_ID,
        parentInteractionId: null,
        questionText: "",
        answerOption: "",
        scriptOptions: [""],
        answerActions: "",
        interactionSteps: [],
        isDeleted: false,
        createdAt: DateTime.local().toISO()
      }
    : tree;
  const campaignId = props.data?.campaign?.id;

  const renderInvalidScriptFields = () => {
    if (invalidScriptFields.length === 0) {
      return null;
    }
    const invalidFields = invalidCampaignVariables.concat(
      invalidScriptFields.map((field: string) => `{${field}}`)
    );
    return (
      <div>
        <p style={{ color: theme.colors.red, fontSize: "1.2em" }}>
          Warning: Variable values are not all present for this script. You can
          continue working on your script but you cannot start this campaign.
          The following variables do not have values and will not populate in
          your script:
        </p>
        <p style={{ color: theme.colors.red, fontSize: "1.2em" }}>
          {invalidFields.join(", ")}
        </p>
      </div>
    );
  };

  return (
    <div onFocus={updateClipboardHasBlock} onClick={updateClipboardHasBlock}>
      <Dialog open={confirmingRootPaste}>
        <DialogContent>
          <DialogContentText>
            Pasting over the initial message will overwrite the whole script and
            you may need to change your sync configuration. Are you sure you
            want to continue?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            key="cancel"
            color="primary"
            onClick={() => setConfirmingRootPaste(false)}
          >
            Cancel
          </Button>
          <Button key="paste" color="primary" onClick={confirmRootPaste}>
            Paste
          </Button>
        </DialogActions>
      </Dialog>
      <CampaignFormSectionHeading
        title="What do you want to discuss?"
        subtitle="You can add scripts and questions and your texters can indicate responses from your contacts. For example, you might want to collect RSVPs to an event or find out whether to follow up about a different volunteer activity."
      />
      <Grid container style={{ padding: "8px" }} justifyContent="space-between">
        <Grid item xs={4}>
          <ScriptPreviewButton campaignId={campaignId} />
        </Grid>
        <Grid item xs={1}>
          <Button
            {...dataTest("interactionSubmit", true)}
            variant="contained"
            color="primary"
            disabled={isSaveDisabled}
            onClick={handleSave}
          >
            {upperSaveLabel}
          </Button>
        </Grid>
      </Grid>
      {renderInvalidScriptFields()}
      <InteractionStepCard
        interactionStep={finalFree}
        customFields={customFields}
        campaignVariables={campaignVariables}
        integrationSourced={externalSystem !== null}
        availableActions={availableActions}
        hasBlockCopied={hasBlockCopied}
        disabled={isWorking}
        onFormChange={handleFormChange}
        onCopyBlock={copyBlock}
        onRequestRootPaste={onRequestRootPaste}
        deleteStepFactory={createDeleteStepHandler}
        addStepFactory={createAddStepHandler}
        pasteBlockFactory={createPasteBlockHandler}
      />
      <Button
        {...dataTest("interactionSubmit")}
        variant="contained"
        color="primary"
        disabled={isSaveDisabled}
        onClick={handleSave}
      >
        {finalSaveLabel}
      </Button>
      {hasEmptyScripts && (
        <p style={{ color: "#DD0000" }}>You have one or more empty scripts!</p>
      )}
    </div>
  );
};

const queries: QueryMap<FullComponentProps> = {
  data: {
    query: GET_CAMPAIGN_INTERACTIONS,
    options: (ownProps) => ({
      variables: {
        campaignId: ownProps.campaignId
      }
    })
  },
  availableActions: {
    query: gql`
      query getOrganizationAvailableActions($organizationId: String!) {
        availableActions(organizationId: $organizationId) {
          name
          display_name
          instructions
        }
      }
    `,
    options: (ownProps) => ({
      variables: {
        organizationId: ownProps.organizationId
      },
      fetchPolicy: "network-only"
    })
  }
};

const mutations: MutationMap<FullComponentProps> = {
  editCampaign: (ownProps) => (payload: Values) => ({
    mutation: gql`
      mutation editCampaignInteractions(
        $campaignId: String!
        $payload: CampaignInput!
      ) {
        editCampaign(id: $campaignId, campaign: $payload) {
          id
          interactionSteps {
            ...EditInteractionStep
          }
          invalidScriptFields
          isStarted
          isApproved
          customFields
          readiness {
            id
            interactions
          }
        }
      }
      ${EditInteractionStepFragment}
    `,
    variables: {
      campaignId: ownProps.campaignId,
      payload
    },
    update: (store, { data: { editCampaign } }) => {
      const variables = { campaignId: ownProps.campaignId };
      const old = store.readQuery({
        query: GET_CAMPAIGN_INTERACTIONS,
        variables
      });
      const data = produce(old, (draft: any) => {
        draft.campaign.interactionSteps = editCampaign.interactionSteps.map(
          (step: InteractionStepWithLocalState) => ({
            ...step,
            isModified: false
          })
        );
      });
      store.writeQuery({ query: GET_CAMPAIGN_INTERACTIONS, variables, data });
    }
  }),
  stageDeleteInteractionStep: (_ownProps) => (iStepId: string) => ({
    mutation: gql`
      mutation StageDeleteInteractionStep($iStepId: String!) {
        stageDeleteInteractionStep(iStepId: $iStepId) @client
      }
    `,
    variables: { iStepId }
  }),
  stageClearInteractionSteps: ({ campaignId }) => () => ({
    mutation: gql`
      mutation StageClearInteractionSteps($campaignId: String!) {
        stageClearInteractionSteps(campaignId: $campaignId) @client
      }
    `,
    variables: { campaignId }
  }),
  stageAddInteractionStep: ({ campaignId }) => (
    payload: AddInteractionStepPayload
  ) => ({
    mutation: gql`
      mutation StageAddInteractionStep(
        $campaignId: String!
        $id: String
        $parentInteractionId: String
        $questionText: String
        $scriptOptions: [String]
        $answerOption: String
      ) {
        stageAddInteractionStep(
          campaignId: $campaignId
          id: $id
          parentInteractionId: $parentInteractionId
          questionText: $questionText
          scriptOptions: $scriptOptions
          answerOption: $answerOption
        ) @client
      }
    `,
    variables: { campaignId, ...payload }
  }),
  stageUpdateInteractionStep: (_ownProps) => (
    iStepId: string,
    payload: UpdateInteractionStepPayload
  ) => ({
    mutation: gql`
      mutation StageUpdateInteractionStep(
        $iStepId: String!
        $questionText: String
        $scriptOptions: [String]
        $answerOption: String
      ) {
        stageUpdateInteractionStep(
          iStepId: $iStepId
          questionText: $questionText
          scriptOptions: $scriptOptions
          answerOption: $answerOption
        ) @client
      }
    `,
    variables: { iStepId, ...payload }
  })
};

export default compose<InnerProps, RequiredComponentProps>(
  asSection({
    title: "Interactions",
    readinessName: "interactions",
    jobQueueNames: [],
    expandAfterCampaignStarts: true,
    expandableBySuperVolunteers: true
  }),
  loadData({
    queries,
    mutations
  })
)(CampaignInteractionStepsForm);
