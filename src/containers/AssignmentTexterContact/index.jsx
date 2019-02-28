import PropTypes from 'prop-types'
import React from 'react'
import { StyleSheet, css } from 'aphrodite'
import MessageList from '../../components/MessageList'
import CannedResponseMenu from '../../components/CannedResponseMenu'
import AssignmentTexterSurveys from '../../components/AssignmentTexterSurveys'
import RaisedButton from 'material-ui/RaisedButton'
import FlatButton from 'material-ui/FlatButton'
import { grey100 } from 'material-ui/styles/colors'
import { Toolbar, ToolbarGroup } from 'material-ui/Toolbar'
import { Card, CardActions, CardTitle } from 'material-ui/Card'
import Divider from 'material-ui/Divider'
import { applyScript } from '../../lib/scripts'
import yup from 'yup'
import GSForm from '../../components/forms/GSForm'
import Form from 'react-formal'
import GSSubmitButton from '../../components/forms/GSSubmitButton'
import SendButton from '../../components/SendButton'
import BulkSendButton from '../../components/BulkSendButton'
import SendButtonArrow from '../../components/SendButtonArrow'
import CircularProgress from 'material-ui/CircularProgress'
import Snackbar from 'material-ui/Snackbar'
import { getChildren, getTopMostParent, interactionStepForId, log } from '../../lib'
import { withRouter } from 'react-router'
import Empty from '../../components/Empty'
import CreateIcon from 'material-ui/svg-icons/content/create'
import { dataTest } from '../../lib/attributes'

import { isContactBetweenTextingHours } from './utils'
import TopFixedSection from './TopFixedSection'

