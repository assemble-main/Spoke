import { gql } from "@apollo/client";
import Button from "@material-ui/core/Button";
import { red } from "@material-ui/core/colors";
import Divider from "@material-ui/core/Divider";
import Grid from "@material-ui/core/Grid";
import Snackbar from "@material-ui/core/Snackbar";
import Alert from "@material-ui/lab/Alert";
import {
  GetCampaignDocument,
  GetOrganizationDataDocument,
  GetOrganizationsDocument
} from "@spoke/spoke-codegen";
import { css, StyleSheet } from "aphrodite";
import PropTypes from "prop-types";
import React from "react";
import { Helmet } from "react-helmet";
import { withRouter } from "react-router-dom";
import { compose } from "recompose";

import CampaignNavigation from "../../components/CampaignNavigation";
import ScriptPreviewButton from "../../components/ScriptPreviewButton";
import { dataTest } from "../../lib/attributes";
import { DateTime } from "../../lib/datetime";
import theme from "../../styles/theme";
import { withAuthzContext } from "../AuthzProvider";
import { loadData } from "../hoc/with-operations";
import CampaignExportModal from "./components/CampaignExportModal";
import CampaignSurveyStats from "./components/CampaignSurveyStats";
import CopyCampaignModal from "./components/CopyCampaignModal";
import DeliverabilityStats from "./components/DeliverabilityStats";
import TexterStats from "./components/TexterStats";
import TopLineStats from "./components/TopLineStats";
import VanExportModal from "./components/VanExportModal";
import VanSyncModal from "./components/VanSyncModal";

const styles = StyleSheet.create({
  container: {
    ...theme.layouts.multiColumn.container,
    marginBottom: 40,
    justifyContent: "space-around",
    flexWrap: "wrap"
  },
  buttonContainer: {
    ...theme.layouts.multiColumn.container,
    justifyContent: "flex-end",
    paddingTop: 20,
    paddingBottom: 20,
    flexWrap: "wrap"
  },
  archivedBanner: {
    backgroundColor: "#FFFBE6",
    fontSize: "16px",
    width: "100%",
    padding: "15px",
    textAlign: "center",
    marginBottom: "20px"
  },
  header: {
    ...theme.text.header
  },
  flexColumn: {
    flex: 1,
    textAlign: "right",
    display: "flex"
  },
  rightAlign: {
    marginLeft: "auto",
    marginRight: 0
  },
  inline: {
    display: "inline-block",
    marginLeft: 20,
    verticalAlign: "middle"
  },
  secondaryHeader: {
    ...theme.text.secondaryHeader
  }
});

class AdminCampaignStats extends React.Component {
  state = {
    exportMessageOpen: false,
    exportDialogOpen: false,
    exportVanOpen: false,
    syncVanOpen: false,
    copyCampaignModalOpen: false,
    disableExportButton: false,
    disableVanExportButton: false,
    disableVanSyncButton: false,
    copyingCampaign: false,
    campaignJustCopied: false,
    copiedCampaignId: undefined,
    copyCampaignError: undefined,
    exportCampaignOpen: false,
    exportCampaignError: undefined
  };

  handleNavigateToEdit = () => {
    const { organizationId, campaignId } = this.props.match.params;
    const editUrl = `/admin/${organizationId}/campaigns/${campaignId}/edit`;
    this.props.history.push(editUrl);
  };

  handleOnClickExport = async () => {
    this.setState({
      exportDialogOpen: true,
      disableExportButton: true
    });
  };

  handleCloseCampaignExport = async () => {
    this.setState({
      exportDialogOpen: false,
      disableExportButton: false
    });
  };

  handleCompleteCampaignExport = async () => {
    this.setState({
      exportDialogOpen: false,
      exportMessageOpen: true,
      disableExportButton: true
    });
  };

  handleErrorCampaignExport = async (errorMessage) => {
    this.setState({
      exportCampaignError: errorMessage,
      exportCampaignOpen: true,
      exportDialogOpen: false
    });
  };

  handleOnClickVanExport = () => this.setState({ exportVanOpen: true });

  handleDismissVanExport = () => this.setState({ exportVanOpen: false });

