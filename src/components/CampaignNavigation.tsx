import { gql } from "@apollo/client";
import Button from "@material-ui/core/Button";
import ButtonGroup from "@material-ui/core/ButtonGroup";
import { css, StyleSheet } from "aphrodite";
import React from "react";

import { loadData } from "../containers/hoc/with-operations";
import { QueryMap } from "../network/types";

interface Props {
  prevCampaignClicked(campaignId: string | null): void;
  nextCampaignClicked(campaignId: string | null): void;
  campaignId: string;
  campaignNavigation: {
    campaignNavigation: {
      prevCampaignId: string | null;
      nextCampaignId: string | null;
    };
  };
}

const styles = StyleSheet.create({
  buttonContainer: {
    display: "flex",
    justifyContent: "flex-end",
    paddingTop: 20,
    paddingBottom: 20,
    flexWrap: "wrap"
  }
});

const CampaignNavigation: React.FC<Props> = (props) => {
  const { campaignNavigation } = props.campaignNavigation;

  return (
    <div className={css(styles.buttonContainer)}>
      <ButtonGroup disableElevation variant="contained" color="primary">
        <Button
          disabled={!campaignNavigation.prevCampaignId}
          onClick={() => {
            props.prevCampaignClicked(campaignNavigation.prevCampaignId);
          }}
        >
          Previous
        </Button>
        <Button
          disabled={!campaignNavigation.nextCampaignId}
          onClick={() => {
            props.nextCampaignClicked(campaignNavigation.nextCampaignId);
          }}
        >
          Next
        </Button>
      </ButtonGroup>
    </div>
  );
};

const queries: QueryMap<Props> = {
  campaignNavigation: {
    query: gql`
      query getCampaignNavigation($campaignId: String!) {
        campaignNavigation(campaignId: $campaignId) {
          nextCampaignId
          prevCampaignId
        }
      }
    `,
    options: (ownProps) => ({
      variables: {
        campaignId: ownProps.campaignId
      }
    })
  }
};

export default loadData({ queries })(CampaignNavigation);