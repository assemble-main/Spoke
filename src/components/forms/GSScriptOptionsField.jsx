import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import Tooltip from "@material-ui/core/Tooltip";
import CreateIcon from "@material-ui/icons/Create";
import InfoIcon from "@material-ui/icons/Info";
import PropTypes from "prop-types";
import React from "react";

import { withSpokeContext } from "../../client/spoke-context";
import { dataTest } from "../../lib/attributes";
import { allScriptFields } from "../../lib/scripts";
import ScriptEditor from "../ScriptEditor";
import ScriptLinkWarningDialog from "../ScriptLinkWarningDialog";
import ScriptOptionBlock from "../ScriptOptionBlock";
import ScriptOptOutLanguageWarningDialog from "../ScriptOptOutLanguageWarningDialog";
import GSFormField from "./GSFormField";
import { getWarningContextForScript } from "./utils";

// dialogs stack on top of each other when all are open as:
// opt out language warning > link warning > script editor
const styles = {
  dialog: {
    zIndex: 10001
  }
};

class GSScriptOptionsField extends GSFormField {
  state = {
    scriptTarget: undefined,
    scriptDraft: "",
    scriptLinkWarningOpen: false,
    optOutLanguageWarningOpen: false
  };

  createDialogHandler = (scriptVersion) => (event) => {
    event.stopPropagation();
    event.preventDefault();

    this.setState({ scriptTarget: scriptVersion, scriptDraft: scriptVersion });
  };

  createDeleteHandler = (scriptVersion) => () => {
    const scriptVersions = [...this.props.value];
    const targetIndex = scriptVersions.indexOf(scriptVersion);
    scriptVersions.splice(targetIndex, 1);
    this.props.onChange(scriptVersions);
  };

  handleCancelDialog = () =>
    this.setState({
      scriptTarget: undefined,
      scriptDraft: ""
    });

  // save script if no link warning is needed
  handleSaveScript = () => {
    const scriptVersions = [...this.props.value];
    const { scriptTarget, scriptDraft } = this.state;
    const targetIndex = scriptVersions.indexOf(scriptTarget);
    scriptVersions[targetIndex] = scriptDraft.trim();

    this.props.onChange(scriptVersions);
    this.handleCancelDialog();
  };

  handleAddScriptVersion = () => {
    const scriptVersions = [...this.props.value];
    scriptVersions.push("");
    this.props.onChange(scriptVersions);
  };

  // check draftScript for links, then save
  wrapSaveScript = () => {
    const { scriptDraft } = this.state;
    const warningContext =
      this.props.orgSettings.confirmationClickForScriptLinks &&
      getWarningContextForScript(scriptDraft);

    // 2022-09-24 - stop as a separate word is best for avoiding spam blocks
    const warnForOptOutLanguage =
      this.props.isRootStep &&
      scriptDraft.length > 0 &&
      !scriptDraft.toLowerCase().includes("stop ");

    if (!warningContext && !warnForOptOutLanguage) {
      this.handleSaveScript();
    } else {
      if (warningContext) this.setState({ scriptLinkWarningOpen: true });
      if (warnForOptOutLanguage)
        this.setState({ optOutLanguageWarningOpen: true });
    }
  };

  // confirm draft with links, save script and close editor
  handleConfirmLinkWarning = () => {
    this.setState({ scriptLinkWarningOpen: false }, () =>
      this.handleSaveScript()
    );
  };

  // cancel draft with links, reset script draft
  handleCloseLinkWarning = () => {
    this.setState({ scriptLinkWarningOpen: false });
  };

  // opt out warning will appear on top of link warning
  // so defer saving to the link warning if it's open
  handleConfirmOptOutLanguageWarning = () => {
    this.setState({ optOutLanguageWarningOpen: false }, () => {
      if (!this.state.scriptLinkWarningOpen) this.handleSaveScript();
    });
  };

  // cancel draft with no opt out language, reset script draft
  handleCloseOptOutLanguageWarning = () => {
    this.setState({ optOutLanguageWarningOpen: false });
  };

