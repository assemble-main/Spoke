import Button from "@material-ui/core/Button";
import Card from "@material-ui/core/Card";
import CardActions from "@material-ui/core/CardActions";
import CardContent from "@material-ui/core/CardContent";
import CardHeader from "@material-ui/core/CardHeader";
import OpenInNew from "@material-ui/icons/OpenInNew";
import Warning from "@material-ui/icons/Warning";
import type { Register10DlcNotice } from "@spoke/spoke-codegen";
import React from "react";

import { isRegister10DlcBrandNotice } from "../../../api/notice";
import BrandRegistration10DlcNoticeText from "../../../components/NoticeText/BrandRegistration10DlcNoticeText";
import CampaignRegistration10DlcNoticeText from "../../../components/NoticeText/CampaignRegistration10DlcNoticeText";

type Register10DlcNoticeCardProps = Register10DlcNotice;

const Register10DlcNoticeCard: React.FC<Register10DlcNoticeCardProps> = (
  props
) => {
  const isBrandNotice = isRegister10DlcBrandNotice(props);
  return (
    <Card variant="outlined" style={{ marginBottom: "2em" }}>
      <CardHeader
        title={
          isBrandNotice
            ? "Register for 10DLC to reduce your sending costs"
            : "Incomplete 10DLC Registration"
        }
        avatar={<Warning color="error" />}
      />
      <CardContent>
        {isBrandNotice ? (
          <BrandRegistration10DlcNoticeText />
        ) : (
          <CampaignRegistration10DlcNoticeText />
        )}

        {props.tcrRegistrationUrl === null && (
          <p style={{ fontWeight: "bold" }}>
            Please contact your Spoke organization owner to resolve this!
          </p>
        )}
      </CardContent>
      {props.tcrRegistrationUrl && (
        <CardActions disableSpacing>
          <Button
            href={props.tcrRegistrationUrl}
            target="_blank"
            rel="noreferrer"
            color="primary"
            variant="contained"
            style={{ marginLeft: "auto" }}
            endIcon={<OpenInNew />}
          >
            Register
          </Button>
        </CardActions>
      )}
    </Card>
  );
};

export default Register10DlcNoticeCard;
