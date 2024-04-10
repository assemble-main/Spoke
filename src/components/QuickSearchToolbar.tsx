import IconButton from "@material-ui/core/IconButton";
import TextField from "@material-ui/core/TextField";
import ClearIcon from "@material-ui/icons/Clear";
import SearchIcon from "@material-ui/icons/Search";
import React from "react";

interface QuickSearchToolbarProps {
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  clearSearch(): void;
}

const QuickSearchToolbar: React.FC<QuickSearchToolbarProps> = (props) => {
  return (
    <div
      style={{
        justifyContent: "flex-end",
        paddingTop: 15,
        paddingRight: 15,
        paddingBottom: 5,
        display: "flex"
      }}
    >
      <TextField
        style={{ width: 400 }}
        variant="standard"
        value={props.value}
        onChange={props.onChange}
        placeholder="Search…"
        InputProps={{
          startAdornment: <SearchIcon />,
          endAdornment: (
            <IconButton
              title="Clear"
              aria-label="Clear"
              size="small"
              style={{ visibility: props.value ? "visible" : "hidden" }}
              onClick={props.clearSearch}
            >
              <ClearIcon fontSize="small" />
            </IconButton>
          )
        }}
      />
    </div>
  );
};

export default QuickSearchToolbar;
