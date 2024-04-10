/* eslint-disable react/no-unused-state */
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import CircularProgress from "@material-ui/core/CircularProgress";
import { blueGrey, deepOrange, grey } from "@material-ui/core/colors";
import IconButton from "@material-ui/core/IconButton";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import Menu from "@material-ui/core/Menu";
import MenuItem from "@material-ui/core/MenuItem";
import Snackbar from "@material-ui/core/Snackbar";
import { withTheme } from "@material-ui/core/styles";
import Tooltip from "@material-ui/core/Tooltip";
import LocalOfferIcon from "@material-ui/icons/LocalOffer";
import MailIcon from "@material-ui/icons/Mail";
import MarkunreadIcon from "@material-ui/icons/Markunread";
import MoreVertIcon from "@material-ui/icons/MoreVert";
import NotInterestedIcon from "@material-ui/icons/NotInterested";
import ReplyIcon from "@material-ui/icons/Reply";
import { css, StyleSheet } from "aphrodite";
import sample from "lodash/sample";
import sortBy from "lodash/sortBy";
import { Toolbar, ToolbarGroup } from "material-ui/Toolbar";
import md5 from "md5";
import PropTypes from "prop-types";
import React from "react";
import { withRouter } from "react-router-dom";
import { compose } from "recompose";
import * as yup from "yup";

import CannedResponseMenu from "../../components/CannedResponseMenu";
import ColorButton from "../../components/ColorButton";
import Empty from "../../components/Empty";
import GSForm from "../../components/forms/GSForm";
import MessageLengthInfo from "../../components/MessageLengthInfo";
import SendButton from "../../components/SendButton";
import { dataTest } from "../../lib/attributes";
import {
  getChildren,
  getTopMostParent,
  interactionStepForId
} from "../../lib/interaction-step-helpers";
import { applyScript } from "../../lib/scripts";
import { isContactNowWithinCampaignHours } from "../../lib/timezones";
import ApplyTagDialog from "./components/ApplyTagDialog";
import AssignmentTexterSurveys from "./components/AssignmentTexterSurveys";
import BulkSendButton from "./components/BulkSendButton";
import ContactActionDialog from "./components/ContactActionDialog";
import MessageList from "./components/MessageList";
import MessageTextField from "./components/MessageTextField";
import NoMessagesIcon from "./components/NoMessagesIcon";
import SendButtonArrow from "./components/SendButtonArrow";
import TopFixedSection from "./components/TopFixedSection";

const TexterDialogType = Object.freeze({
  None: "None",
  OptOut: "OptOut"
});

const styles = StyleSheet.create({
  fullSize: {
    width: "100%",
    height: "100%"
  },
  flexContainer: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    margin: 0
  },
  overlay: {
    margin: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    color: "black",
    zIndex: 1000000
  },
  fixedFlexSection: {
    flex: "0 0 auto"
  },
  dynamicFlexSection: {
    flex: "1 1 auto",
    height: "0px",
    display: "flex"
  },
  verticalScrollingSection: {
    flex: "1 1 auto",
    overflowY: "scroll",
    overflow: "-moz-scrollbars-vertical"
  },
  messageComposition: {
    borderTop: `1px solid ${grey[100]}`,
    marginBottom: "none"
  },
  messageField: {
    margin: "0px 8px",
    "@media(maxWidth: 450px)": {
      marginBottom: "8%"
    },
    position: "relative"
  },
  messageLengthInfo: {
    display: "flex",
    justifyContent: "flex-end"
  }
});

const inlineStyles = {
  actionToolbarFirst: {
    backgroundColor: "white"
  },
  snackbar: {
    zIndex: 1000001
  }
};

export class AssignmentTexterContact extends React.Component {
  messageSchema = yup.object({
    messageText: yup
      .string()
      .trim()
      .required("Can't send empty message")
      .max(window.MAX_MESSAGE_LENGTH)
  });

