import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogTitle from "@material-ui/core/DialogTitle";
import TextField from "@material-ui/core/TextField";
import Tooltip from "@material-ui/core/Tooltip";
import Autocomplete from "@material-ui/lab/Autocomplete";
import type { Campaign } from "@spoke/spoke-codegen";
import React, { useCallback, useMemo, useState } from "react";

// TODO - campaign variables
type DefaultTemplateCampaign = Pick<
  Campaign,
  "title" | "description" | "campaignVariables" | "interactionSteps"
>;

// TODO - hook up github page
const DUMMY_LIBRARY = [
  {
    title: "GOTV",
    description: "a get out the vote campaign for your candidate or issue",
    interactionSteps: {
      scriptOptions: ["hi there"]
    }
  },
  {
    title: "Fundraising",
    description: "a fundraising campaign for your candidate or issue",
    interactionSteps: {
      scriptOptions: ["hiya"]
    }
  },
  {
    title: "Voter Reg",
    description: "a voter registration campaign for your area",
    interactionSteps: {
      scriptOptions: ["howdy!"]
    }
  }
];

export interface CreateCampaignFromLibraryDialogProps {
  organizationId: string;
  open: boolean;
  onClose?: () => Promise<void> | void;
}

// eslint-disable-next-line max-len
export const CreateCampaignFromLibraryDialog: React.FC<CreateCampaignFromLibraryDialogProps> = (
  props
) => {
  const [
    selectedTemplate,
    setSelectedTemplate
  ] = useState<DefaultTemplateCampaign | null>(null);
  const [quantity, setQuantity] = useState<number | null>(1);

  // TODO
  const working = false;

  // TODO - fetch default templates
  // const { data, error } = useGetTemplateCampaignsQuery({
  //   variables: { organizationId: props.organizationId }
  // });
  // const [
  //   createFromTemplate,
  //   { loading: working }
  // ] = useCreateCampaignFromTemplateMutation({
  //   refetchQueries: [GetAdminCampaignsDocument]
  // });

  const templates = DUMMY_LIBRARY;
  // data?.organization?.templateCampaigns?.edges?.map(({ node }) => node) ?? [];

  const handleChangeTemplate = useCallback(
    (
      _event: React.ChangeEvent<unknown>,
      value: DefaultTemplateCampaign | null
    ) => {
      setSelectedTemplate(value);
    },
    [setSelectedTemplate]
  );

  const handleKeyDown: React.KeyboardEventHandler = useCallback((event) => {
    const badKey = event.keyCode === 69 || event.keyCode === 101;
    if (badKey) event.preventDefault();
  }, []);

  const handleChangeQuantity: React.ChangeEventHandler<
    HTMLInputElement | HTMLTextAreaElement
  > = useCallback(
    (event) => {
      const textValue = event.target.value.replace(/\D/g, "");
      const intValue = parseInt(textValue, 10);
      const finalValue = Number.isNaN(intValue) ? null : Math.max(1, intValue);
      setQuantity(finalValue);
    },
    [setQuantity]
  );

  const canCreate = useMemo(
    () => quantity !== null && selectedTemplate !== null && !working,
    [quantity, selectedTemplate, working]
  );

  const handleClickCreate = useCallback(async () => {
    if (!(quantity !== null && selectedTemplate !== null && !working)) return;

    // await createFromTemplate({
    //   variables: { templateId: selectedTemplate.id, quantity }
    // });
    props.onClose?.();
  }, [quantity, selectedTemplate, props.onClose]);

  return (
    <Dialog
      onClose={props.onClose}
      aria-labelledby="create-from-library-dialog-title"
      open={props.open}
    >
      <DialogTitle id="create-from-library-dialog-title">
        Select Campaign from Spoke Rewired Library
      </DialogTitle>
      <DialogContent>
        <DialogContentText>Select a campaign to get started</DialogContentText>
        {/* {error && (
          <DialogContentText>
            Error fetching templates: {error.message}
          </DialogContentText>
        )} */}
        <Autocomplete
          options={templates}
          getOptionLabel={(template) => template.title}
          value={selectedTemplate}
          onChange={handleChangeTemplate}
          style={{ width: 300 }}
          renderInput={(params) => (
            <TextField {...params} label="Template campaign name" />
          )}
        />
        <br />
        <Tooltip
          title="View an outline of this campaign's script"
          placement="top"
        >
          <Button
            key="open-script-preview"
            variant="contained"
            onClick={() => {
              console.log("TODO");
              // window.open(`/preview/${previewUrl}`, "_blank");
            }}
            size="small"
            disabled={!selectedTemplate}
          >
            Open Script Preview
          </Button>
        </Tooltip>
        <br />
        <TextField
          fullWidth
          label="Quantity"
          type="number"
          value={quantity ?? ""}
          onChange={handleChangeQuantity}
          onKeyDown={handleKeyDown}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose}>Cancel</Button>
        <Button
          color="primary"
          disabled={!canCreate}
          onClick={handleClickCreate}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateCampaignFromLibraryDialog;

// github page
// - lists default template campaigns
// - has script preview for each campaign?
// - script preview button here similar to ScriptPreviewButton but open link to github page?
