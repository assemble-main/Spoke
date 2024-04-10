import type { MutationResult } from "@apollo/client/react/types/types";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogTitle from "@material-ui/core/DialogTitle";
import TextField from "@material-ui/core/TextField";
import Autocomplete from "@material-ui/lab/Autocomplete";
import type {
  CreateCampaignFromTemplateMutation,
  TemplateCampaignFragment
} from "@spoke/spoke-codegen";
import {
  GetAdminCampaignsDocument,
  useCreateCampaignFromTemplateMutation,
  useGetTemplateCampaignsQuery
} from "@spoke/spoke-codegen";
import React, { useCallback, useEffect, useMemo, useState } from "react";

export interface CreateCampaignFromTemplateDialogProps {
  organizationId: string;
  open: boolean;
  onCreateTemplateCompleted: (
    copiedCampaigns: NonNullable<
      MutationResult<CreateCampaignFromTemplateMutation>["data"]
    >["copyCampaigns"],
    selectedTemplateTitle: string
  ) => void;
  onClose?: () => Promise<void> | void;
  defaultTemplate?: TemplateCampaignFragment;
}

export const CreateCampaignFromTemplateDialog: React.FC<CreateCampaignFromTemplateDialogProps> = (
  props
) => {
  const defaultTemplate = props.defaultTemplate ?? null;
  const defaultCopyCount = 1;
  const [
    selectedTemplate,
    setSelectedTemplate
  ] = useState<TemplateCampaignFragment | null>(defaultTemplate);
  const [quantity, setQuantity] = useState<number | null>(defaultCopyCount);
  const {
    data: templateCampaignsData,
    error: templateCampaignsError
  } = useGetTemplateCampaignsQuery({
    variables: { organizationId: props.organizationId }
  });
  const [
    createFromTemplate,
    { loading: working }
  ] = useCreateCampaignFromTemplateMutation({
    refetchQueries: [GetAdminCampaignsDocument]
  });

  // Reset state when dialog is closed
  useEffect(() => {
    if (!props.open) {
      setSelectedTemplate(defaultTemplate);
      setQuantity(defaultCopyCount);
    }
  }, [props.open]);

  const templates =
    templateCampaignsData?.organization?.templateCampaigns?.edges?.map(
      ({ node }) => node
    ) ?? [];

  const handleChangeTemplate = useCallback(
    (
      _event: React.ChangeEvent<unknown>,
      value: TemplateCampaignFragment | null
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

    const result = await createFromTemplate({
      variables: { templateId: selectedTemplate.id, quantity }
    });
    const { data, errors } = result;
    const copiedCampaigns = data?.copyCampaigns ?? [];
    const hasCopiedCampaigns = copiedCampaigns.length > 0;
    const noErrors = !errors || errors.length === 0;
    if (hasCopiedCampaigns && noErrors) {
      const selectedTemplateTitle = selectedTemplate?.title ?? "";
      props.onCreateTemplateCompleted(copiedCampaigns, selectedTemplateTitle);
    }

    props.onClose?.();
  }, [
    quantity,
    selectedTemplate,
    createFromTemplate,
    props.onClose,
    props.onCreateTemplateCompleted
  ]);

  return (
    <Dialog
      onClose={props.onClose}
      aria-labelledby="create-from-template-dialog-title"
      open={props.open}
      disableRestoreFocus
    >
      <DialogTitle id="create-from-template-dialog-title">
        Create Campaign from Template
      </DialogTitle>
      <DialogContent>
        <DialogContentText>
          Select a campaign template to create from
        </DialogContentText>
        {templateCampaignsError && (
          <DialogContentText>
            Error fetching templates: {templateCampaignsError.message}
          </DialogContentText>
        )}
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

export default CreateCampaignFromTemplateDialog;
