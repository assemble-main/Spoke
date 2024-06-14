import blue from "@material-ui/core/colors/blue";
import blueGrey from "@material-ui/core/colors/blueGrey";
import green from "@material-ui/core/colors/green";
import grey from "@material-ui/core/colors/grey";
import red from "@material-ui/core/colors/red";
import yellow from "@material-ui/core/colors/yellow";
import { createTheme } from "@material-ui/core/styles"; // v4.x
import getMuiTheme from "material-ui/styles/getMuiTheme";

import assemblePalette from "./assemble-palette";
import baseTheme from "./theme";
import type { CustomTheme } from "./types";

export const createMuiThemev0 = (theme: Partial<CustomTheme> = {}) => {
  const primaryColor = theme.primaryColor ?? assemblePalette.primary.navy;
  const secondaryColor = theme.secondaryColor ?? assemblePalette.primary.navy;

  return getMuiTheme(
    {
      fontFamily: "Karla",
      palette: {
        primary1Color: primaryColor,
        textColor: theme.primaryTextColor || blueGrey[800],
        primary2Color: secondaryColor,
        primary3Color: grey[400],
        accent1Color: secondaryColor,
        accent2Color: grey[300],
        accent3Color: grey[500],
        alternateTextColor: theme.secondaryTextColor || "#333333",
        canvasColor: theme.canvassColor || grey[50],
        borderColor: grey[300],
        disabledColor: theme.disabledBackgroundColor || grey[300]
      }
    },
    { userAgent: "all" }
  );
};

// TODO: return real theme once components beyond Dialog are converted
export const createMuiThemev1 = (theme: Partial<CustomTheme> = {}) => {
  const primaryColor = theme.primaryColor ?? assemblePalette.primary.navy;
  const secondaryColor = theme.secondaryColor ?? assemblePalette.primary.navy;
  const infoColor = theme.infoColor ?? "#FF781D";
  const badgeColor = theme.badgeColor || assemblePalette.secondary.red;

  return createTheme({
    palette: {
      primary: { main: primaryColor },
      secondary: { main: secondaryColor },
      badge: { main: badgeColor },
      convoMessageBadge: { main: yellow[600] },
      inboundMessageBg: { main: blue[500] },
      success: { main: theme.successColor || green[500], light: green[100] },
      warning: { main: theme.warningColor || baseTheme.colors.orange },
      error: { main: theme.errorColor || red[200] },
      info: { main: infoColor, light: blue[100], dark: blue[900] },
      text: {
        primary: theme.primaryTextColor || blueGrey[800],
        // Do not provide default of grey[50] here -- v0 and v1 behave differently
        secondary: theme.secondaryTextColor || "#333333"
      },
      background: {
        default: theme.canvassColor || grey[50]
      },
      action: {
        disabled: theme.disabledTextColor || blueGrey[800],
        disabledBackground: theme.disabledBackgroundColor || grey[300]
      }
    },
    typography: {
      fontFamily: "Karla"
    }
  });
};
