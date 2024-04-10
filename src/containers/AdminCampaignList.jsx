import { gql } from "@apollo/client";
import { withStyles } from "@material-ui/core";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import Snackbar from "@material-ui/core/Snackbar";
import Typography from "@material-ui/core/Typography";
import ClearIcon from "@material-ui/icons/Clear";
import CreateIcon from "@material-ui/icons/Create";
import FileCopyIcon from "@material-ui/icons/FileCopyOutlined";
import MuiAlert from "@material-ui/lab/Alert";
import AlertTitle from "@material-ui/lab/AlertTitle";
import SpeedDial from "@material-ui/lab/SpeedDial";
import SpeedDialAction from "@material-ui/lab/SpeedDialAction";
import SpeedDialIcon from "@material-ui/lab/SpeedDialIcon";
import { TextField, Toggle } from "material-ui";
import DropDownMenu from "material-ui/DropDownMenu";
import { MenuItem } from "material-ui/Menu";
import PropTypes from "prop-types";
import React from "react";
import { withRouter } from "react-router-dom";
import { compose } from "recompose";

import CreateCampaignFromTemplateDialog from "../components/CreateCampaignFromTemplateDialog";
import LoadingIndicator from "../components/LoadingIndicator";
import theme from "../styles/theme";
import { withAuthzContext } from "./AuthzProvider";
import CampaignList from "./CampaignList";
import { loadData } from "./hoc/with-operations";

const styles = {
  flexContainer: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    padding: 5
  }
};

const AdminCampaignListSpeedDialAction = withStyles(() => ({
  staticTooltipLabel: {
    display: "inline-block",
    width: "max-content"
  }
}))(SpeedDialAction);

const AdminCampaignListSpeedDial = withStyles(() => ({
  root: {
    "align-items": "flex-end"
  }
}))(SpeedDial);

const AdminCampaignListSpeedDialIcon = withStyles(() => ({
  root: {
    display: "inline-box",
    position: "relative",
    width: "100%"
  },
  openIcon: {
    width: "100%"
  }
}))(SpeedDialIcon);

// The campaign list uses infinite scrolling now so we fix the page size
const DEFAULT_PAGE_SIZE = 10;