  // TODO: refactor dialog types into a ts enum
  // https://github.com/politics-rewired/Spoke/issues/1529
  renderDialog(dialogType) {
    const {
      name,
      customFields,
      campaignVariables,
      value: scriptVersions,
      integrationSourced,
      orgSettings
    } = this.props;
    const {
      scriptTarget,
      scriptDraft,
      scriptLinkWarningOpen,
      optOutLanguageWarningOpen
    } = this.state;
    const scriptFields = allScriptFields(customFields);

    const draftVersionOccurences = scriptVersions.filter(
      (version) => version === scriptDraft
    ).length;
    const isDuplicate =
      scriptDraft !== scriptTarget && draftVersionOccurences > 0;

    // Script target could be "" which is falsey, so make explicit check against undefined
    const isDialogOpen = scriptTarget !== undefined;

    const warningContext =
      orgSettings.confirmationClickForScriptLinks &&
      getWarningContextForScript(scriptDraft);

    const actions = [
      <Button
        key="cancel"
        {...dataTest("scriptCancel")}
        onClick={this.handleCancelDialog}
      >
        Cancel
      </Button>,
      <Button
        key="done"
        {...dataTest("scriptDone")}
        variant="contained"
        color="primary"
        disabled={isDuplicate}
        onClick={this.wrapSaveScript}
      >
        Done
      </Button>
    ];

    return (
      <Dialog
        open={isDialogOpen}
        style={styles.dialog}
        disableBackdropClick
        disableEscapeKeyDown
        onClose={this.handleCancelDialog}
      >
        <DialogContent>
          <ScriptEditor
            ref={(ref) => {
              this.inputRef = ref;
            }}
            name={name}
            scriptText={scriptDraft}
            scriptFields={scriptFields}
            campaignVariables={campaignVariables}
            integrationSourced={integrationSourced}
            maxSmsSegmentLength={orgSettings.maxSmsSegmentLength}
            receiveFocus
            expandable
            onChange={(val) => this.setState({ scriptDraft: val.trim() })}
          />
          {isDuplicate && (
            <p>A script version with this text already exists!</p>
          )}
          {dialogType === "script-link" ? (
            <ScriptLinkWarningDialog
              open={scriptLinkWarningOpen}
              warningContext={warningContext}
              handleConfirm={this.handleConfirmLinkWarning}
              handleClose={this.handleCloseLinkWarning}
            />
          ) : (
            <ScriptOptOutLanguageWarningDialog
              open={optOutLanguageWarningOpen}
              handleConfirm={this.handleConfirmOptOutLanguageWarning}
              handleClose={this.handleCloseOptOutLanguageWarning}
            />
          )}
        </DialogContent>
        <DialogActions>{actions}</DialogActions>
      </Dialog>
    );
  }

  render() {
    // The "errors" prop is an empty object and is not mentioned in yum or react-formal documentation
    const {
      customFields,
      campaignVariables,
      value: scriptVersions
    } = this.props;

    const canDelete = scriptVersions.length > 1;
    const emptyVersionExists =
      scriptVersions.filter((version) => version.trim() === "").length > 0;

    return (
      <div>
        Scripts
        <Tooltip
          title="For best deliverability results add a few versions of the script with
          different wordings. This makes your texts look more natural."
          placement="right-start"
        >
          <InfoIcon fontSize="small" />
        </Tooltip>
        {scriptVersions.map((scriptVersion, index) => (
          <ScriptOptionBlock
            key={scriptVersion}
            label={`Script Version ${index + 1}`}
            customFields={customFields}
            campaignVariables={campaignVariables}
            script={scriptVersion}
            onEditScript={this.createDialogHandler(scriptVersion)}
            onDelete={canDelete && this.createDeleteHandler(scriptVersion)}
          />
        ))}
        <Button
          color="primary"
          endIcon={<CreateIcon />}
          disabled={emptyVersionExists}
          onClick={this.handleAddScriptVersion}
        >
          Add script version
        </Button>
        {this.renderDialog("script-link")}
        {this.renderDialog("opt-out-language")}
      </div>
    );
  }
}

GSScriptOptionsField.propTypes = {
  value: PropTypes.arrayOf(PropTypes.string),
  customFields: PropTypes.arrayOf(PropTypes.string).isRequired,
  campaignVariables: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      value: PropTypes.string
    })
  ).isRequired,
  isRootStep: PropTypes.bool.isRequired,
  name: PropTypes.string,
  className: PropTypes.string,
  hintText: PropTypes.string,
  label: PropTypes.string,
  multiLine: PropTypes.bool,
  fullWidth: PropTypes.bool,
  orgSettings: PropTypes.object,
  onChange: PropTypes.func,
  onBlur: PropTypes.func
};

export default withSpokeContext(GSScriptOptionsField);
