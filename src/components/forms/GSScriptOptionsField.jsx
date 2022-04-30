import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import IconButton from "@material-ui/core/IconButton";
import CreateIcon from "@material-ui/icons/Create";
import DeleteIcon from "@material-ui/icons/Delete";
import InfoIcon from "@material-ui/icons/Info";
import pick from "lodash/pick";
import TextField from "material-ui/TextField";
import PropTypes from "prop-types";
import React from "react";

import { withSpokeContext } from "../../client/spoke-context";
import { dataTest } from "../../lib/attributes";
import { allScriptFields } from "../../lib/scripts";
import ScriptEditor from "../ScriptEditor";
import ScriptLinkWarningDialog from "../ScriptLinkWarningDialog";
import GSFormField from "./GSFormField";
import { getWarningContextForScript } from "./utils";

const styles = {
  dialog: {
    zIndex: 10001
  }
};

class GSScriptOptionsField extends GSFormField {
  state = {
    scriptTarget: undefined,
    scriptDraft: "",
    scriptWarningOpen: false
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

    if (warningContext) {
      this.setState({ scriptWarningOpen: true });
    } else {
      this.handleSaveScript();
    }
  };

  // confirm draft with links, save script and close editor
  handleConfirmLinkWarning = () => {
    this.setState({ scriptWarningOpen: false }, () => this.handleSaveScript());
  };

  // cancel draft with links, reset script draft
  handleCloseLinkWarning = () => {
    this.setState({ scriptWarningOpen: false });
  };

  renderDialog() {
    const {
      name,
      customFields,
      value: scriptVersions,
      integrationSourced,
      orgSettings
    } = this.props;
    const { scriptTarget, scriptDraft, scriptWarningOpen } = this.state;
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
            integrationSourced={integrationSourced}
            receiveFocus
            expandable
            onChange={(val) => this.setState({ scriptDraft: val.trim() })}
          />
          {isDuplicate && (
            <p>A script version with this text already exists!</p>
          )}
          <ScriptLinkWarningDialog
            open={scriptWarningOpen}
            warningContext={warningContext}
            handleConfirm={this.handleConfirmLinkWarning}
            handleClose={this.handleCloseLinkWarning}
          />
        </DialogContent>
        <DialogActions>{actions}</DialogActions>
      </Dialog>
    );
  }

  render() {
    // The "errors" prop is an empty object and is not mentioned in yum or react-formal documentation
    const scriptVersions = this.props.value;
    const passThroughProps = pick(this.props, [
      "className",
      "fullWidth",
      "hintText",
      "label",
      "multiLine",
      "name",
      "data-test",
      "onBlur"
      // We manage onChange ourselves so don't pass it though
    ]);

    const canDelete = scriptVersions.length > 1;
    const emptyVersionExists =
      scriptVersions.filter((version) => version.trim() === "").length > 0;

    return (
      <div>
        Scripts
        <IconButton
          tooltip="For best deliverability results add a few versions of the script with
          different wordings. This makes your texts look more natural."
          tooltipPosition="top-right"
          iconStyle={{ width: 20, height: 20 }}
          style={{ width: 40, height: 40, padding: 10 }}
        >
          <InfoIcon />
        </IconButton>
        {scriptVersions.map((scriptVersion, index) => (
          <div
            key={scriptVersion}
            style={{ display: "flex", alignItems: "center" }}
          >
            <TextField
              key={scriptVersion}
              value={scriptVersion}
              floatingLabelText={`Script Version ${index + 1}`}
              floatingLabelStyle={{ zIndex: 0 }}
              errorText={
                scriptVersion.trim().length === 0
                  ? "Script cannot be empty"
                  : undefined
              }
              multiLine
              onClick={this.createDialogHandler(scriptVersion)}
              {...passThroughProps}
            />
            {canDelete && (
              <IconButton
                tooltip="Deleting will not take effect until you save!"
                tooltipPosition="top-left"
                iconStyle={{ width: 20, height: 20, color: "red" }}
                style={{ width: 40, height: 40, padding: 10 }}
                onClick={this.createDeleteHandler(scriptVersion)}
              >
                <DeleteIcon />
              </IconButton>
            )}
          </div>
        ))}
        <Button
          color="primary"
          endIcon={<CreateIcon />}
          disabled={emptyVersionExists}
          onClick={this.handleAddScriptVersion}
        >
          Add script version
        </Button>
        {this.renderDialog()}
      </div>
    );
  }
}

GSScriptOptionsField.propTypes = {
  value: PropTypes.arrayOf(PropTypes.string),
  customFields: PropTypes.arrayOf(PropTypes.string).isRequired,
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
