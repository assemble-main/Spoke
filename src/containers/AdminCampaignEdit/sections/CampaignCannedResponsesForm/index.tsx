import type { ApolloQueryResult } from "@apollo/client";
import { gql } from "@apollo/client";
import Button from "@material-ui/core/Button";
import CreateIcon from "@material-ui/icons/Create";
import type {
  CampaignVariablePage,
  CannedResponse
} from "@spoke/spoke-codegen";
import isEqual from "lodash/isEqual";
import unionBy from "lodash/unionBy";
import uniqBy from "lodash/uniqBy";
import React from "react";
import type { DropResult } from "react-beautiful-dnd";
import { DragDropContext, Draggable, Droppable } from "react-beautiful-dnd";
import { compose } from "recompose";

import { LargeList } from "../../../../components/LargeList";
import { dataTest } from "../../../../lib/attributes";
import type { MutationMap, QueryMap } from "../../../../network/types";
import { loadData } from "../../../hoc/with-operations";
import CampaignFormSectionHeading from "../../components/CampaignFormSectionHeading";
import type {
  FullComponentProps,
  RequiredComponentProps
} from "../../components/SectionWrapper";
import { asSection } from "../../components/SectionWrapper";
import CannedResponseDialog from "./components/CannedResponseDialog";
import CannedResponseRow from "./components/CannedResponseRow";
import { ResponseEditorContext } from "./interfaces";

interface Values {
  cannedResponses: CannedResponse[];
}

interface HocProps {
  mutations: {
    editCampaign(payload: Values): ApolloQueryResult<any>;
  };
  data: {
    campaign: {
      id: string;
      cannedResponses: CannedResponse[];
      campaignVariables: CampaignVariablePage;
      isStarted: boolean;
      customFields: string[];
      externalSystem: { id: string } | null;
    };
  };
}

interface InnerProps extends FullComponentProps, HocProps {}

interface State {
  cannedResponsesToAdd: CannedResponse[];
  cannedResponseIdsToDelete: string[];
  editedCannedResponses: CannedResponse[];
  editingResponse?: CannedResponse;
  isWorking: boolean;
  shouldShowEditor: boolean;
}

class CampaignCannedResponsesForm extends React.Component<InnerProps, State> {
  state: State = {
    cannedResponsesToAdd: [],
    cannedResponseIdsToDelete: [],
    editedCannedResponses: [],
    isWorking: false,
    shouldShowEditor: false
  };

  pendingCannedResponses = () => {
    const {
      cannedResponsesToAdd,
      cannedResponseIdsToDelete,
      editedCannedResponses
    } = this.state;
    const { cannedResponses } = this.props.data.campaign;
    const newCannedResponses = cannedResponses
      .filter((response) => !cannedResponseIdsToDelete.includes(response.id))
      .concat(cannedResponsesToAdd)
      .map((response) => {
        const editedResponse = editedCannedResponses.find(
          ({ id }) => id === response.id
        );
        return editedResponse || response;
      })
      .sort(
        (
          { displayOrder: displayOrderFirst },
          { displayOrder: displayOrderSecond }
        ) => {
          if (displayOrderFirst > displayOrderSecond) {
            return 1;
          }
          if (displayOrderFirst < displayOrderSecond) {
            return -1;
          }
          return 0;
        }
      );

    const didChange = !isEqual(cannedResponses, newCannedResponses);
    return { cannedResponses: newCannedResponses, didChange };
  };

  handleSubmit = async () => {
    const { editCampaign } = this.props.mutations;
    const { cannedResponses, didChange } = this.pendingCannedResponses();

    if (!didChange) return;

    this.setState({ isWorking: true });
    try {
      const response = await editCampaign({ cannedResponses });
      if (response.errors) throw response.errors;
      this.setState({
        cannedResponsesToAdd: [],
        cannedResponseIdsToDelete: []
      });
    } catch (err: any) {
      this.props.onError(err.message);
    } finally {
      this.setState({ isWorking: false });
    }
  };

  cannedResponseTitleSort = (
    { title: titleFirst }: CannedResponse,
    { title: titleSecond }: CannedResponse
  ) => {
    if (titleFirst > titleSecond) {
      return 1;
    }
    if (titleFirst < titleSecond) {
      return -1;
    }
    return 0;
  };

  cannedResponseArraysEqual = (
    cannedResponses1: CannedResponse[],
    cannedResponses2: CannedResponse[]
  ) =>
    cannedResponses1.length === cannedResponses2.length &&
    cannedResponses1.every(
      (cr, idx) => cr.title === cannedResponses2[idx].title
    );

  mapToTitleDisplayOrder = (cannedResponses: CannedResponse[]) => {
    return cannedResponses.map((cannedResponse, idx) => {
      return { ...cannedResponse, displayOrder: idx };
    });
  };