  constructor(props) {
    super(props);

    const { assignment, campaign, contact } = this.props;
    const questionResponses = this.getInitialQuestionResponses(
      contact.questionResponseValues
    );
    const availableSteps = this.getAvailableInteractionSteps(questionResponses);

    let disabled = false;
    let disabledText = "Sending...";
    let snackbarOnTouchTap = null;
    let snackbarActionTitle = null;
    let snackbarError = null;

    if (assignment.id !== contact.assignmentId || campaign.isArchived) {
      disabledText = "";
      disabled = true;
      snackbarError = "Your assignment has changed";
      snackbarOnTouchTap = this.goBackToTodos;
      snackbarActionTitle = "Back to Todos";
    } else if (contact.optOut) {
      disabledText = "Skipping opt-out...";
      disabled = true;
    } else if (!isContactNowWithinCampaignHours(contact, campaign)) {
      disabledText = "Refreshing ...";
      disabled = true;
    }

    const [messageVersionHash, messageText] = this.getStartingMessageText();

    this.state = {
      disabled,
      disabledText,
      // this prevents jitter by not showing the optout/skip buttons right after sending
      justSentNew: false,
      questionResponses,
      snackbarError,
      snackbarActionTitle,
      snackbarOnTouchTap,
      optOutMessageText: campaign.organization.optOutMessage,
      tagMessageText: "",
      addedTags: [],
      removedTags: [],
      responsePopoverOpen: false,
      messageText,
      messageVersionHash,
      dialogType: TexterDialogType.None,
      currentInteractionStep:
        availableSteps.length > 0
          ? availableSteps[availableSteps.length - 1]
          : null,
      isTagEditorOpen: false,
      menuAnchor: null
    };
  }

  componentDidMount() {
    const { contact, campaign } = this.props;
    if (contact.optOut) {
      this.skipContact();
    } else if (!isContactNowWithinCampaignHours(contact, campaign)) {
      setTimeout(() => {
        this.props.refreshData();
        this.setState({ disabled: false });
      }, 1500);
    }

    const scroller = this.messageScrollContainerRef;
    if (scroller) {
      scroller.scrollTo(0, scroller.scrollHeight);
    }

    document.body.addEventListener("keyup", this.onEnterUp);
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (this.props.errors.length !== nextProps.length) {
      // eslint-disable-next-line react/no-direct-mutation-state
      this.state.disabled = false;
    }
  }

  componentWillUnmount() {
    document.body.removeEventListener("keyup", this.onEnterUp);
  }

  // Handle submission on <enter> *up* to prevent holding enter
  onEnterUp = (event) => {
    const keyCode = event.keyCode || event.which;
    if (keyCode === 13 && !event.shiftKey) {
      event.preventDefault();
      const { dialogType } = this.state;
      if (dialogType === TexterDialogType.OptOut) {
        this.handleOptOut();
      } else {
        this.handleClickSendMessageButton();
      }
    }
  };

  setDisabled = (disabled = true) => {
    this.setState({ disabled });
  };

  getAvailableInteractionSteps = (questionResponses) => {
    const allInteractionSteps = this.props.campaign.interactionSteps;
    const availableSteps = [];

    let step = getTopMostParent(allInteractionSteps);

    while (step) {
      availableSteps.push(step);
      const questionResponseValue = questionResponses[step.id];
      if (questionResponseValue) {
        const matchingAnswerOption = step.question.answerOptions.find(
          (answerOption) => answerOption.value === questionResponseValue
        );
        if (matchingAnswerOption && matchingAnswerOption.nextInteractionStep) {
          step = interactionStepForId(
            matchingAnswerOption.nextInteractionStep.id,
            allInteractionSteps
          );
        } else {
          step = null;
        }
      } else {
        step = null;
      }
    }

    return availableSteps;
  };

  getInitialQuestionResponses = (questionResponseValues) => {
    const questionResponses = {};
    questionResponseValues.forEach((questionResponse) => {
      questionResponses[questionResponse.interactionStepId] =
        questionResponse.value;
    });

    return questionResponses;
  };

  getMessageTextFromScript = (script) => {
    const { campaign, contact, texter } = this.props;

    const campaignVariables = campaign.campaignVariables.edges.map(
      ({ node }) => node
    );

    return script
      ? applyScript({
          contact,
          texter,
          script,
          customFields: campaign.customFields,
          campaignVariables
        })
      : "";
  };

  getStartingMessageText = () => {
    const { contact, campaign } = this.props;
    if (contact.messageStatus === "needsMessage") {
      const { scriptOptions } = getTopMostParent(
        campaign.interactionSteps,
        false
      );
      const randomScript = sample(scriptOptions);
      const scriptVersionHash = md5(randomScript);
      return [scriptVersionHash, this.getMessageTextFromScript(randomScript)];
    }
    return [null, ""];
  };

