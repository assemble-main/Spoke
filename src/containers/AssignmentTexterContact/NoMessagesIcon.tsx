import muiThemeable from "material-ui/styles/muiThemeable";
import CreateIcon from "material-ui/svg-icons/content/create";
import React from "react";

import { useSpokeTheme } from "../../styles/spoke-theme-context";
import { MuiThemeProviderProps } from "../../styles/types";

const NoMessagesIcon: React.FC<MuiThemeProviderProps> = ({
  muiTheme,
  ...iconProps
}) => {
  const theme = useSpokeTheme();

  if (theme?.firstMessageIconUrl) {
    return (
      <div {...iconProps}>
        <img
          src={theme?.firstMessageIconUrl}
          style={{ display: "block", margin: "auto", height: "100%" }}
        />
      </div>
    );
  }

  const iconColor = muiTheme?.palette?.primary1Color ?? "rgb(83, 180, 119)";
  return <CreateIcon color={iconColor} {...iconProps} />;
};

export default muiThemeable()(NoMessagesIcon);