const styles = StyleSheet.create({
  mobile: {
    '@media(minWidth: 425px)': {
      display: 'none !important'
    }
  },
  desktop: {
    '@media(maxWidth: 450px)': {
      display: 'none !important'
    }
  },
  container: {
    margin: 0,
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    flexDirection: 'column',
    height: '100%'
  },
  overlay: {
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    opacity: 0.2,
    backgroundColor: 'black',
    color: 'white',
    zIndex: 1000000
  },
  optOutCard: {
    '@media(max-width: 320px)': {
      padding: '2px 10px !important'
    },
    zIndex: 2000,
    backgroundColor: 'white'
  },
  messageForm: {
    backgroundColor: 'red'
  },
  loadingIndicator: {
    maxWidth: '50%'
  },
  navigationToolbarTitle: {
    fontSize: '14px',
    fontWeight: 'bold',
    position: 'relative',
    top: 5

  },
  topFixedSection: {
    flex: '0 0 auto'
  },
  middleScrollingSection: {
    flex: '1 1 auto',
    overflowY: 'scroll',
    overflow: '-moz-scrollbars-vertical'
  },
  bottomFixedSection: {
    borderTop: `1px solid ${grey100}`,
    flex: '0 0 auto',
    marginBottom: 'none'
  },
  messageField: {
    padding: '0px 8px',
    '@media(maxWidth: 450px)': {
      marginBottom: '8%'
    }
  },
  textField: {
    '@media(maxWidth: 350px)': {
      overflowY: 'scroll !important'
    }
  },
  dialogActions: {
    marginTop: 20,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  lgMobileToolBar: {
    '@media(maxWidth: 449px) and (minWidth: 300px)': {
      display: 'inline-block'
    },
    '@media(maxWidth: 320px) and (minWidth: 300px)': {
      marginLeft: '-30px !important'
    }
  }
})

const inlineStyles = {
  mobileToolBar: {
    position: 'absolute',
    bottom: '-5'
  },
  mobileCannedReplies: {
    '@media(maxWidth: 450px)': {
      marginBottom: '1'
    }
  },
  dialogButton: {
    display: 'inline-block'
  },
  actionToolbar: {
    backgroundColor: 'white',
    '@media(min-width: 450px)': {
      marginBottom: 5
    },
    '@media(maxWidth: 450px)': {
      marginBottom: 50
    }
  },

  actionToolbarFirst: {
    backgroundColor: 'white'
  },

  snackbar: {
    zIndex: 1000001
  }
}

export class AssignmentTexterContact extends React.Component {

  constructor(props) {
    super(props)

    const { assignment, campaign, contact } = this.props
    const questionResponses = this.getInitialQuestionResponses(contact.questionResponseValues)
    const availableSteps = this.getAvailableInteractionSteps(questionResponses)

    let disabled = false
    let disabledText = 'Sending...'
    let snackbarOnTouchTap = null
    let snackbarActionTitle = null
    let snackbarError = null

    if (assignment.id !== contact.assignmentId || campaign.isArchived) {
      disabledText = ''
      disabled = true
      snackbarError = 'Your assignment has changed'
      snackbarOnTouchTap = this.goBackToTodos
      snackbarActionTitle = 'Back to Todos'
    } else if (contact.optOut) {
      disabledText = 'Skipping opt-out...'
      disabled = true
    } else if (!isContactBetweenTextingHours(contact, campaign)) {
      disabledText = "Refreshing ..."
      disabled = true
    }

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
      responsePopoverOpen: false,
      messageText: this.getStartingMessageText(),
      optOutDialogOpen: false,
      currentInteractionStep: availableSteps.length > 0 ? availableSteps[availableSteps.length - 1] : null
    }
  }

  componentDidMount() {
    const { contact, campaign } = this.props
    if (contact.optOut) {
      this.skipContact()
    } else if (!isContactBetweenTextingHours(contact, campaign)) {
      setTimeout(() => {
        this.props.refreshData()
        this.setState({ disabled: false })
      }, 1500)
    }

    this.refs.messageScrollContainer.scrollTo(0, this.refs.messageScrollContainer.scrollHeight)

    // note: key*down* is necessary to stop propagation of keyup for the textarea element
    document.body.addEventListener('keydown', this.onEnter)
  }

  componentWillUnmount() {
    document.body.removeEventListener('keydown', this.onEnter)
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.errors.length !== nextProps.length) {
      this.state.disabled = false
    }
  }

  onEnter = (evt) => {
    // Only handle <enter>
    if (evt.keyCode === 13) {
      evt.preventDefault()
      document.body.removeEventListener('keydown', this.onEnter)
      // pressing the Enter key submits
      if (this.state.optOutDialogOpen) {
        this.handleOptOut()
      } else {
        this.handleClickSendMessageButton()
      }
    }
  }

  setDisabled = async (disabled = true) => {
    this.setState({ disabled })
  }

  getAvailableInteractionSteps = (questionResponses) => {
    const allInteractionSteps = this.props.campaign.interactionSteps
    const availableSteps = []

    let step = getTopMostParent(allInteractionSteps)

    while (step) {
      availableSteps.push(step)
      const questionResponseValue = questionResponses[step.id]
      if (questionResponseValue) {
        const matchingAnswerOption = step.question.answerOptions.find((answerOption) => answerOption.value === questionResponseValue)
        if (matchingAnswerOption && matchingAnswerOption.nextInteractionStep) {
          step = interactionStepForId(matchingAnswerOption.nextInteractionStep.id, allInteractionSteps)
        } else {
          step = null
        }
      } else {
        step = null
      }
    }

    return availableSteps
  }

  getInitialQuestionResponses = (questionResponseValues) => {
    const questionResponses = {}
    questionResponseValues.forEach((questionResponse) => {
      questionResponses[questionResponse.interactionStepId] = questionResponse.value
    })

    return questionResponses
  }
  getMessageTextFromScript = (script) => {
    const { campaign, contact, texter } = this.props

    return script ? applyScript({
      contact,
      texter,
      script,
      customFields: campaign.customFields
    }) : null
  }

  getStartingMessageText = () => {
    const { contact, campaign } = this.props
    return contact.messageStatus == 'needsMessage'
      ? this.getMessageTextFromScript(getTopMostParent(campaign.interactionSteps).script)
      : ''
  }

  handleOpenPopover = (event) => {
    event.preventDefault()
    const { assignment } = this.props
    const { userCannedResponses, campaignCannedResponses } = assignment
    const isCannedResponseEnabled = userCannedResponses.length + campaignCannedResponses.length > 0
    if (isCannedResponseEnabled) {
      this.setState({
        responsePopoverAnchorEl: event.currentTarget,
        responsePopoverOpen: true
      })
    }
  }

  handleClosePopover = () => {
    this.setState({
      responsePopoverOpen: false
    })
  }

  handleCannedResponseChange = (cannedResponseScript) => {
    this.handleChangeScript(cannedResponseScript)
  }

  createMessageToContact = (text) => {
    const { texter, assignment } = this.props
    const { contact } = this.props

    return {
      contactNumber: contact.cell,
      userId: texter.id,
      text,
      assignmentId: assignment.id
    }
  }

  goBackToTodos = () => {
    const { campaign } = this.props
    this.props.router.push(`/app/${campaign.organization.id}/todos`)
  }

  handleMessageFormSubmit = ({ messageText }) => {
    // Process the submit synchronously
    if (this.state.disabled) {
      return // stops from multi-send
    }
    this.setState({ disabled: true })

    // Actually deliver the payload asyncronously
    this.submitAction(messageText)
  }

  submitAction = async (messageText) => {
    const { contact } = this.props
    const message = this.createMessageToContact(messageText)
    const changes = this.gatherSurveyChanges()
    const payload = Object.assign({ message }, changes)
    console.log(payload)
    this.props.sendMessage(contact.id, payload)
  }

  gatherSurveyChanges = () => {
    const { contact } = this.props

    const deletionIds = []
    const questionResponseObjects = []

    const interactionStepIds = Object.keys(this.state.questionResponses)

    const count = interactionStepIds.length

    for (let i = 0; i < count; i++) {
      const interactionStepId = interactionStepIds[i]
      const value = this.state.questionResponses[interactionStepId]
      if (value) {
        questionResponseObjects.push({
          interactionStepId,
          campaignContactId: contact.id,
          value
        })
      } else {
        deletionIds.push(interactionStepId)
      }
    }


    const changes = {}
    if (questionResponseObjects.length) changes.questionResponseObjects = questionResponseObjects
    if (deletionIds.length) changes.deletionIds = deletionIds
    return changes
  }

  handleClickCloseContactButton = async () => {
    await this.handleEditMessageStatus('closed')
    this.props.onFinishContact()
  }

  handleEditMessageStatus = async (messageStatus) => {
    const { contact } = this.props
    await this.props.mutations.editCampaignContactMessageStatus(messageStatus, contact.id)
  }

  handleOptOut = () => {
    const optOutMessageText = this.state.optOutMessageText
    const { contact } = this.props
    const { assignment } = this.props
    const message = this.createMessageToContact(optOutMessageText)
    if (this.state.disabled) {
      return // stops from multi-send
    }
    this.setState({ disabled: true })

    const payload = {
      optOut: {
        cell: contact.cell,
        assignmentId: assignment.id
      }
    }

    if (optOutMessageText.length) {
      payload.message = message
    }

    Object.assign(payload, this.gatherSurveyChanges())
    this.props.sendMessage(contact.id, payload)
  }

  handleOpenDialog = () => {
    this.setState({ optOutDialogOpen: true })
  }

  handleCloseDialog = () => {
    this.setState({ optOutDialogOpen: false })
  }

  handleChangeScript = (newScript) => {
    const messageText = this.getMessageTextFromScript(newScript)

    this.setState({
      messageText
    })
  }

  handleQuestionResponseChange = ({ interactionStep, questionResponseValue, nextScript }) => {
    const { questionResponses } = this.state
    const { interactionSteps } = this.props.campaign
    questionResponses[interactionStep.id] = questionResponseValue

    const children = getChildren(interactionStep, interactionSteps)
    for (const childStep of children) {
      if (childStep.id in questionResponses) {
        questionResponses[childStep.id] = null
      }
    }

    this.setState({
      questionResponses
    }, () => {
      this.handleChangeScript(nextScript)
    })
  }

  handleClickSendMessageButton = () => {
    this.refs.form.submit()
    if (this.props.contact.messageStatus === 'needsMessage') {
      this.setState({ justSentNew: true })
    }
  }

  optOutSchema = yup.object({
    optOutMessageText: yup.string()
  })

  skipContact = () => {
    this.props.onFinishContact()
  }

  bulkSendMessages = async (assignmentId) => {
    await this.props.mutations.bulkSendMessages(assignmentId)
    this.props.refreshData()
  }

  messageSchema = yup.object({
    messageText: yup.string().required("Can't send empty message").max(window.MAX_MESSAGE_LENGTH)
  })

  handleMessageFormChange = ({ messageText }) => {
    const { messageStatus } = this.props.contact
    // Do not allow deviating from the script for the first message of a campaign
    if (messageStatus !== 'needsMessage') {
      this.setState({ messageText })
    }
  }

  renderSurveySection() {
    const { contact } = this.props
    const { messages } = contact

    const { questionResponses } = this.state

    const availableInteractionSteps = this.getAvailableInteractionSteps(questionResponses)

    return messages.length === 0 ? (<Empty
      title={'This is your first message to ' + contact.firstName}
      icon={<CreateIcon color='rgb(83, 180, 119)' />}
      hideMobile
    />) : (
      <div>
        <AssignmentTexterSurveys
          contact={contact}
          interactionSteps={availableInteractionSteps}
          onQuestionResponseChange={this.handleQuestionResponseChange}
          currentInteractionStep={this.state.currentInteractionStep}
          questionResponses={questionResponses}
        />
      </div>
    )
  }

  renderNeedsResponseToggleButton(contact) {
    const { messageStatus } = contact
    let button = null
    if (messageStatus === 'closed') {
      button = (<RaisedButton
        onTouchTap={() => this.handleEditMessageStatus('needsResponse')}
        label='Reopen'
      />)
    } else if (messageStatus === 'needsResponse') {
      button = (<RaisedButton
        onTouchTap={this.handleClickCloseContactButton}
        label='Skip Reply'
      />)
    }

    return button
  }

  renderActionToolbar() {
    const { contact, campaign, assignment, navigationToolbarChildren, onFinishContact } = this.props
    const { userCannedResponses, campaignCannedResponses } = assignment
    const isCannedResponseEnabled = userCannedResponses.length + campaignCannedResponses.length > 0
    const { justSentNew } = this.state
    const { messageStatus } = contact
    const size = document.documentElement.clientWidth

    if (messageStatus === 'needsMessage' || justSentNew) {
      return (
        <div>
          <Toolbar style={inlineStyles.actionToolbarFirst}>
            <ToolbarGroup
              firstChild
            >
              <SendButton
                threeClickEnabled={campaign.organization.threeClickEnabled}
                onFinalTouchTap={this.handleClickSendMessageButton}
                disabled={this.state.disabled}
              />
              {window.NOT_IN_USA && window.ALLOW_SEND_ALL && window.BULK_SEND_CHUNK_SIZE ? <BulkSendButton
                assignment={assignment}
                onFinishContact={onFinishContact}
                bulkSendMessages={this.bulkSendMessages}
                setDisabled={this.setDisabled}
              /> : ''}
              <div
                style={{ float: 'right', marginLeft: 20 }}
              >
                {navigationToolbarChildren}
              </div>
            </ToolbarGroup>
          </Toolbar>
        </div>
      )
    } else if (size < 450) { // for needsResponse or messaged or convo
      return (
        <div>
          <Toolbar
            className={css(styles.mobile)}
            style={inlineStyles.actionToolbar}
          >
            <ToolbarGroup
              style={inlineStyles.mobileToolBar}
              className={css(styles.lgMobileToolBar)}
              firstChild
            >
              <RaisedButton
                {...dataTest('optOut')}
                secondary
                label='Opt out'
                onTouchTap={this.handleOpenDialog}
                tooltip='Opt out this contact'
              />
              <RaisedButton
                style={inlineStyles.mobileCannedReplies}
                label='Canned replies'
                onTouchTap={this.handleOpenPopover}
                disabled={!isCannedResponseEnabled}
              />
              {this.renderNeedsResponseToggleButton(contact)}
              <div
                style={{ float: 'right', marginLeft: '-30px' }}
              >
                {navigationToolbarChildren}
              </div>
            </ToolbarGroup>
          </Toolbar>
        </div>
      )
    } else if (size >= 768) { // for needsResponse or messaged
      return (
        <div>
          <Toolbar style={inlineStyles.actionToolbarFirst}>
            <ToolbarGroup
              firstChild
            >
              <SendButton
                threeClickEnabled={campaign.organization.threeClickEnabled}
                onFinalTouchTap={this.handleClickSendMessageButton}
                disabled={this.state.disabled}
              />
              {this.renderNeedsResponseToggleButton(contact)}
              <RaisedButton
                label='Canned responses'
                onTouchTap={this.handleOpenPopover}
                disabled={!isCannedResponseEnabled}
              />
              <RaisedButton
                {...dataTest('optOut')}
                secondary
                label='Opt out'
                onTouchTap={this.handleOpenDialog}
              />
              <div
                style={{ float: 'right', marginLeft: 20 }}
              >
                {navigationToolbarChildren}
              </div>
            </ToolbarGroup>
          </Toolbar>
        </div>
      )
    }
    return ''
  }

  renderCannedResponsePopover() {
    const { campaign, assignment, texter } = this.props
    const { userCannedResponses, campaignCannedResponses } = assignment

    return (<CannedResponseMenu
      onRequestClose={this.handleClosePopover}
      open={this.state.responsePopoverOpen}
      anchorEl={this.state.responsePopoverAnchorEl}
      campaignCannedResponses={campaignCannedResponses}
      userCannedResponses={userCannedResponses}
      customFields={campaign.customFields}
      campaignId={campaign.id}
      texterId={texter.id}
      onSelectCannedResponse={this.handleCannedResponseChange}
    />)
  }

  renderOptOutDialog() {
    if (!this.state.optOutDialogOpen) {
      return ''
    }
    return (
      <Card>
        <CardTitle
          className={css(styles.optOutCard)}
          title='Opt out user'
        />
        <Divider />
        <CardActions className={css(styles.optOutCard)}>
          <GSForm
            className={css(styles.optOutCard)}
            schema={this.optOutSchema}
            onChange={({ optOutMessageText }) => this.setState({ optOutMessageText })}
            value={{ optOutMessageText: this.state.optOutMessageText }}
            onSubmit={this.handleOptOut}
          >
            <Form.Field
              name='optOutMessageText'
              fullWidth
              autoFocus
              multiLine
            />
            <div className={css(styles.dialogActions)}>
              <FlatButton
                style={inlineStyles.dialogButton}
                label='Cancel'
                onTouchTap={this.handleCloseDialog}
              />
              <Form.Button
                type='submit'
                style={inlineStyles.dialogButton}
                component={GSSubmitButton}
                label={this.state.optOutMessageText.length ? 'Send' : 'Opt Out without Text'}
              />
            </div>
          </GSForm>
        </CardActions>
      </Card>
    )
  }

  renderCorrectSendButton() {
    const { messageStatus } = this.props.contact
    const validStates = ['messaged', 'convo', 'needsResponse']
    if (validStates.indexOf(messageStatus) > -1) {
      return (
        <SendButtonArrow
          onClick={this.handleClickSendMessageButton}
          disabled={this.state.disabled}
        />
      )
    }
    return null
  }

  renderBottomFixedSection() {
    const { optOutDialogOpen, messageText } = this.state

    const message = (optOutDialogOpen) ? '' : (
      <div className={css(styles.messageField)}>
        <GSForm
          ref='form'
          schema={this.messageSchema}
          value={{ messageText }}
          onSubmit={this.handleMessageFormSubmit}
          onChange={this.handleMessageFormChange}
        >
          <Form.Field
            className={css(styles.textField)}
            name='messageText'
            label='Your message'
            multiLine
            fullWidth
            rowsMax={6}
          />
          {this.renderCorrectSendButton()}
        </GSForm>
      </div>
    )

    return (
      <div>
        {this.renderSurveySection()}
        <div>
          {message}
          {optOutDialogOpen ? '' : this.renderActionToolbar()}
        </div>
        {this.renderOptOutDialog()}
        {this.renderCannedResponsePopover()}
      </div>
    )
  }

  render() {
    const { disabled } = this.state
    const { campaign, contact, onExitTexter } = this.props

    const backgroundColor = contact.messageStatus === 'needsResponse'
      ? 'rgba(83, 180, 119, 0.25)'
      : ''

    return (
      <div>
        {disabled && (
          <div className={css(styles.overlay)}>
            <CircularProgress size={0.5} />
            {this.state.disabledText}
          </div>
        )}
        <div
          className={css(styles.container)}
          style={{ backgroundColor }}
        >
          <div className={css(styles.topFixedSection)}>
            <TopFixedSection
              campaign={campaign}
              contact={contact}
              onExitTexter={onExitTexter}
            />
          </div>
          <div
            {...dataTest('messageList')}
            ref='messageScrollContainer'
            className={css(styles.middleScrollingSection)}
          >
            <MessageList
              contact={contact}
              messages={contact.messages}
            />
          </div>
          <div className={css(styles.bottomFixedSection)}>
            {this.renderBottomFixedSection()}
          </div>
        </div>
        <Snackbar
          style={inlineStyles.snackbar}
          open={!!this.state.snackbarError}
          message={this.state.snackbarError || ''}
          action={this.state.snackbarActionTitle}
          onActionClick={this.state.snackbarOnTouchTap}
        />
        {this.props.errors.map((err, idx) =>
          <Snackbar 
            key={err.id}
            style={Object.assign({}, inlineStyles.snackbar, {bottom: idx * 50, width: 700})}
            open={true}
            message={err.snackbarError || ''}
            action={err.snackbarActionTitle}
            onActionClick={err.snackbarOnTouchTap}
            transitionDuration={0}
          />
        )}
      </div>
    )
  }
}

AssignmentTexterContact.propTypes = {
  errors: PropTypes.array,
  contact: PropTypes.object,
  campaign: PropTypes.object,
  assignment: PropTypes.object,
  texter: PropTypes.object,
  navigationToolbarChildren: PropTypes.array,
  onFinishContact: PropTypes.func,
  router: PropTypes.object,
  mutations: PropTypes.object,
  refreshData: PropTypes.func,
  onExitTexter: PropTypes.func,
  onRefreshAssignmentContacts: PropTypes.func
}

export default withRouter(AssignmentTexterContact)