  handleOpenPopover = (event) => {
    event.preventDefault();
    const { assignment } = this.props;
    const { userCannedResponses, campaignCannedResponses } = assignment;
    const isCannedResponseEnabled =
      userCannedResponses.length + campaignCannedResponses.length > 0;
    if (isCannedResponseEnabled) {
      this.setState({
        responsePopoverAnchorEl: event.currentTarget,
        responsePopoverOpen: true
      });
    }
  };

  handleClosePopover = () => {
    this.setState({
      responsePopoverAnchorEl: undefined
    });
  };

  handleCannedResponseChange = (cannedResponseScript) => {
    this.handleChangeScript(cannedResponseScript);
    this.handleClosePopover();
  };

  createMessageToContact = (text) => {
    const { texter, campaign, assignment } = this.props;
    const { contact } = this.props;
    const campaignVariableIds = campaign.campaignVariables.edges.map(
      ({ node: { id } }) => id
    );

    return {
      contactNumber: contact.cell,
      userId: texter.id,
      text,
      assignmentId: assignment.id,
      versionHash: this.state.messageVersionHash,
      campaignVariableIds
    };
  };

  goBackToTodos = () => {
    const { campaign } = this.props;
    this.props.history.push(`/app/${campaign.organization.id}/todos`);
  };

  handleMessageFormSubmit = ({ messageText }) => {
    // Process the submit synchronously
    if (this.state.alreadySent || this.state.disabled) {
      return; // stops from multi-send
    }
    this.setState({ disabled: true, alreadySent: true }, () => {
      // Actually deliver the payload asyncronously
      this.submitAction(messageText);
    });
  };

  submitAction = async (messageText) => {
    const { contact } = this.props;
    const message = this.createMessageToContact(messageText);
    const changes = this.gatherSurveyChanges();
    const payload = { message, ...changes };
    this.props.sendMessage(contact.id, payload);
  };

  gatherSurveyChanges = () => {
    const { contact } = this.props;

    const changes = {};

    // Gather survey question changes
    const deletionIds = [];
    const questionResponseObjects = [];

    const interactionStepIds = Object.keys(this.state.questionResponses);

    const count = interactionStepIds.length;

    for (let i = 0; i < count; i += 1) {
      const interactionStepId = interactionStepIds[i];
      const value = this.state.questionResponses[interactionStepId];
      if (value) {
        questionResponseObjects.push({
          interactionStepId,
          campaignContactId: contact.id,
          value
        });
      } else {
        deletionIds.push(interactionStepId);
      }
    }

    if (questionResponseObjects.length)
      changes.questionResponseObjects = questionResponseObjects;
    if (deletionIds.length) changes.deletionIds = deletionIds;

    // Return aggregate changes
    return changes;
  };

  handleClickCloseContactButton = async () => {
    const { contact } = this.props;
    await this.handleEditMessageStatus("closed");
    const payload = this.gatherSurveyChanges();
    await this.props.sendMessage(contact.id, payload);
  };

  handleEditMessageStatus = async (messageStatus) => {
    const { contact } = this.props;
    await this.props.mutations.editCampaignContactMessageStatus(
      messageStatus,
      contact.id
    );
  };

  handleOptOut = () => {
    const { disabled, optOutMessageText } = this.state;
    const { assignment, contact } = this.props;
    if (disabled) {
      return; // stops from multi-send
    }
    this.setState({ disabled: true });

    const optOut = {
      cell: contact.cell,
      assignmentId: assignment.id
    };

    if (optOutMessageText.length) {
      const message = this.createMessageToContact(optOutMessageText);
      optOut.message = message;
    }

    const payload = { optOut, ...this.gatherSurveyChanges() };
    this.props.sendMessage(contact.id, payload);
  };

  handleOpenOptOutDialog = () => {
    this.setState({ dialogType: TexterDialogType.OptOut });
  };

  handleApplyTags = (addedContactTags, removedContactTags, callback) => {
    this.tagContact(addedContactTags, removedContactTags);

    if (callback) {
      this.setState(
        {
          addedTags: addedContactTags,
          removedTags: removedContactTags,
          isTagEditorOpen: false
        },
        callback
      );
    } else {
      this.setState({
        addedTags: addedContactTags,
        removedTags: removedContactTags,
        isTagEditorOpen: false
      });
    }

    if (!callback && addedContactTags.length > 0) {
      const mostImportantTag = sortBy(addedContactTags, "id")[0];
      const tagMessageText = mostImportantTag.tag.onApplyScript;
      if (tagMessageText !== "") this.handleChangeScript(tagMessageText);
    }
  };

