import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";
import CardHeader from "@material-ui/core/CardHeader";
import Announcement from "@material-ui/icons/Announcement";
import React from "react";

import Pending10DlcCampaignNoticeText from "../../../components/NoticeText/Pending10DlcCampaignNoticeText";

const Pending10DlcCampaignNoticeCard: React.FC = () => {
  return (
    <Card variant="outlined" style={{ marginBottom: "2em" }}>
      <CardHeader
        title="10DLC Campaign Submitted"
        avatar={<Announcement color="secondary" />}
      />
      <CardContent>
        <Pending10DlcCampaignNoticeText />
      </CardContent>
    </Card>
  );
};

export default Pending10DlcCampaignNoticeCard;
