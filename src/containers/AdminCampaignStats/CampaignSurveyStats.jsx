import PropTypes from "prop-types";
import React from "react";
import gql from "graphql-tag";
import { StyleSheet, css } from "aphrodite";

import loadData from "../hoc/load-data";
import Chart from "../../components/Chart";
import CampaignStat from "./CampaignStat";
import theme from "../../styles/theme";

const styles = StyleSheet.create({
  container: {
    ...theme.layouts.multiColumn.container,
    marginBottom: 40,
    justifyContent: "space-around",
    flexWrap: "wrap"
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
  secondaryHeader: {
    ...theme.text.secondaryHeader
  }
});

const CampaignSurveyStats = props => {
  const { interactionSteps } = props.data.campaign;

  return (
    <div>
      {interactionSteps.filter(iStep => iStep.question !== "").map(step => {
        const { answerOptions } = step.question;
        const countReducer = (acc, answer) => acc + answer.responderCount;
        const responseCount = answerOptions.reduce(countReducer, 0);

        return (
          <div key={step.id}>
            <div className={css(styles.secondaryHeader)}>
              {step.question.text}
            </div>
            {responseCount > 0 ? (
              <div className={css(styles.container)}>
                <div className={css(styles.flexColumn)}>
                  <CampaignStat title="responses" count={responseCount} />
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
      })}
    </div>
  );
};

CampaignSurveyStats.propTypes = {
  campaignId: PropTypes.string.isRequired
};

const mapQueriesToProps = ({ ownProps }) => ({
  data: {
    query: gql`
      query getCampaign($campaignId: String!) {
        campaign(id: $campaignId) {
          id
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
        }
      }
    `,
    variables: {
      campaignId: ownProps.campaignId
    }
    // pollInterval: 5000
  }
});

export default loadData(CampaignSurveyStats, { mapQueriesToProps });