  handleApplyTagsAndMoveOn = (addedContactTags, removedContactTags) => {
    this.handleApplyTags(addedContactTags, removedContactTags, async () => {
      const { contact } = this.props;
      const payload = this.gatherSurveyChanges();
      await this.props.sendMessage(contact.id, payload);
    });
  };

  // run mutation with added and removed tags
  tagContact = (addedContactTags, removedContactTags) => {
    const { contact } = this.props;
    const tag = {
      addedTagIds: addedContactTags.map((t) => t.tag.id),
      removedTagIds: removedContactTags.map((t) => t.tag.id)
    };

    this.props.addTagToContact(contact.id, tag);
  };

  handleCloseDialog = () => {
    this.setState({ dialogType: TexterDialogType.None });
  };

  handleChangeScript = (newScript) => {
    const safeScript = newScript || "";
    const messageVersionHash = md5(safeScript);
    const messageText = this.getMessageTextFromScript(safeScript);
    this.setState({ messageText, messageVersionHash });
  };

  handleQuestionResponseChange = ({
    interactionStep,
    questionResponseValue,
    nextScript
  }) => {
    const { questionResponses } = this.state;
    const { interactionSteps } = this.props.campaign;
    questionResponses[interactionStep.id] = questionResponseValue;

    const children = getChildren(interactionStep, interactionSteps);
    for (const childStep of children) {
      if (childStep.id in questionResponses) {
        questionResponses[childStep.id] = null;
      }
    }

    this.setState(
      {
        questionResponses
      },
      () => {
        this.handleChangeScript(nextScript);
      }
    );
  };

  handleClickSendMessageButton = () => {
    this.formRef.submit();
    if (this.props.contact.messageStatus === "needsMessage") {
      this.setState({ justSentNew: true });
    }
  };

  handleClickMenu = (event) =>
    this.setState({ menuAnchor: event.currentTarget });

  handleCloseMenu = () => this.setState({ menuAnchor: null });

  skipContact = () => {
    this.props.onFinishContact();
  };

  bulkSendMessages = async (assignmentId) => {
    await this.props.mutations.bulkSendMessages(assignmentId);
    this.props.refreshData();
  };

  handleMessageFormChange = ({ messageText }) => {
    const { messageStatus } = this.props.contact;
    // Do not allow deviating from the script for the first message of a campaign
    if (messageStatus !== "needsMessage") {
      this.setState({ messageText });
    }
  };

  renderSurveySection() {
    const { contact } = this.props;
    const { questionResponses } = this.state;

    const availableInteractionSteps = this.getAvailableInteractionSteps(
      questionResponses
    );

    return (
      <AssignmentTexterSurveys
        contact={contact}
        interactionSteps={availableInteractionSteps}
        onQuestionResponseChange={this.handleQuestionResponseChange}
        currentInteractionStep={this.state.currentInteractionStep}
        questionResponses={questionResponses}
      />
    );
  }

  renderNeedsResponseToggleButton(contact) {
    const { messageStatus } = contact;
    let button = null;
    if (messageStatus === "closed") {
      button = (
        <Box m={2}>
          <Button
            variant="contained"
            onClick={() => this.handleEditMessageStatus("needsResponse")}
          >
            Reopen
          </Button>
        </Box>
      );
    } else if (messageStatus === "needsResponse") {
      button = (
        <Box m={2}>
          <Button
            variant="contained"
            onClick={this.handleClickCloseContactButton}
          >
            Close
          </Button>
        </Box>
      );
    }

    return button;
  }

  renderNeedsResponseToggleMenuItem(contact) {
    const { messageStatus } = contact;
    if (messageStatus === "closed") {
      return (
        <MenuItem onClick={() => this.handleEditMessageStatus("needsResponse")}>
          <ListItemIcon>
            <MarkunreadIcon />
          </ListItemIcon>
          Reopen
        </MenuItem>
      );
    }
    if (messageStatus === "needsResponse") {
      return (
        <MenuItem onClick={this.handleClickCloseContactButton}>
          <ListItemIcon>
            <MailIcon />
          </ListItemIcon>
          Close
        </MenuItem>
      );
    }
  }

