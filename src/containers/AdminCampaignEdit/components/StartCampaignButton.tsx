import Button from "@material-ui/core/Button";
import Tooltip from "@material-ui/core/Tooltip";
import {
  useGetCampaignInteractionStepsQuery,
  useGetCampaignStatusQuery,
  useStartCampaignMutation
} from "@spoke/spoke-codegen";
import React, { useCallback, useState } from "react";

import { useSpokeContext } from "../../../client/spoke-context";
import { useAuthzContext } from "../../AuthzProvider";
import CampaignSurveyResponseWarningDialog from "./CampaignSurveyResponseWarningDialog";

export interface StartCampaignButtonProps {
  campaignId: string;
  isCompleted: boolean;
}

export const StartCampaignButton: React.FC<StartCampaignButtonProps> = (
  props
) => {
  const { campaignId, isCompleted } = props;
  const authz = useAuthzContext();
  const { orgSettings } = useSpokeContext();
  const { data, loading } = useGetCampaignStatusQuery({
    variables: { campaignId }
  });
  const { data: campaignStepsData } = useGetCampaignInteractionStepsQuery({
    variables: { campaignId }
  });
  const [startCampaign] = useStartCampaignMutation();

  // manage warning confirmation and confirmation dialog state
  const [warningConfirmed, setWarningConfirmed] = useState<boolean>(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState<boolean>(false);

  const requiresApproval =
    !authz.isSuperadmin &&
    (orgSettings?.startCampaignRequiresApproval ?? true) &&
    !(data?.campaign?.isApproved ?? false);

  const disabled =
    !isCompleted ||
    loading ||
    (data?.campaign?.isStarted ?? false) ||
    requiresApproval;

  const tooltipText = requiresApproval ? "Superadmin approval required" : "";

  const campaignInteractionSteps =
    campaignStepsData?.campaign?.interactionSteps ?? [];

  const campaignHasSurveyResponses = campaignInteractionSteps.length > 1;

  const handleConfirmWarningAndStartCampaign = useCallback(() => {
    setWarningConfirmed(true);
    setConfirmDialogOpen(false);
    startCampaign({ variables: { campaignId } });
  }, [startCampaign, campaignId]);

  const handleCloseDialog = () => {
    setConfirmDialogOpen(false);
  };

  const handleClick = useCallback(() => {
    if (disabled) return;

    if (!campaignHasSurveyResponses && !warningConfirmed) {
      return setConfirmDialogOpen(true);
    }

    startCampaign({ variables: { campaignId } });
  }, [startCampaign, campaignId, campaignHasSurveyResponses, warningConfirmed]);

  const startText = data?.campaign?.isStarted
    ? "Already started"
    : authz.isSuperadmin &&
      !data?.campaign?.isApproved &&
      orgSettings?.startCampaignRequiresApproval
    ? "Approve and start"
    : "Start this campaign";

  return (
    <>
      <Tooltip title={tooltipText} placement="top">
        <span>
          <Button
            variant="contained"
            color="primary"
            style={{ width: 210 }}
            disabled={disabled}
            onClick={handleClick}
          >
            {startText}
          </Button>
        </span>
      </Tooltip>
      <CampaignSurveyResponseWarningDialog
        open={confirmDialogOpen}
        campaignId={campaignId}
        onConfirm={handleConfirmWarningAndStartCampaign}
        onClose={handleCloseDialog}
      />
    </>
  );
};

export default StartCampaignButton;
