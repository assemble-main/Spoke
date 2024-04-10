import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogTitle from "@material-ui/core/DialogTitle";
import { useCopyCampaignsMutation } from "@spoke/spoke-codegen";
import React, { useState } from "react";
import NumberCopiesField from "src/components/NumberCopiesField";
import OrganizationSelector from "src/components/OrganizationSelector";

export interface CopyCampaignModalProps {
  campaignId: string;
  currentOrgId: string;
  open: boolean;
  onRequestClose: () => Promise<unknown> | unknown;
  onComplete: (
    copiedCampaignId: string | undefined
  ) => Promise<unknown> | unknown;
}

export const CopyCampaignModal: React.FC<CopyCampaignModalProps> = ({
  campaignId,
  currentOrgId,
  open,
  onRequestClose,
  onComplete
}) => {
  const [copyCampaigns] = useCopyCampaignsMutation();

  const [targetOrgId, setTargetOrgId] = useState<string>(currentOrgId);
  const [numCopies, setNumCopies] = useState<number>(1);

  const handleOrgSelected = (selectedOrgId: string) =>
    setTargetOrgId(selectedOrgId);

  const handleNumCopiesChanged: React.ChangeEventHandler<HTMLInputElement> = (
    event
  ) => setNumCopies(event.target.valueAsNumber);

  const onConfirm = async () => {
    const newCampaignData = await copyCampaigns({
      variables: {
        templateId: campaignId,
        quantity: numCopies,
        targetOrgId
      }
    });
    onComplete(newCampaignData.data?.copyCampaigns[0].id);
  };

  return (
    <Dialog open={open} onClose={onRequestClose}>
      <DialogTitle>Copy Campaign</DialogTitle>
      <DialogContent>
        <DialogContentText>
          This will copy campaign {campaignId} to the organization you select
          below.
        </DialogContentText>
        <OrganizationSelector
          orgId={targetOrgId}
          onChange={handleOrgSelected}
        />
        <br />
        <NumberCopiesField qty={numCopies} onChange={handleNumCopiesChanged} />
      </DialogContent>
      <DialogActions>
        <Button variant="contained" color="primary" onClick={onConfirm}>
          Copy
        </Button>
        <Button variant="contained" onClick={onRequestClose}>
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CopyCampaignModal;