  renderIconMenu(menuItems) {
    const { menuAnchor } = this.state;
    return (
      <div>
        <IconButton aria-label="people-row-menu" onClick={this.handleClickMenu}>
          <MoreVertIcon />
        </IconButton>
        <Menu
          anchorEl={menuAnchor}
          onClose={this.handleCloseMenu}
          open={menuAnchor !== null}
        >
          {menuItems}
        </Menu>
      </div>
    );
  }

  renderActionToolbar() {
    const {
      contact,
      campaign,
      tags,
      assignment,
      navigationToolbarChildren,
      onFinishContact,
      theme
    } = this.props;
    const { userCannedResponses, campaignCannedResponses } = assignment;
    const isCannedResponseEnabled =
      userCannedResponses.length + campaignCannedResponses.length > 0;
    const { justSentNew, alreadySent } = this.state;
    const { messageStatus } = contact;
    const size = document.documentElement.clientWidth;

    const menuItems = [];

    if (messageStatus === "needsMessage" || justSentNew) {
      return (
        <div>
          <Toolbar style={inlineStyles.actionToolbarFirst}>
            <ToolbarGroup>
              <SendButton
                threeClickEnabled={campaign.organization.threeClickEnabled}
                onFinalTouchTap={
                  alreadySent ? undefined : this.handleClickSendMessageButton
                }
                disabled={this.state.disabled}
              />
              {window.NOT_IN_USA &&
              window.ALLOW_SEND_ALL &&
              window.BULK_SEND_CHUNK_SIZE ? (
                <BulkSendButton
                  assignment={assignment}
                  onFinishContact={onFinishContact}
                  bulkSendMessages={this.bulkSendMessages}
                  setDisabled={this.setDisabled}
                />
              ) : (
                ""
              )}
              <div style={{ float: "right", marginLeft: 20 }}>
                {navigationToolbarChildren}
              </div>
            </ToolbarGroup>
          </Toolbar>
        </div>
      );
    }
    if (size < 768) {
      // for needsResponse or messaged or convo
      menuItems.push(
        <MenuItem
          disabled={tags.length === 0}
          onClick={() => this.setState({ isTagEditorOpen: true })}
        >
          <ListItemIcon>
            <LocalOfferIcon />
          </ListItemIcon>
          Manage Tags
        </MenuItem>
      );

      if (size <= 400) {
        menuItems.push(this.renderNeedsResponseToggleMenuItem(contact));
        menuItems.push(
          <MenuItem onClick={this.handleOpenOptOutDialog}>
            <ListItemIcon>
              <NotInterestedIcon />
            </ListItemIcon>
            Opt Out
          </MenuItem>
        );
      }

      if (size <= 500) {
        menuItems.push(
          <MenuItem
            disabled={!isCannedResponseEnabled}
            onClick={this.handleOpenPopover}
          >
            <ListItemIcon>
              <ReplyIcon />
            </ListItemIcon>
            Canned Responses
          </MenuItem>
        );
      }

      return (
        <div
          style={{
            padding: "5px 5px 0 5px",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "white",
            fontSize: size < 500 ? "0.9em" : "1em"
          }}
        >
          {size > 400 && (
            <Tooltip title="Opt out this contact">
              <Box m={2}>
                <ColorButton
                  {...dataTest("optOut")}
                  variant="contained"
                  backgroundColor={deepOrange[500]}
                  onClick={this.handleOpenOptOutDialog}
                >
                  Opt out
                </ColorButton>
              </Box>
            </Tooltip>
          )}
          {size > 500 && (
            <Box m={2}>
              <Button
                variant="contained"
                onClick={this.handleOpenPopover}
                style={{ backgroundColor: theme.palette.info.light }}
                disabled={!isCannedResponseEnabled}
              >
                Canned Responses
              </Button>
            </Box>
          )}
          {size > 400 && this.renderNeedsResponseToggleButton(contact)}
          <div style={{ flexGrow: 1, textAlign: "center" }}>
            {navigationToolbarChildren}
          </div>
          {this.renderIconMenu(menuItems)}
        </div>
      );
    }
    if (size < 1080) {
      // for needsResponse or messaged
      // size < 1080, and > 768

      menuItems.push(
        <MenuItem
          disabled={tags.length === 0}
          onClick={() => this.setState({ isTagEditorOpen: true })}
        >
          <ListItemIcon>
            <LocalOfferIcon />
          </ListItemIcon>
          Manage Tags
        </MenuItem>
      );

      if (size <= 840) {
        menuItems.push(
          <MenuItem
            disabled={!isCannedResponseEnabled}
            onClick={this.handleOpenPopover}
          >
            <ListItemIcon>
              <ReplyIcon />
            </ListItemIcon>
            Canned Responses
          </MenuItem>
        );
      }

      return (
        <div
          style={{
            padding: "5px 5px 0 5px",
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "white"
          }}
        >
          <Box m={2}>
            <SendButton
              threeClickEnabled={campaign.organization.threeClickEnabled}
              onFinalTouchTap={this.handleClickSendMessageButton}
              disabled={this.state.disabled}
            />
          </Box>
          <Tooltip title="Opt out this contact">
            <Box m={2}>
              <ColorButton
                {...dataTest("optOut")}
                variant="contained"
                backgroundColor={deepOrange[500]}
                onClick={this.handleOpenOptOutDialog}
              >
                Opt out
              </ColorButton>
            </Box>
          </Tooltip>
          {size > 840 && (
            <Box m={2}>
              <Button
                variant="contained"
                onClick={this.handleOpenPopover}
                style={{ backgroundColor: theme.palette.info.light }}
                disabled={!isCannedResponseEnabled}
              >
                Canned Responses
              </Button>
            </Box>
          )}
          {this.renderNeedsResponseToggleButton(contact)}
          <div style={{ flexGrow: 1, textAlign: "center" }}>
            {navigationToolbarChildren}
          </div>
          {this.renderIconMenu(menuItems)}
        </div>
      );
    }
    // for needsResponse or messaged
    // size > 1080 px, optimal size with new button changes
    return (
      <div>
        <Toolbar style={inlineStyles.actionToolbarFirst}>
          <ToolbarGroup>
            <Box m={2}>
              <SendButton
                threeClickEnabled={campaign.organization.threeClickEnabled}
                onFinalTouchTap={this.handleClickSendMessageButton}
                disabled={this.state.disabled}
              />
            </Box>
            <Box m={2}>
              <Button
                variant="contained"
                onClick={this.handleOpenPopover}
                style={{ backgroundColor: theme.palette.info.light }}
                disabled={!isCannedResponseEnabled}
              >
                Canned responses
              </Button>
            </Box>
            <Box m={2}>
              <ColorButton
                {...dataTest("optOut")}
                variant="contained"
                backgroundColor={deepOrange[500]}
                onClick={this.handleOpenOptOutDialog}
              >
                Opt out
              </ColorButton>
            </Box>
            <Box m={2}>
              <Button
                variant="contained"
                style={{ backgroundColor: blueGrey[100] }}
                endIcon={<LocalOfferIcon />}
                disabled={tags.length === 0}
                onClick={() => this.setState({ isTagEditorOpen: true })}
              >
                Manage Tags
              </Button>
            </Box>
            {this.renderNeedsResponseToggleButton(contact)}
            <div style={{ float: "right", marginLeft: 20 }}>
              {navigationToolbarChildren}
            </div>
          </ToolbarGroup>
        </Toolbar>
      </div>
    );
  }