  handleCompleteVanExport = () =>
    this.setState({
      exportVanOpen: false,
      exportMessageOpen: true,
      disableVanExportButton: true
    });

  handleOnClickVanSync = () => this.setState({ syncVanOpen: true });

  handleDismissVanSync = () => this.setState({ syncVanOpen: false });

  handleCompleteVanSync = () =>
    this.setState({
      syncVanOpen: false,
      disableVanSyncButton: true
    });

  openCopyCampaignModal = () => this.setState({ copyCampaignModalOpen: true });

  handleDismissCopyCampaign = () =>
    this.setState({ copyCampaignModalOpen: false });

  handleCompleteCopyCampaign = (copiedCampaignId) => {
    this.setState({ copyCampaignModalOpen: false });
    if (copiedCampaignId === undefined)
      this.setState({
        campaignJustCopied: true,
        copyingCampaign: false,
        copyCampaignError: "There was an error copying this campaign."
      });
    else
      this.setState({
        campaignJustCopied: true,
        copyingCampaign: false,
        copiedCampaignId
      });
  };

  handleCopyCampaignSameOrg = () => {
    this.setState({ copyingCampaign: true });

    this.props.mutations
      .copyCampaign()
      .then((result) => {
        if (result.errors) {
          throw result.errors;
        }

        this.setState({
          campaignJustCopied: true,
          copyingCampaign: false,
          copiedCampaignId: result.data.copyCampaign.id
        });
      })
      .catch((error) =>
        this.setState({
          campaignJustCopied: true,
          copyingCampaign: false,
          copyCampaignError: error
        })
      );
  };

  prevCampaignClicked = (campaignId) => {
    const { history } = this.props;
    const { organizationId } = this.props.match.params;
    history.push(`/admin/${organizationId}/campaigns/${campaignId}`);
  };

  nextCampaignClicked = (campaignId) => {
    const { history } = this.props;
    const { organizationId } = this.props.match.params;
    history.push(`/admin/${organizationId}/campaigns/${campaignId}`);
  };