class AdminCampaignList extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      speedDialOpen: false,
      createFromTemplateOpen: false,
      // created from template state
      showCreatedFromTemplateSnackbar: false,
      createdFromTemplateIds: [],
      createdFromTemplateTitle: "",
      // end created from template state
      isCreating: false,
      campaignsFilter: {
        isArchived: false
      },
      releasingInProgress: false,
      releasingAllReplies: false,
      releaseAllRepliesError: undefined,
      releaseAllRepliesResult: undefined
    };
  }

  handleClickNewButton = async () => {
    const { history, match } = this.props;
    const { organizationId } = match.params;
    this.setState({ isCreating: true });
    const newCampaign = await this.props.mutations.createCampaign({
      title: "New Campaign",
      description: "",
      dueBy: null,
      organizationId,
      interactionSteps: {
        scriptOptions: [""]
      }
    });
    if (newCampaign.errors) {
      alert("There was an error creating your campaign");
      throw new Error(newCampaign.errors);
    }

    const { id: campaignId } = newCampaign.data.createCampaign;
    history.push(
      `/admin/${organizationId}/campaigns/${campaignId}/edit?new=true`
    );
  };

  handleFilterChange = (event, index, value) => {
    this.setState({
      campaignsFilter: {
        isArchived: value
      }
    });
  };

  handleCreatedFromTemplateSnackbarClose = (_event, reason) => {
    if (reason === "clickaway") {
      return;
    }

    this.setState({
      showCreatedFromTemplateSnackbar: false,
      createdFromTemplateIds: [],
      createdFromTemplateTitle: null
    });
  };

  closeReleasingAllReplies = () => {
    this.setState({
      releasingInProgress: false,
      releasingAllReplies: false,
      releaseAllRepliesError: undefined,
      releaseAllRepliesResult: undefined
    });
  };

  handleCreateTemplateCompleted = (copyCampaigns, selectedTemplateTitle) => {
    if (copyCampaigns.length === 0) {
      return;
    }
    this.setState({
      showCreatedFromTemplateSnackbar: true,
      createdFromTemplateIds: copyCampaigns.map((campaign) => campaign.id),
      createdFromTemplateTitle: selectedTemplateTitle
    });
  };

  handleCreateTemplateDialogClose = () => {
    this.setState({ createFromTemplateOpen: false });
  };

  startReleasingAllReplies = () => {
    this.setState({ releasingAllReplies: true });
  };

  handleOnCreateClickFromTemplate = () => {
    this.setState({
      createFromTemplateOpen: true,
      speedDialOpen: false
    });
  };

  handleSpeedDialOnKeyDown = (event) => {
    /* "toggle", "blur", "mouseLeave", "escapeKeyDown" are the possible close events,
      so we're handling escapeKeyDown here * */
    if (event.key === "Escape") {
      this.setState({ speedDialOpen: false });
    }
  };

  handleSpeedDialOnFocus = () => {
    this.setState({ speedDialOpen: true });
  };

  handleSpeedDialOnBlur = () => {
    this.setState({ speedDialOpen: false });
  };

  /**
   * We listen to mouse down because we don't close the speed dial menu right after opening it in the focus event
   */
  handleSpeedDialOnMouseDown = () => {
    this.setState({ speedDialOpen: !this.state.speedDialOpen });
  };

  releaseAllReplies = () => {
    const ageInHours = parseFloat(this.numberOfHoursToReleaseRef.input.value);
    const releaseOnRestricted = this.releaseOnRestrictedRef.state.switched;
    const limitToCurrentlyTextableContacts = this
      .limitToCurrentlyTextableContactsRef.state.switched;

    this.setState({ releasingInProgress: true });

    this.props.mutations
      .releaseAllUnhandledReplies(
        this.props.match.params.organizationId,
        ageInHours,
        releaseOnRestricted,
        limitToCurrentlyTextableContacts
      )
      .then((result) => {
        if (result.errors) {
          throw result.errors;
        }

        this.setState({
          releaseAllRepliesResult: result.data.releaseAllUnhandledReplies,
          releasingInProgress: false
        });
      })
      .catch((error) => {
        this.setState({
          releaseAllRepliesError: error,
          releasingInProgress: false
        });
      });
  };

  renderFilters() {
    return (
      <DropDownMenu
        value={this.state.campaignsFilter.isArchived}
        onChange={this.handleFilterChange}
      >
        <MenuItem value={false} primaryText="Current" />
        <MenuItem value primaryText="Archived" />
      </DropDownMenu>
    );
  }

  render() {
    const {
      campaignsFilter,
      releasingAllReplies,
      releasingInProgress,
      releaseAllRepliesResult,
      releaseAllRepliesError,
      createFromTemplateOpen,
      createdFromTemplateIds,
      createdFromTemplateTitle,
      showCreatedFromTemplateSnackbar,
      isCreating
    } = this.state;

    const doneReleasingReplies =
      releaseAllRepliesResult || releaseAllRepliesError;

    const { organizationId } = this.props.match.params;
    const { isAdmin } = this.props;
    return (
      <div>
        <div style={styles.flexContainer}>
          {this.renderFilters()}
          <Button
            variant="contained"
            color="primary"
            onClick={this.startReleasingAllReplies}
          >
            Release All Unhandled Replies
          </Button>
        </div>
        {releasingAllReplies && (
          <Dialog open onClose={this.closeReleasingAllReplies}>
            <DialogTitle>Release All Unhandled Replies</DialogTitle>
            <DialogContent>
              {releasingInProgress ? (
                <LoadingIndicator />
              ) : releaseAllRepliesError ? (
                <span>Error: {JSON.stringify(releaseAllRepliesError)}</span>
              ) : releaseAllRepliesResult ? (
                <span>
                  Released {releaseAllRepliesResult.contactCount} replies on{" "}
                  {releaseAllRepliesResult.campaignCount} campaigns
                </span>
              ) : !doneReleasingReplies ? (
                <div>
                  How many hours ago should a conversation have been idle for it
                  to be unassigned?
                  <TextField
                    type="number"
                    floatingLabelText="Number of Hours"
                    ref={(el) => {
                      this.numberOfHoursToReleaseRef = el;
                    }}
                    defaultValue={1}
                  />
                  <br />
                  <br />
                  Should we release replies on campaigns that are restricted to
                  teams? If unchecked, replies on campaigns restricted to team
                  members will stay assigned to their current texter.
                  <Toggle
                    ref={(el) => {
                      this.releaseOnRestrictedRef = el;
                    }}
                    defaultToggled={false}
                  />
                  <br />
                  <br />
                  Release contacts only if it is within texting hours in the
                  contact's timezone? If unchecked, replies will be released for
                  contacts that may not be textable until later today or until
                  tomorrow.
                  <Toggle
                    ref={(el) => {
                      this.limitToCurrentlyTextableContactsRef = el;
                    }}
                    defaultToggled
                  />
                </div>
              ) : (
                <div />
              )}
            </DialogContent>
            <DialogActions>
              {releasingInProgress
                ? []
                : doneReleasingReplies
                ? [
                    <Button
                      key="done"
                      variant="contained"
                      onClick={this.closeReleasingAllReplies}
                    >
                      Done
                    </Button>
                  ]
                : [
                    <Button
                      key="cancel"
                      variant="contained"
                      onClick={this.closeReleasingAllReplies}
                    >
                      Cancel
                    </Button>,
                    <Button
                      key="release"
                      variant="contained"
                      color="primary"
                      onClick={this.releaseAllReplies}
                    >
                      Release
                    </Button>
                  ]}
            </DialogActions>
          </Dialog>
        )}
        {isCreating ? (
          <LoadingIndicator />
        ) : (
          <CampaignList
            organizationId={organizationId}
            campaignsFilter={campaignsFilter}
            pageSize={DEFAULT_PAGE_SIZE}
            isAdmin={isAdmin}
          />
        )}

        {isAdmin ? (
          <AdminCampaignListSpeedDial
            id="adminCampaignListSpeedDial"
            ariaLabel="Open create campaign actions"
            style={theme.components.floatingButton}
            onFocus={this.handleSpeedDialOnFocus}
            onMouseDown={this.handleSpeedDialOnMouseDown}
            onBlur={this.handleSpeedDialOnBlur}
            onKeyDown={this.handleSpeedDialOnKeyDown}
            open={this.state.speedDialOpen}
            direction="up"
            FabProps={{ variant: "extended" }}
            icon={
              <AdminCampaignListSpeedDialIcon
                icon={
                  <Box
                    sx={{
                      display: "flex",
                      alignContent: "center",
                      justifyContent: "center"
                    }}
                  >
                    <SpeedDialIcon />
                    <Typography variant="button">
                      {" "}
                      Create a campaign{" "}
                    </Typography>
                  </Box>
                }
                openIcon={
                  <Box
                    sx={{
                      display: "flex",
                      alignContent: "center",
                      justifyContent: "center"
                    }}
                  >
                    <ClearIcon />
                  </Box>
                }
              />
            }
          >
            <AdminCampaignListSpeedDialAction
              icon={<CreateIcon />}
              tooltipOpen
              tooltipTitle="Create new campaign"
              onClick={this.handleClickNewButton}
            />
            <AdminCampaignListSpeedDialAction
              icon={<FileCopyIcon />}
              tooltipOpen
              tooltipTitle="Create campaign from template"
              onClick={this.handleOnCreateClickFromTemplate}
            />
          </AdminCampaignListSpeedDial>
        ) : null}
        <CreateCampaignFromTemplateDialog
          organizationId={organizationId}
          open={createFromTemplateOpen}
          onClose={this.handleCreateTemplateDialogClose}
          onCreateTemplateCompleted={this.handleCreateTemplateCompleted}
        />
        <Snackbar
          open={showCreatedFromTemplateSnackbar}
          onClose={this.handleCreatedFromTemplateSnackbarClose}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        >
          <MuiAlert
            elevation={6}
            variant="filled"
            severity="success"
            onClose={this.handleCreatedFromTemplateSnackbarClose}
          >
            <AlertTitle>
              Campaign{createdFromTemplateIds.length > 1 ? "s" : ""}{" "}
              successfully created from template "{createdFromTemplateTitle}"
            </AlertTitle>
            <p>
              Created campaign
              {createdFromTemplateIds.length > 1 ? "s" : ""}:{" "}
              {createdFromTemplateIds.map((id, i) => {
                return (
                  <span key={id}>
                    {i > 0 && ", "}
                    <a
                      key={id}
                      target="_blank"
                      href={`${window.BASE_URL}/admin/${organizationId}/campaigns/${id}/edit`}
                      rel="noreferrer"
                    >
                      Campaign {id}
                    </a>
                  </span>
                );
              })}
            </p>
          </MuiAlert>
        </Snackbar>
      </div>
    );
  }
}

