import PropTypes from "prop-types";
import React from "react";
import moment from "moment";
import RaisedButton from "material-ui/RaisedButton";
import { withAuthzContext } from "../components/AuthzProvider";
import Chart from "../components/Chart";
import { Card, CardTitle, CardText } from "material-ui/Card";
import { red600 } from "material-ui/styles/colors";
import TexterStats from "../components/TexterStats";
import Snackbar from "material-ui/Snackbar";
import { withRouter } from "react-router";
import { StyleSheet, css } from "aphrodite";
import loadData from "./hoc/load-data";
import gql from "graphql-tag";
import theme from "../styles/theme";
import wrapMutations from "./hoc/wrap-mutations";
import { dataTest } from "../lib/attributes";

const inlineStyles = {
  stat: {
    margin: "10px 0",
    width: "100%",
    maxWidth: 400
  },
  count: {
    fontSize: "60px",
    paddingTop: "10px",
    textAlign: "center",
    fontWeight: "bold"
  },
  title: {
    textTransform: "uppercase",
    textAlign: "center",
    color: "gray"
  }
};

const styles = StyleSheet.create({
  container: {
    ...theme.layouts.multiColumn.container,
    marginBottom: 40,
    justifyContent: "space-around",
    flexWrap: "wrap"
  },
  archivedBanner: {
    backgroundColor: "#FFFBE6",
    fontSize: "16px",
    fontWeight: "bold",
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
  question: {
    marginBottom: 24
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
  spacer: {
    marginRight: 20
  },
  secondaryHeader: {
    ...theme.text.secondaryHeader
  }
});

const Stat = ({ title, count }) => (
  <Card key={title} style={inlineStyles.stat}>
    <CardTitle title={count} titleStyle={inlineStyles.count} />
    <CardText style={inlineStyles.title}>{title}</CardText>
  </Card>
);

Stat.propTypes = {
  title: PropTypes.string,
  count: PropTypes.number
};

class AdminCampaignStats extends React.Component {
  state = {
    exportMessageOpen: false,
    disableExportButton: false,
    copyingCampaign: false,
    copiedCampaignId: undefined
  };

  renderSurveyStats() {
    const { interactionSteps } = this.props.data.campaign;

    return interactionSteps.map(step => {
      if (step.question === "") {
        return <div />;
      }

      const totalResponseCount = step.question.answerOptions.reduce(
        (prev, answer) => prev + answer.responderCount,
        0
      );
      return (
        <div key={step.id}>
          <div className={css(styles.secondaryHeader)}>
            {step.question.text}
          </div>
          {totalResponseCount > 0 ? (
            <div className={css(styles.container)}>
              <div className={css(styles.flexColumn)}>
                <Stat title="responses" count={totalResponseCount} />
              </div>
              <div className={css(styles.flexColumn)}>
                <div className={css(styles.rightAlign)}>
                  <Chart
                    data={step.question.answerOptions.map(answer => [
                      answer.value,
                      answer.responderCount
                    ])}
                  />
                </div>
              </div>
            </div>
          ) : (
            "No responses yet"
          )}
        </div>
      );
    });
  }

  renderCopyButton() {
    return (
      <RaisedButton
        label="Copy Campaign"
        onTouchTap={async () =>
          await this.props.mutations.copyCampaign(
            this.props.match.params.campaignId
          )
        }
      />
    );
  }

  render() {
    const { data, match, adminPerms } = this.props;
    const { organizationId, campaignId } = match.params;
    const campaign = data.campaign;

    if (!campaign) {
      return <h1> Uh oh! Campaign {campaignId} doesn't seem to exist </h1>;
    }

    const currentExportJob = this.props.data.campaign.pendingJobs.filter(
      job => job.jobType === "export"
    )[0];
    const shouldDisableExport =
      this.state.disableExportButton || currentExportJob;

    const exportLabel = currentExportJob
      ? `Exporting (${currentExportJob.status}%)`
      : "Export Data";

    const dueFormatted = moment(campaign.dueBy).format("MMM D, YYYY");
    const isOverdue = moment().isSameOrAfter(campaign.dueBy);

    return (
      <div>
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
            <span style={{ color: isOverdue ? red600 : undefined }}>
              {dueFormatted} {isOverdue && "(Overdue)"}
            </span>
          </div>
          <div className={css(styles.flexColumn)}>
            <div className={css(styles.rightAlign)}>
              <div className={css(styles.inline)}>
                <div className={css(styles.inline)}>
                  {!campaign.isArchived ? (
                    // edit
                    <RaisedButton
                      {...dataTest("editCampaign")}
                      onTouchTap={() =>
                        this.props.history.push(
                          `/admin/${organizationId}/campaigns/${campaignId}/edit`
                        )
                      }
                      label="Edit"
                    />
                  ) : null}
                  {adminPerms
                    ? [
                        // Buttons for Admins (and not Supervolunteers)
                        // export
                        <RaisedButton
                          onTouchTap={async () => {
                            this.setState(
                              {
                                exportMessageOpen: true,
                                disableExportButton: true
                              },
                              () => {
                                this.setState({
                                  exportMessageOpen: true,
                                  disableExportButton: false
                                });
                              }
                            );
                            await this.props.mutations.exportCampaign(
                              campaignId
                            );
                          }}
                          label={exportLabel}
                          disabled={shouldDisableExport}
                        />, // unarchive
                        campaign.isArchived ? (
                          <RaisedButton
                            onTouchTap={async () =>
                              await this.props.mutations.unarchiveCampaign(
                                campaignId
                              )
                            }
                            label="Unarchive"
                          />
                        ) : null, // archive
                        !campaign.isArchived ? (
                          <RaisedButton
                            onTouchTap={async () =>
                              await this.props.mutations.archiveCampaign(
                                campaignId
                              )
                            }
                            label="Archive"
                          />
                        ) : null, // copy
                        <RaisedButton
                          {...dataTest("copyCampaign")}
                          label="Copy Campaign"
                          disabled={this.state.copyingCampaign}
                          onTouchTap={() => {
                            this.setState({ copyingCampaign: true });

                            this.props.mutations
                              .copyCampaign(this.props.match.params.campaignId)
                              .then(result => {
                                this.setState({
                                  campaignJustCopied: true,
                                  copyingCampaign: false,
                                  copiedCampaignId: result.data.copyCampaign.id
                                });
                              });
                          }}
                        />
                      ]
                    : null}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className={css(styles.container)}>
          <div className={css(styles.flexColumn, styles.spacer)}>
            <Stat title="Contacts" count={campaign.contactsCount} />
          </div>
          <div className={css(styles.flexColumn, styles.spacer)}>
            <Stat title="Texters" count={campaign.assignments.length} />
          </div>
          <div className={css(styles.flexColumn, styles.spacer)}>
            <Stat title="Sent" count={campaign.stats.sentMessagesCount} />
          </div>
          <div className={css(styles.flexColumn, styles.spacer)}>
            <Stat
              title="Replies"
              count={campaign.stats.receivedMessagesCount}
            />
          </div>
          <div className={css(styles.flexColumn)}>
            <Stat title="Opt-outs" count={campaign.stats.optOutsCount} />
          </div>
        </div>
        <div className={css(styles.header)}>Survey Questions</div>
        {this.renderSurveyStats()}

        <div className={css(styles.header)}>Texter stats</div>
        <div className={css(styles.secondaryHeader)}>% of first texts sent</div>
        <TexterStats campaign={campaign} />
        <Snackbar
          open={this.state.exportMessageOpen}
          message="Export started - we'll e-mail you when it's done"
          autoHideDuration={5000}
          onRequestClose={() => {
            this.setState({ exportMessageOpen: false });
          }}
        />
        <Snackbar
          open={this.state.campaignJustCopied}
          message={`Campaign successfully copied to campaign ${
            this.state.copiedCampaignId
          }`}
          autoHideDuration={5000}
          onRequestClose={() => {
            this.setState({
              campaignJustCopied: false,
              copiedCampaignId: undefined
            });
          }}
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
  adminPerms: PropTypes.bool.isRequired
};

const mapQueriesToProps = ({ ownProps }) => ({
  data: {
    query: gql`
      query getCampaign(
        $campaignId: String!
        $contactsFilter: ContactsFilter!
      ) {
        campaign(id: $campaignId) {
          id
          title
          dueBy
          isArchived
          useDynamicAssignment
          assignments {
            id
            texter {
              id
              firstName
              lastName
            }
            unmessagedCount: contactsCount(contactsFilter: $contactsFilter)
            contactsCount
          }
          pendingJobs {
            id
            jobType
            assigned
            status
          }
          interactionSteps {
            id
            question {
              text
              answerOptions {
                value
                responderCount
              }
            }
          }
          contactsCount
          stats {
            sentMessagesCount
            receivedMessagesCount
            optOutsCount
          }
        }
      }
    `,
    variables: {
      campaignId: ownProps.match.params.campaignId,
      contactsFilter: {
        messageStatus: "needsMessage"
      }
    },
    pollInterval: 5000
  }
});

const mapMutationsToProps = () => ({
  archiveCampaign: campaignId => ({
    mutation: gql`
      mutation archiveCampaign($campaignId: String!) {
        archiveCampaign(id: $campaignId) {
          id
          isArchived
        }
      }
    `,
    variables: { campaignId }
  }),
  unarchiveCampaign: campaignId => ({
    mutation: gql`
      mutation unarchiveCampaign($campaignId: String!) {
        unarchiveCampaign(id: $campaignId) {
          id
          isArchived
        }
      }
    `,
    variables: { campaignId }
  }),
  exportCampaign: campaignId => ({
    mutation: gql`
      mutation exportCampaign($campaignId: String!) {
        exportCampaign(id: $campaignId) {
          id
        }
      }
    `,
    variables: { campaignId }
  }),
  copyCampaign: campaignId => ({
    mutation: gql`
      mutation copyCampaign($campaignId: String!) {
        copyCampaign(id: $campaignId) {
          id
        }
      }
    `,
    variables: { campaignId }
  })
});

export default loadData(
  withRouter(wrapMutations(withAuthzContext(AdminCampaignStats))),
  {
    mapQueriesToProps,
    mapMutationsToProps
  }
);