  render() {
    const {
      disableExportButton,
      disableVanExportButton,
      disableVanSyncButton
    } = this.state;
    const { data, match, isAdmin, isSuperadmin, organizationData } = this.props;
    const { organizationId, campaignId } = match.params;
    const { campaign } = data;
    const { organization } = organizationData;

    if (!campaign) {
      return <h1> Uh oh! Campaign {campaignId} doesn't seem to exist </h1>;
    }
    const { pendingJobs, messagingService } = campaign;

    const currentExportJob = pendingJobs.find(
      (job) => job.jobType === "export"
    );
    const shouldDisableExport =
      disableExportButton || currentExportJob !== undefined;
    const exportLabel = currentExportJob
      ? `Exporting (${currentExportJob.status}%)`
      : "Export Data";

    const vanExportJob = pendingJobs.find(
      (job) => job.jobType === "van-export"
    );
    const isVanExportDisabled =
      disableVanExportButton || vanExportJob !== undefined;
    const vanExportLabel = vanExportJob
      ? `Exporting for VAN (${vanExportJob.status}%)`
      : "Export for VAN";

    const vanSyncJob = pendingJobs.find((job) => job.jobType === "van-sync");
    const isVanSyncDisabled = disableVanSyncButton || vanSyncJob !== undefined;
    const vanSyncLabel = vanSyncJob
      ? `Syncing to VAN (${vanSyncJob.status}%)`
      : "Sync to VAN";

    const dueFormatted = campaign.dueBy
      ? DateTime.fromISO(campaign.dueBy).toFormat("DD")
      : "No Due Date";
    const isOverdue = DateTime.local() >= DateTime.fromISO(campaign.dueBy);
    const newTitle = `${organization.name} - Campaigns - ${campaignId}: ${campaign.title}`;

    // only a superadmin with multiple active orgs can copy a campaign to another org
    const orgLength = this.props.orgs?.organizations?.length;
    const onlyCopyCampaignSameOrg =
      !isSuperadmin || orgLength === undefined || orgLength < 2;

    let msgServiceName = messagingService?.name;
    if (!msgServiceName) {
      msgServiceName = messagingService?.id;
    }
    const showMessagingServiceName =
      organization.messagingServices.pageInfo.totalCount > 1 &&
      campaign.isStarted &&
      msgServiceName;

    return (
      <div>
        <Helmet>
          <title>{newTitle}</title>
        </Helmet>
        <Grid container justify="flex-end">
          <Grid item>
            <CampaignNavigation
              prevCampaignClicked={this.prevCampaignClicked}
              nextCampaignClicked={this.nextCampaignClicked}
              campaignId={campaign.id}
            />
          </Grid>
        </Grid>
        <Divider style={{ marginTop: 20, marginBottom: 20 }} />
        <div className={css(styles.container)}>
          {campaign.isArchived ? (
            <div className={css(styles.archivedBanner)}>
              This campaign is archived
            </div>
          ) : (
            ""
          )}

          <div className={css(styles.header)}>
            {campaign.title}
            <br />
            Campaign ID: {campaign.id}
            <br />
            Due:{" "}
            <span style={{ color: isOverdue ? red[600] : undefined }}>
              {dueFormatted} {isOverdue && "(Overdue)"}
            </span>
            {showMessagingServiceName && (
              <>
                <br />
                Messaging Service: {msgServiceName}
              </>
            )}
          </div>
          <div className={css(styles.flexColumn)}>
            <div className={css(styles.rightAlign)}>
              <div className={css(styles.inline)}>
                <div className={css(styles.inline)}>
                  {!campaign.isArchived ? (
                    // edit
                    <Button
                      {...dataTest("editCampaign")}
                      variant="contained"
                      onClick={this.handleNavigateToEdit}
                    >
                      Edit
                    </Button>
                  ) : null}
                  <ScriptPreviewButton campaignId={campaignId} />

                  {isAdmin
                    ? [
                        // Buttons for Admins (and not Supervolunteers)
                        // export
                        <Button
                          key="export"
                          variant="contained"
                          disabled={shouldDisableExport}
                          onClick={this.handleOnClickExport}
                        >
                          {exportLabel}
                        </Button>,
                        // Export for VAN
                        <Button
                          key="van-export"
                          variant="contained"
                          disabled={isVanExportDisabled}
                          onClick={this.handleOnClickVanExport}
                        >
                          {vanExportLabel}
                        </Button>,
                        // Sync to VAN
                        <Button
                          key="van-sync"
                          variant="contained"
                          disabled={isVanSyncDisabled}
                          onClick={this.handleOnClickVanSync}
                        >
                          {vanSyncLabel}
                        </Button>,
                        // unarchive
                        campaign.isArchived ? (
                          <Button
                            key="unarchive"
                            variant="contained"
                            onClick={() =>
                              this.props.mutations.unarchiveCampaign()
                            }
                          >
                            Unarchive
                          </Button>
                        ) : null, // archive
                        !campaign.isArchived ? (
                          <Button
                            key="archive"
                            variant="contained"
                            onClick={() =>
                              this.props.mutations.archiveCampaign()
                            }
                          >
                            Archive
                          </Button>
                        ) : null,
                        // Copy
                        <Button
                          key="copy"
                          {...dataTest("copyCampaign")}
                          variant="contained"
                          disabled={this.state.copyingCampaign}
                          onClick={
                            onlyCopyCampaignSameOrg
                              ? this.handleCopyCampaignSameOrg
                              : this.openCopyCampaignModal
                          }
                        >
                          Copy Campaign
                        </Button>
                      ]
                    : null}
                </div>
              </div>
            </div>
          </div>
        </div>
        <TopLineStats campaignId={campaign.id} />
        <div className={css(styles.header)}>Survey Questions</div>
        <CampaignSurveyStats campaignId={campaign.id} />

        <br />
        <div className={css(styles.header)}>Outbound Deliverability</div>
        <DeliverabilityStats campaignId={campaign.id} />
        <br />

        <div className={css(styles.header)}>Texter stats</div>
        <div className={css(styles.secondaryHeader)}>% of first texts sent</div>
        <TexterStats campaignId={campaign.id} />

        <Snackbar
          open={this.state.exportMessageOpen}
          message="Export started - we'll e-mail you when it's done"
          autoHideDuration={5000}
          onClose={() => {
            this.setState({ exportMessageOpen: false });
          }}
        />
        <Snackbar
          open={this.state.campaignJustCopied}
          message={
            this.state.copyCampaignError
              ? `Error: ${this.state.copyCampaignError}`
              : `Campaign successfully copied to campaign ${this.state.copiedCampaignId}`
          }
          autoHideDuration={5000}
          onClose={() => {
            this.setState({
              campaignJustCopied: false,
              copiedCampaignId: undefined,
              copyCampaignError: undefined
            });
          }}
        />
        <CampaignExportModal
          campaignId={campaignId}
          open={this.state.exportDialogOpen}
          onClose={this.handleCloseCampaignExport}
          onComplete={this.handleCompleteCampaignExport}
          onError={this.handleErrorCampaignExport}
        />
        <Snackbar
          open={this.state.exportCampaignOpen}
          autoHideDuration={5000}
          onClose={() => {
            this.setState({
              exportCampaignOpen: false,
              exportCampaignError: undefined
            });
          }}
        >
          <Alert severity="error">{this.state.exportCampaignError}</Alert>
        </Snackbar>
        <VanExportModal
          campaignId={campaignId}
          open={this.state.exportVanOpen}
          onRequestClose={this.handleDismissVanExport}
          onComplete={this.handleCompleteVanExport}
        />
        <VanSyncModal
          organizationId={organizationId}
          campaignId={campaignId}
          open={this.state.syncVanOpen}
          onRequestClose={this.handleDismissVanSync}
          onComplete={this.handleCompleteVanSync}
        />
        <CopyCampaignModal
          currentOrgId={organizationId}
          campaignId={campaignId}
          open={this.state.copyCampaignModalOpen}
          onRequestClose={this.handleDismissCopyCampaign}
          onComplete={this.handleCompleteCopyCampaign}
        />
      </div>
    );
  }
}

