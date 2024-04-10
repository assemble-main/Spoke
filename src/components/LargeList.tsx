import { grey } from "@material-ui/core/colors";
import DragIndicatorIcon from "@material-ui/icons/DragIndicator";
import React from "react";

const largeListStyle: React.CSSProperties = {
  listStyleType: "none",
  margin: 0,
  padding: 0
};

export const LargeList: React.SFC = (props) => {
  return <ul style={largeListStyle}>{props.children}</ul>;
};

const largeListItemStyles: { [key: string]: React.CSSProperties } = {
  flexContainer: {
    display: "flex",
    alignItems: "center"
  },
  textWrapper: {
    flexGrow: 1
  },
  actionWrapper: {
    flexGrow: 0
  },
  primaryText: {
    margin: "10px 0 0 0",
    padding: 0,
    fontFamily: "Karla",
    fontSize: "16px",
    color: grey[900]
  },
  secondaryText: {
    margin: "5px 0 0 0",
    padding: 0,
    fontFamily: "Karla",
    whiteSpace: "pre-wrap",
    fontSize: "14px",
    color: grey[600]
  }
};

export interface LargeListItemProps {
  primaryText?: string;
  secondaryText?: React.ReactNode;
  rightActionMenu?: React.ReactNode;
  draggable?: boolean;
}

export const LargeListItem: React.SFC<LargeListItemProps> = (props) => {
  const { primaryText, secondaryText, rightActionMenu, draggable } = props;

  return (
    <li style={largeListItemStyles.flexContainer}>
      {draggable && (
        <DragIndicatorIcon style={{ paddingRight: 10, cursor: "grab" }} />
      )}
      <div style={largeListItemStyles.textWrapper}>
        {primaryText && (
          <p style={largeListItemStyles.primaryText}>{primaryText}</p>
        )}
        {secondaryText && (
          <p style={largeListItemStyles.secondaryText}>{secondaryText}</p>
        )}
      </div>
      {rightActionMenu && (
        <div style={largeListItemStyles.actionWrapper}>{rightActionMenu}</div>
      )}
    </li>
  );
};
