import type { ApolloQueryResult } from "@apollo/client";
import { gql } from "@apollo/client";
import Button from "@material-ui/core/Button";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import ErrorIcon from "@material-ui/icons/Error";
import WarningIcon from "@material-ui/icons/Warning";
import React from "react";
import { compose } from "recompose";

import { loadData } from "../../hoc/with-operations";
import CampaignFormSectionHeading from "../components/CampaignFormSectionHeading";
import type {
  FullComponentProps,
  PendingJobType,
  RequiredComponentProps
} from "../components/SectionWrapper";
import { asSection } from "../components/SectionWrapper";

const parseJobResultMessage = (
  job?: PendingJobType
): { message?: string; error?: string; unknown?: string } => {
  if (job === undefined) return { unknown: "No job!" };

  if (job.jobType === "filter_landlines") {
    return { unknown: job.resultMessage };
  }

  const { message, error } = JSON.parse(job.resultMessage);

  return { message, error };
};

interface FilterLandlinesValues {
  campaignId: string;
}

interface FilterLandlinesData {
  id: string;
  landlinesFiltered: boolean;
}

interface FilterLandlinesInnerProps {
  mutations: {
    filterLandlines(
      payload: FilterLandlinesValues
    ): Promise<ApolloQueryResult<any>>;
  };
  campaignData: {
    campaign: FilterLandlinesData;
  };
}

interface Props extends FullComponentProps, FilterLandlinesInnerProps {}

interface State {
  // UI
  isWorking: boolean;
}

class FilterLandlinesForm extends React.Component<Props, State> {
  state: State = {
    // UI
    isWorking: false
  };

  filterLandlines = async () => {
    this.setState({ isWorking: true });

    try {
      const response = await this.props.mutations.filterLandlines({
        campaignId: this.props.campaignId
      });

      if (response.errors) throw response.errors;
    } catch (ex) {
      this.props.onError(ex.message);
    } finally {
      this.setState({ isWorking: false });
    }
  };

  render() {
    const { isWorking } = this.state;
    const { landlinesFiltered } = this.props.campaignData.campaign;
    const filterJob = this.props.pendingJob;
    const { message, error, unknown } = parseJobResultMessage(filterJob);

    return (
      <div>
        <CampaignFormSectionHeading
          title="Filtering Landlines"
          subtitle={
            !landlinesFiltered && (
              <span>
                <p>
                  Filtering landlines or otherwise un-textable numbers takes a
                  few minutes to run, but is a free service that can help you
                  avoid paying for messages to numbers that won't receive them!
                </p>
                <p>
                  If you're pretty sure your phone numbers are valid, skip this
                  section!
                </p>
              </span>
            )
          }
        />
        {!landlinesFiltered && (
          <Button
            variant="contained"
            disabled={isWorking}
            onClick={this.filterLandlines}
          >
            Filter Landlines
          </Button>
        )}
        {landlinesFiltered && message && (
          <div style={{ display: "flex", alignItems: "center" }}>
            <CheckCircleIcon style={{ marginRight: 10 }} />
            <span>{message}</span>
          </div>
        )}
        {landlinesFiltered && error && (
          <div style={{ display: "flex", alignItems: "center" }}>
            <ErrorIcon style={{ marginRight: 10 }} />
            <span>{error}</span>
          </div>
        )}
        {landlinesFiltered && unknown && (
          <div style={{ display: "flex", alignItems: "center" }}>
            <WarningIcon style={{ marginRight: 10 }} />
            <span>{unknown}</span>
          </div>
        )}
      </div>
    );
  }
}

const queries = {
  campaignData: {
    query: gql`
      query getCampaignContacts($campaignId: String!) {
        campaign(id: $campaignId) {
          id
          landlinesFiltered
        }
      }
    `,
    options: (ownProps: Props) => ({
      variables: {
        campaignId: ownProps.campaignId
      }
    })
  },
  organizationData: {
    query: gql`
      query getOrganizationDataForEditContacts($organizationId: String!) {
        organization(id: $organizationId) {
          id
          numbersApiKey
        }
      }
    `,
    options: (ownProps: Props) => ({
      variables: {
        organizationId: ownProps.organizationId
      }
    })
  }
};

const mutations = {
  filterLandlines: (ownProps: Props) => () => ({
    mutation: gql`
      mutation filterLandlines($campaignId: String!) {
        filterLandlines(id: $campaignId) {
          id
          landlinesFiltered
        }
      }
    `,
    variables: {
      campaignId: ownProps.campaignData.campaign.id
    }
  })
};

export default compose<Props, RequiredComponentProps>(
  asSection({
    title: "Filter Landlines",
    readinessName: "contacts",
    jobQueueNames: ["filter-landlines", "filter_landlines"],
    expandAfterCampaignStarts: false,
    expandableBySuperVolunteers: false
  }),
  loadData({
    queries,
    mutations
  })
)(FilterLandlinesForm);
