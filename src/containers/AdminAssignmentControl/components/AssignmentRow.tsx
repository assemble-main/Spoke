import Chip from "@material-ui/core/Chip";
import Grid from "@material-ui/core/Grid";
import TextField from "@material-ui/core/TextField";
import Autocomplete from "@material-ui/lab/Autocomplete";
import MenuItem from "material-ui/MenuItem";
import SelectField from "material-ui/SelectField";
import Toggle from "material-ui/Toggle";
import React from "react";

import { TextRequestType } from "../../../api/types";
import type {
  TagWithTitle,
  TeamForAssignment,
  TeamInputWithTags
} from "../types";

interface AssignmentRowProps {
  assignmentPool: TeamForAssignment;
  escalationTagList: TagWithTitle[];
  isRowDisabled: boolean;
  onChange: (payload: TeamInputWithTags) => Promise<void> | void;
}

const AssignmentRow: React.FC<AssignmentRowProps> = (props) => {
  const {
    assignmentPool,
    isRowDisabled = false,
    onChange,
    escalationTagList
  } = props;

  const handleToggleIsEnabled = (
    _event: React.MouseEvent<unknown, MouseEvent>,
    isAssignmentEnabled: boolean
  ) => onChange({ isAssignmentEnabled });

  const handleChangeAssignmentType = (
    _event: React.SyntheticEvent<unknown, Event>,
    _index: number,
    assignmentType: any
  ) => onChange({ assignmentType });

  const handleChangeMaxCount = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const maxRequestCount = event?.target?.value;
    onChange({
      maxRequestCount: maxRequestCount ? parseInt(maxRequestCount, 10) : null
    });
  };

  const handleChangeEscalationTags = (
    _event: React.ChangeEvent<any>,
    value: TagWithTitle[]
  ): void => {
    onChange({ escalationTags: value });
  };

  const {
    id,
    title,
    textColor,
    backgroundColor,
    isAssignmentEnabled,
    assignmentType,
    maxRequestCount,
    escalationTags
  } = assignmentPool;

  const isSaveDisabled =
    isRowDisabled || !isAssignmentEnabled || id === "general";

  return (
    <Grid
      container
      spacing={2}
      wrap="nowrap"
      alignItems="center"
      justifyContent="space-between"
    >
      <Grid item>
        <Chip label={title} style={{ color: textColor, backgroundColor }} />
      </Grid>
      <Grid item>
        <Toggle
          label="Enable assignment?"
          labelPosition="right"
          toggled={isAssignmentEnabled}
          disabled={isRowDisabled}
          onToggle={handleToggleIsEnabled}
        />
      </Grid>
      <Grid item>
        <SelectField
          floatingLabelText="Assignment Type"
          value={assignmentType}
          disabled={isRowDisabled || !isAssignmentEnabled}
          onChange={handleChangeAssignmentType}
        >
          <MenuItem
            value={TextRequestType.UNSENT}
            primaryText="Unsent Initial Messages"
          />
          <MenuItem
            value={TextRequestType.UNREPLIED}
            primaryText="Unhandled Replies"
          />
        </SelectField>
      </Grid>
      <Grid item style={{ width: 200 }}>
        <TextField
          label="Max to request at once"
          type="number"
          value={maxRequestCount}
          disabled={isRowDisabled || !isAssignmentEnabled}
          onChange={handleChangeMaxCount}
        />
      </Grid>
      <Grid item style={{ width: 300 }}>
        <Autocomplete
          multiple
          options={escalationTagList}
          value={escalationTags}
          getOptionLabel={(tag) => tag.title}
          filterSelectedOptions
          fullWidth
          onChange={handleChangeEscalationTags}
          disabled={isSaveDisabled}
          getOptionSelected={(option, value) => option.id === value.id}
          renderInput={(params) => (
            <TextField
              {...params}
              variant="standard"
              label={id === "general" ? "N/A" : "Custom Escalation Tags"}
              name="select-teams-autocomplete"
            />
          )}
        />
      </Grid>
    </Grid>
  );
};

export default AssignmentRow;
