import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import React from "react";

interface CampaignSurveyResponseWarningDialogProps {
  open: boolean;
  campaignId: string;
  onConfirm: () => void;
  onClose: () => void;
}

const CampaignSurveyResponseWarningDialog = ({
  open,
  campaignId,
  onConfirm,
  onClose
}: CampaignSurveyResponseWarningDialogProps) => {
  return (
    <Dialog open={open}>
      <DialogTitle>
        {`Heads up! Campaign ${campaignId} currently has no survey responses. Do you want to start this campaign anyway?`}
      </DialogTitle>
      <DialogContent>
        <p>
          For the best experience for you and your texters, we recommend adding
          survey responses before starting this campaign!
        </p>
        Without survey responses, texters can only use{" "}
        <a
          href="https://docs.spokerewired.com/article/67-tags"
          target="_blank"
          rel="noopener noreferrer"
        >
          Tags
        </a>{" "}
        to log data on this campaign.
        <p>
          Tags do not prepopulate scripts for texters and are not scoped to a
          single campaign. Canned responses prepopulate scripts but log no data
          at all. (
          <a
            href="https://docs.spokerewired.com/article/125-survey-responses-vs-canned-responses"
            target="_blank"
            rel="noopener noreferrer"
          >
            Read more
          </a>
          )
        </p>
      </DialogContent>
      <DialogActions>
        {[
          <Button key="save" variant="contained" onClick={onConfirm}>
            Start this campaign
          </Button>,
          <Button
            key="close"
            variant="contained"
            color="primary"
            onClick={onClose}
          >
            Cancel
          </Button>
        ]}
      </DialogActions>
    </Dialog>
  );
};

export default CampaignSurveyResponseWarningDialog;
