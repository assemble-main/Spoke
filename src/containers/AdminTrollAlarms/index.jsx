import React from "react";
import PropTypes from "prop-types";
import gql from "graphql-tag";

import AutoComplete from "material-ui/AutoComplete";
import Dialog from "material-ui/Dialog";
import FlatButton from "material-ui/FlatButton";
import Paper from "material-ui/Paper";
import RaisedButton from "material-ui/RaisedButton";
import Toggle from "material-ui/Toggle";

import { loadData } from "../hoc/with-operations";
import { dataSourceItem } from "../../components/utils";
import TrollAlarmList from "./components/TrollAlarmList";

const styles = {
  controlsContainer: {
    padding: "10px",
    display: "flex",
    alignItems: "baseline"
  },
  controlsColumn: { flexGrow: "1", flexBasis: "1" }
};

class AdminTrollAlarms extends React.Component {
  state = {
    // UI Widgets
    tokenSearchText: "",

    // Query params
    pageSize: 25,
    page: 0,
    dismissed: false,
    token: null,

    // Operations
    selectedAlarmIds: [],
    isWorking: false,
    error: undefined
  };

  handleOnCancelError = () => this.setState({ error: undefined });

  // Query conditions
  handleFocusTokenSearch = () =>
    this.setState({ tokenSearchText: "", token: null });
  handleTokenSearchTextChange = tokenSearchText =>
    this.setState({ tokenSearchText });
  handleTokenSelected = (selection, index) => {
    let token = null;
    if (index > -1) {
      token = selection.value.key;
    } else {
      const trollTokens = this.props.trollTokens.trollTokens;
      token = trollTokens.find(({ token }) => token === selection);
    }
    if (token) {
      this.setState({ token, selectedAlarmIds: [] });
    }
  };
  handleToggleDismissed = (_event, dismissed) =>
    this.setState({ dismissed, selectedAlarmIds: [] });

  // Actions
  handleDismissSelected = async () => {
    const { selectedAlarmIds } = this.state;
    this.setState({ isWorking: true, error: undefined });
    try {
      await this.props.mutations.dismissAlarms(selectedAlarmIds);
      this.setState({ selectedAlarmIds: [] });
    } catch (err) {
      this.setState({ error: err.message });
    } finally {
      this.setState({ isWorking: false });
    }
  };

  // Table selection
  handleAlarmSelectionChange = selectedAlarmIds =>
    this.setState({ selectedAlarmIds });

  // Pagination
  handlePageSizeChange = pageSize => this.setState({ pageSize });
  handlePageChange = page => this.setState({ page });

  render() {
    const { tokenSearchText } = this.state;
    const { pageSize, page, dismissed, token } = this.state;
    const { selectedAlarmIds, isWorking, error } = this.state;
    const { match } = this.props;

    const trollTokens = this.props.trollTokens.trollTokens;
    const dataSource = trollTokens.map(({ token }) =>
      dataSourceItem(token, token)
    );

    const deleteAllSuffix = token ? `"${token}"` : "Token";
    const isDeleteSelectedDisabled = selectedAlarmIds.length === 0 || isWorking;

    const errorActions = [
      <FlatButton
        label="Close"
        primary={true}
        onClick={this.handleOnCancelError}
      />
    ];

    return (
      <div>
        <Paper style={styles.controlsContainer}>
          <AutoComplete
            floatingLabelText={"Token"}
            hintText={"Search for a trigger token"}
            style={{ marginRight: "10px", ...styles.controlsColumn }}
            fullWidth={true}
            maxSearchResults={8}
            searchText={tokenSearchText}
            dataSource={dataSource}
            filter={AutoComplete.caseInsensitiveFilter}
            onFocus={this.handleFocusTokenSearch}
            onUpdateInput={this.handleTokenSearchTextChange}
            onNewRequest={this.handleTokenSelected}
          />
          <Toggle
            label="Dismissed Alarms"
            style={styles.controlsColumn}
            onToggle={this.handleToggleDismissed}
            toggled={dismissed}
          />
          <RaisedButton
            label={`Dismiss All Matching ${deleteAllSuffix}`}
            style={{ marginRight: "10px" }}
            secondary={true}
            disabled={token === null}
            onClick={console.log}
          />
          <RaisedButton
            label={`Dismiss Selected (${selectedAlarmIds.length})`}
            secondary={true}
            disabled={isDeleteSelectedDisabled}
            onClick={this.handleDismissSelected}
          />
        </Paper>
        <br />
        <TrollAlarmList
          organizationId={match.params.organizationId}
          pageSize={pageSize}
          page={page}
          dismissed={dismissed}
          token={token}
          selectedAlarmIds={selectedAlarmIds}
          onAlarmSelectionChange={this.handleAlarmSelectionChange}
          onPageSizeChange={this.handlePageSizeChange}
          onPageChange={this.handlePageChange}
        />
        <Dialog
          title="Error"
          actions={errorActions}
          open={error !== undefined}
          onRequestClose={this.handleOnCancelError}
        >
          {error || ""}
        </Dialog>
      </div>
    );
  }
}

AdminTrollAlarms.propTypes = {
  // HOC props
  match: PropTypes.object.isRequired,
  trollTokens: PropTypes.shape({
    trollTokens: PropTypes.arrayOf(
      PropTypes.shape({
        token: PropTypes.string.isRequired
      })
    ).isRequired
  }).isRequired
};

const queries = {
  trollTokens: {
    query: gql`
      query getTrollTokensForOrg($organizationId: String!) {
        trollTokens(organizationId: $organizationId) {
          token
        }
      }
    `,
    options: ownProps => ({
      variables: {
        organizationId: ownProps.match.params.organizationId
      }
    })
  }
};

const mutations = {
  dismissAlarms: ownProps => alarmIds => ({
    mutation: gql`
      mutation addTrollBotToken(
        $organizationId: String!
        $alarmIds: [String!]!
      ) {
        dismissManyAlarms(
          messageIds: $alarmIds
          organizationId: $organizationId
        )
      }
    `,
    variables: {
      organizationId: ownProps.match.params.organizationId,
      alarmIds
    },
    refetchQueries: ["getTrollAlarmsForOrg"]
  })
};

export default loadData({
  queries,
  mutations
})(AdminTrollAlarms);