AdminCampaignList.propTypes = {
  match: PropTypes.object,
  history: PropTypes.object,
  mutations: PropTypes.object,
  isAdmin: PropTypes.bool.isRequired
};

const mutations = {
  createCampaign: (_ownProps) => (campaign) => ({
    mutation: gql`
      mutation createBlankCampaign($campaign: CampaignInput!) {
        createCampaign(campaign: $campaign) {
          id
        }
      }
    `,
    variables: { campaign }
  }),
  releaseAllUnhandledReplies: (_ownProps) => (
    organizationId,
    ageInHours,
    releaseOnRestricted,
    limitToCurrentlyTextableContacts
  ) => ({
    mutation: gql`
      mutation releaseAllUnhandledReplies(
        $organizationId: String!
        $ageInHours: Float
        $releaseOnRestricted: Boolean
        $limitToCurrentlyTextableContacts: Boolean
      ) {
        releaseAllUnhandledReplies(
          organizationId: $organizationId
          ageInHours: $ageInHours
          releaseOnRestricted: $releaseOnRestricted
          limitToCurrentlyTextableContacts: $limitToCurrentlyTextableContacts
        ) {
          contactCount
          campaignCount
        }
      }
    `,
    variables: {
      organizationId,
      ageInHours,
      releaseOnRestricted,
      limitToCurrentlyTextableContacts
    }
  })
};

export default compose(
  withRouter,
  withAuthzContext,
  loadData({ mutations })
)(AdminCampaignList);
