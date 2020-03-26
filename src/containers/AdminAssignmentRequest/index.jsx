import React, { Component } from "react";
import PropTypes from "prop-types";
import gql from "graphql-tag";
import isEqual from "lodash/isEqual";

import CircularProgress from "material-ui/CircularProgress";

import { loadData } from "../hoc/with-operations";
import { sleep } from "../../lib/utils";
import AssignmentRequestTable, {
  RowWorkStatus
} from "./AssignmentRequestTable";

class AdminAssignmentRequest extends Component {
  state = {
    assignmentRequests: []
  };

  componentWillUpdate(nextProps) {
    this.updateAssignmentRequestStateWithNewProps(this.props, nextProps);
  }

  componentWillMount() {
    this.updateAssignmentRequestStateWithNewProps(null, this.props);
  }

  updateAssignmentRequestStateWithNewProps(lastProps, nextProps) {
    if (
      lastProps &&
      lastProps.pendingAssignmentRequests.assignmentRequests &&
      nextProps.pendingAssignmentRequests.assignmentRequests &&
      isEqual(
        lastProps.pendingAssignmentRequests.assignmentRequests,
        nextProps.pendingAssignmentRequests.assignmentRequests
      )
    ) {
      // Ignore the props/state update unless server-provided assignmentRequests have changed
      return;
    }

    const { assignmentRequests } = nextProps.pendingAssignmentRequests;
    this.state.assignmentRequests = assignmentRequests;
  }

  setRequestStatus = (requestId, status) => {
    const { assignmentRequests } = this.state;
    const requestIndex = assignmentRequests.findIndex(
      request => request.id === requestId
    );
    if (requestIndex < 0)
      throw new Error(`Could not find request with ID ${requestId}`);
    assignmentRequests[requestIndex].status = status;
    this.setState({ assignmentRequests });
  };

  deleteRequest = requestId => {
    let { assignmentRequests } = this.state;
    assignmentRequests = assignmentRequests.filter(
      request => request.id !== requestId
    );
    this.setState({ assignmentRequests });
  };

  handleResolveRequest = approved => async requestId => {
    const { resolveAssignmentRequest } = this.props.mutations;
    this.setRequestStatus(requestId, RowWorkStatus.Working);
    try {
      const response = await resolveAssignmentRequest(requestId, approved);
      if (response.errors) throw response.errors[0];

      const newStatus = approved
        ? RowWorkStatus.Approved
        : RowWorkStatus.Denied;
      this.setRequestStatus(requestId, newStatus);
      await sleep(2000);
      this.deleteRequest(requestId);
    } catch (exc) {
      console.error(
        `Resolve request as "${approved ? "approved" : "denied"}" failed: `,
        exc
      );
      this.setRequestStatus(requestId, RowWorkStatus.Error);
    }
  };

  render() {
    const { pendingAssignmentRequests } = this.props;

    if (pendingAssignmentRequests.loading) {
      return <CircularProgress />;
    }

    const { assignmentRequests } = this.state;

    return (
      <AssignmentRequestTable
        assignmentRequests={assignmentRequests}
        onApproveRequest={this.handleResolveRequest(true)}
        onDenyRequest={this.handleResolveRequest(false)}
      />
    );
  }
}

AdminAssignmentRequest.propTypes = {
  match: PropTypes.object.isRequired
};

const queries = {
  pendingAssignmentRequests: {
    query: gql`
      query assignmentRequests($organizationId: String!, $status: String) {
        assignmentRequests(organizationId: $organizationId, status: $status) {
          id
          createdAt
          amount
          status
          user {
            id
            firstName
            lastName
          }
        }
      }
    `,
    options: ownProps => ({
      variables: {
        organizationId: ownProps.match.params.organizationId,
        status: "pending"
      },
      fetchPolicy: "network-only",
      pollInterval: 10000
    })
  }
};

const mutations = {
  resolveAssignmentRequest: ownProps => (
    assignmentRequestId,
    approved,
    autoApproveLevel
  ) => ({
    mutation: gql`
      mutation resolveAssignmentRequest(
        $assignmentRequestId: String!
        $approved: Boolean!
        $autoApproveLevel: RequestAutoApprove
      ) {
        resolveAssignmentRequest(
          assignmentRequestId: $assignmentRequestId
          approved: $approved
          autoApproveLevel: $autoApproveLevel
        )
      }
    `,
    variables: { assignmentRequestId, approved, autoApproveLevel }
  })
};

export default loadData({
  queries,
  mutations
})(AdminAssignmentRequest);
