import type { ApolloQueryResult } from "@apollo/client";
import { gql } from "@apollo/client";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogTitle from "@material-ui/core/DialogTitle";
import type { Organization, TeamInput } from "@spoke/spoke-codegen";
import { Card, CardActions, CardHeader, CardText } from "material-ui/Card";
import React, { useState } from "react";
import type { match } from "react-router-dom";

import type { MutationMap, QueryMap } from "../../network/types";
import { loadData } from "../hoc/with-operations";
import AssignmentRow from "./components/AssignmentRow";
import type {
  TagWithTitle,
  TeamForAssignment,
  TeamInputWithTags
} from "./types";

interface OuterProps {
  match: match<{ organizationId: string }>;
  className?: string;
  containerStyle?: any;
  style?: any;
}

interface InnerProps extends OuterProps {
  assignmentConfiguration: {
    organization: Pick<
      Organization,
      | "id"
      | "textRequestFormEnabled"
      | "textRequestType"
      | "textRequestMaxCount"
    > & {
      escalationTagList: TagWithTitle[];
      teams: TeamForAssignment[];
    };
  };
  mutations: {
    saveTeams: (payload: TeamInput[]) => Promise<ApolloQueryResult<any>>;
  };
}

const AdminAssignmentControl: React.FC<InnerProps> = (props) => {
  const {
    className = "",
    containerStyle = {},
    style = { padding: "15px" }
  } = props;
  const [changes, setChanges] = useState<Record<string, TeamInputWithTags>>({});
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const assignmentPoolsFromProps = () => {
    const {
      textRequestFormEnabled,
      textRequestType,
      textRequestMaxCount,
      teams
    } = props.assignmentConfiguration.organization;
    const generalAssignment: TeamForAssignment = {
      id: "general",
      title: "General",
      textColor: "",
      backgroundColor: "",
      isAssignmentEnabled: textRequestFormEnabled,
      assignmentType: textRequestType,
      maxRequestCount: textRequestMaxCount,
      escalationTags: []
    };

    const rwTeams = teams.map((team) => ({ ...team }));
    const assignmentPools = [generalAssignment].concat(rwTeams);
    return assignmentPools;
  };

  const assignmentPoolsWithChanges = () => {
    let assignmentPools = assignmentPoolsFromProps();
    assignmentPools = assignmentPools.map((pool) => {
      const poolChanges = changes[pool.id] || {};
      return Object.assign(pool, poolChanges);
    });
    return assignmentPools;
  };

  const createHandleChangeAssignment = (poolId: string) => (
    payload: TeamInputWithTags
  ) => {
    const poolChanges: TeamInputWithTags = { ...changes[poolId], ...payload };
    setChanges({ ...changes, [poolId]: poolChanges });
  };

  const handleSaveAssignmentControls = async () => {
    const payloads: TeamInput[] = Object.entries(changes).map(
      ([key, teamChanges]) => {
        const { escalationTags, ...team } = teamChanges;
        const payload = { ...team, id: key };
        if (escalationTags) {
          payload.escalationTagIds = escalationTags.map((t) => t.id);
        }
        return payload;
      }
    );

    setWorking(true);
    try {
      const response = await props.mutations.saveTeams(payloads);
      if (response.errors) throw response.errors;
      setChanges({});
      console.log("assignmentPoolsWithChanges", assignmentPoolsWithChanges());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setWorking(false);
    }
  };

  const handleCloseDialog = () => setError(undefined);

  const hasChanges = Object.keys(changes).length > 0;

  const assignmentPools = assignmentPoolsWithChanges();
  const escalationTagList = props.assignmentConfiguration.organization
    ? props.assignmentConfiguration.organization.escalationTagList
    : [];

  const dialogActions = [
    <Button key="close" color="primary" onClick={handleCloseDialog}>
      Close
    </Button>
  ];

  return (
    <Card className={className} containerStyle={containerStyle} style={style}>
      <CardHeader title="Assignment Request Controls" />
      <CardText>
        {assignmentPools.map((assignmentPool) => (
          <AssignmentRow
            key={assignmentPool.id}
            assignmentPool={assignmentPool}
            escalationTagList={escalationTagList}
            isRowDisabled={working}
            onChange={createHandleChangeAssignment(assignmentPool.id)}
          />
        ))}
      </CardText>
      <CardActions style={{ textAlign: "right" }}>
        <Button
          variant="contained"
          color="primary"
          disabled={working || !hasChanges}
          onClick={handleSaveAssignmentControls}
        >
          Save
        </Button>
      </CardActions>
      <Dialog open={!!error} onClose={handleCloseDialog}>
        <DialogTitle>Error saving Assignment Controls</DialogTitle>
        <DialogContent>
          <DialogContentText>{error}</DialogContentText>
        </DialogContent>
        <DialogActions>{dialogActions}</DialogActions>
      </Dialog>
    </Card>
  );
};

const queries: QueryMap<OuterProps> = {
  assignmentConfiguration: {
    query: gql`
      query getAssignmentConfiguration($organizationId: String!) {
        organization(id: $organizationId) {
          id
          textRequestFormEnabled
          textRequestType
          textRequestMaxCount
          escalationTagList {
            id
            title
          }
          teams {
            id
            title
            textColor
            backgroundColor
            isAssignmentEnabled
            assignmentType
            maxRequestCount
            escalationTags {
              id
              title
            }
          }
        }
      }
    `,
    options: (ownProps) => ({
      variables: {
        organizationId: ownProps.match.params.organizationId
      }
    })
  }
};

const mutations: MutationMap<OuterProps> = {
  saveTeams: (ownProps) => (teams) => ({
    mutation: gql`
      mutation saveTeams($organizationId: String!, $teams: [TeamInput]!) {
        saveTeams(organizationId: $organizationId, teams: $teams) {
          id
          title
          textColor
          backgroundColor
          isAssignmentEnabled
          assignmentType
          maxRequestCount
          escalationTags {
            id
            title
          }
        }
      }
    `,
    variables: {
      organizationId: ownProps.match.params.organizationId,
      teams
    },
    refetchQueries: ["getAssignmentConfiguration"]
  })
};

export default loadData({
  queries,
  mutations
})(AdminAssignmentControl);
