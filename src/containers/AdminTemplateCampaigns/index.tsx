import { makeStyles } from "@material-ui/core/styles";
import CreateIcon from "@material-ui/icons/Create";
import LibraryAddOutlinedIcon from "@material-ui/icons/LibraryAddOutlined";
import SpeedDial from "@material-ui/lab/SpeedDial";
import SpeedDialAction from "@material-ui/lab/SpeedDialAction";
import SpeedDialIcon from "@material-ui/lab/SpeedDialIcon";
import {
  GetTemplateCampaignsDocument,
  useCloneTemplateCampaignMutation,
  useCreateTemplateCampaignMutation,
  useDeleteTemplateCampaignMutation,
  useGetTemplateCampaignsQuery
} from "@spoke/spoke-codegen";
import React, { useCallback, useState } from "react";
import { useHistory, useParams } from "react-router-dom";

import CreateCampaignFromLibraryDialog from "./components/CreateFromLibraryDialog";
import TemplateCampaignRow from "./components/TemplateCampaignRow";

const useStyles = makeStyles((theme) => ({
  listContainer: {
    "& > *": {
      margin: theme.spacing(1)
    }
  },
  speedDial: {
    position: "absolute",
    bottom: theme.spacing(2),
    right: theme.spacing(2)
  }
}));

export const AdminTemplateCampaigns: React.FC = () => {
  const classes = useStyles();
  const history = useHistory();
  const { organizationId } = useParams<{ organizationId: string }>();

  const [speedDialOpen, setSpeedDialOpen] = useState<boolean>(false);
  const [createFromLibrary, setCreateFromLibrary] = useState<boolean>(false);

  const { data, loading, error } = useGetTemplateCampaignsQuery({
    variables: { organizationId }
  });

  const refetchQueries = [
    { query: GetTemplateCampaignsDocument, variables: { organizationId } }
  ];

  // TODO - disable if loading?
  const [
    createTemplateCampaign,
    { loading: _createTemplateLoading }
  ] = useCreateTemplateCampaignMutation({
    refetchQueries
  });

  const [deleteTemplateCampaign] = useDeleteTemplateCampaignMutation({
    refetchQueries
  });
  const [cloneTemplateCampaign] = useCloneTemplateCampaignMutation({
    refetchQueries
  });

  const templateCampaigns = (
    data?.organization?.templateCampaigns?.edges ?? []
  ).map(({ node }) => node);

  const handleClickCreateTemplate = useCallback(async () => {
    const result = await createTemplateCampaign({
      variables: { organizationId }
    });
    if (result.errors) throw result.errors[0];
    const newTemplateId = result.data?.createTemplateCampaign.id;
    history.push(
      `/admin/${organizationId}/template-campaigns/${newTemplateId}`
    );
  }, [createTemplateCampaign, history]);

  const createHandleClickEdit = (templateCampaignId: string) => () => {
    history.push(
      `/admin/${organizationId}/template-campaigns/${templateCampaignId}`
    );
  };

  const createCloneClickEdit = (templateCampaignId: string) => async () => {
    await cloneTemplateCampaign({
      variables: { organizationId, campaignId: templateCampaignId }
    });
  };

  const createDeleteClickEdit = (templateCampaignId: string) => async () => {
    await deleteTemplateCampaign({
      variables: { organizationId, campaignId: templateCampaignId }
    });
  };

  const toggleSpeedDial = () => {
    setSpeedDialOpen(!speedDialOpen);
  };

  return (
    <>
      {loading && "Loading..."}
      {error && <p>{error.message}</p>}
      {!loading && templateCampaigns.length === 0 && "No Campaigns"}
      <div className={classes.listContainer}>
        {templateCampaigns.map((templateCampaign) => (
          <TemplateCampaignRow
            organizationId={organizationId}
            key={templateCampaign.id}
            templateCampaign={templateCampaign}
            onClickEdit={createHandleClickEdit(templateCampaign.id)}
            onClickClone={createCloneClickEdit(templateCampaign.id)}
            onClickDelete={createDeleteClickEdit(templateCampaign.id)}
          />
        ))}
      </div>
      <SpeedDial
        ariaLabel="create-template-campaign-dial"
        className={classes.speedDial}
        icon={<SpeedDialIcon />}
        onClick={toggleSpeedDial}
        onOpen={() => setSpeedDialOpen(true)}
        open={speedDialOpen}
        direction="up"
      >
        <SpeedDialAction
          icon={<CreateIcon />}
          tooltipTitle="Create Template"
          onClick={handleClickCreateTemplate}
        />
        <SpeedDialAction
          icon={<LibraryAddOutlinedIcon />}
          tooltipTitle="Select from Library"
          onClick={() => setCreateFromLibrary(true)}
        />
      </SpeedDial>

      <CreateCampaignFromLibraryDialog
        organizationId={organizationId}
        open={createFromLibrary}
        onClose={() => setCreateFromLibrary(false)}
      />
    </>
  );
};

export default AdminTemplateCampaigns;