  renderCannedResponsePopover() {
    const { assignment } = this.props;

    return (
      <CannedResponseMenu
        assignmentId={assignment.id}
        anchorEl={this.state.responsePopoverAnchorEl}
        onSelectCannedResponse={this.handleCannedResponseChange}
        onRequestClose={this.handleClosePopover}
      />
    );
  }

  renderCorrectSendButton() {
    const { messageStatus } = this.props.contact;
    const validStates = ["messaged", "convo", "needsResponse"];
    if (validStates.indexOf(messageStatus) > -1) {
      return (
        <SendButtonArrow
          onClick={this.handleClickSendMessageButton}
          onFinalTouchTap={this.handleClickSendMessageButton}
          disabled={this.state.disabled}
        />
      );
    }
    return null;
  }

  renderMessageLengthInfo() {
    return (
      <div className={css(styles.messageLengthInfo)}>
        <MessageLengthInfo messageText={this.state.messageText} />
      </div>
    );
  }

  renderBottomFixedSection() {
    const { contact, tags } = this.props;
    const {
      dialogType,
      messageText,
      alreadySent,
      isTagEditorOpen
    } = this.state;

    return (
      <div>
        {contact.messages.length > 0 && this.renderSurveySection()}
        {dialogType === TexterDialogType.None && (
          <div>
            <div className={css(styles.messageField)}>
              <GSForm
                ref={(el) => {
                  this.formRef = el;
                }}
                schema={this.messageSchema}
                value={{ messageText }}
                onSubmit={
                  alreadySent ? undefined : this.handleMessageFormSubmit
                }
                onChange={this.handleMessageFormChange}
              >
                <MessageTextField />
                {this.renderMessageLengthInfo()}
                {this.renderCorrectSendButton()}
              </GSForm>
            </div>
            {this.renderActionToolbar()}
            <ApplyTagDialog
              open={isTagEditorOpen}
              allTags={tags}
              onRequestClose={() => this.setState({ isTagEditorOpen: false })}
              onApplyTag={this.handleApplyTags}
              onApplyTagsAndMoveOn={this.handleApplyTagsAndMoveOn}
              texter={this.props.texter}
              contact={contact}
            />
          </div>
        )}
        {dialogType === TexterDialogType.OptOut && (
          <ContactActionDialog
            title="Opt out user"
            messageText={this.state.optOutMessageText}
            submitTitle={
              this.state.optOutMessageText ? "Send" : "Opt Out without Text"
            }
            onChange={({ messageText: optOutMessageText }) =>
              this.setState({ optOutMessageText })
            }
            onSubmit={this.handleOptOut}
            handleCloseDialog={this.handleCloseDialog}
          />
        )}
        {this.renderCannedResponsePopover()}
      </div>
    );
  }