AdminCampaignStats.propTypes = {
  mutations: PropTypes.object,
  data: PropTypes.object,
  match: PropTypes.object.isRequired,
  history: PropTypes.object.isRequired,
  isAdmin: PropTypes.bool.isRequired
};

const queries = {
  data: {
    query: GetCampaignDocument,
    options: (ownProps) => ({
      variables: {
        campaignId: ownProps.match.params.campaignId
      }
    })
  },

  organizationData: {
    query: GetOrganizationDataDocument,
    options: (ownProps) => ({
      variables: {
        organizationId: ownProps.match.params.organizationId
      }
    })
  },

  orgs: {
    query: GetOrganizationsDocument
  }
};

const mutations = {
  archiveCampaign: (ownProps) => () => ({
    mutation: gql`
      mutation archiveCampaign($campaignId: String!) {
        archiveCampaign(id: $campaignId) {
          id
          isArchived
        }
      }
    `,
    variables: { campaignId: ownProps.match.params.campaignId }
  }),
  unarchiveCampaign: (ownProps) => () => ({
    mutation: gql`
      mutation unarchiveCampaign($campaignId: String!) {
        unarchiveCampaign(id: $campaignId) {
          id
          isArchived
        }
      }
    `,
    variables: { campaignId: ownProps.match.params.campaignId }
  }),
  exportCampaign: (ownProps) => () => ({
    mutation: gql`
      mutation exportCampaign($campaignId: String!) {
        exportCampaign(
          options: { campaignId: $campaignId, exportType: SPOKE }
        ) {
          id
        }
      }
    `,
    variables: { campaignId: ownProps.match.params.campaignId }
  }),
  copyCampaign: (ownProps) => () => ({
    mutation: gql`
      mutation copyCampaign($campaignId: String!) {
        copyCampaign(id: $campaignId) {
          id
        }
      }
    `,
    variables: { campaignId: ownProps.match.params.campaignId }
  })
};

export default compose(
  withRouter,
  loadData({
    queries,
    mutations
  }),
  withAuthzContext
)(AdminCampaignStats);