  handleOnSaveResponse = (response: CannedResponse) => {
    const newId = Math.random()
      .toString(36)
      .replace(/[^a-zA-Z1-9]+/g, "");

    const { cannedResponses } = this.pendingCannedResponses();
    const cannedResponsesAlphabetical = cannedResponses.sort(
      this.cannedResponseTitleSort
    );

    let newCannedResponse = {
      ...response,
      id: newId,
      displayOrder: cannedResponses.length
    };

    if (
      this.cannedResponseArraysEqual(
        cannedResponses,
        cannedResponsesAlphabetical
      )
    ) {
      const newCannedResponses = cannedResponses.concat({
        ...newCannedResponse
      });
      newCannedResponses.sort(this.cannedResponseTitleSort);
      const newCannedResponsesWithOrder = this.mapToTitleDisplayOrder(
        newCannedResponses
      );

      const newCannedResponseWithOrder = newCannedResponsesWithOrder.find(
        ({ id }) => id === newId
      );
      if (newCannedResponseWithOrder)
        newCannedResponse = newCannedResponseWithOrder;

      const updatedCannedResponses = newCannedResponsesWithOrder.filter(
        ({ id }) => id !== newId
      );

      this.setState({
        editedCannedResponses: unionBy(
          updatedCannedResponses,
          this.state.editedCannedResponses,
          "id"
        ) as CannedResponse[]
      });
    }

    const cannedResponsesToAdd = this.state.cannedResponsesToAdd.concat(
      newCannedResponse
    );

    this.setState({ cannedResponsesToAdd, shouldShowEditor: false });
  };

  createHandleOnDelete = (responseId: string) => () => {
    const cannedResponsesToAdd = this.state.cannedResponsesToAdd.filter(
      (response) => response.id !== responseId
    );
    const cannedResponseIdsToDelete = [
      ...new Set(this.state.cannedResponseIdsToDelete).add(responseId)
    ];

    // eslint-disable-next-line max-len
    const cannedResponseToDelete = this.pendingCannedResponses().cannedResponses.find(
      ({ id }) => id === responseId
    );

    const cannedResponsesToUpdate = this.pendingCannedResponses()
      .cannedResponses.filter(
        ({ displayOrder }) =>
          displayOrder > (cannedResponseToDelete?.displayOrder ?? -1)
      )
      .map((cannedResponse) => {
        return {
          ...cannedResponse,
          displayOrder: cannedResponse.displayOrder - 1
        };
      });

    const { editedCannedResponses } = this.state;

    this.setState({
      cannedResponsesToAdd,
      cannedResponseIdsToDelete,
      editedCannedResponses: unionBy(
        cannedResponsesToUpdate,
        editedCannedResponses,
        "id"
      )
    });
  };

  makeHandleToggleResponseDialog = (responseId = "") => () => {
    const { cannedResponses } = this.pendingCannedResponses();
    const editingResponse = cannedResponses.find(
      (res) => res.id === responseId
    );
    this.setState({ shouldShowEditor: true, editingResponse });
  };

  // save edits to a canned response
  handleOnSaveResponseEdit = (formValues: any) => {
    const { editingResponse, editedCannedResponses } = this.state;
    if (editingResponse === undefined) return;

    const editedResponse = { ...editingResponse, ...formValues };
    const newResponses = uniqBy(
      [editedResponse, ...editedCannedResponses],
      (response) => response.id
    );

    this.setState({
      editedCannedResponses: newResponses,
      editingResponse: undefined,
      shouldShowEditor: false
    });
  };

  // cancel editing and creating canned responses
  handleOnCancelResponseEdit = () => {
    this.setState({ editingResponse: undefined, shouldShowEditor: false });
  };

  onDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const sourceDisplayOrder = result.source.index;
    const destinationDisplayOrder = result.destination.index;
    const cannedResponseId = result.draggableId;

    const { cannedResponses } = this.pendingCannedResponses();
    const { editedCannedResponses } = this.state;
    const allCannedResponses = unionBy(
      editedCannedResponses,
      cannedResponses,
      "id"
    );
    let updatedCannedResponses = [];

    const sourceItem = allCannedResponses.find(
      ({ id }) => id === cannedResponseId
    );

    // Get all items that were moved, except item that was moved
    const cannedResponsesToMoveDown = allCannedResponses.filter(
      ({ displayOrder }) =>
        displayOrder >= destinationDisplayOrder &&
        displayOrder < sourceDisplayOrder
    );
    const cannedResponsesToMoveUp = allCannedResponses.filter(
      ({ displayOrder }) =>
        displayOrder <= destinationDisplayOrder &&
        displayOrder > sourceDisplayOrder
    );

    updatedCannedResponses.push({
      ...sourceItem,
      displayOrder: destinationDisplayOrder
    });

    updatedCannedResponses = updatedCannedResponses
      .concat(
        cannedResponsesToMoveUp.map((cannedResponse) => {
          return {
            ...cannedResponse,
            displayOrder: cannedResponse.displayOrder - 1
          };
        })
      )
      .concat(
        cannedResponsesToMoveDown.map((cannedResponse) => {
          return {
            ...cannedResponse,
            displayOrder: cannedResponse.displayOrder + 1
          };
        })
      );

