import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
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

class GSScriptField extends GSFormField {
  constructor(props) {
    super(props);
    this.state = {
      open: false,
      script: props.value,
      scriptWarningOpen: false
    };
  }

  handleOpenDialog = (event) => {
    event.stopPropagation();
    event.preventDefault();
    this.setState(
      {
        open: true
      },
      () => {
        if (this.scriptInputRef) this.scriptInputRef.focus();
      }
    );
  };

  handleCancelDialog = () => {
    // Reset any changes the user has made in the Editor
    const script = this.props.value;
    this.setState({
      open: false,
      script
    });
  };

  handleSaveScript = () => {
    const value = this.state.script;
    this.props.onChange(value);
    this.setState({ open: false });
  };

  // check script for links, then save
  wrapSaveScript = () => {
    const { script } = this.state;
    const warningContext =
      this.props.orgSettings.confirmationClickForScriptLinks &&
      getWarningContextForScript(script);

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
      campaignVariables,
      integrationSourced,
      orgSettings
    } = this.props;
    const { open, scriptWarningOpen, script } = this.state;
    const scriptFields = allScriptFields(customFields);
    const warningContext =
      script &&
      orgSettings.confirmationClickForScriptLinks &&
      getWarningContextForScript(script);

    return (
      <Dialog
        style={styles.dialog}
        disableBackdropClick
        disableEscapeKeyDown
        open={open}
        onClose={this.handleCancelDialog}
      >
        <DialogContent>
          <ScriptEditor
            ref={(el) => {
              this.scriptInputRef = el;
            }}
            name={name}
            scriptText={this.state.script}
            scriptFields={scriptFields}
            campaignVariables={campaignVariables}
            integrationSourced={integrationSourced}
            maxSmsSegmentLength={orgSettings.maxSmsSegmentLength}
            expandable
            onChange={(val) => this.setState({ script: val })}
          />
          <ScriptLinkWarningDialog
            open={scriptWarningOpen}
            warningContext={warningContext}
            handleConfirm={this.handleConfirmLinkWarning}
            handleClose={this.handleCloseLinkWarning}
          />
        </DialogContent>
        <DialogActions>
          <Button
            key="cancel"
            {...dataTest("scriptCancel")}
            onClick={this.handleCancelDialog}
          >
            Cancel
          </Button>
          <Button
            key="done"
            variant="contained"
            color="primary"
            {...dataTest("scriptDone")}
            onClick={this.wrapSaveScript}
          >
            Done
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  render() {
    // The "errors" prop is an empty object and is not mentioned in yum or react-formal documentation
    const passThroughProps = pick(this.props, [
      "className",
      "fullWidth",
      "hintText",
      "label",
      "multiLine",
      "name",
      "value",
      "data-test",
      "onBlur",
      "onChange"
    ]);
    return (
      <div>
        <TextField
          multiLine
          onClick={this.handleOpenDialog}
          floatingLabelText={this.floatingLabelText()}
          floatingLabelStyle={{
            zIndex: 0
          }}
          {...passThroughProps}
        />
        {this.renderDialog()}
      </div>
    );
  }
}

GSScriptField.propTypes = {
  value: PropTypes.string.isRequired,
  customFields: PropTypes.arrayOf(PropTypes.string).isRequired,
  campaignVariables: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
      value: PropTypes.string
    })
  ).isRequired,
  name: PropTypes.string,
  className: PropTypes.string,
  hintText: PropTypes.string,
  label: PropTypes.string,
  multiLine: PropTypes.bool,
  fullWidth: PropTypes.bool,
  orgSettings: PropTypes.object,
  onChange: PropTypes.func.isRequired,
  onBlur: PropTypes.func
};

export default withSpokeContext(GSScriptField);
