import Button from "@material-ui/core/Button";
import Card from "@material-ui/core/Card";
import CardActions from "@material-ui/core/CardActions";
import CardContent from "@material-ui/core/CardContent";
import CardHeader from "@material-ui/core/CardHeader";
import OpenInNew from "@material-ui/icons/OpenInNew";
import React from "react";
import { compose } from "recompose";

import BrandRegistration10DlcNoticeText from "../../../components/NoticeText/BrandRegistration10DlcNoticeText";
import type { QueryMap } from "../../../network/types";
import { loadData } from "../../hoc/with-operations";
import type { OrganizationMessagingServicesType } from "./queries";
import { GET_MESSAGING_SERVICES } from "./queries";

interface HocProps {
  data: OrganizationMessagingServicesType;
}

export interface OuterProps {
  organizationId: string;
  style?: React.CSSProperties;
}

interface InnerProps extends OuterProps, HocProps {}

const Review10DlcInfo: React.FC<InnerProps> = (props) => {
  const {
    data: {
      organization: {
        messagingServices: { edges }
      }
    },
    style
  } = props;

  const link =
    edges.length === 1
      ? edges[0].node.tcrBrandRegistrationLink ?? undefined
      : undefined;

  return (
    <Card style={style}>
      <CardHeader title="10DLC Registration Information" />
      <CardContent>
        <BrandRegistration10DlcNoticeText />
      </CardContent>
      <CardActions disableSpacing>
        <Button
          href={link ?? ""}
          target="_blank"
          rel="noreferrer"
          color="primary"
          variant="contained"
          disabled={link === undefined}
          style={{ marginLeft: "auto" }}
          endIcon={<OpenInNew />}
        >
          Register
        </Button>
      </CardActions>
    </Card>
  );
};

const queries: QueryMap<OuterProps> = {
  data: {
    query: GET_MESSAGING_SERVICES,
    options: ({ organizationId }) => ({
      variables: { organizationId }
    })
  }
};

export default compose<InnerProps, OuterProps>(loadData({ queries }))(
  Review10DlcInfo
);