  render() {
    const { disabled } = this.state;
    const { campaign, contact, contactSettings, onExitTexter } = this.props;

    return (
      <div className={css(styles.fullSize)}>
        {disabled && (
          <div className={css(styles.overlay)}>
            <CircularProgress size={24} style={{ marginRight: "10px" }} />
            {this.state.disabledText}
          </div>
        )}
        <div className={css(styles.flexContainer)}>
          <div className={css(styles.fixedFlexSection)}>
            <TopFixedSection
              contactSettings={contactSettings}
              campaign={campaign}
              contact={contact}
              onExitTexter={onExitTexter}
            />
          </div>
          <div className={css(styles.dynamicFlexSection)}>
            {contact.messages.length > 0 ? (
              <div
                ref={(el) => {
                  this.messageScrollContainerRef = el;
                }}
                className={css(styles.verticalScrollingSection)}
                {...dataTest("messageList")}
              >
                <MessageList contact={contact} messages={contact.messages} />
              </div>
            ) : (
              <Empty
                title={`This is your first message to ${contact.firstName}`}
                icon={<NoMessagesIcon />}
                style={{ flex: "1 1 auto" }}
              />
            )}
          </div>
          <div className={css(styles.fixedFlexSection, css.messageComposition)}>
            {this.renderBottomFixedSection()}
          </div>
        </div>
        <Snackbar
          style={inlineStyles.snackbar}
          open={!!this.state.snackbarError}
          message={this.state.snackbarError || ""}
          action={this.state.snackbarActionTitle}
          onActionClick={this.state.snackbarOnTouchTap}
        />
        {this.props.errors.map((err, idx) => (
          <Snackbar
            key={err.id}
            style={{ ...inlineStyles.snackbar, bottom: idx * 50, width: 700 }}
            open
            message={err.snackbarError || ""}
            action={err.snackbarActionTitle}
            onActionClick={err.snackbarOnTouchTap}
            transitionDuration={0}
          />
        ))}
      </div>
    );
  }
}

AssignmentTexterContact.propTypes = {
  errors: PropTypes.array,
  contact: PropTypes.object,
  contactSettings: PropTypes.object,
  tags: PropTypes.arrayOf(PropTypes.object).isRequired,
  campaign: PropTypes.object,
  assignment: PropTypes.object,
  texter: PropTypes.object,
  navigationToolbarChildren: PropTypes.array,
  onFinishContact: PropTypes.func,
  history: PropTypes.object.isRequired,
  mutations: PropTypes.object,
  refreshData: PropTypes.func,
  onExitTexter: PropTypes.func,
  onRefreshAssignmentContacts: PropTypes.func
};

export default compose(withTheme, withRouter)(AssignmentTexterContact);