    this.setState({
      editedCannedResponses: unionBy(
        updatedCannedResponses,
        editedCannedResponses,
        "id"
      ) as CannedResponse[]
    });
  };

  scriptVariables = () => {
    const {
      data: {
        campaign: {
          customFields,
          campaignVariables: { edges: campaignVariableEdges }
        }
      }
    } = this.props;

    const campaignVariables = campaignVariableEdges.map(({ node }) => node);

    return { customFields, campaignVariables };
  };

  renderCannedResponseDialog() {
    const { shouldShowEditor, editingResponse } = this.state;
    const {
      data: {
        campaign: { externalSystem }
      }
    } = this.props;

    const { customFields, campaignVariables } = this.scriptVariables();

    const context = editingResponse
      ? ResponseEditorContext.EditingResponse
      : ResponseEditorContext.CreatingResponse;
    const onSave = editingResponse
      ? this.handleOnSaveResponseEdit
      : this.handleOnSaveResponse;

    return (
      <CannedResponseDialog
        open={shouldShowEditor}
        context={context}
        customFields={customFields}
        campaignVariables={campaignVariables}
        integrationSourced={externalSystem !== null}
        editingResponse={editingResponse!}
        onCancel={this.handleOnCancelResponseEdit}
        onSave={onSave}
      />
    );
  }

  render() {
    const { isWorking, shouldShowEditor } = this.state;
    const { isNew, saveLabel } = this.props;

    const {
      cannedResponses,
      didChange: hasPendingChanges
    } = this.pendingCannedResponses();
    const isSaveDisabled = isWorking || (!isNew && !hasPendingChanges);
    const finalSaveLabel = isWorking ? "Working..." : saveLabel;

    const { customFields, campaignVariables } = this.scriptVariables();

    return (
      <div>
        <CampaignFormSectionHeading
          title="Canned responses for texters"
          subtitle={
            <>
              Share additional FAQ responses with your texters that are NOT
              associated with logging data. Please note that canned responses
              are not tracked or stored when used. Responses associated with
              data collection should be included in your{" "}
              <a
                href="https://docs.spokerewired.com/article/43-create-interaction-script"
                target="_blank"
                rel="noreferrer"
              >
                interaction script
              </a>{" "}
              instead.
            </>
          }
        />
        {cannedResponses.length > 0 ? (
          <DragDropContext onDragEnd={this.onDragEnd}>
            <Droppable droppableId="droppable-canned-responses">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps}>
                  <LargeList>
                    {cannedResponses.map((cannedResponse, index) => (
                      <Draggable
                        key={cannedResponse.id}
                        draggableId={cannedResponse.id}
                        index={index}
                      >
                        {(providedDrag) => (
                          <div
                            ref={providedDrag.innerRef}
                            {...providedDrag.draggableProps}
                            {...providedDrag.dragHandleProps}
                            // The prop types for div and ref are fighting here
                            onDragStart={
                              providedDrag.dragHandleProps?.onDragStart as any
                            }
                          >
                            <CannedResponseRow
                              key={cannedResponse.id}
                              cannedResponse={cannedResponse}
                              customFields={customFields}
                              campaignVariables={campaignVariables}
                              onDelete={this.createHandleOnDelete(
                                cannedResponse.id
                              )}
                              // eslint-disable-next-line max-len
                              onToggleResponseEditor={this.makeHandleToggleResponseDialog(
                                cannedResponse.id
                              )}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                  </LargeList>
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        ) : (
          <p>No canned responses</p>
        )}
        <hr />
        {this.renderCannedResponseDialog()}
        {!shouldShowEditor && (
          <Button
            {...dataTest("newCannedResponse", false)}
            color="secondary"
            endIcon={<CreateIcon />}
            onClick={this.makeHandleToggleResponseDialog()}
          >
            Add new canned response
          </Button>
        )}
        <br />
        <Button
          variant="contained"
          disabled={isSaveDisabled}
          onClick={this.handleSubmit}
        >
          {finalSaveLabel}
        </Button>
      </div>
    );
  }
}

const queries: QueryMap<InnerProps> = {
  data: {
    query: gql`
      query getCampaignBasics($campaignId: String!) {
        campaign(id: $campaignId) {
          id
          cannedResponses {
            id
            title
            text
            displayOrder
          }
          isStarted
          isApproved
          customFields
          campaignVariables {
            edges {
              node {
                id
                name
                value
              }
            }
          }
          externalSystem {
            id
          }
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

const mutations: MutationMap<InnerProps> = {
  editCampaign: (ownProps) => (payload: Values) => ({
    mutation: gql`
      mutation editCampaignCannedResponses(
        $campaignId: String!
        $payload: CampaignInput!
      ) {
        editCampaign(id: $campaignId, campaign: $payload) {
          id
          cannedResponses {
            id
            title
            text
          }
          isStarted
          isApproved
          customFields
          readiness {
            id
            basics
          }
        }
      }
    `,
    variables: {
      campaignId: ownProps.campaignId,
      payload
    }
  })
};

export default compose<InnerProps, RequiredComponentProps>(
  asSection({
    title: "Canned Responses",
    readinessName: "cannedResponses",
    jobQueueNames: [],
    expandAfterCampaignStarts: true,
    expandableBySuperVolunteers: true
  }),
  loadData({
    queries,
    mutations
  })
)(CampaignCannedResponsesForm);
